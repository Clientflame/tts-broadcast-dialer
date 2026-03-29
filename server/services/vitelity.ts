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
