/**
 * FreePBX Inbound Routes Service
 * 
 * Creates inbound routes on FreePBX via SSH when DIDs are imported.
 * Uses MySQL queries via SSH to insert into the `incoming` table,
 * then runs `fwconsole reload` to apply changes.
 */

import { Client as SSHClient } from "ssh2";
import { getAppSetting } from "../db";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DestinationType = 
  | "extension"
  | "queue"
  | "ring_group"
  | "ivr"
  | "voicemail"
  | "announcement"
  | "terminate"
  | "none";

export interface FreePBXDestination {
  type: DestinationType;
  id: string;
  name: string;
  /** FreePBX-format destination string, e.g. "ext-queues,400,1" */
  destination: string;
}

export interface InboundRouteConfig {
  did: string;
  description: string;
  destination: string; // FreePBX destination format
  cidPrefix?: string;  // CID name prefix for callbacks
}

export interface InboundRouteResult {
  did: string;
  success: boolean;
  error?: string;
  alreadyExists?: boolean;
}

// ─── SSH Helpers ─────────────────────────────────────────────────────────────

async function getSSHConfig() {
  const host = await getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
  const user = await getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER || "root";
  const password = await getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD || "";
  if (!host) throw new Error("FreePBX host not configured");
  return { host, user, password, port: 22 };
}

function sshExec(config: { host: string; user: string; password: string; port: number }, command: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
        stream.on("close", () => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout, stderr });
        });
      });
    });

    conn.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      readyTimeout: 10000,
    });
  });
}

// ─── Fetch Available Destinations ────────────────────────────────────────────

/**
 * Fetch all available destinations from FreePBX via SSH MySQL queries.
 * Returns a flat list of destinations grouped by type.
 */
export async function fetchFreePBXDestinations(): Promise<FreePBXDestination[]> {
  const config = await getSSHConfig();
  const destinations: FreePBXDestination[] = [];

  // We use `mysql --batch --skip-column-names` for clean tab-separated output
  // FreePBX stores its config in the `asterisk` database
  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk --batch --skip-column-names -e "${query}"`;

  try {
    // 1. Extensions (SIP/PJSIP devices)
    const extResult = await sshExec(config, mysqlCmd(
      "SELECT id, name FROM users ORDER BY CAST(id AS UNSIGNED)"
    ));
    for (const line of extResult.stdout.trim().split("\n").filter(Boolean)) {
      const [id, name] = line.split("\t");
      if (id) {
        destinations.push({
          type: "extension",
          id,
          name: name ? `${id} - ${name}` : id,
          destination: `from-did-direct,${id},1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching extensions:", e);
  }

  try {
    // 2. Queues
    const queueResult = await sshExec(config, mysqlCmd(
      "SELECT extension, descr FROM queues_config ORDER BY CAST(extension AS UNSIGNED)"
    ));
    for (const line of queueResult.stdout.trim().split("\n").filter(Boolean)) {
      const [ext, descr] = line.split("\t");
      if (ext) {
        destinations.push({
          type: "queue",
          id: ext,
          name: descr ? `Queue ${ext} - ${descr}` : `Queue ${ext}`,
          destination: `ext-queues,${ext},1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching queues:", e);
  }

  try {
    // 3. Ring Groups
    const rgResult = await sshExec(config, mysqlCmd(
      "SELECT grpnum, description FROM ringgroups ORDER BY CAST(grpnum AS UNSIGNED)"
    ));
    for (const line of rgResult.stdout.trim().split("\n").filter(Boolean)) {
      const [grpnum, description] = line.split("\t");
      if (grpnum) {
        destinations.push({
          type: "ring_group",
          id: grpnum,
          name: description ? `Ring Group ${grpnum} - ${description}` : `Ring Group ${grpnum}`,
          destination: `ext-group,${grpnum},1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching ring groups:", e);
  }

  try {
    // 4. IVRs
    const ivrResult = await sshExec(config, mysqlCmd(
      "SELECT id, name FROM ivr_details ORDER BY id"
    ));
    for (const line of ivrResult.stdout.trim().split("\n").filter(Boolean)) {
      const [id, name] = line.split("\t");
      if (id) {
        destinations.push({
          type: "ivr",
          id,
          name: name ? `IVR ${id} - ${name}` : `IVR ${id}`,
          destination: `ivr-${id},s,1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching IVRs:", e);
  }

  try {
    // 5. Voicemail boxes
    const vmResult = await sshExec(config, mysqlCmd(
      "SELECT mailbox, fullname FROM voicemail WHERE context='default' ORDER BY CAST(mailbox AS UNSIGNED)"
    ));
    for (const line of vmResult.stdout.trim().split("\n").filter(Boolean)) {
      const [mailbox, fullname] = line.split("\t");
      if (mailbox) {
        destinations.push({
          type: "voicemail",
          id: mailbox,
          name: fullname ? `Voicemail ${mailbox} - ${fullname}` : `Voicemail ${mailbox}`,
          destination: `ext-local,vm${mailbox},1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching voicemail:", e);
  }

  try {
    // 6. Announcements
    const annResult = await sshExec(config, mysqlCmd(
      "SELECT announcement_id, description FROM announcement ORDER BY announcement_id"
    ));
    for (const line of annResult.stdout.trim().split("\n").filter(Boolean)) {
      const [id, description] = line.split("\t");
      if (id) {
        destinations.push({
          type: "announcement",
          id,
          name: description ? `Announcement ${id} - ${description}` : `Announcement ${id}`,
          destination: `app-announcement-${id},s,1`,
        });
      }
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error fetching announcements:", e);
  }

  // 7. Terminate options (always available, no DB query needed)
  destinations.push(
    { type: "terminate", id: "hangup", name: "Hangup", destination: "app-blackhole,hangup,1" },
    { type: "terminate", id: "congestion", name: "Congestion", destination: "app-blackhole,congestion,1" },
    { type: "terminate", id: "busy", name: "Play Busy", destination: "app-blackhole,busy,1" },
  );

  return destinations;
}

// ─── Check Existing Inbound Routes ──────────────────────────────────────────

/**
 * Check which DIDs already have inbound routes on FreePBX.
 */
export async function checkExistingRoutes(dids: string[]): Promise<Map<string, boolean>> {
  const config = await getSSHConfig();
  const result = new Map<string, boolean>();
  
  if (dids.length === 0) return result;

  // Initialize all as false
  for (const did of dids) result.set(did, false);

  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk --batch --skip-column-names -e "${query}"`;

  try {
    const didList = dids.map(d => `'${d.replace(/'/g, "")}'`).join(",");
    const { stdout } = await sshExec(config, mysqlCmd(
      `SELECT extension FROM incoming WHERE extension IN (${didList})`
    ));
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      result.set(line.trim(), true);
    }
  } catch (e) {
    console.error("[FreePBX Routes] Error checking existing routes:", e);
  }

  return result;
}

// ─── Create Inbound Routes ──────────────────────────────────────────────────

/**
 * Create inbound routes on FreePBX for the given DIDs.
 * Inserts into the `incoming` table and runs `fwconsole reload`.
 */
export async function createInboundRoutes(routes: InboundRouteConfig[]): Promise<InboundRouteResult[]> {
  if (routes.length === 0) return [];

  const config = await getSSHConfig();
  const results: InboundRouteResult[] = [];

  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk -e "${query}"`;

  // First, check which routes already exist
  const dids = routes.map(r => r.did);
  const existing = await checkExistingRoutes(dids);

  // Build batch INSERT for new routes
  const newRoutes = routes.filter(r => !existing.get(r.did));
  const skippedRoutes = routes.filter(r => existing.get(r.did));

  // Mark skipped routes
  for (const r of skippedRoutes) {
    results.push({ did: r.did, success: true, alreadyExists: true });
  }

  if (newRoutes.length === 0) {
    return results;
  }

  // Build individual INSERT statements for each route
  // FreePBX `incoming` table columns:
  // cidnum, extension, destination, faxenabled, faxdetection, legacy_email, 
  // mohclass, description, grptime, grpnum, delay_answer, pricid, alertinfo, 
  // ringing, fanswer, privacyman
  for (const route of newRoutes) {
    const safeDid = route.did.replace(/'/g, "").replace(/"/g, "");
    const safeDesc = route.description.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeDest = route.destination.replace(/'/g, "").replace(/"/g, "");
    const safeCidPrefix = route.cidPrefix ? route.cidPrefix.replace(/'/g, "\\'").replace(/"/g, '\\"') : "";

    const query = `INSERT INTO incoming (cidnum, extension, destination, faxenabled, faxdetection, legacy_email, mohclass, description, grptime, grpnum, delay_answer, pricid, alertinfo, ringing, fanswer, privacyman) VALUES ('', '${safeDid}', '${safeDest}', 'disabled', 'none', '', 'default', '${safeDesc}', 0, 0, 0, '${safeCidPrefix}', '', 'default', '', 'no')`;

    try {
      await sshExec(config, mysqlCmd(query));
      results.push({ did: route.did, success: true });
    } catch (e: any) {
      // Check for duplicate key error
      if (e.message?.includes("Duplicate entry")) {
        results.push({ did: route.did, success: true, alreadyExists: true });
      } else {
        results.push({ did: route.did, success: false, error: e.message || "Unknown error" });
      }
    }
  }

  // Run fwconsole reload to apply changes
  const successCount = results.filter(r => r.success && !r.alreadyExists).length;
  if (successCount > 0) {
    try {
      await sshExec(config, "fwconsole reload", 60000);
      console.log(`[FreePBX Routes] Applied ${successCount} new inbound route(s) and reloaded config`);
    } catch (e) {
      console.error("[FreePBX Routes] Warning: fwconsole reload failed:", e);
      // Routes were inserted but reload failed - not a critical error
    }
  }

  return results;
}

// ─── Delete Inbound Routes ──────────────────────────────────────────────────

/**
 * Delete inbound routes from FreePBX for the given DIDs.
 */
export async function deleteInboundRoutes(dids: string[]): Promise<{ deleted: number; errors: string[] }> {
  if (dids.length === 0) return { deleted: 0, errors: [] };

  const config = await getSSHConfig();
  const errors: string[] = [];
  let deleted = 0;

  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk -e "${query}"`;

  const didList = dids.map(d => `'${d.replace(/'/g, "")}'`).join(",");

  try {
    const { stdout } = await sshExec(config, mysqlCmd(
      `DELETE FROM incoming WHERE extension IN (${didList})`
    ));
    // Count affected rows from MySQL output
    const match = stdout.match(/(\d+) row/);
    deleted = match ? parseInt(match[1]) : dids.length;

    // Reload config
    await sshExec(config, "fwconsole reload", 60000);
    console.log(`[FreePBX Routes] Deleted ${deleted} inbound route(s) and reloaded config`);
  } catch (e: any) {
    errors.push(e.message || "Unknown error");
  }

  return { deleted, errors };
}

// ─── Update Inbound Route ────────────────────────────────────────────────────

/**
 * Update an existing inbound route's destination, description, or CID prefix.
 */
export async function updateInboundRoute(did: string, updates: { destination?: string; description?: string; cidPrefix?: string }): Promise<{ success: boolean; error?: string }> {
  const config = await getSSHConfig();

  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk -e "${query}"`;

  const setClauses: string[] = [];
  if (updates.destination !== undefined) {
    const safe = updates.destination.replace(/'/g, "").replace(/"/g, "");
    setClauses.push(`destination='${safe}'`);
  }
  if (updates.description !== undefined) {
    const safe = updates.description.replace(/'/g, "\\'").replace(/"/g, '\\"');
    setClauses.push(`description='${safe}'`);
  }
  if (updates.cidPrefix !== undefined) {
    const safe = updates.cidPrefix.replace(/'/g, "\\'").replace(/"/g, '\\"');
    setClauses.push(`pricid='${safe}'`);
  }

  if (setClauses.length === 0) return { success: true };

  const safeDid = did.replace(/'/g, "").replace(/"/g, "");
  const query = `UPDATE incoming SET ${setClauses.join(", ")} WHERE extension='${safeDid}'`;

  try {
    await sshExec(config, mysqlCmd(query));
    await sshExec(config, "fwconsole reload", 60000);
    console.log(`[FreePBX Routes] Updated inbound route for ${did} and reloaded config`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Unknown error" };
  }
}

// ─── List Existing Inbound Routes ───────────────────────────────────────────

export interface ExistingInboundRoute {
  did: string;
  description: string;
  destination: string;
  cidPrefix: string;
}

/**
 * List all inbound routes currently configured on FreePBX.
 */
export async function listInboundRoutes(): Promise<ExistingInboundRoute[]> {
  const config = await getSSHConfig();

  const mysqlCmd = (query: string) =>
    `mysql -u \$(grep AMPDBUSER /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `-p\$(grep AMPDBPASS /etc/freepbx.conf | grep -oP "'[^']*'" | tail -1 | tr -d "'") ` +
    `asterisk --batch --skip-column-names -e "${query}"`;

  try {
    const { stdout } = await sshExec(config, mysqlCmd(
      "SELECT extension, description, destination, pricid FROM incoming ORDER BY extension"
    ));
    const routes: ExistingInboundRoute[] = [];
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      routes.push({
        did: parts[0] || "",
        description: parts[1] || "",
        destination: parts[2] || "",
        cidPrefix: parts[3] || "",
      });
    }
    return routes;
  } catch (e) {
    console.error("[FreePBX Routes] Error listing routes:", e);
    return [];
  }
}
