/**
 * Vitelity/Voyant API Service
 * 
 * Integrates with the Vitelity API to fetch DIDs owned by the account.
 * API docs: https://apihelp.vitelity.net/
 * Base URL: https://api.vitelity.net/api.php (POST)
 * Auth: login + pass POST params
 * 
 * listdids response format (XML):
 *   <content><status>ok</status><numbers>
 *     <number><did>2015551212</did><ratecenter>JERSEYCITY</ratecenter>
 *       <state>NJ</state><rate_per_minute>.015</rate_per_minute>
 *       <subaccount>Main</subaccount><rate_per_month>1</rate_per_month>
 *     </number>
 *   </numbers></content>
 * 
 * Plain text format (with extra=yes):
 *   x[[2015551212,JERSEYCITY,.015,Main,NJ,1\n2015551213,...[[x
 */

const VITELITY_API_URL = "https://api.vitelity.net/api.php";

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
 * Parse the Vitelity plain-text response.
 * Format: x[[data[[x  where data is newline-separated CSV rows
 * With extra=yes: {NUMBER},{RATECENTER},{RATE_PER_MINUTE},{SUB_ACCOUNT},{STATE},{RATE_PER_MONTH}
 */
function parsePlainTextResponse(body: string): VitelityDID[] {
  // Extract content between x[[ and [[x
  const match = body.match(/x?\[\[([\s\S]*?)\]\]x?/);
  if (!match || !match[1]) {
    // Check for error responses
    const errorMatch = body.match(/\[\[(.*)/);
    if (errorMatch) {
      const errCode = errorMatch[1].trim();
      const errors: Record<string, string> = {
        missingdata: "Missing login, pass or cmd parameters",
        invalidauth: "Invalid Vitelity username or password",
        invalid: "Invalid parameters",
        none: "No DIDs found on this account",
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
 * Fetch all DIDs from the Vitelity account.
 */
export async function listVitelityDIDs(): Promise<VitelityDID[]> {
  const { login, pass } = getCredentials();

  const params = new URLSearchParams({
    login,
    pass,
    cmd: "listdids",
    extra: "yes",
  });

  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Vitelity API HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  return parsePlainTextResponse(body);
}

/**
 * Check Vitelity account balance.
 */
export async function getVitelityBalance(): Promise<string> {
  const { login, pass } = getCredentials();

  const params = new URLSearchParams({
    login,
    pass,
    cmd: "balance",
  });

  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Vitelity API HTTP error: ${response.status}`);
  }

  const body = await response.text();
  const match = body.match(/\[\[([\s\S]*)/);
  if (match) {
    return match[1].replace(/\]\].*/, "").trim();
  }
  return body.trim();
}

/**
 * Test Vitelity API connectivity by fetching balance.
 * Returns true if credentials are valid.
 */
export async function testVitelityConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const balance = await getVitelityBalance();
    return { success: true, message: `Connected. Account balance: $${balance}` };
  } catch (err: any) {
    return { success: false, message: err.message || "Connection failed" };
  }
}

/**
 * Parse a simple Vitelity text response (success/error/data after [[).
 */
function parseSimpleResponse(body: string): { success: boolean; data: string } {
  const match = body.match(/\[\[([\s\S]*)/);
  if (!match) return { success: false, data: body.trim() };
  const data = match[1].replace(/\]\].*/, "").trim();
  if (data === "success") return { success: true, data: "success" };
  // Check for known error codes
  const errors = ["missingdata", "invalidauth", "invalid", "missingrc", "unavailable", "none", "missingdid"];
  if (errors.includes(data)) return { success: false, data };
  return { success: true, data };
}

// ─── DID Purchasing ───────────────────────────────────────────────

export interface AvailableState {
  state: string;
  name: string;
}

export interface AvailableRateCenter {
  rateCenter: string;
  state: string;
}

export interface AvailableDID {
  did: string;
  rateCenter: string;
  state: string;
  ratePerMinute: string;
  ratePerMonth: string;
  type: string;
}

/**
 * List states with available DIDs for purchase.
 * cmd=listavailstates&type=perminute
 * Returns newline-separated state codes
 */
export async function listAvailableStates(type: string = "perminute"): Promise<string[]> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "listavailstates", type });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (!success) throw new Error(`Vitelity error: ${data}`);
  return data.split("\n").map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * List available rate centers in a state.
 * cmd=listavailratecenters&state=XX
 * Returns newline-separated rate center names
 */
export async function listAvailableRateCenters(state: string): Promise<string[]> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "listavailratecenters", state: state.toUpperCase() });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (!success) throw new Error(`Vitelity error: ${data}`);
  return data.split("\n").map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Search available local DIDs for purchase.
 * cmd=listlocal&state=XX&ratecenter=XXXX&withrates=yes&type=perminute
 * Returns CSV: DID,RATECENTER,RATE_PER_MINUTE,RATE_PER_MONTH
 */
export async function searchAvailableDIDs(
  state: string,
  rateCenter?: string,
  type: string = "perminute"
): Promise<AvailableDID[]> {
  const { login, pass } = getCredentials();
  const paramObj: Record<string, string> = {
    login, pass, cmd: "listlocal",
    state: state.toUpperCase(),
    withrates: "yes",
    type,
  };
  if (rateCenter) paramObj.ratecenter = rateCenter;
  const params = new URLSearchParams(paramObj);
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (!success) {
    if (data === "none" || data === "unavailable") return [];
    throw new Error(`Vitelity error: ${data}`);
  }
  const lines = data.split("\n").filter(l => l.trim());
  return lines.map(line => {
    const parts = line.trim().split(",");
    return {
      did: parts[0]?.trim() || "",
      rateCenter: parts[1]?.trim() || rateCenter || "",
      ratePerMinute: parts[2]?.trim() || "",
      ratePerMonth: parts[3]?.trim() || "",
      state: state.toUpperCase(),
      type,
    };
  }).filter(d => d.did.length >= 10);
}

/**
 * Purchase a local DID.
 * cmd=getlocaldid&did=XXXXXXXXXX&type=perminute
 * Returns "success" on successful purchase.
 */
export async function purchaseDID(
  did: string,
  type: string = "perminute"
): Promise<{ success: boolean; message: string }> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "getlocaldid", did, type });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (success) {
    return { success: true, message: `DID ${did} purchased successfully` };
  }
  const errorMessages: Record<string, string> = {
    missingdata: "Missing required parameters",
    invalidauth: "Invalid Vitelity credentials",
    invalid: "Invalid DID number",
    unavailable: "DID is no longer available",
    none: "DID not found",
  };
  return { success: false, message: errorMessages[data] || `Purchase failed: ${data}` };
}

/**
 * Route a DID to a SIP endpoint.
 * cmd=reroute&did=XXXXXXXXXX&routesip=sip.server.com
 */
export async function routeDID(
  did: string,
  routeSip: string
): Promise<{ success: boolean; message: string }> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "reroute", did, routesip: routeSip });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `DID ${did} routed to ${routeSip}` };
  return { success: false, message: `Routing failed: ${data}` };
}

/**
 * Remove/release a DID from the account.
 * cmd=removedid&did=XXXXXXXXXX
 */
export async function removeDID(
  did: string
): Promise<{ success: boolean; message: string }> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "removedid", did });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `DID ${did} removed from account` };
  return { success: false, message: `Remove failed: ${data}` };
}

// ─── CNAM Lookup ──────────────────────────────────────────────────

export interface CnamResult {
  did: string;
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Perform a CNAM (Caller ID Name) lookup on a phone number.
 * cmd=cnam&did=XXXXXXXXXX
 * Returns the caller name associated with the number.
 * This is a paid service - charged per lookup.
 */
export async function cnamLookup(did: string): Promise<CnamResult> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "cnam", did });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
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
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "lidb", did, name });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (success) return { success: true, message: `LIDB set for ${did}: ${name}` };
  return { success: false, message: `LIDB failed: ${data}` };
}

/**
 * List all DIDs where LIDB/CNAM name change is available.
 * cmd=lidbavailall
 */
export async function listLidbAvailable(): Promise<string[]> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "lidbavailall" });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (!success) return [];
  return data.split("\n").map(s => s.trim()).filter(s => s.length > 0);
}

// ─── Toll-Free DID Purchasing ────────────────────────────────────

export interface AvailableTollFreeDID {
  did: string;
  ratePerMinute: string;
  ratePerMonth: string;
  type: "tollfree";
}

/**
 * Search available toll-free DIDs for purchase.
 * cmd=listtollfree&type=perminute
 * Returns CSV: DID,RATE_PER_MINUTE,RATE_PER_MONTH
 */
export async function searchAvailableTollFreeDIDs(
  type: string = "perminute"
): Promise<AvailableTollFreeDID[]> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "listtollfree", type });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (!success) {
    if (data === "none" || data === "unavailable") return [];
    throw new Error(`Vitelity error: ${data}`);
  }
  const lines = data.split("\n").filter(l => l.trim());
  return lines.map(line => {
    const parts = line.trim().split(",");
    return {
      did: parts[0]?.trim() || "",
      ratePerMinute: parts[1]?.trim() || "",
      ratePerMonth: parts[2]?.trim() || "",
      type: "tollfree" as const,
    };
  }).filter(d => d.did.length >= 10);
}

/**
 * Purchase a toll-free DID.
 * cmd=gettollfree&did=XXXXXXXXXX&type=perminute
 */
export async function purchaseTollFreeDID(
  did: string,
  type: string = "perminute"
): Promise<{ success: boolean; message: string }> {
  const { login, pass } = getCredentials();
  const params = new URLSearchParams({ login, pass, cmd: "gettollfree", did, type });
  const response = await fetch(VITELITY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Vitelity API HTTP error: ${response.status}`);
  const body = await response.text();
  const { success, data } = parseSimpleResponse(body);
  if (success) {
    return { success: true, message: `Toll-free DID ${did} purchased successfully` };
  }
  const errorMessages: Record<string, string> = {
    missingdata: "Missing required parameters",
    invalidauth: "Invalid Vitelity credentials",
    invalid: "Invalid DID number",
    unavailable: "DID is no longer available",
    none: "DID not found",
  };
  return { success: false, message: errorMessages[data] || `Purchase failed: ${data}` };
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
 * Returns which DIDs need to be added or flagged as removed.
 */
export function compareInventory(
  vitelityDIDs: VitelityDID[],
  localPhoneNumbers: string[]
): VitelitySyncResult {
  // Normalize all numbers to 10-digit format
  const normalize = (n: string) => n.replace(/\D/g, "").slice(-10);
  
  const vitelitySet = new Set(vitelityDIDs.map(d => normalize(d.did)));
  const localSet = new Set(localPhoneNumbers.map(n => normalize(n)));
  
  const added: string[] = [];
  const removed: string[] = [];
  let matched = 0;
  
  // DIDs on Vitelity but not local
  for (const did of Array.from(vitelitySet)) {
    if (localSet.has(did)) {
      matched++;
    } else {
      added.push(did);
    }
  }
  
  // DIDs local but not on Vitelity
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
