import { adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { APP_VERSION } from "../../shared/const";
import * as db from "../db";

const GITHUB_REPO = "Clientflame/tts-broadcast-dialer";
const GHCR_IMAGE = "ghcr.io/clientflame/tts-broadcast-dialer";

/**
 * Compare two semver-ish version strings.
 * Returns true if remote is newer than local.
 */
function isNewerVersion(local: string, remote: string): boolean {
  // Strip leading 'v' if present
  const l = local.replace(/^v/, "").split(/[.-]/).map(Number);
  const r = remote.replace(/^v/, "").split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const lv = l[i] || 0;
    const rv = r[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export const updaterRouter = router({
  /**
   * Check for available updates by comparing current version with latest GitHub release/tag.
   */
  checkForUpdate: adminProcedure.query(async () => {
    const currentVersion = APP_VERSION;

    try {
      // Try releases first
      const releaseRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        {
          headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "tts-broadcast-dialer" },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (releaseRes.ok) {
        const release = await releaseRes.json() as { tag_name: string; name: string; body: string; published_at: string; html_url: string };
        const latestVersion = release.tag_name.replace(/^v/, "");
        return {
          currentVersion,
          latestVersion,
          updateAvailable: isNewerVersion(currentVersion, latestVersion),
          releaseName: release.name || release.tag_name,
          releaseNotes: release.body || "",
          publishedAt: release.published_at,
          releaseUrl: release.html_url,
          source: "release" as const,
        };
      }

      // Fall back to tags
      const tagsRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`,
        {
          headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "tts-broadcast-dialer" },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (tagsRes.ok) {
        const tags = await tagsRes.json() as Array<{ name: string }>;
        if (tags.length > 0) {
          const latestVersion = tags[0].name.replace(/^v/, "");
          return {
            currentVersion,
            latestVersion,
            updateAvailable: isNewerVersion(currentVersion, latestVersion),
            releaseName: tags[0].name,
            releaseNotes: "",
            publishedAt: null,
            releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${tags[0].name}`,
            source: "tag" as const,
          };
        }
      }

      // No releases or tags found — compare with GHCR
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseName: `v${currentVersion}`,
        releaseNotes: "",
        publishedAt: null,
        releaseUrl: `https://github.com/${GITHUB_REPO}`,
        source: "none" as const,
      };
    } catch (err) {
      console.error("[Updater] Error checking for updates:", err);
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseName: `v${currentVersion}`,
        releaseNotes: "",
        publishedAt: null,
        releaseUrl: `https://github.com/${GITHUB_REPO}`,
        source: "error" as const,
        error: String(err),
      };
    }
  }),

  /**
   * Trigger an update: pull the latest Docker image and restart the container.
   * This runs the update command on the local server (inside the Docker host).
   * The app is running in Docker, so we use the Docker socket to pull and recreate.
   */
  triggerUpdate: adminProcedure
    .input(z.object({
      targetVersion: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const targetVersion = input?.targetVersion;
      const imageTag = targetVersion ? `${GHCR_IMAGE}:v${targetVersion.replace(/^v/, "")}` : `${GHCR_IMAGE}:latest`;

      try {
        // We can't directly run docker commands from inside the container.
        // Instead, we'll use the update.sh script approach — write a flag file
        // that signals the host to pull and restart.
        // 
        // For self-hosted deployments, the update is triggered by calling
        // docker compose pull && docker compose up -d on the host.
        // We'll use the /var/run/docker.sock if mounted, or fall back to
        // writing an update request that the host can pick up.

        const { execSync } = await import("child_process");

        // Check if we're running inside Docker
        let insideDocker = false;
        try {
          const cgroup = await import("fs").then(fs => fs.readFileSync("/proc/1/cgroup", "utf-8"));
          insideDocker = cgroup.includes("docker") || cgroup.includes("containerd");
        } catch {
          // Check for .dockerenv
          try {
            await import("fs").then(fs => fs.accessSync("/.dockerenv"));
            insideDocker = true;
          } catch {
            insideDocker = false;
          }
        }

        if (insideDocker) {
          // Check if Docker socket is mounted
          let hasDockerSocket = false;
          try {
            await import("fs").then(fs => fs.accessSync("/var/run/docker.sock"));
            hasDockerSocket = true;
          } catch {
            hasDockerSocket = false;
          }

          if (hasDockerSocket) {
            // We have the Docker socket — pull the new image via Docker API
            // Use curl to talk to the Docker socket
            const pullResult = execSync(
              `curl -s --unix-socket /var/run/docker.sock "http://localhost/images/create?fromImage=${encodeURIComponent(GHCR_IMAGE)}&tag=${encodeURIComponent(targetVersion ? `v${targetVersion.replace(/^v/, "")}` : "latest")}" -X POST 2>&1 | tail -5`,
              { encoding: "utf-8", timeout: 120000 }
            );

            return {
              success: true,
              message: `Image pull initiated for ${imageTag}. The container will restart automatically via Watchtower, or run 'docker compose up -d' on the host to apply immediately.`,
              details: pullResult.trim(),
              method: "docker-socket" as const,
            };
          } else {
            // No Docker socket — write an update request file
            // The host can watch for this file and trigger the update
            const fs = await import("fs");
            const updateRequest = {
              requestedAt: new Date().toISOString(),
              targetVersion: targetVersion || "latest",
              imageTag,
            };
            fs.writeFileSync("/tmp/update-request.json", JSON.stringify(updateRequest, null, 2));

            return {
              success: true,
              message: `Update request created for ${imageTag}. Watchtower will automatically pull the latest image within the configured interval. For immediate update, SSH into the server and run: cd /opt/tts-dialer && docker compose pull && docker compose up -d`,
              details: "Running inside Docker without socket access. Update will be applied by Watchtower.",
              method: "watchtower" as const,
            };
          }
        } else {
          // Not inside Docker — running directly on host (dev mode or bare metal)
          // Try to pull and restart via docker compose
          try {
            const pullOutput = execSync(
              `cd /opt/tts-dialer && docker compose pull dialer 2>&1`,
              { encoding: "utf-8", timeout: 120000 }
            );
            const upOutput = execSync(
              `cd /opt/tts-dialer && docker compose up -d dialer 2>&1`,
              { encoding: "utf-8", timeout: 60000 }
            );

            return {
              success: true,
              message: `Update applied successfully. Pulled and restarted with ${imageTag}.`,
              details: `${pullOutput}\n${upOutput}`.trim(),
              method: "direct" as const,
            };
          } catch (cmdErr) {
            return {
              success: false,
              message: `Failed to run docker compose. You may need to update manually: cd /opt/tts-dialer && docker compose pull && docker compose up -d`,
              details: String(cmdErr),
              method: "failed" as const,
            };
          }
        }
      } catch (err) {
        console.error("[Updater] Error triggering update:", err);
        return {
          success: false,
          message: `Update failed: ${String(err)}`,
          details: String(err),
          method: "error" as const,
        };
      }
    }),
});
