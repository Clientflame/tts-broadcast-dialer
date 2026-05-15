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
 *   GET    /api/v1/campaigns          - List campaigns
 *   GET    /api/v1/campaigns/:id      - Get campaign details
 *   POST   /api/v1/campaigns/:id/launch - Launch a campaign
 *   GET    /api/v1/contacts           - List contacts (with pagination)
 *   POST   /api/v1/contacts/import    - Import contacts (JSON array)
 *   GET    /api/v1/call-logs/:campaignId - Get call logs for a campaign
 *   GET    /api/v1/reports/summary    - Get summary report
 *   GET    /api/v1/dnc               - List DNC numbers
 *   POST   /api/v1/dnc               - Add number(s) to DNC
 *   DELETE  /api/v1/dnc/:phoneNumber  - Remove from DNC
 */

import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";

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

    await db.updateCampaign(Number(req.params.id), { status: "running" });
    res.json({ success: true, message: `Campaign "${campaign.name}" launched` });
  } catch (err) {
    res.status(500).json({ error: "Failed to launch campaign" });
  }
});

// ─── Contacts ────────────────────────────────────────────────────────────────
restApiRouter.get("/contacts", async (req: AuthenticatedRequest, res) => {
  if (!req.apiPermissions?.contacts?.read) {
    return res.status(403).json({ error: "API key does not have contacts:read permission" });
  }

  try {
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined;
    if (!campaignId) {
      return res.status(400).json({ error: "campaignId query parameter is required" });
    }
    const contacts = await db.getContacts(campaignId);
    res.json({ success: true, data: contacts, total: contacts.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

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
      phoneNumber: (c.phoneNumber || c.phone || "").replace(/\D/g, ""),
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
      phoneNumber: p.replace(/\D/g, ""),
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
    const phoneNumber = req.params.phoneNumber.replace(/\D/g, "");
    const entries = await db.getDncEntries(phoneNumber);
    const entry = entries.find(e => e.phoneNumber === phoneNumber);
    if (!entry) return res.status(404).json({ error: "Phone number not found in DNC list" });
    await db.removeDncEntry(entry.id);
    res.json({ success: true, message: `${phoneNumber} removed from DNC` });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from DNC" });
  }
});

export { restApiRouter };
