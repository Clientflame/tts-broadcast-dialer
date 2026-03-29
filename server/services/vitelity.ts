/**
 * Vitelity/Voyant API Service
 * 
 * Uses Vitelity API v2.0 (JSON, Basic Auth) for DID search & ordering.
 * Uses Vitelity API v1.0 (form-encoded) for inventory, CNAM, LIDB, routing, removal.
 * 
 * v2.0 docs: https://docs.vitelity.net/
 * v1.0 docs: https://apihelp.vitelity.net/
 */

const VITELITY_API_V1_URL = "https://api.vitelity.net/api.php";
const VITELITY_API_V2_URL = "https://api.vitelity.net/2.0";

export interface VitelityDID {
  did: string;          // 10-digit phone number
  rateCenter: string;   // Rate center name
  state: string;        // 2-letter state code
  ratePerMinute: string;
  subAccount: string;
  ratePerMonth: string;
}

function getCredentials() {
  const login = process.env.VITELITY_API_LOGIN;
  const pass = process.env.VITELITY_API_PASS;
  if (!login || !pass) {
    throw new Error("Vitelity API credentials not configured. Set VITELITY_API_LOGIN and VITELITY_API_PASS.");
  }
  return { login, pass };
}

/**
 * Get Basic Auth header for v2.0 API.
 */
function getBasicAuth(): string {
  const { login, pass } = getCredentials();
  return "Basic " + Buffer.from(login + ":" + pass).toString("base64");
}

/**
 * Make a v2.0 API request (JSON, Basic Auth).
 */
async function v2Request(path: string, body: Record<string, any>): Promise<{ status: number; data: any }> {
  const response = await fetch(`${VITELITY_API_V2_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

/**
 * Parse the Vitelity v1.0 plain-text response.
 * Format: x[[data[[x  where data is newline-separated CSV rows
 */
function parsePlainTextResponse(body: string): VitelityDID[] {
  const match = body.match(/x?\[\[([\s\S]*?)\]\]x?/);
  if (!match || !match[1]) {
    const errorMatch = body.match(/\[\[(.*)/);
    if (errorMatch) {
      const errCode = errorMatch[1].trim();
      const errors: Record<string, string> = {
        missingdata: "Missing login, pass or cmd parameters",
        invalidauth: "Invalid Vitelity username or password",
        invalid: "Invalid parameters",
        none: "No DIDs found on this account",
        deprecated: "This API command has been deprecated. Please use API v2.0.",
      };
      throw new Error(errors[errCode] || `Vitelity API error: ${errCode}`);
    }
    throw new Error(`Unexpected Vitelity API response: ${body.substring(0, 200)}`);
  }

  const data = match[1].trim();
  if (!data || data === "success") return [];

  const lines = data.split("\n").filter((l) => l.trim());
  const dids: VitelityDID[] = [];

  for (const line of lines) {
    const parts = line.trim().split(",");
    if (parts.length >= 4) {
      dids.push({
        did: parts[0].trim(),
        rateCenter: parts[1]?.trim() || "",
        ratePerMinute: parts[2]?.trim() || "",
        subAccount: parts[3]?.trim() || "",
        state: parts[4]?.trim() || "",
        ratePerMonth: parts[5]?.trim() || "",
      });
    }
  }

  return dids;
}

/**
 * Parse a simple Vitelity v1.0 text response.
 */
function parseSimpleResponse(body: string): { success: boolean; data: string } {
  const match = body.match(/\[\[([\s\S]*)/);
  if (!match) return { success: false, data: body.trim() };
  const data = match[1].replace(/\]\].*/, "").trim();
  if (data === "success") return { success: true, data: "success" };
  const errors = ["missingdata", "invalidauth", "invalid", "missingrc", "unavailable", "none", "missingdid", "deprecated"];
  if (errors.includes(data)) return { success: false, data };
  return { success: true, data };
}

/**
 * Make a v1.0 API request (form-encoded).
 */
async function v1Request(params: Record<string, string>): Promise<string> {
  const { login, pass } = getCredentials();
  const urlParams = new URLSearchParams({ login, pass, ...params });
  const response = await fetch(VITELITY_API_V1_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: urlParams.toString(),
  });
  if (!response.ok) {
    throw new Error(`Vitelity API HTTP error: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

// ─── Inventory (v1.0 - still active) ─────────────────────────────

/**
 * Fetch all DIDs from the Vitelity account.
 * cmd=listdids (still active on v1.0)
 */
export async function listVitelityDIDs(): Promise<VitelityDID[]> {
  const body = await v1Request({ cmd: "listdids", extra: "yes" });
  return parsePlainTextResponse(body);
}

/**
 * Check Vitelity account balance.
 * cmd=balance (v1.0)
 */
export async function getVitelityBalance(): Promise<string> {
  const body = await v1Request({ cmd: "balance" });
  const match = body.match(/\[\[([\s\S]*)/);
  if (match) {
    return match[1].replace(/\]\].*/, "").trim();
  }
  return body.trim();
}

/**
 * Test Vitelity API connectivity by fetching balance.
 */
export async function testVitelityConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const balance = await getVitelityBalance();
    return { success: true, message: `Connected. Account balance: $${balance}` };
  } catch (err: any) {
    return { success: false, message: err.message || "Connection failed" };
  }
}

// ─── DID Search & Purchase (v2.0 API) ────────────────────────────

export interface AvailableDID {
  did: string;
  rateCenter: string;
  state: string;
  ratePerMinute: string;
  ratePerMonth: string;
  type: string;
}

export interface AvailableTollFreeDID {
  did: string;
  ratePerMinute: string;
  ratePerMonth: string;
  type: "tollfree";
}

/**
 * Search available local DIDs using v2.0 API.
 * POST /did/local/search
 * 
 * @param tnMask - Number pattern with X as wildcards, e.g. "970XXXXXXX" for area code 970
 * @param quantity - Number of results to return (default 20)
 * @param page - Page number for pagination (default 1)
 */
export async function searchAvailableDIDs(
  tnMask: string,
  quantity: number = 20,
  page: number = 1
): Promise<AvailableDID[]> {
  const { status, data } = await v2Request("/did/local/search", {
    tnMask,
    sortDir: "asc",
    quantity,
    page,
  });

  if (status === 431 || data?.statusCode === 431) {
    // No results found
    return [];
  }

  if (data?.status !== "Success") {
    throw new Error(`Vitelity search error: ${data?.status || "Unknown error"}`);
  }

  const results = data.tnResult || [];
  return results.map((item: any) => ({
    did: String(item.telephoneNumber),
    rateCenter: item.rateCenter || "",
    state: item.province || "",
    ratePerMinute: "",
    ratePerMonth: "",
    type: "local",
  }));
}

/**
 * Search available toll-free DIDs using v2.0 API.
 * POST /did/tollfree/search
 * 
 * @param tnMask - Number pattern, e.g. "833XXXXXXX" or "800XXXXXXX"
 * @param quantity - Number of results (default 20)
 */
export async function searchAvailableTollFreeDIDs(
  tnMask: string = "8XXXXXXXXX",
  quantity: number = 20
): Promise<AvailableTollFreeDID[]> {
  const { status, data } = await v2Request("/did/tollfree/search", {
    tnMask,
    quantity,
    sequential: false,
  });

  if (status === 431 || data?.statusCode === 431) {
    return [];
  }

  if (data?.status !== "Success") {
    throw new Error(`Vitelity toll-free search error: ${data?.status || "Unknown error"}`);
  }

  const items = data.tfList?.tfItem || [];
  return items.map((item: any) => ({
    did: String(item.tn),
    ratePerMinute: "",
    ratePerMonth: "",
    type: "tollfree" as const,
  }));
}

/**
 * Purchase local DID(s) using v2.0 API.
 * POST /did/local/order
 * 
 * @param dids - Array of DID numbers to purchase
 * @param ratePlan - "UNLIMITED" or "PPM" (per-minute)
 */
export async function purchaseDID(
  did: string,
  ratePlan: string = "UNLIMITED"
): Promise<{ success: boolean; message: string }> {
  const { data } = await v2Request("/did/local/order", {
    ratePlan,
    vfax: false,
    numbers: [did],
  });

  if (data?.status === "Success") {
    return { success: true, message: `DID ${did} purchased successfully` };
  }

  return {
    success: false,
    message: data?.error || data?.status || `Purchase failed for ${did}`,
  };
}

/**
 * Purchase toll-free DID(s) using v2.0 API.
 * POST /did/tollfree/order
 */
export async function purchaseTollFreeDID(
  did: string,
  ratePlan: string = "UNLIMITED"
): Promise<{ success: boolean; message: string }> {
  const { data } = await v2Request("/did/tollfree/order", {
    ratePlan,
    vfax: false,
    numbers: [did],
  });

  if (data?.status === "Success") {
    return { success: true, message: `Toll-free DID ${did} purchased successfully` };
  }

  return {
    success: false,
    message: data?.error || data?.status || `Purchase failed for ${did}`,
  };
}

// ─── Routing (v1.0 - still active) ──────────────────────────────

/**
 * Route a DID to a SIP endpoint.
 * cmd=reroute&did=XXXXXXXXXX&routesip=sip.server.com
 */
export async function routeDID(
  did: string,
  routeSip: string
): Promise<{ success: boolean; message: string }> {
  const body = await v1Request({ cmd: "reroute", did, routesip: routeSip });
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `DID ${did} routed to ${routeSip}` };
  return { success: false, message: `Routing failed: ${data}` };
}

/**
 * Remove/release a DID from the account.
 * cmd=removedid&did=XXXXXXXXXX (still active on v1.0)
 */
export async function removeDID(
  did: string
): Promise<{ success: boolean; message: string }> {
  const body = await v1Request({ cmd: "removedid", did });
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `DID ${did} removed from account` };
  return { success: false, message: `Remove failed: ${data}` };
}

// ─── CNAM Lookup (v1.0 - still active) ──────────────────────────

export interface CnamResult {
  did: string;
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Perform a CNAM (Caller ID Name) lookup on a phone number.
 * cmd=cnam&did=XXXXXXXXXX
 */
export async function cnamLookup(did: string): Promise<CnamResult> {
  const body = await v1Request({ cmd: "cnam", did });
  const { success, data } = parseSimpleResponse(body);
  if (success && data !== "success") {
    return { did, name: data, success: true };
  }
  if (!success) {
    return { did, name: "", success: false, error: data };
  }
  return { did, name: "", success: true };
}

/**
 * Set the LIDB (Caller ID Name) for a DID you own.
 * cmd=lidb&did=XXXXXXXXXX&name=YourBusinessName
 */
export async function setLidb(
  did: string,
  name: string
): Promise<{ success: boolean; message: string }> {
  const body = await v1Request({ cmd: "lidb", did, name });
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `LIDB set for ${did}: ${name}` };
  return { success: false, message: `LIDB failed: ${data}` };
}

/**
 * List all DIDs where LIDB/CNAM name change is available.
 * cmd=lidbavailall
 */
export async function listLidbAvailable(): Promise<string[]> {
  const body = await v1Request({ cmd: "lidbavailall" });
  const { success, data } = parseSimpleResponse(body);
  if (!success) return [];
  return data.split("\n").map(s => s.trim()).filter(s => s.length > 0);
}

// ─── DID Sync ────────────────────────────────────────────────────

export interface VitelitySyncResult {
  added: string[];       // DIDs found on Vitelity but not in local DB
  removed: string[];     // DIDs in local DB but not on Vitelity
  matched: number;       // DIDs that exist in both
  totalVitelity: number; // Total DIDs on Vitelity account
  totalLocal: number;    // Total DIDs in local DB
}

/**
 * Compare Vitelity inventory with a set of local phone numbers.
 */
export function compareInventory(
  vitelityDIDs: VitelityDID[],
  localPhoneNumbers: string[]
): VitelitySyncResult {
  const normalize = (n: string) => n.replace(/\D/g, "").slice(-10);
  
  const vitelitySet = new Set(vitelityDIDs.map(d => normalize(d.did)));
  const localSet = new Set(localPhoneNumbers.map(n => normalize(n)));
  
  const added: string[] = [];
  const removed: string[] = [];
  let matched = 0;
  
  for (const did of Array.from(vitelitySet)) {
    if (localSet.has(did)) {
      matched++;
    } else {
      added.push(did);
    }
  }
  
  for (const num of Array.from(localSet)) {
    if (!vitelitySet.has(num)) {
      removed.push(num);
    }
  }
  
  return {
    added,
    removed,
    matched,
    totalVitelity: vitelitySet.size,
    totalLocal: localSet.size,
  };
}

// ─── Deprecated v1.0 stubs (kept for backward compatibility) ────

/** @deprecated Use searchAvailableDIDs(tnMask) instead */
export async function listAvailableStates(_type: string = "perminute"): Promise<string[]> {
  throw new Error("listAvailableStates has been deprecated by Vitelity. Use searchAvailableDIDs with a tnMask pattern instead.");
}

/** @deprecated Use searchAvailableDIDs(tnMask) instead */
export async function listAvailableRateCenters(_state: string): Promise<string[]> {
  throw new Error("listAvailableRateCenters has been deprecated by Vitelity. Use searchAvailableDIDs with a tnMask pattern instead.");
}
