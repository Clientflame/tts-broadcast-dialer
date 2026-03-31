/**
 * vTiger Cloud CRM Integration Service
 * 
 * Uses vTiger REST API with HTTP Basic auth (username + access key).
 * Provides contact/account lookup by phone number for screen-pop functionality.
 */

const VTIGER_URL = process.env.VTIGER_URL || "";
const VTIGER_USERNAME = process.env.VTIGER_USERNAME || "";
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY || "";

function getBaseEndpoint(): string {
  const url = VTIGER_URL.replace(/\/+$/, "");
  return `${url}/restapi/v1/vtiger/default`;
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${VTIGER_USERNAME}:${VTIGER_ACCESS_KEY}`).toString("base64");
}

export function isVtigerConfigured(): boolean {
  return !!(VTIGER_URL && VTIGER_USERNAME && VTIGER_ACCESS_KEY);
}

export interface VtigerContact {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  mobile: string;
  account_id: string;
  contact_no: string;
  module: string;
  /** Direct URL to open this record in vTiger */
  crmUrl: string;
}

/**
 * Lookup contacts/leads/accounts in vTiger by phone number.
 * Uses the /lookup endpoint which searches across phone fields.
 */
export async function lookupByPhone(phoneNumber: string): Promise<VtigerContact[]> {
  if (!isVtigerConfigured()) {
    throw new Error("vTiger CRM is not configured. Please add VTIGER_URL, VTIGER_USERNAME, and VTIGER_ACCESS_KEY.");
  }

  // Normalize phone: strip non-digits
  const normalized = phoneNumber.replace(/\D/g, "");
  if (!normalized || normalized.length < 7) {
    return [];
  }

  const endpoint = getBaseEndpoint();
  const searchModules = JSON.stringify(["Contacts", "Leads", "Accounts"]);
  const url = `${endpoint}/lookup?type=phone&value=${encodeURIComponent(normalized)}&searchIn=${encodeURIComponent(searchModules)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": getAuthHeader(),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[vTiger] Lookup failed (${response.status}): ${text}`);
      throw new Error(`vTiger API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.result)) {
      return [];
    }

    const baseUrl = VTIGER_URL.replace(/\/+$/, "");
    return data.result.map((r: any) => {
      // Determine module from the record ID prefix or available fields
      let module = "Contacts";
      if (r.id) {
        // vTiger webservice IDs: Contacts typically start with 12x, Leads with 10x, Accounts with 11x
        // But we can also check for module-specific fields
        if (r.company && !r.firstname) module = "Accounts";
        else if (r.leadstatus) module = "Leads";
      }

      return {
        id: r.id || "",
        firstname: r.firstname || "",
        lastname: r.lastname || r.accountname || "",
        email: r.email || r.email1 || "",
        phone: r.phone || "",
        mobile: r.mobile || "",
        account_id: r.account_id || "",
        contact_no: r.contact_no || r.lead_no || r.account_no || "",
        module,
        crmUrl: `${baseUrl}/index.php?module=${module}&view=Detail&record=${r.id || ""}`,
      };
    });
  } catch (err: any) {
    if (err.message?.includes("vTiger API error")) throw err;
    console.error("[vTiger] Lookup error:", err.message);
    throw new Error(`Failed to connect to vTiger CRM: ${err.message}`);
  }
}

/**
 * Build a direct URL to open a contact/lead/account in vTiger.
 * This is a simple URL builder that doesn't require API access.
 */
export function buildVtigerRecordUrl(recordId: string, module: string = "Contacts"): string {
  const baseUrl = (VTIGER_URL || "https://company1233712.od2.vtiger.com").replace(/\/+$/, "");
  return `${baseUrl}/index.php?module=${module}&view=Detail&record=${recordId}`;
}

/**
 * Build a vTiger search URL for a phone number (opens vTiger's built-in search).
 * This works even without API credentials — just opens the CRM search page.
 */
export function buildVtigerSearchUrl(phoneNumber: string): string {
  const baseUrl = (VTIGER_URL || "https://company1233712.od2.vtiger.com").replace(/\/+$/, "");
  const normalized = phoneNumber.replace(/\D/g, "");
  return `${baseUrl}/index.php?module=Contacts&searchValue=${encodeURIComponent(normalized)}&search=true`;
}
