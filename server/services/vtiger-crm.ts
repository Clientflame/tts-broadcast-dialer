/**
 * Vtiger CRM Integration Service
 * Connects to Vtiger CRM REST API to import contacts
 * API Docs: https://vtap.vtiger.com/platform/rest-apis.html
 */

interface VtigerConfig {
  url: string;       // CRM URL (e.g., https://mycompany.vtiger.com)
  username: string;  // CRM username
  accessKey: string; // Access Key from My Preferences
}

interface VtigerContact {
  id: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  mailingstreet?: string;
  mailingcity?: string;
  mailingstate?: string;
  mailingzip?: string;
  mailingcountry?: string;
  account_id?: string;
  [key: string]: any;
}

interface VtigerResponse {
  success: boolean;
  result?: any;
  error?: { code: string; message: string };
}

async function getVtigerConfig(): Promise<VtigerConfig | null> {
  const { getAppSetting } = await import("../db");
  const url = await getAppSetting("vtiger_url");
  const username = await getAppSetting("vtiger_username");
  const accessKey = await getAppSetting("vtiger_access_key");
  if (!url || !username || !accessKey) return null;
  return { url: url.replace(/\/$/, ""), username, accessKey };
}

function getAuthHeader(config: VtigerConfig): string {
  return "Basic " + Buffer.from(`${config.username}:${config.accessKey}`).toString("base64");
}

async function vtigerRequest(config: VtigerConfig, path: string, params?: Record<string, string>): Promise<VtigerResponse> {
  const endpoint = `${config.url}/restapi/v1/vtiger/default${path}`;
  const url = new URL(endpoint);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(config),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Vtiger API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function testVtigerConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
  try {
    const config = await getVtigerConfig();
    if (!config) return { success: false, error: "Vtiger CRM not configured. Set URL, username, and access key in Settings." };

    const result = await vtigerRequest(config, "/me");
    if (result.success && result.result) {
      return {
        success: true,
        user: `${result.result.first_name || ""} ${result.result.last_name || ""}`.trim() || result.result.user_name,
      };
    }
    return { success: false, error: result.error?.message || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchVtigerContacts(opts?: {
  limit?: number;
  offset?: number;
  query?: string;
}): Promise<{ contacts: VtigerContact[]; total: number; error?: string }> {
  try {
    const config = await getVtigerConfig();
    if (!config) return { contacts: [], total: 0, error: "Vtiger CRM not configured" };

    const limit = opts?.limit || 100;
    const offset = opts?.offset || 0;

    // Build query - Vtiger uses SQL-like query syntax
    let queryStr = `SELECT * FROM Contacts`;
    if (opts?.query) {
      queryStr += ` WHERE firstname LIKE '%${opts.query}%' OR lastname LIKE '%${opts.query}%' OR phone LIKE '%${opts.query}%' OR mobile LIKE '%${opts.query}%'`;
    }
    queryStr += ` LIMIT ${limit} OFFSET ${offset};`;

    const result = await vtigerRequest(config, "/query", { query: queryStr });
    if (result.success && Array.isArray(result.result)) {
      return { contacts: result.result, total: result.result.length };
    }
    return { contacts: [], total: 0, error: result.error?.message || "Failed to fetch contacts" };
  } catch (err: any) {
    return { contacts: [], total: 0, error: err.message };
  }
}

/**
 * Import contacts from Vtiger CRM into a contact list
 * Extracts phone numbers (phone or mobile field) and names
 */
export async function importVtigerContacts(listId: number, userId: number, opts?: {
  limit?: number;
  query?: string;
  phoneField?: "phone" | "mobile" | "both";
  skipDupeCheck?: boolean;
}): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const { bulkCreateContacts } = await import("../db");

  const phoneField = opts?.phoneField || "both";
  let allContacts: VtigerContact[] = [];
  let offset = 0;
  const batchSize = 100;
  const maxContacts = opts?.limit || 10000;

  // Paginate through Vtiger contacts
  while (allContacts.length < maxContacts) {
    const batch = await fetchVtigerContacts({
      limit: Math.min(batchSize, maxContacts - allContacts.length),
      offset,
      query: opts?.query,
    });

    if (batch.error) return { imported: 0, skipped: 0, errors: [batch.error] };
    if (batch.contacts.length === 0) break;

    allContacts = allContacts.concat(batch.contacts);
    offset += batch.contacts.length;

    // If we got fewer than requested, we've reached the end
    if (batch.contacts.length < batchSize) break;
  }

  // Extract phone numbers and build contact data
  const contactData: Array<{ phoneNumber: string; firstName?: string; lastName?: string; email?: string; listId: number; userId: number }> = [];
  const errors: string[] = [];

  for (const vc of allContacts) {
    const phones: string[] = [];
    if ((phoneField === "phone" || phoneField === "both") && vc.phone) phones.push(vc.phone);
    if ((phoneField === "mobile" || phoneField === "both") && vc.mobile && !phones.includes(vc.mobile)) phones.push(vc.mobile);

    if (phones.length === 0) {
      errors.push(`Contact ${vc.firstname || ""} ${vc.lastname || ""} (${vc.id}) has no phone number`);
      continue;
    }

    for (const phone of phones) {
      // Normalize phone number
      const normalized = phone.replace(/[^\d+]/g, "");
      if (normalized.length < 7) {
        errors.push(`Invalid phone: ${phone} for ${vc.firstname || ""} ${vc.lastname || ""}`);
        continue;
      }

      contactData.push({
        phoneNumber: normalized,
        firstName: vc.firstname || undefined,
        lastName: vc.lastname || undefined,
        email: vc.email || undefined,
        listId,
        userId,
      });
    }
  }

  if (contactData.length === 0) {
    return { imported: 0, skipped: 0, errors: errors.length > 0 ? errors : ["No contacts with phone numbers found"] };
  }

  // Bulk import
  const result = await bulkCreateContacts(contactData, { skipDupeCheck: opts?.skipDupeCheck });

  return {
    imported: result.count,
    skipped: result.duplicatesOmitted + result.dncOmitted,
    errors: errors.slice(0, 20), // Limit error messages
  };
}

export async function getVtigerContactCount(query?: string): Promise<{ count: number; error?: string }> {
  try {
    const config = await getVtigerConfig();
    if (!config) return { count: 0, error: "Vtiger CRM not configured" };

    let queryStr = `SELECT COUNT(*) FROM Contacts`;
    if (query) {
      queryStr += ` WHERE firstname LIKE '%${query}%' OR lastname LIKE '%${query}%' OR phone LIKE '%${query}%'`;
    }
    queryStr += `;`;

    const result = await vtigerRequest(config, "/query", { query: queryStr });
    if (result.success && result.result?.[0]) {
      return { count: Number(result.result[0].count) || 0 };
    }
    return { count: 0, error: result.error?.message };
  } catch (err: any) {
    return { count: 0, error: err.message };
  }
}
