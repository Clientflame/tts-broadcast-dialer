/**
 * External REST API with API Key Authentication
 * 
 * Provides programmatic access for external systems (CRMs, lead gen platforms, automation tools)
 * to interact with the TTS Broadcast Dialer.
 * 
 * Authentication: Bearer token in Authorization header
 * Rate limiting: Per-key configurable (default 60 req/min)
 * 
 * Endpoints:
 *   GET    /api/v1/campaigns              - List campaigns
 *   GET    /api/v1/campaigns/:id          - Get campaign details
 *   POST   /api/v1/campaigns              - Create a campaign
 *   PUT    /api/v1/campaigns/:id          - Update a campaign
 *   DELETE /api/v1/campaigns/:id          - Delete a campaign
 *   POST   /api/v1/campaigns/:id/launch   - Launch a campaign
 *   POST   /api/v1/campaigns/:id/stop     - Stop (cancel) a campaign
 *   POST   /api/v1/campaigns/:id/pause    - Pause a campaign
 *   POST   /api/v1/campaigns/:id/resume   - Resume/start a paused/draft campaign
 *   GET    /api/v1/campaigns/:id/stats    - Get campaign analytics/stats
 *   GET    /api/v1/dialer/live            - Get live dialer stats
 *   GET    /api/v1/contacts               - List contacts (by list or campaign)
 *   GET    /api/v1/contacts/:id           - Get a single contact
 *   PUT    /api/v1/contacts/:id           - Update a contact
 *   DELETE /api/v1/contacts/:id           - Delete a contact
 *   POST   /api/v1/contacts               - Import a single contact
 *   POST   /api/v1/contacts/bulk          - Bulk import contacts (JSON array)
 *   POST   /api/v1/contacts/csv           - Import contacts from CSV upload
 *   POST   /api/v1/contacts/import        - Legacy import (JSON array)
 *   GET    /api/v1/contact-lists          - List all contact lists
 *   POST   /api/v1/contact-lists          - Create a new contact list
 *   GET    /api/v1/contact-lists/:id      - Get contact list details
 *   PUT    /api/v1/contact-lists/:id      - Update a contact list
 *   DELETE /api/v1/contact-lists/:id      - Delete a contact list
 *   GET    /api/v1/scripts                - List call scripts
 *   GET    /api/v1/scripts/:id            - Get a call script
 *   POST   /api/v1/scripts                - Create a call script
 *   PUT    /api/v1/scripts/:id            - Update a call script
 *   DELETE /api/v1/scripts/:id            - Delete a call script
 *   GET    /api/v1/audio                  - List audio files
 *   GET    /api/v1/audio/:id              - Get an audio file
 *   POST   /api/v1/audio/generate         - Generate TTS audio
 *   DELETE /api/v1/audio/:id              - Delete an audio file
 *   GET    /api/v1/caller-ids             - List caller IDs
 *   POST   /api/v1/caller-ids             - Add a caller ID
 *   POST   /api/v1/caller-ids/bulk        - Bulk add caller IDs
 *   PUT    /api/v1/caller-ids/:id         - Update a caller ID
 *   DELETE /api/v1/caller-ids/:id         - Delete a caller ID
 *   GET    /api/v1/settings               - Get app settings
 *   PUT    /api/v1/settings               - Update app settings
 *   GET    /api/v1/call-logs/:campaignId  - Get call logs for a campaign
 *   GET    /api/v1/reports/summary        - Get summary report
 *   GET    /api/v1/dnc                    - List DNC numbers
 *   POST   /api/v1/dnc                    - Add number(s) to DNC
 *   DELETE  /api/v1/dnc/:phoneNumber      - Remove from DNC
 */

import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";
import { startCampaign, pauseCampaign, cancelCampaign, getDialerLiveStats } from "./dialer";
import { generateTTS } from "./tts";

const restApiRouter = Router();

// ─── Rate Limiting (in-memory, per API key) ──────────────────────────────────
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();

function checkRateLimit(keyId: number, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(keyId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(keyId, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
interface AuthenticatedRequest extends Request {
  apiKeyId?: number;
  apiPermissions?: any;
}

async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <api_key>" });
  }

  const key = authHeader.slice(7);
  const startTime = Date.now();

  try {
    const result = await db.validateApiKey(key);
    if (!result.valid) {
      await db.logApiRequest({
        apiKeyId: 0,
        method: req.method,
        endpoint: req.path,
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: "Invalid or expired API key" });
    }

    // Check rate limit
    if (!checkRateLimit(result.keyId!, 60)) {
      await db.logApiRequest({
        apiKeyId: result.keyId!,
        method: req.method,
        endpoint: req.path,
        statusCode: 429,
        responseTimeMs: Date.now() - startTime,
        ipAddress: req.ip,
      });
      return res.status(429).json({ error: "Rate limit exceeded. Try again in 60 seconds." });
    }

    req.apiKeyId = result.keyId;
    req.apiPermissions = result.permissions;

    // Log request after response
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      db.logApiRequest({
        apiKeyId: result.keyId!,
        method: req.method,
        endpoint: req.path,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startTime,
        ipAddress: req.ip,
      }).catch(() => {});
      return originalJson(body);
    };

    next();
  } catch (err) {
    return res.status(500).json({ error: "Authentication error" });
  }
}

restApiRouter.use(apiKeyAuth);

// ─── Helper: Normalize phone number ─────────────────────────────────────────
function normalizePhone(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

// ─── Helper: Validate a single contact object ──────────────────────────────
function validateContact(c: any): { valid: boolean; error?: string; data?: any } {
  const phone = normalizePhone(c.phoneNumber || c.phone || c.phone_number || "");
  if (!phone || phone.length < 7 || phone.length > 15) {
    return { valid: false, error: `Invalid phone number: "${c.phoneNumber || c.phone || c.phone_number || ""}"` };
  }
  return {
    valid: true,
    data: {
      phoneNumber: phone,
      firstName: c.firstName || c.first_name || null,
      lastName: c.lastName || c.last_name || null,
      email: c.email || null,
      company: c.company || null,
      state: c.state || null,
      databaseName: c.databaseName || c.database_name || null,
      customFields: c.customFields || c.custom_fields || {},
    },
  };
}

// ─── Helper: Parse CSV text into contact objects ────────────────────────────
function parseCsvToContacts(csvText: string): { contacts: any[]; errors: string[] } {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { contacts: [], errors: ["CSV must have a header row and at least one data row"] };

  const headerLine = lines[0];
  // Support comma, tab, pipe delimiters
  const delimiter = headerLine.includes("\t") ? "\t" : headerLine.includes("|") ? "|" : ",";
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ""));

  // Map common header names to our field names
  const fieldMap: Record<string, string> = {
    phone: "phoneNumber", phonenumber: "phoneNumber", phone_number: "phoneNumber",
    "phone number": "phoneNumber", mobile: "phoneNumber", cell: "phoneNumber", telephone: "phoneNumber",
    firstname: "firstName", first_name: "firstName", "first name": "firstName", first: "firstName",
    lastname: "lastName", last_name: "lastName", "last name": "lastName", last: "lastName",
    name: "fullName",
    email: "email", "e-mail": "email", emailaddress: "email", email_address: "email",
    company: "company", organization: "company", org: "company", business: "company",
    state: "state", st: "state", province: "state",
    database: "databaseName", databasename: "databaseName", database_name: "databaseName",
    "database name": "databaseName", db: "databaseName",
  };

  const contacts: any[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    if (values.length === 0) continue;

    const contact: any = { customFields: {} };
    let hasPhone = false;

    headers.forEach((header, idx) => {
      const value = (values[idx] || "").trim().replace(/^["']|["']$/g, "");
      if (!value) return;

      const mappedField = fieldMap[header];
      if (mappedField === "phoneNumber") {
        contact.phoneNumber = value;
        hasPhone = true;
      } else if (mappedField === "fullName") {
        // Split "First Last" into firstName/lastName
        const parts = value.split(/\s+/);
        contact.firstName = parts[0] || null;
        contact.lastName = parts.slice(1).join(" ") || null;
      } else if (mappedField) {
        contact[mappedField] = value;
      } else {
        // Unknown headers go to customFields
        contact.customFields[header] = value;
      }
    });

    if (!hasPhone) {
      errors.push(`Row ${i + 1}: Missing phone number`);
      continue;
    }

    contacts.push(contact);
  }

  return { contacts, errors };
}

// ─── Helper: Parse a single CSV line (handles quoted fields) ────────────────
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
restApiRouter.get("/campaigns", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have campaigns:read permission" });
  }

  try {
    const campaigns = await db.getCampaigns();
    res.json({
      success: true,
      data: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        totalContacts: c.totalContacts,
        completedCalls: c.completedCalls,
        answeredCalls: c.answeredCalls,
        createdAt: c.createdAt,
      })),
      total: campaigns.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

restApiRouter.get("/campaigns/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have campaigns:read permission" });
  }

  try {
    const campaign = await db.getCampaign(Number(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

restApiRouter.post("/campaigns/:id/launch", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.launch) {
    return res.status(403).json({ error: "API key does not have campaigns:launch permission" });
  }
  try {
    const campaign = await db.getCampaign(Number(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "running") return res.status(400).json({ error: "Campaign is already running" });
    await startCampaign(Number(req.params.id), 0);
    res.json({ success: true, message: `Campaign "${campaign.name}" launched` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to launch campaign" });
  }
});

// ─── Contact Lists ──────────────────────────────────────────────────────────
restApiRouter.get("/contact-lists", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.read) {
    return res.status(403).json({ error: "API key does not have contacts:read permission" });
  }

  try {
    const lists = await db.getContactLists();
    res.json({
      success: true,
      data: lists.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        contactCount: l.contactCount,
        createdAt: l.createdAt,
      })),
      total: lists.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact lists" });
  }
});

restApiRouter.post("/contact-lists", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.write) {
    return res.status(403).json({ error: "API key does not have contacts:write permission" });
  }

  try {
    const { name, description } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "name is required" });
    }
    if (name.length > 255) {
      return res.status(400).json({ error: "name must be 255 characters or less" });
    }

    const result = await db.createContactList({
      userId: 0, // API import
      name: name.trim(),
      description: description || null,
    });

    res.status(201).json({
      success: true,
      data: { id: result.id, name: name.trim(), description: description || null },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create contact list" });
  }
});

restApiRouter.get("/contact-lists/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.read) {
    return res.status(403).json({ error: "API key does not have contacts:read permission" });
  }

  try {
    const list = await db.getContactList(Number(req.params.id));
    if (!list) return res.status(404).json({ error: "Contact list not found" });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact list" });
  }
});

// ─── Contacts: Single Import ────────────────────────────────────────────────
restApiRouter.post("/contacts", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.import) {
    return res.status(403).json({ error: "API key does not have contacts:import permission" });
  }

  try {
    const { listId, phoneNumber, phone, phone_number, firstName, first_name, lastName, last_name,
            email, company, state, databaseName, database_name, customFields, custom_fields } = req.body;

    if (!listId) {
      return res.status(400).json({ error: "listId is required. Use GET /api/v1/contact-lists to find your list ID, or POST /api/v1/contact-lists to create one." });
    }

    // Verify list exists
    const list = await db.getContactList(Number(listId));
    if (!list) {
      return res.status(404).json({ error: `Contact list ${listId} not found` });
    }

    const contactData = {
      phoneNumber: phoneNumber || phone || phone_number,
      firstName: firstName || first_name,
      lastName: lastName || last_name,
      email,
      company,
      state,
      databaseName: databaseName || database_name,
      customFields: customFields || custom_fields,
    };

    const validation = validateContact(contactData);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await db.bulkCreateContacts([{
      listId: Number(listId),
      userId: 0, // API import
      ...validation.data,
    }]);

    if (result.dncOmitted > 0) {
      return res.status(200).json({
        success: true,
        imported: 0,
        skipped: true,
        reason: "Phone number is on the Do Not Call list",
      });
    }

    if (result.duplicatesOmitted > 0) {
      return res.status(200).json({
        success: true,
        imported: 0,
        skipped: true,
        reason: "Duplicate phone number already exists in this list",
      });
    }

    res.status(201).json({
      success: true,
      imported: 1,
      contact: validation.data,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to import contact" });
  }
});

// ─── Contacts: Bulk Import (JSON Array) ─────────────────────────────────────
restApiRouter.post("/contacts/bulk", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.import) {
    return res.status(403).json({ error: "API key does not have contacts:import permission" });
  }

  try {
    const { listId, contacts } = req.body;

    if (!listId) {
      return res.status(400).json({ error: "listId is required" });
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: "contacts[] array is required and must not be empty" });
    }
    if (contacts.length > 10000) {
      return res.status(400).json({ error: "Maximum 10,000 contacts per request. For larger imports, split into multiple requests." });
    }

    // Verify list exists
    const list = await db.getContactList(Number(listId));
    if (!list) {
      return res.status(404).json({ error: `Contact list ${listId} not found` });
    }

    // Validate all contacts
    const validated: any[] = [];
    const validationErrors: { row: number; error: string }[] = [];

    contacts.forEach((c: any, idx: number) => {
      const result = validateContact(c);
      if (result.valid) {
        validated.push({
          listId: Number(listId),
          userId: 0,
          ...result.data,
        });
      } else {
        validationErrors.push({ row: idx + 1, error: result.error! });
      }
    });

    if (validated.length === 0) {
      return res.status(400).json({
        error: "No valid contacts found",
        validationErrors: validationErrors.slice(0, 20), // Show first 20 errors
      });
    }

    const result = await db.bulkCreateContacts(validated);

    res.json({
      success: true,
      imported: result.count,
      duplicatesOmitted: result.duplicatesOmitted,
      dncOmitted: result.dncOmitted,
      validationErrors: validationErrors.length,
      totalSubmitted: contacts.length,
      totalValid: validated.length,
      errors: validationErrors.length > 0 ? validationErrors.slice(0, 20) : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to bulk import contacts" });
  }
});

// ─── Contacts: CSV Upload ───────────────────────────────────────────────────
restApiRouter.post("/contacts/csv", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.import) {
    return res.status(403).json({ error: "API key does not have contacts:import permission" });
  }

  try {
    const contentType = req.headers["content-type"] || "";

    let csvText: string;
    let listId: number | undefined;
    let listName: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      // Handle multipart form upload — read raw body
      // Since we don't have multer, accept CSV as raw text body or base64
      return res.status(400).json({
        error: "Multipart form upload not supported. Send CSV as raw text body with Content-Type: text/csv, or as JSON with { listId, csv: \"...csv content...\" }",
      });
    } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
      // Raw CSV body
      csvText = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : "";
      listId = req.query.listId ? Number(req.query.listId) : undefined;
      listName = req.query.listName as string | undefined;
    } else {
      // JSON body with csv field
      const { csv, listId: bodyListId, listName: bodyListName } = req.body;
      if (!csv || typeof csv !== "string") {
        return res.status(400).json({
          error: "csv field is required. Send CSV content as a string in the 'csv' field, or send raw CSV with Content-Type: text/csv",
        });
      }
      csvText = csv;
      listId = bodyListId ? Number(bodyListId) : undefined;
      listName = bodyListName;
    }

    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "CSV content is empty" });
    }

    // Check CSV size (max 10MB)
    if (Buffer.byteLength(csvText, "utf-8") > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "CSV file too large. Maximum size is 10MB." });
    }

    // Create or find list
    if (!listId && !listName) {
      listName = `API CSV Import ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    }

    if (!listId) {
      const newList = await db.createContactList({
        userId: 0,
        name: listName!,
      });
      listId = newList.id;
    } else {
      const list = await db.getContactList(listId);
      if (!list) {
        return res.status(404).json({ error: `Contact list ${listId} not found` });
      }
    }

    // Parse CSV
    const { contacts: parsedContacts, errors: parseErrors } = parseCsvToContacts(csvText);

    if (parsedContacts.length === 0) {
      return res.status(400).json({
        error: "No valid contacts found in CSV",
        parseErrors: parseErrors.slice(0, 20),
      });
    }

    if (parsedContacts.length > 50000) {
      return res.status(400).json({ error: "CSV contains too many rows. Maximum 50,000 contacts per CSV upload." });
    }

    // Validate all parsed contacts
    const validated: any[] = [];
    const validationErrors: { row: number; error: string }[] = [];

    parsedContacts.forEach((c: any, idx: number) => {
      const result = validateContact(c);
      if (result.valid) {
        validated.push({
          listId: listId!,
          userId: 0,
          ...result.data,
        });
      } else {
        validationErrors.push({ row: idx + 2, error: result.error! }); // +2 for header + 0-index
      }
    });

    if (validated.length === 0) {
      return res.status(400).json({
        error: "No valid contacts after validation",
        validationErrors: validationErrors.slice(0, 20),
        parseErrors: parseErrors.slice(0, 20),
      });
    }

    // Import in batches of 1000
    let totalImported = 0;
    let totalDuplicates = 0;
    let totalDnc = 0;

    for (let i = 0; i < validated.length; i += 1000) {
      const batch = validated.slice(i, i + 1000);
      const result = await db.bulkCreateContacts(batch);
      totalImported += result.count;
      totalDuplicates += result.duplicatesOmitted;
      totalDnc += result.dncOmitted;
    }

    res.json({
      success: true,
      listId,
      imported: totalImported,
      duplicatesOmitted: totalDuplicates,
      dncOmitted: totalDnc,
      validationErrors: validationErrors.length,
      parseErrors: parseErrors.length,
      totalRows: parsedContacts.length,
      totalValid: validated.length,
      errors: validationErrors.length > 0 || parseErrors.length > 0
        ? [...parseErrors.slice(0, 10), ...validationErrors.slice(0, 10).map(e => `Row ${e.row}: ${e.error}`)]
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to import CSV contacts" });
  }
});

// ─── Contacts: Legacy Import (backwards compatible) ─────────────────────────
restApiRouter.post("/contacts/import", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.import) {
    return res.status(403).json({ error: "API key does not have contacts:import permission" });
  }

  try {
    const { campaignId, listId, contacts } = req.body;
    if (!listId || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: "listId and contacts[] array are required" });
    }

    if (contacts.length > 10000) {
      return res.status(400).json({ error: "Maximum 10,000 contacts per import" });
    }

    // Validate contacts format
    const validContacts = contacts.filter((c: any) => c.phoneNumber || c.phone);
    if (validContacts.length === 0) {
      return res.status(400).json({ error: "No valid contacts found. Each contact must have a phoneNumber or phone field." });
    }

    const formatted = validContacts.map((c: any) => ({
      listId,
      userId: 0, // API import
      phoneNumber: normalizePhone(c.phoneNumber || c.phone || ""),
      firstName: c.firstName || c.first_name || null,
      lastName: c.lastName || c.last_name || null,
      customFields: c.customFields || c.custom_fields || {},
    }));

    const result = await db.bulkCreateContacts(formatted);
    res.json({
      success: true,
      imported: result.count,
      duplicatesOmitted: result.duplicatesOmitted,
      dncOmitted: result.dncOmitted,
      total: formatted.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

// ─── Contacts: List/Query ───────────────────────────────────────────────────
restApiRouter.get("/contacts", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.read) {
    return res.status(403).json({ error: "API key does not have contacts:read permission" });
  }

  try {
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined;
    const listId = req.query.listId ? Number(req.query.listId) : undefined;

    if (!campaignId && !listId) {
      return res.status(400).json({ error: "Either campaignId or listId query parameter is required" });
    }

    if (listId) {
      const list = await db.getContactList(listId);
      if (!list) return res.status(404).json({ error: "Contact list not found" });
      const contacts = await db.getContactsByList(listId);
      res.json({ success: true, data: contacts, total: contacts.length, listId });
    } else {
      const contacts = await db.getContacts(campaignId!);
      res.json({ success: true, data: contacts, total: contacts.length, campaignId });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// ─── Call Logs ───────────────────────────────────────────────────────────────
restApiRouter.get("/call-logs/:campaignId", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callLogs?.read) {
    return res.status(403).json({ error: "API key does not have callLogs:read permission" });
  }

  try {
    const logs = await db.getCallLogs(Number(req.params.campaignId));
    res.json({ success: true, data: logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch call logs" });
  }
});

// ─── Reports ─────────────────────────────────────────────────────────────────
restApiRouter.get("/reports/summary", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.reports?.read) {
    return res.status(403).json({ error: "API key does not have reports:read permission" });
  }

  try {
    const campaigns = await db.getCampaigns();
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === "running").length;
    const totalCalls = campaigns.reduce((sum, c) => sum + (c.completedCalls || 0), 0);
    const totalAnswered = campaigns.reduce((sum, c) => sum + (c.answeredCalls || 0), 0);
    const overallAnswerRate = totalCalls > 0 ? Math.round((totalAnswered / totalCalls) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalCampaigns,
        activeCampaigns,
        totalCalls,
        totalAnswered,
        overallAnswerRate,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// ─── DNC ─────────────────────────────────────────────────────────────────────
restApiRouter.get("/dnc", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.dnc?.read) {
    return res.status(403).json({ error: "API key does not have dnc:read permission" });
  }

  try {
    const entries = await db.getDncEntries();
    res.json({ success: true, data: entries, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch DNC list" });
  }
});

restApiRouter.post("/dnc", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.dnc?.write) {
    return res.status(403).json({ error: "API key does not have dnc:write permission" });
  }

  try {
    const { phoneNumbers, reason, source } = req.body;
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: "phoneNumbers[] array is required" });
    }

    if (phoneNumbers.length > 10000) {
      return res.status(400).json({ error: "Maximum 10,000 numbers per request" });
    }

    const entries = phoneNumbers.map((p: string) => ({
      phoneNumber: normalizePhone(p),
      reason: reason || "Added via API",
      source: (source || "import") as "manual" | "import" | "opt-out" | "complaint" | "disconnected",
      userId: 0, // API import
    }));

    const result = await db.bulkAddToDnc(entries);
    res.json({ success: true, added: result.added, duplicates: result.duplicates });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to DNC" });
  }
});

restApiRouter.delete("/dnc/:phoneNumber", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.dnc?.write) {
    return res.status(403).json({ error: "API key does not have dnc:write permission" });
  }

  try {
    // Find the DNC entry by phone number and remove it
    const phoneNumber = normalizePhone(req.params.phoneNumber);
    const entries = await db.getDncEntries(phoneNumber);
    const entry = entries.find(e => e.phoneNumber === phoneNumber);
    if (!entry) return res.status(404).json({ error: "Phone number not found in DNC list" });
    await db.removeDncEntry(entry.id);
    res.json({ success: true, message: `${phoneNumber} removed from DNC` });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from DNC" });
  }
});

// ─── Campaign CRUD (create, update, delete, stop/pause/resume) ──────────────
restApiRouter.post("/campaigns", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have campaigns:write permission" });
  }
  try {
    const { name, contactListId, ...rest } = req.body;
    if (!name || !contactListId) {
      return res.status(400).json({ error: "name and contactListId are required" });
    }
    const contactCount = await db.getContactListContactCount(Number(contactListId));
    const result = await db.createCampaign({
      userId: 0, // API-created
      name,
      contactListId: Number(contactListId),
      totalContacts: contactCount,
      ...rest,
    });
    res.status(201).json({ success: true, data: { id: result.id } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create campaign" });
  }
});

restApiRouter.put("/campaigns/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have campaigns:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const campaign = await db.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "running") return res.status(400).json({ error: "Cannot update a running campaign" });
    const { id: _id, userId: _uid, createdAt: _ca, updatedAt: _ua, ...updateData } = req.body;
    // If contactListId changed, recalculate totalContacts
    if (updateData.contactListId && updateData.contactListId !== campaign.contactListId) {
      updateData.totalContacts = await db.getContactListContactCount(Number(updateData.contactListId));
    }
    await db.updateCampaign(id, updateData);
    res.json({ success: true, message: "Campaign updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update campaign" });
  }
});

restApiRouter.delete("/campaigns/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have campaigns:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const campaign = await db.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "running") return res.status(400).json({ error: "Stop the campaign before deleting" });
    await db.deleteCampaign(id);
    res.json({ success: true, message: "Campaign deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete campaign" });
  }
});

restApiRouter.post("/campaigns/:id/stop", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.launch) {
    return res.status(403).json({ error: "API key does not have campaigns:launch permission" });
  }
  try {
    const id = Number(req.params.id);
    const campaign = await db.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "running") return res.status(400).json({ error: "Campaign is not running" });
    await cancelCampaign(id, 0);
    res.json({ success: true, message: `Campaign "${campaign.name}" stopped` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to stop campaign" });
  }
});

restApiRouter.post("/campaigns/:id/pause", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.launch) {
    return res.status(403).json({ error: "API key does not have campaigns:launch permission" });
  }
  try {
    const id = Number(req.params.id);
    const campaign = await db.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "running") return res.status(400).json({ error: "Campaign is not running" });
    await pauseCampaign(id, 0);
    res.json({ success: true, message: `Campaign "${campaign.name}" paused` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to pause campaign" });
  }
});

restApiRouter.post("/campaigns/:id/resume", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.launch) {
    return res.status(403).json({ error: "API key does not have campaigns:launch permission" });
  }
  try {
    const id = Number(req.params.id);
    const campaign = await db.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "paused" && campaign.status !== "draft") {
      return res.status(400).json({ error: "Campaign must be paused or draft to resume/start" });
    }
    await startCampaign(id, 0);
    res.json({ success: true, message: `Campaign "${campaign.name}" started` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to resume campaign" });
  }
});

restApiRouter.get("/campaigns/:id/stats", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have campaigns:read permission" });
  }
  try {
    const id = Number(req.params.id);
    const analytics = await db.getCampaignAnalytics(id);
    if (!analytics) return res.status(404).json({ error: "Campaign not found" });
    res.json({ success: true, data: analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch campaign stats" });
  }
});

restApiRouter.get("/dialer/live", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have campaigns:read permission" });
  }
  try {
    const stats = await getDialerLiveStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch live dialer stats" });
  }
});

// ─── Call Scripts CRUD ──────────────────────────────────────────────────────
restApiRouter.get("/scripts", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.scripts?.read && !req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have scripts:read permission" });
  }
  try {
    const scripts = await db.getCallScripts();
    res.json({ success: true, data: scripts, total: scripts.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch scripts" });
  }
});

restApiRouter.get("/scripts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.scripts?.read && !req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have scripts:read permission" });
  }
  try {
    const script = await db.getCallScript(Number(req.params.id));
    if (!script) return res.status(404).json({ error: "Script not found" });
    res.json({ success: true, data: script });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch script" });
  }
});

restApiRouter.post("/scripts", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.scripts?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have scripts:write permission" });
  }
  try {
    const { name, segments, description, callbackNumber, status } = req.body;
    if (!name || !segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: "name and segments[] are required" });
    }
    const result = await db.createCallScript({
      userId: 0,
      name,
      segments,
      description: description || null,
      callbackNumber: callbackNumber || null,
      status: status || "active",
    });
    res.status(201).json({ success: true, data: { id: result.id } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create script" });
  }
});

restApiRouter.put("/scripts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.scripts?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have scripts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const script = await db.getCallScript(id);
    if (!script) return res.status(404).json({ error: "Script not found" });
    const { name, segments, description, callbackNumber, status } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (segments !== undefined) updateData.segments = segments;
    if (description !== undefined) updateData.description = description;
    if (callbackNumber !== undefined) updateData.callbackNumber = callbackNumber;
    if (status !== undefined) updateData.status = status;
    await db.updateCallScript(id, updateData);
    res.json({ success: true, message: "Script updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update script" });
  }
});

restApiRouter.delete("/scripts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.scripts?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have scripts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const script = await db.getCallScript(id);
    if (!script) return res.status(404).json({ error: "Script not found" });
    await db.deleteCallScript(id);
    res.json({ success: true, message: "Script deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete script" });
  }
});

// ─── Audio Files CRUD ──────────────────────────────────────────────────────
restApiRouter.get("/audio", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.audio?.read && !req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have audio:read permission" });
  }
  try {
    const files = await db.getAudioFiles();
    res.json({ success: true, data: files, total: files.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audio files" });
  }
});

restApiRouter.get("/audio/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.audio?.read && !req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have audio:read permission" });
  }
  try {
    const file = await db.getAudioFile(Number(req.params.id));
    if (!file) return res.status(404).json({ error: "Audio file not found" });
    res.json({ success: true, data: file });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audio file" });
  }
});

restApiRouter.post("/audio/generate", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.audio?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have audio:write permission" });
  }
  try {
    const { text, voice, name, speed } = req.body;
    if (!text || !voice || !name) {
      return res.status(400).json({ error: "text, voice, and name are required" });
    }
    // Generate TTS audio
    const ttsResult = await generateTTS({ text, voice, name, speed: speed ? Number(speed) : undefined });
    // Save to database
    const record = await db.createAudioFile({
      userId: 0,
      name,
      text,
      voice,
      s3Url: ttsResult.s3Url,
      s3Key: ttsResult.s3Key,
      fileSize: ttsResult.fileSize,
      status: "ready",
    });
    res.status(201).json({ success: true, data: { id: record.id, s3Url: ttsResult.s3Url, fileSize: ttsResult.fileSize } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate audio" });
  }
});

restApiRouter.delete("/audio/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.audio?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have audio:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const file = await db.getAudioFile(id);
    if (!file) return res.status(404).json({ error: "Audio file not found" });
    await db.deleteAudioFile(id);
    res.json({ success: true, message: "Audio file deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete audio file" });
  }
});

// ─── Caller IDs CRUD ───────────────────────────────────────────────────────
restApiRouter.get("/caller-ids", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callerIds?.read && !req.apiPermissions?.campaigns?.read) {
    return res.status(403).json({ error: "API key does not have callerIds:read permission" });
  }
  try {
    const ids = await db.getCallerIds();
    res.json({ success: true, data: ids, total: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch caller IDs" });
  }
});

restApiRouter.post("/caller-ids", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callerIds?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have callerIds:write permission" });
  }
  try {
    const { phoneNumber, label } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required" });
    }
    const result = await db.createCallerId({
      userId: 0,
      phoneNumber,
      label: label || null,
    });
    if (result.duplicate) {
      return res.status(409).json({ error: "Caller ID already exists", data: { id: result.id } });
    }
    res.status(201).json({ success: true, data: { id: result.id } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create caller ID" });
  }
});

restApiRouter.post("/caller-ids/bulk", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callerIds?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have callerIds:write permission" });
  }
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries[] array is required" });
    }
    if (entries.length > 1000) {
      return res.status(400).json({ error: "Maximum 1000 caller IDs per request" });
    }
    const data = entries.map((e: any) => ({
      userId: 0,
      phoneNumber: e.phoneNumber || e.phone_number || e.phone,
      label: e.label || null,
    }));
    const result = await db.bulkCreateCallerIds(data);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to bulk create caller IDs" });
  }
});

restApiRouter.put("/caller-ids/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callerIds?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have callerIds:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const { label, isActive } = req.body;
    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (isActive !== undefined) updateData.isActive = isActive;
    await db.updateCallerId(id, updateData);
    res.json({ success: true, message: "Caller ID updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update caller ID" });
  }
});

restApiRouter.delete("/caller-ids/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.callerIds?.write && !req.apiPermissions?.campaigns?.write) {
    return res.status(403).json({ error: "API key does not have callerIds:write permission" });
  }
  try {
    const id = Number(req.params.id);
    await db.deleteCallerId(id);
    res.json({ success: true, message: "Caller ID deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete caller ID" });
  }
});

// ─── Settings ──────────────────────────────────────────────────────────────
restApiRouter.get("/settings", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.settings?.read && !req.apiPermissions?.reports?.read) {
    return res.status(403).json({ error: "API key does not have settings:read permission" });
  }
  try {
    const keys = req.query.keys ? String(req.query.keys).split(",") : undefined;
    const settings = await db.getAppSettings(keys);
    // Mask secret values
    const data = settings.map(s => ({
      key: s.key,
      value: s.isSecret ? "***" : s.value,
      description: s.description,
      isSecret: s.isSecret,
      updatedAt: s.updatedAt,
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

restApiRouter.put("/settings", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.settings?.write) {
    return res.status(403).json({ error: "API key does not have settings:write permission" });
  }
  try {
    const { settings } = req.body;
    if (!settings || !Array.isArray(settings)) {
      return res.status(400).json({ error: "settings[] array is required with {key, value} objects" });
    }
    for (const s of settings) {
      if (!s.key) continue;
      await db.upsertAppSetting(s.key, s.value ?? null, s.description, s.isSecret);
    }
    res.json({ success: true, message: `${settings.length} setting(s) updated` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update settings" });
  }
});

// ─── Contacts CRUD (single contact operations) ─────────────────────────────
restApiRouter.get("/contacts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.read) {
    return res.status(403).json({ error: "API key does not have contacts:read permission" });
  }
  try {
    const contact = await db.getContact(Number(req.params.id));
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

restApiRouter.put("/contacts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.write) {
    return res.status(403).json({ error: "API key does not have contacts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const contact = await db.getContact(id);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    const { firstName, lastName, email, company, state, customFields, phoneNumber } = req.body;
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (company !== undefined) updateData.company = company;
    if (state !== undefined) updateData.state = state;
    if (customFields !== undefined) updateData.customFields = customFields;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.replace(/\D/g, "");
    await db.updateContact(id, updateData);
    res.json({ success: true, message: "Contact updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update contact" });
  }
});

restApiRouter.delete("/contacts/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.write) {
    return res.status(403).json({ error: "API key does not have contacts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const contact = await db.getContact(id);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    await db.deleteContacts([id]);
    res.json({ success: true, message: "Contact deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete contact" });
  }
});

// ─── Contact Lists CRUD (update/delete) ────────────────────────────────────
restApiRouter.put("/contact-lists/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.write) {
    return res.status(403).json({ error: "API key does not have contacts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const list = await db.getContactList(id);
    if (!list) return res.status(404).json({ error: "Contact list not found" });
    const { name, description } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    await db.updateContactList(id, updateData);
    res.json({ success: true, message: "Contact list updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update contact list" });
  }
});

restApiRouter.delete("/contact-lists/:id", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.write) {
    return res.status(403).json({ error: "API key does not have contacts:write permission" });
  }
  try {
    const id = Number(req.params.id);
    const list = await db.getContactList(id);
    if (!list) return res.status(404).json({ error: "Contact list not found" });
    await db.deleteContactList(id);
    res.json({ success: true, message: "Contact list deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete contact list" });
  }
});

export { restApiRouter };
