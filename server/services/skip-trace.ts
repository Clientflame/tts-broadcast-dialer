/**
 * Skip Tracing Service
 * Connects to skip-tracing APIs (TLO, Accurint, SkipGenie, or manual)
 * to find updated phone numbers for debtors with disconnected numbers.
 */
import * as db from "../db";
import type { SkipTraceResult } from "../../drizzle/schema";

export interface SkipTraceInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  ssn4?: string;
}

export interface SkipTraceProviderConfig {
  provider: string;
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
}

/**
 * Get the configured skip trace provider settings from app_settings
 */
export async function getSkipTraceConfig(): Promise<SkipTraceProviderConfig | null> {
  const provider = await db.getAppSetting("skip_trace_provider");
  const apiUrl = await db.getAppSetting("skip_trace_api_url");
  const apiKey = await db.getAppSetting("skip_trace_api_key");
  const apiSecret = await db.getAppSetting("skip_trace_api_secret");

  if (!provider || !apiUrl || !apiKey) return null;

  return { provider, apiUrl, apiKey, apiSecret: apiSecret || undefined };
}

/**
 * Execute a single skip trace lookup
 */
export async function executeSkipTrace(
  input: SkipTraceInput,
  config: SkipTraceProviderConfig
): Promise<SkipTraceResult[]> {
  switch (config.provider) {
    case "skipgenie":
      return executeSkipGenie(input, config);
    case "tlo":
      return executeTLO(input, config);
    case "accurint":
      return executeAccurint(input, config);
    case "manual":
      // Manual mode — no API call, user enters results manually
      return [];
    default:
      throw new Error(`Unknown skip trace provider: ${config.provider}`);
  }
}

/**
 * SkipGenie API integration
 */
async function executeSkipGenie(
  input: SkipTraceInput,
  config: SkipTraceProviderConfig
): Promise<SkipTraceResult[]> {
  try {
    const params = new URLSearchParams();
    if (input.firstName) params.set("first_name", input.firstName);
    if (input.lastName) params.set("last_name", input.lastName);
    if (input.phone) params.set("phone", input.phone);
    if (input.address) params.set("address", input.address);
    if (input.ssn4) params.set("ssn4", input.ssn4);

    const response = await fetch(`${config.apiUrl}/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SkipGenie API error (${response.status}): ${sanitizeApiError(errorText)}`);
    }

    const data = await response.json();
    return normalizeSkipGenieResults(data);
  } catch (err: any) {
    if (err.message?.includes("SkipGenie API error")) throw err;
    throw new Error(`SkipGenie connection failed: ${err.message}`);
  }
}

/**
 * TLO (TransUnion) API integration
 */
async function executeTLO(
  input: SkipTraceInput,
  config: SkipTraceProviderConfig
): Promise<SkipTraceResult[]> {
  try {
    const body = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      address: input.address,
      ssn4: input.ssn4,
    };

    const response = await fetch(`${config.apiUrl}/person/search`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret || ""}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TLO API error (${response.status}): ${sanitizeApiError(errorText)}`);
    }

    const data = await response.json();
    return normalizeTLOResults(data);
  } catch (err: any) {
    if (err.message?.includes("TLO API error")) throw err;
    throw new Error(`TLO connection failed: ${err.message}`);
  }
}

/**
 * Accurint (LexisNexis) API integration
 */
async function executeAccurint(
  input: SkipTraceInput,
  config: SkipTraceProviderConfig
): Promise<SkipTraceResult[]> {
  try {
    const body = {
      Name: { First: input.firstName, Last: input.lastName },
      Phone10: input.phone?.replace(/\D/g, ""),
      Address: input.address ? { StreetAddress1: input.address } : undefined,
      SSN: input.ssn4 ? `*****${input.ssn4}` : undefined,
    };

    const response = await fetch(`${config.apiUrl}/WsSearchService/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Accurint API error (${response.status}): ${sanitizeApiError(errorText)}`);
    }

    const data = await response.json();
    return normalizeAccurintResults(data);
  } catch (err: any) {
    if (err.message?.includes("Accurint API error")) throw err;
    throw new Error(`Accurint connection failed: ${err.message}`);
  }
}

// ─── Result Normalizers ─────────────────────────────────────────────────────

function normalizeSkipGenieResults(data: any): SkipTraceResult[] {
  const results: SkipTraceResult[] = [];
  const records = data?.results || data?.records || [];
  for (const record of Array.isArray(records) ? records : []) {
    const phones = record.phones || record.phone_numbers || [];
    for (const phone of Array.isArray(phones) ? phones : []) {
      results.push({
        phoneNumber: phone.number || phone.phone || "",
        phoneType: normalizePhoneType(phone.type || phone.line_type),
        phoneStatus: normalizePhoneStatus(phone.status || phone.connected),
        firstName: record.first_name || record.firstName,
        lastName: record.last_name || record.lastName,
        address: record.address || record.street_address,
        city: record.city,
        state: record.state,
        zip: record.zip || record.postal_code,
        email: record.email,
        employer: record.employer,
        confidence: phone.confidence || phone.score || 50,
      });
    }
  }
  return results;
}

function normalizeTLOResults(data: any): SkipTraceResult[] {
  const results: SkipTraceResult[] = [];
  const persons = data?.persons || data?.results || [];
  for (const person of Array.isArray(persons) ? persons : []) {
    const phones = person.phones || person.phoneNumbers || [];
    for (const phone of Array.isArray(phones) ? phones : []) {
      results.push({
        phoneNumber: phone.phoneNumber || phone.number || "",
        phoneType: normalizePhoneType(phone.phoneType || phone.type),
        phoneStatus: normalizePhoneStatus(phone.connectionStatus || phone.status),
        firstName: person.firstName || person.name?.first,
        lastName: person.lastName || person.name?.last,
        address: person.addresses?.[0]?.streetAddress,
        city: person.addresses?.[0]?.city,
        state: person.addresses?.[0]?.state,
        zip: person.addresses?.[0]?.zip,
        email: person.emails?.[0]?.address,
        employer: person.employers?.[0]?.name,
        confidence: phone.confidence || 60,
      });
    }
  }
  return results;
}

function normalizeAccurintResults(data: any): SkipTraceResult[] {
  const results: SkipTraceResult[] = [];
  const records = data?.Records || data?.SearchResult?.Records || [];
  for (const record of Array.isArray(records) ? records : []) {
    const phones = record.Phones || record.PhoneNumbers || [];
    for (const phone of Array.isArray(phones) ? phones : []) {
      results.push({
        phoneNumber: phone.Phone10 || phone.Number || "",
        phoneType: normalizePhoneType(phone.PhoneType),
        phoneStatus: normalizePhoneStatus(phone.ListingType || phone.Status),
        firstName: record.Name?.First,
        lastName: record.Name?.Last,
        address: record.Address?.StreetAddress1,
        city: record.Address?.City,
        state: record.Address?.State,
        zip: record.Address?.Zip5,
        email: record.EmailAddresses?.[0]?.Address,
        employer: record.Employers?.[0]?.CompanyName,
        confidence: phone.Confidence || 55,
      });
    }
  }
  return results;
}

function normalizePhoneType(type: string | undefined): "mobile" | "landline" | "voip" | "unknown" {
  if (!type) return "unknown";
  const t = type.toLowerCase();
  if (t.includes("mobile") || t.includes("cell") || t.includes("wireless")) return "mobile";
  if (t.includes("land") || t.includes("pots")) return "landline";
  if (t.includes("voip") || t.includes("virtual")) return "voip";
  return "unknown";
}

function normalizePhoneStatus(status: string | undefined): "connected" | "disconnected" | "unknown" {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s.includes("connect") || s.includes("active") || s === "true") return "connected";
  if (s.includes("disconnect") || s.includes("inactive") || s === "false") return "disconnected";
  return "unknown";
}

function sanitizeApiError(text: string): string {
  // Strip any API keys or tokens from error messages
  return text.replace(/[A-Za-z0-9_-]{20,}/g, "[REDACTED]").substring(0, 200);
}
