import { adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { APP_VERSION } from "../../shared/const";

const GITHUB_REPO = "Clientflame/tts-broadcast-dialer";
const GHCR_IMAGE = "ghcr.io/clientflame/tts-broadcast-dialer";

// Build-time commit SHA injected by Vite (see vite.config.ts)
declare const __APP_COMMIT_SHA__: string;
const APP_COMMIT_SHA = typeof __APP_COMMIT_SHA__ !== "undefined" ? __APP_COMMIT_SHA__ : "";

/**
 * Compare two semver-ish version strings.
 * Returns true if remote is newer than local.
 */
function isNewerVersion(local: string, remote: string): boolean {
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

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { date: string };
  };
  html_url: string;
}

interface GitHubCompare {
  status: string;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  commits: Array<{
    sha: string;
    commit: { message: string; author: { date: string } };
  }>;
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "tts-broadcast-dialer",
};

export const updaterRouter = router({
  /**
   * Comprehensive update check:
   * 1. Check latest GitHub release (tagged version)
   * 2. Check latest commit on main branch vs running commit SHA
   * 3. Return whichever indicates an update is available
   * This ensures ALL updates are detected — tagged releases, untagged commits, everything.
   */
  checkForUpdate: adminProcedure.query(async () => {
    const currentVersion = APP_VERSION;
    const currentCommitSha = APP_COMMIT_SHA;

    // Results from both checks
    let releaseUpdate: {
      available: boolean;
      version: string;
      name: string;
      notes: string;
      publishedAt: string | null;
      url: string;
    } | null = null;

    let commitUpdate: {
      available: boolean;
      latestSha: string;
      latestMessage: string;
      latestDate: string | null;
      aheadBy: number;
      commitSummaries: string[];
      url: string;
    } | null = null;

    try {
      // ── CHECK 1: GitHub Releases ──────────────────────────────────────
      try {
        const releaseRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(10000) }
        );

        if (releaseRes.ok) {
          const release = (await releaseRes.json()) as GitHubRelease;
          const latestVersion = release.tag_name.replace(/^v/, "");
          releaseUpdate = {
            available: isNewerVersion(currentVersion, latestVersion),
            version: latestVersion,
            name: release.name || release.tag_name,
            notes: release.body || "",
            publishedAt: release.published_at,
            url: release.html_url,
          };
        }
      } catch (e) {
        console.warn("[Updater] Release check failed:", e);
      }

      // ── CHECK 2: Latest Commit on main ────────────────────────────────
      // This catches ALL pushes, even without a release/tag
      try {
        if (currentCommitSha) {
          // Compare current commit with remote HEAD
          const compareRes = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/compare/${currentCommitSha}...main`,
            { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(10000) }
          );

          if (compareRes.ok) {
            const compare = (await compareRes.json()) as GitHubCompare;
            const hasNewCommits = compare.ahead_by > 0;
            const latestCommit = compare.commits.length > 0
              ? compare.commits[compare.commits.length - 1]
              : null;

            commitUpdate = {
              available: hasNewCommits,
              latestSha: latestCommit?.sha.slice(0, 7) || "",
              latestMessage: latestCommit?.commit.message.split("\n")[0] || "",
              latestDate: latestCommit?.commit.author.date || null,
              aheadBy: compare.ahead_by,
              commitSummaries: compare.commits
                .slice(-10) // last 10 commits
                .map((c) => `• ${c.sha.slice(0, 7)} — ${c.commit.message.split("\n")[0]}`)
                .reverse(),
              url: `https://github.com/${GITHUB_REPO}/compare/${currentCommitSha}...main`,
            };
          } else if (compareRes.status === 404) {
            // SHA not found on remote — likely a very old build or force-pushed
            // Fall back to just checking the latest commit
            const headRes = await fetch(
              `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
              { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(10000) }
            );
            if (headRes.ok) {
              const head = (await headRes.json()) as GitHubCommit;
              const isSame = head.sha.startsWith(currentCommitSha) || currentCommitSha.startsWith(head.sha.slice(0, 7));
              commitUpdate = {
                available: !isSame,
                latestSha: head.sha.slice(0, 7),
                latestMessage: head.commit.message.split("\n")[0],
                latestDate: head.commit.author.date,
                aheadBy: isSame ? 0 : -1, // unknown count
                commitSummaries: isSame ? [] : [`• ${head.sha.slice(0, 7)} — ${head.commit.message.split("\n")[0]}`],
                url: `https://github.com/${GITHUB_REPO}/commits/main`,
              };
            }
          }
        } else {
          // No commit SHA available — check latest commit on main
          const headRes = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
            { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(10000) }
          );
          if (headRes.ok) {
            const head = (await headRes.json()) as GitHubCommit;
            commitUpdate = {
              available: true, // Can't compare, assume update might be available
              latestSha: head.sha.slice(0, 7),
              latestMessage: head.commit.message.split("\n")[0],
              latestDate: head.commit.author.date,
              aheadBy: -1,
              commitSummaries: [`• ${head.sha.slice(0, 7)} — ${head.commit.message.split("\n")[0]}`],
              url: `https://github.com/${GITHUB_REPO}/commits/main`,
            };
          }
        }
      } catch (e) {
        console.warn("[Updater] Commit check failed:", e);
      }

      // ── Determine overall update status ───────────────────────────────
      const hasReleaseUpdate = releaseUpdate?.available ?? false;
      const hasCommitUpdate = commitUpdate?.available ?? false;
      const updateAvailable = hasReleaseUpdate || hasCommitUpdate;

      // Build release notes combining both sources
      let combinedNotes = "";
      if (hasReleaseUpdate && releaseUpdate) {
        combinedNotes += `## Release: ${releaseUpdate.name}\n\n${releaseUpdate.notes}`;
      }
      if (hasCommitUpdate && commitUpdate && commitUpdate.commitSummaries.length > 0) {
        if (combinedNotes) combinedNotes += "\n\n---\n\n";
        const commitCount = commitUpdate.aheadBy > 0 ? `${commitUpdate.aheadBy} new commit(s)` : "New commits";
        combinedNotes += `## ${commitCount} on main\n\n${commitUpdate.commitSummaries.join("\n")}`;
      }

      // Use release version if available, otherwise construct from commit
      const latestVersion = hasReleaseUpdate && releaseUpdate
        ? releaseUpdate.version
        : hasCommitUpdate && commitUpdate
          ? `${currentVersion}+${commitUpdate.latestSha}`
          : currentVersion;

      return {
        currentVersion,
        currentCommitSha: currentCommitSha || "unknown",
        latestVersion,
        updateAvailable,
        // Release info
        hasReleaseUpdate,
        releaseName: releaseUpdate?.name || `v${currentVersion}`,
        releaseNotes: combinedNotes || "",
        publishedAt: releaseUpdate?.publishedAt || commitUpdate?.latestDate || null,
        releaseUrl: releaseUpdate?.url || commitUpdate?.url || `https://github.com/${GITHUB_REPO}`,
        // Commit info
        hasCommitUpdate,
        commitsAhead: commitUpdate?.aheadBy ?? 0,
        latestCommitSha: commitUpdate?.latestSha || "",
        latestCommitMessage: commitUpdate?.latestMessage || "",
        commitSummaries: commitUpdate?.commitSummaries || [],
        // Source indicator
        source: hasReleaseUpdate ? "release" as const
          : hasCommitUpdate ? "commit" as const
          : "none" as const,
      };
    } catch (err) {
      console.error("[Updater] Error checking for updates:", err);
      return {
        currentVersion,
        currentCommitSha: currentCommitSha || "unknown",
        latestVersion: currentVersion,
        updateAvailable: false,
        hasReleaseUpdate: false,
        releaseName: `v${currentVersion}`,
        releaseNotes: "",
        publishedAt: null,
        releaseUrl: `https://github.com/${GITHUB_REPO}`,
        hasCommitUpdate: false,
        commitsAhead: 0,
        latestCommitSha: "",
        latestCommitMessage: "",
        commitSummaries: [],
        source: "error" as const,
        error: String(err),
      };
    }
  }),

  /**
   * Trigger an update: pull the latest Docker image and restart the container.
   */
  triggerUpdate: adminProcedure
    .input(z.object({
      targetVersion: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const targetVersion = input?.targetVersion;
      const imageTag = targetVersion ? `${GHCR_IMAGE}:v${targetVersion.replace(/^v/, "")}` : `${GHCR_IMAGE}:latest`;

      try {
        const { execSync } = await import("child_process");

        // Check if we're running inside Docker
        let insideDocker = false;
        try {
          const cgroup = await import("fs").then(fs => fs.readFileSync("/proc/1/cgroup", "utf-8"));
          insideDocker = cgroup.includes("docker") || cgroup.includes("containerd");
        } catch {
          try {
            await import("fs").then(fs => fs.accessSync("/.dockerenv"));
            insideDocker = true;
          } catch {
            insideDocker = false;
          }
        }

        if (insideDocker) {
          let hasDockerSocket = false;
          try {
            await import("fs").then(fs => fs.accessSync("/var/run/docker.sock"));
            hasDockerSocket = true;
          } catch {
            hasDockerSocket = false;
          }

          if (hasDockerSocket) {
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
