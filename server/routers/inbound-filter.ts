/**
 * Inbound Call Filter Router
 *
 * Manages per-DID inbound call filtering with whitelist/blacklist modes,
 * custom rejection messages, Vtiger CRM integration, and a public API
 * for the Voice AI Bridge to check callers before processing.
 */
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";

// ─── Vtiger CRM Integration ─────────────────────────────────────────────────

interface CrmLookupResult {
  found: boolean;
  contactName?: string;
  source: string;
}

/**
 * Look up a phone number in Vtiger Cloud CRM.
 * Uses the Vtiger REST API to search contacts/leads by phone.
 */
async function lookupInVtiger(phoneNumber: string, apiUrl: string, username: string, accessKey: string): Promise<CrmLookupResult> {
  try {
    const normalized = phoneNumber.replace(/\D/g, "");
    // Vtiger uses a challenge-based auth: get challenge token, then login
    // For simplicity, use the webservice API with username + accessKey (API key from My Preferences)
    const loginUrl = `${apiUrl}/webservice.php?operation=login&username=${encodeURIComponent(username)}&accessKey=${encodeURIComponent(accessKey)}`;
    const loginResp = await fetch(loginUrl, { method: "POST" });
    const loginData = await loginResp.json() as any;
    if (!loginData.success) {
      console.warn("[Vtiger] Login failed:", loginData.error?.message);
      return { found: false, source: "vtiger_error" };
    }
    const sessionName = loginData.result.sessionName;

    // Search for contacts with this phone number
    // Vtiger stores phone in "phone", "mobile", "otherphone" fields
    const query = `SELECT id,firstname,lastname,phone,mobile FROM Contacts WHERE phone='${normalized}' OR mobile='${normalized}' OR phone='1${normalized}' OR mobile='1${normalized}' LIMIT 1;`;
    const queryUrl = `${apiUrl}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
    const queryResp = await fetch(queryUrl);
    const queryData = await queryResp.json() as any;

    if (queryData.success && queryData.result && queryData.result.length > 0) {
      const contact = queryData.result[0];
      return {
        found: true,
        contactName: `${contact.firstname || ""} ${contact.lastname || ""}`.trim(),
        source: "vtiger_contacts",
      };
    }

    // Also search Leads
    const leadQuery = `SELECT id,firstname,lastname,phone,mobile FROM Leads WHERE phone='${normalized}' OR mobile='${normalized}' OR phone='1${normalized}' OR mobile='1${normalized}' LIMIT 1;`;
    const leadUrl = `${apiUrl}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(leadQuery)}`;
    const leadResp = await fetch(leadUrl);
    const leadData = await leadResp.json() as any;

    if (leadData.success && leadData.result && leadData.result.length > 0) {
      const lead = leadData.result[0];
      return {
        found: true,
        contactName: `${lead.firstname || ""} ${lead.lastname || ""}`.trim(),
        source: "vtiger_leads",
      };
    }

    return { found: false, source: "vtiger_not_found" };
  } catch (err: any) {
    console.error("[Vtiger] CRM lookup error:", err.message);
    return { found: false, source: "vtiger_error" };
  }
}

/**
 * Generic CRM lookup dispatcher — routes to the right CRM based on provider.
 * Designed to be easily extensible for Salesforce, HubSpot, Zoho, etc.
 */
async function lookupInCrm(phoneNumber: string, integration: NonNullable<Awaited<ReturnType<typeof db.getActiveCrmIntegration>>>): Promise<CrmLookupResult> {
  const apiKey = await db.getAppSetting(integration.apiKeyField ?? "crm_api_key");
  if (!apiKey) return { found: false, source: "crm_no_api_key" };

  switch (integration.provider) {
    case "vtiger":
      return lookupInVtiger(
        phoneNumber,
        integration.apiUrl ?? "",
        integration.apiUsername ?? "",
        apiKey,
      );
    // Future CRM providers:
    // case "salesforce": return lookupInSalesforce(phoneNumber, integration, apiKey);
    // case "hubspot": return lookupInHubspot(phoneNumber, integration, apiKey);
    // case "zoho": return lookupInZoho(phoneNumber, integration, apiKey);
    default:
      return { found: false, source: "unsupported_crm" };
  }
}

// ─── Filter Messages Router ─────────────────────────────────────────────────

const filterMessageInput = z.object({
  name: z.string().min(1).max(255),
  messageText: z.string().min(1),
  voice: z.string().default("en-US-Wavenet-F"),
  isDefault: z.number().min(0).max(1).default(0),
});

// ─── Filter Rules Router ────────────────────────────────────────────────────

const filterRuleInput = z.object({
  callerIdId: z.number(),
  didNumber: z.string().min(1),
  enabled: z.number().min(0).max(1).default(1),
  filterMode: z.enum(["whitelist", "blacklist", "both"]).default("whitelist"),
  checkInternalContacts: z.number().min(0).max(1).default(1),
  checkExternalCrm: z.number().min(0).max(1).default(0),
  checkManualWhitelist: z.number().min(0).max(1).default(1),
  rejectionMessageId: z.number().nullable().optional(),
});

// ─── Main Router ────────────────────────────────────────────────────────────

export const inboundFilterRouter = router({
  // ─── Filter Messages CRUD ───────────────────────────────────────────────
  messages: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getInboundFilterMessages(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getInboundFilterMessage(input.id);
      }),

    create: protectedProcedure
      .input(filterMessageInput)
      .mutation(async ({ ctx, input }) => {
        return db.createInboundFilterMessage({ ...input, userId: ctx.user.id });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number() }).merge(filterMessageInput.partial()))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await db.updateInboundFilterMessage(id, { ...data, userId: ctx.user.id });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInboundFilterMessage(input.id);
        return { success: true };
      }),
  }),

  // ─── Filter Rules CRUD (per-DID) ───────────────────────────────────────
  rules: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rules = await db.getInboundFilterRules(ctx.user.id);
      // Enrich with DID info
      const callerIdsList = await db.getCallerIds();
      const callerIdMap = new Map(callerIdsList.map(c => [c.phoneNumber, c]));
      return rules.map(r => ({
        ...r,
        didLabel: callerIdMap.get(r.didNumber)?.label ?? null,
        isMerchant: callerIdMap.get(r.didNumber)?.isMerchant ?? 0,
      }));
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getInboundFilterRule(input.id);
      }),

    create: protectedProcedure
      .input(filterRuleInput)
      .mutation(async ({ ctx, input }) => {
        return db.createInboundFilterRule({ ...input, userId: ctx.user.id });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number() }).merge(filterRuleInput.partial()))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateInboundFilterRule(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInboundFilterRule(input.id);
        return { success: true };
      }),

    // Bulk assign a rejection message to multiple DIDs
    bulkAssignMessage: protectedProcedure
      .input(z.object({
        ruleIds: z.array(z.number()).min(1),
        messageId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        return db.bulkAssignFilterMessage(input.ruleIds, input.messageId);
      }),

    // Bulk enable/disable filter rules
    bulkToggle: protectedProcedure
      .input(z.object({
        ruleIds: z.array(z.number()).min(1),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        return db.bulkToggleFilterRules(input.ruleIds, input.enabled);
      }),

    // Auto-create filter rules for all DIDs that don't have one yet
    autoCreate: protectedProcedure
      .input(z.object({
        filterMode: z.enum(["whitelist", "blacklist", "both"]).default("whitelist"),
        enabled: z.boolean().default(true),
        rejectionMessageId: z.number().nullable().optional(),
        excludeMerchant: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const allDids = await db.getCallerIds();
        const existingRules = await db.getInboundFilterRules(ctx.user.id);
        const existingDidNumbers = new Set(existingRules.map(r => r.didNumber));

        const newRules = allDids
          .filter(did => {
            if (existingDidNumbers.has(did.phoneNumber)) return false;
            if (input.excludeMerchant && did.isMerchant) return false;
            return true;
          })
          .map(did => ({
            userId: ctx.user.id,
            callerIdId: did.id,
            didNumber: did.phoneNumber,
            enabled: input.enabled ? 1 : 0,
            filterMode: input.filterMode as "whitelist" | "blacklist" | "both",
            checkInternalContacts: 1,
            checkExternalCrm: 0,
            checkManualWhitelist: 1,
            rejectionMessageId: input.rejectionMessageId ?? null,
          }));

        return db.bulkCreateFilterRules(newRules);
      }),
  }),

  // ─── Phone Whitelist ───────────────────────────────────────────────────
  whitelist: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getPhoneWhitelist(ctx.user.id, input?.search);
      }),

    add: protectedProcedure
      .input(z.object({
        phoneNumber: z.string().min(1),
        name: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.addToWhitelist({ ...input, userId: ctx.user.id, addedBy: ctx.user.name ?? "admin" });
      }),

    bulkAdd: protectedProcedure
      .input(z.object({
        entries: z.array(z.object({
          phoneNumber: z.string().min(1),
          name: z.string().optional(),
          reason: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.bulkAddToWhitelist(input.entries.map(e => ({
          ...e,
          userId: ctx.user.id,
          addedBy: ctx.user.name ?? "admin",
        })));
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.removeFromWhitelist(input.id);
        return { success: true };
      }),
  }),

  // ─── Phone Blacklist ───────────────────────────────────────────────────
  blacklist: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getPhoneBlacklist(ctx.user.id, input?.search);
      }),

    add: protectedProcedure
      .input(z.object({
        phoneNumber: z.string().min(1),
        name: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.addToBlacklist({ ...input, userId: ctx.user.id, addedBy: ctx.user.name ?? "admin" });
      }),

    bulkAdd: protectedProcedure
      .input(z.object({
        entries: z.array(z.object({
          phoneNumber: z.string().min(1),
          name: z.string().optional(),
          reason: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.bulkAddToBlacklist(input.entries.map(e => ({
          ...e,
          userId: ctx.user.id,
          addedBy: ctx.user.name ?? "admin",
        })));
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.removeFromBlacklist(input.id);
        return { success: true };
      }),
  }),

  // ─── Filter Logs & Stats ───────────────────────────────────────────────
  logs: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(500).default(100),
        didNumber: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInboundFilterLogs(input?.limit ?? 100, input?.didNumber);
      }),

    stats: protectedProcedure.query(async () => {
      return db.getFilterStats();
    }),
  }),

  // ─── CRM Integration ──────────────────────────────────────────────────
  crm: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCrmIntegrations(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        provider: z.enum(["vtiger", "salesforce", "hubspot", "zoho", "custom"]).default("vtiger"),
        name: z.string().min(1),
        apiUrl: z.string().min(1),
        apiUsername: z.string().optional(),
        apiKeyField: z.string().default("crm_api_key"),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.createCrmIntegration({ ...input, userId: ctx.user.id });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        apiUrl: z.string().optional(),
        apiUsername: z.string().optional(),
        apiKeyField: z.string().optional(),
        isActive: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCrmIntegration(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCrmIntegration(input.id);
        return { success: true };
      }),

    // Test CRM connection
    test: protectedProcedure
      .input(z.object({ id: z.number(), testPhone: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const integration = await db.getActiveCrmIntegration(ctx.user.id);
        if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "No active CRM integration" });
        const result = await lookupInCrm(input.testPhone ?? "0000000000", integration);
        // Update last sync status
        await db.updateCrmIntegration(integration.id, {
          lastSyncAt: Date.now(),
          lastSyncStatus: result.source.includes("error") ? "error" : "connected",
          lastSyncError: result.source.includes("error") ? result.source : null,
        });
        return result;
      }),
  }),

  // ─── Merchant DID Management ───────────────────────────────────────────
  merchant: router({
    toggle: protectedProcedure
      .input(z.object({ callerIdId: z.number(), isMerchant: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setMerchantDid(input.callerIdId, input.isMerchant);
        return { success: true };
      }),

    bulkSet: protectedProcedure
      .input(z.object({
        callerIdIds: z.array(z.number()).min(1),
        isMerchant: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        return db.bulkSetMerchantDids(input.callerIdIds, input.isMerchant);
      }),
  }),

  // ─── Public Caller Check API (for Voice AI Bridge) ─────────────────────
  // This is a public endpoint that the bridge calls before processing a call
  checkCaller: publicProcedure
    .input(z.object({
      didNumber: z.string().min(1),
      callerNumber: z.string().min(1),
      agentApiKey: z.string().min(1), // PBX agent API key for auth
    }))
    .mutation(async ({ input }) => {
      // Verify the PBX agent API key
      const agents = await db.getPbxAgents();
      const agent = agents.find(a => a.apiKey === input.agentApiKey);
      if (!agent) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid agent API key" });
      }

      // Run the inbound filter check
      let result = await db.checkInboundCaller(input.didNumber, input.callerNumber);

      // If the DB check says we need a CRM check, do it now
      if (result.reason === "not_found_needs_crm_check") {
        // Find the active CRM integration (use userId from the filter rule)
        const rule = result.filterRuleId ? await db.getInboundFilterRule(result.filterRuleId) : null;
        if (rule) {
          const integration = await db.getActiveCrmIntegration(rule.userId);
          if (integration) {
            const crmResult = await lookupInCrm(input.callerNumber, integration);
            if (crmResult.found) {
              result = {
                action: "allowed",
                reason: `found_in_crm: ${crmResult.contactName ?? ""}`,
                matchSource: crmResult.source,
                filterRuleId: rule.id,
              };
            } else {
              // Not found in CRM either — reject
              const msg = rule.rejectionMessageId
                ? await db.getInboundFilterMessage(rule.rejectionMessageId)
                : await db.getDefaultFilterMessage(rule.userId);
              result = {
                action: "rejected",
                reason: "not_in_whitelist_or_crm",
                matchSource: "none",
                filterRuleId: rule.id,
                rejectionMessage: msg
                  ? { text: msg.messageText, voice: msg.voice ?? "en-US-Wavenet-F" }
                  : { text: "We're sorry, this number is not currently accepting calls. Goodbye.", voice: "en-US-Wavenet-F" },
              };
            }
          } else {
            // No CRM configured but checkExternalCrm is on — reject (can't verify)
            const msg = rule.rejectionMessageId
              ? await db.getInboundFilterMessage(rule.rejectionMessageId)
              : await db.getDefaultFilterMessage(rule.userId);
            result = {
              action: "rejected",
              reason: "crm_not_configured",
              matchSource: "none",
              filterRuleId: rule.id,
              rejectionMessage: msg
                ? { text: msg.messageText, voice: msg.voice ?? "en-US-Wavenet-F" }
                : { text: "We're sorry, this number is not currently accepting calls. Goodbye.", voice: "en-US-Wavenet-F" },
            };
          }
        }
      }

      // Log the filter action
      await db.logInboundFilter({
        didNumber: input.didNumber.replace(/\D/g, ""),
        callerNumber: input.callerNumber.replace(/\D/g, ""),
        action: result.action,
        reason: result.reason,
        matchSource: result.matchSource,
        filterRuleId: result.filterRuleId,
      });

      // Update stats
      if (result.filterRuleId && (result.action === "allowed" || result.action === "rejected")) {
        await db.incrementFilterStat(result.filterRuleId, result.action);
      }

      return result;
    }),
});
