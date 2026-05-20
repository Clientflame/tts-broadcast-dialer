/**
 * Phone Lookup API
 * 
 * Provides endpoints for the PBX call screening system (vtiger_screen.py / CollectIQ AGI)
 * and the Auto-Sync worker to look up contacts and bulk-export phone data.
 * 
 * Authentication: X-API-Key header OR ?apiKey= query param (uses existing external API key system)
 * 
 * Endpoints:
 *   GET  /api/phone-lookup          - Look up a single phone number
 *   GET  /api/phone-lookup/export   - Bulk export all contacts (for auto-sync cache)
 *   POST /api/phone-lookup/log      - Log an inbound call event
 */
import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";
import { contacts } from "../../drizzle/schema";
import { sql, like, or, eq } from "drizzle-orm";

const phoneLookupRouter = Router();

// ─── Auth Middleware (supports X-API-Key header or ?apiKey query param) ──────
interface AuthenticatedRequest extends Request {
  apiKeyId?: number;
}

async function phoneLookupAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Try X-API-Key header first, then ?apiKey query param, then Authorization Bearer
  const apiKey = (req.headers["x-api-key"] as string) 
    || (req.query.apiKey as string)
    || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");

  if (!apiKey) {
    return res.status(401).json({ success: false, error: "Missing API key. Use X-API-Key header or ?apiKey= query param." });
  }

  try {
    const result = await db.validateApiKey(apiKey);
    if (!result.valid) {
      return res.status(403).json({ success: false, error: "Invalid or expired API key." });
    }
    req.apiKeyId = result.keyId;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: "Authentication error." });
  }
}

phoneLookupRouter.use(phoneLookupAuth);

// ─── GET /api/phone-lookup?number=XXXXXXXXXX ─────────────────────────────────
// Individual phone number lookup for call screening
phoneLookupRouter.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawNumber = (req.query.number as string) || "";
    const digits = rawNumber.replace(/\D/g, "");

    if (digits.length < 7) {
      return res.json({ success: true, count: 0, contacts: [] });
    }

    // Normalize to last 10 digits for matching
    const searchDigits = digits.length >= 10 ? digits.slice(-10) : digits;

    // Search contacts by phone number (check both phoneNumber and phoneNumber2)
    const database = await db.getDb();
    if (!database) {
      return res.status(500).json({ success: false, error: "Database unavailable" });
    }

    const results = await database.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phoneNumber: contacts.phoneNumber,
      phoneNumber2: contacts.phoneNumber2,
      company: contacts.company,
      databaseName: contacts.databaseName,
      status: contacts.status,
      listId: contacts.listId,
    }).from(contacts)
      .where(
        or(
          like(contacts.phoneNumber, `%${searchDigits}`),
          like(contacts.phoneNumber2, `%${searchDigits}`)
        )
      )
      .limit(10);

    const contactResults = results.map(c => ({
      id: c.id,
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      phoneNumber: c.phoneNumber,
      phoneNumber2: c.phoneNumber2 || "",
      company: c.company || "",
      databaseName: c.databaseName || "",
      status: c.status,
      listId: c.listId,
    }));

    return res.json({
      success: true,
      count: contactResults.length,
      contacts: contactResults,
    });
  } catch (err: any) {
    console.error("[PhoneLookup] Error:", err.message);
    return res.status(500).json({ success: false, error: "Lookup failed" });
  }
});

// ─── GET /api/phone-lookup/export ────────────────────────────────────────────
// Bulk export all contacts for the Auto-Sync worker cache population
phoneLookupRouter.get("/export", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const database = await db.getDb();
    if (!database) {
      return res.status(500).json({ success: false, error: "Database unavailable" });
    }

    // Fetch all active contacts with phone numbers
    // Only return essential fields to keep response size manageable
    const allContacts = await database.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phoneNumber: contacts.phoneNumber,
      phoneNumber2: contacts.phoneNumber2,
      databaseName: contacts.databaseName,
      status: contacts.status,
    }).from(contacts)
      .where(eq(contacts.status, "active"));

    // Build the export format expected by the auto-sync worker:
    // { "phone": "4074551177", "name": "Jay Testing", "id": 1849284, "url": "/contacts/1849284" }
    const exportContacts: Array<{ phone: string; name: string; id: number; url: string }> = [];

    for (const c of allContacts) {
      const name = [c.firstName || "", c.lastName || ""].filter(Boolean).join(" ") || c.databaseName || "Unknown";
      const phone1 = (c.phoneNumber || "").replace(/\D/g, "");

      if (phone1.length >= 7) {
        exportContacts.push({
          phone: phone1.length >= 10 ? phone1.slice(-10) : phone1,
          name,
          id: c.id,
          url: `/contacts/${c.id}`,
        });
      }

      // Also include phone2 if available (as separate entry with same contact info)
      const phone2 = (c.phoneNumber2 || "").replace(/\D/g, "");
      if (phone2.length >= 7 && phone2 !== phone1) {
        exportContacts.push({
          phone: phone2.length >= 10 ? phone2.slice(-10) : phone2,
          name,
          id: c.id,
          url: `/contacts/${c.id}`,
        });
      }
    }

    console.log(`[PhoneLookup] Export: ${exportContacts.length} phone entries from ${allContacts.length} contacts`);

    return res.json({
      success: true,
      count: exportContacts.length,
      contacts: exportContacts,
    });
  } catch (err: any) {
    console.error("[PhoneLookup] Export error:", err.message);
    return res.status(500).json({ success: false, error: "Export failed: " + err.message });
  }
});

// ─── POST /api/phone-lookup/log ──────────────────────────────────────────────
// Log an inbound call event from the PBX screening system
phoneLookupRouter.post("/log", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone, contactId, contactName, direction, timestamp } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, error: "Missing phone number" });
    }

    // Log the inbound call as an audit event
    await db.createAuditLog({
      userId: 0, // System-generated
      userName: "PBX-Screen",
      action: "phone_lookup.call_logged",
      resource: "contacts",
      resourceId: contactId ? parseInt(contactId, 10) : undefined,
      details: {
        phone,
        contactName: contactName || "",
        direction: direction || "inbound",
        timestamp: timestamp || new Date().toISOString(),
        source: "pbx_screening",
      },
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[PhoneLookup] Log error:", err.message);
    return res.status(500).json({ success: false, error: "Log failed" });
  }
});

export { phoneLookupRouter };
