/**
 * Debt Collection Router
 * Handles Skip Tracing, Settlement Offers, and Collection Imports
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { getDb } from "../db";
import {
  skipTraceRequests, skipTracePhones,
  settlementTiers, settlementOffers,
  collectionImportJobs,
  contacts, contactLists,
  type SkipTraceResult,
} from "../../drizzle/schema";
import { eq, desc, and, sql, inArray, like, gte, lte } from "drizzle-orm";
import { getSkipTraceConfig, executeSkipTrace } from "../services/skip-trace";
import { storagePut } from "../storage";

// ─── Skip Tracing ───────────────────────────────────────────────────────────

const skipTraceRouter = router({
  /** Get skip trace configuration status */
  getConfig: protectedProcedure.query(async () => {
    const config = await getSkipTraceConfig();
    return {
      isConfigured: !!config,
      provider: config?.provider || null,
      apiUrl: config?.apiUrl ? config.apiUrl.replace(/\/[^/]*$/, "/***") : null,
    };
  }),

  /** Save skip trace provider configuration */
  saveConfig: protectedProcedure
    .input(z.object({
      provider: z.enum(["skipgenie", "tlo", "accurint", "manual"]),
      apiUrl: z.string().optional(),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const settings = [
        { key: "skip_trace_provider", value: input.provider, description: "Skip trace API provider", isSecret: 0 },
        ...(input.apiUrl ? [{ key: "skip_trace_api_url", value: input.apiUrl, description: "Skip trace API URL", isSecret: 0 }] : []),
        ...(input.apiKey ? [{ key: "skip_trace_api_key", value: input.apiKey, description: "Skip trace API key", isSecret: 1 }] : []),
        ...(input.apiSecret ? [{ key: "skip_trace_api_secret", value: input.apiSecret, description: "Skip trace API secret", isSecret: 1 }] : []),
      ];

      for (const s of settings) {
        await db.upsertAppSetting(s.key, s.value, s.description, s.isSecret);
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "skipTrace.saveConfig",
        resource: "settings",
        details: { provider: input.provider },
      });

      return { success: true };
    }),

  /** Run a single skip trace lookup */
  lookup: protectedProcedure
    .input(z.object({
      contactId: z.number().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      ssn4: z.string().max(4).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const config = await getSkipTraceConfig();
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Skip trace provider not configured. Go to Settings to configure." });

      // Create the request record
      const [request] = await database.insert(skipTraceRequests).values({
        userId: ctx.user.id,
        contactId: input.contactId || null,
        provider: config.provider,
        requestType: "single",
        inputFirstName: input.firstName || null,
        inputLastName: input.lastName || null,
        inputPhone: input.phone || null,
        inputAddress: input.address || null,
        inputSsn4: input.ssn4 || null,
        status: "processing",
      });

      const requestId = request.insertId;

      try {
        const results = await executeSkipTrace({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          address: input.address,
          ssn4: input.ssn4,
        }, config);

        // Save results
        await database.update(skipTraceRequests)
          .set({
            status: results.length > 0 ? "completed" : "no_results",
            resultsCount: results.length,
            results: results,
            completedAt: new Date(),
          })
          .where(eq(skipTraceRequests.id, requestId));

        // Save individual phone results
        if (results.length > 0) {
          await database.insert(skipTracePhones).values(
            results.map(r => ({
              requestId,
              contactId: input.contactId || null,
              phoneNumber: r.phoneNumber,
              phoneType: r.phoneType,
              phoneStatus: r.phoneStatus,
              confidence: r.confidence,
            }))
          );
        }

        await db.createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          action: "skipTrace.lookup",
          resource: "skipTrace",
          resourceId: requestId,
          details: { contactId: input.contactId, resultsCount: results.length },
        });

        return { requestId, results, count: results.length };
      } catch (err: any) {
        await database.update(skipTraceRequests)
          .set({ status: "failed", errorMessage: err.message })
          .where(eq(skipTraceRequests.id, requestId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  /** Batch skip trace for a contact list */
  batchLookup: protectedProcedure
    .input(z.object({
      contactListId: z.number(),
      onlyDisconnected: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const config = await getSkipTraceConfig();
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Skip trace provider not configured." });

      // Get contacts from the list
      let contactQuery = database.select().from(contacts)
        .where(and(
          eq(contacts.listId, input.contactListId),
          eq(contacts.status, "active"),
        ));

      const contactRows = await contactQuery;

      if (contactRows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active contacts in this list" });
      }

      // Create batch request
      const [batchReq] = await database.insert(skipTraceRequests).values({
        userId: ctx.user.id,
        contactListId: input.contactListId,
        provider: config.provider,
        requestType: "batch",
        status: "processing",
      });

      const batchId = batchReq.insertId;

      // Process in background (fire-and-forget)
      processBatchSkipTrace(batchId, contactRows, config, ctx.user.id).catch(err => {
        console.error("[SkipTrace] Batch failed:", err);
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "skipTrace.batchLookup",
        resource: "skipTrace",
        resourceId: batchId,
        details: { contactListId: input.contactListId, contactCount: contactRows.length },
      });

      return { batchId, contactCount: contactRows.length, status: "processing" };
    }),

  /** Apply skip trace result to a contact (update their phone number) */
  applyResult: protectedProcedure
    .input(z.object({
      skipTracePhoneId: z.number(),
      contactId: z.number(),
      replacePhone: z.enum(["phone1", "phone2"]).default("phone1"),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [phoneResult] = await database.select().from(skipTracePhones)
        .where(eq(skipTracePhones.id, input.skipTracePhoneId));

      if (!phoneResult) throw new TRPCError({ code: "NOT_FOUND", message: "Skip trace result not found" });

      const updateData = input.replacePhone === "phone1"
        ? { phoneNumber: phoneResult.phoneNumber, skipTraceStatus: "completed" as const }
        : { phoneNumber2: phoneResult.phoneNumber, skipTraceStatus: "completed" as const };

      await database.update(contacts)
        .set(updateData)
        .where(eq(contacts.id, input.contactId));

      await database.update(skipTracePhones)
        .set({ isApplied: 1 })
        .where(eq(skipTracePhones.id, input.skipTracePhoneId));

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "skipTrace.applyResult",
        resource: "contacts",
        resourceId: input.contactId,
        details: { phoneNumber: phoneResult.phoneNumber, replacePhone: input.replacePhone },
      });

      return { success: true };
    }),

  /** List skip trace history */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return { requests: [], total: 0 };

      const [requests, countResult] = await Promise.all([
        database.select().from(skipTraceRequests)
          .orderBy(desc(skipTraceRequests.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        database.select({ count: sql<number>`count(*)` }).from(skipTraceRequests),
      ]);

      return { requests, total: countResult[0]?.count || 0 };
    }),

  /** Get results for a specific request */
  getResults: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return { request: null, phones: [] };

      const [request] = await database.select().from(skipTraceRequests)
        .where(eq(skipTraceRequests.id, input.requestId));

      const phones = await database.select().from(skipTracePhones)
        .where(eq(skipTracePhones.requestId, input.requestId))
        .orderBy(desc(skipTracePhones.confidence));

      return { request, phones };
    }),
});

// Background batch processor
async function processBatchSkipTrace(
  batchId: number,
  contactRows: any[],
  config: any,
  userId: number
) {
  const database = await getDb();
  if (!database) return;

  let completed = 0;
  let totalResults = 0;
  const allResults: SkipTraceResult[] = [];

  for (const contact of contactRows) {
    try {
      const results = await executeSkipTrace({
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        phone: contact.phoneNumber,
      }, config);

      if (results.length > 0) {
        await database.insert(skipTracePhones).values(
          results.map(r => ({
            requestId: batchId,
            contactId: contact.id,
            phoneNumber: r.phoneNumber,
            phoneType: r.phoneType,
            phoneStatus: r.phoneStatus,
            confidence: r.confidence,
          }))
        );
        totalResults += results.length;
        allResults.push(...results);
      }

      completed++;

      // Update progress every 10 contacts
      if (completed % 10 === 0) {
        await database.update(skipTraceRequests)
          .set({ resultsCount: totalResults })
          .where(eq(skipTraceRequests.id, batchId));
      }

      // Rate limit: 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[SkipTrace] Failed for contact ${contact.id}:`, err);
    }
  }

  await database.update(skipTraceRequests)
    .set({
      status: totalResults > 0 ? "completed" : "no_results",
      resultsCount: totalResults,
      results: allResults.slice(0, 1000), // Cap stored results
      completedAt: new Date(),
    })
    .where(eq(skipTraceRequests.id, batchId));
}

// ─── Settlement Offers ──────────────────────────────────────────────────────

const settlementRouter = router({
  /** List settlement tiers */
  listTiers: protectedProcedure.query(async () => {
    const database = await getDb();
    if (!database) return [];

    return database.select().from(settlementTiers)
      .orderBy(settlementTiers.priority);
  }),

  /** Create a settlement tier */
  createTier: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      minDebtAge: z.number().optional(),
      maxDebtAge: z.number().optional(),
      minBalance: z.number().optional(),
      maxBalance: z.number().optional(),
      discountPercent: z.number().min(1).max(99),
      paymentDeadlineDays: z.number().default(30),
      allowInstallments: z.boolean().default(false),
      maxInstallments: z.number().default(1),
      scriptTemplate: z.string().optional(),
      priority: z.number().default(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [result] = await database.insert(settlementTiers).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        minDebtAge: input.minDebtAge || null,
        maxDebtAge: input.maxDebtAge || null,
        minBalance: input.minBalance || null,
        maxBalance: input.maxBalance || null,
        discountPercent: input.discountPercent,
        paymentDeadlineDays: input.paymentDeadlineDays,
        allowInstallments: input.allowInstallments ? 1 : 0,
        maxInstallments: input.maxInstallments,
        scriptTemplate: input.scriptTemplate || null,
        priority: input.priority,
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "settlement.createTier",
        resource: "settlementTiers",
        resourceId: result.insertId,
        details: { name: input.name, discountPercent: input.discountPercent },
      });

      return { id: result.insertId };
    }),

  /** Update a settlement tier */
  updateTier: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      minDebtAge: z.number().nullable().optional(),
      maxDebtAge: z.number().nullable().optional(),
      minBalance: z.number().nullable().optional(),
      maxBalance: z.number().nullable().optional(),
      discountPercent: z.number().min(1).max(99).optional(),
      paymentDeadlineDays: z.number().optional(),
      allowInstallments: z.boolean().optional(),
      maxInstallments: z.number().optional(),
      scriptTemplate: z.string().nullable().optional(),
      priority: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updates } = input;
      const setData: Record<string, any> = {};
      if (updates.name !== undefined) setData.name = updates.name;
      if (updates.description !== undefined) setData.description = updates.description;
      if (updates.minDebtAge !== undefined) setData.minDebtAge = updates.minDebtAge;
      if (updates.maxDebtAge !== undefined) setData.maxDebtAge = updates.maxDebtAge;
      if (updates.minBalance !== undefined) setData.minBalance = updates.minBalance;
      if (updates.maxBalance !== undefined) setData.maxBalance = updates.maxBalance;
      if (updates.discountPercent !== undefined) setData.discountPercent = updates.discountPercent;
      if (updates.paymentDeadlineDays !== undefined) setData.paymentDeadlineDays = updates.paymentDeadlineDays;
      if (updates.allowInstallments !== undefined) setData.allowInstallments = updates.allowInstallments ? 1 : 0;
      if (updates.maxInstallments !== undefined) setData.maxInstallments = updates.maxInstallments;
      if (updates.scriptTemplate !== undefined) setData.scriptTemplate = updates.scriptTemplate;
      if (updates.priority !== undefined) setData.priority = updates.priority;
      if (updates.isActive !== undefined) setData.isActive = updates.isActive ? 1 : 0;

      await database.update(settlementTiers).set(setData).where(eq(settlementTiers.id, id));

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "settlement.updateTier",
        resource: "settlementTiers",
        resourceId: id,
        details: setData,
      });

      return { success: true };
    }),

  /** Delete a settlement tier */
  deleteTier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await database.delete(settlementTiers).where(eq(settlementTiers.id, input.id));

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "settlement.deleteTier",
        resource: "settlementTiers",
        resourceId: input.id,
      });

      return { success: true };
    }),

  /** Generate settlement offers for contacts in a list based on tiers */
  generateOffers: protectedProcedure
    .input(z.object({
      contactListId: z.number(),
      campaignId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get active tiers sorted by priority
      const tiers = await database.select().from(settlementTiers)
        .where(eq(settlementTiers.isActive, 1))
        .orderBy(settlementTiers.priority);

      if (tiers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active settlement tiers configured" });
      }

      // Get contacts with debt info
      const contactRows = await database.select().from(contacts)
        .where(and(
          eq(contacts.listId, input.contactListId),
          eq(contacts.status, "active"),
        ));

      let offersCreated = 0;

      for (const contact of contactRows) {
        const balance = contact.currentBalance || contact.originalBalance;
        if (!balance || balance <= 0) continue;

        // Calculate debt age in days
        const debtAgeDays = contact.placementDate
          ? Math.floor((Date.now() - contact.placementDate) / (1000 * 60 * 60 * 24))
          : null;

        // Find matching tier
        const matchingTier = tiers.find(tier => {
          if (tier.minBalance && balance < tier.minBalance) return false;
          if (tier.maxBalance && balance > tier.maxBalance) return false;
          if (debtAgeDays !== null) {
            if (tier.minDebtAge && debtAgeDays < tier.minDebtAge) return false;
            if (tier.maxDebtAge && debtAgeDays > tier.maxDebtAge) return false;
          }
          return true;
        });

        if (!matchingTier) continue;

        const settlementAmount = Math.round(balance * (100 - matchingTier.discountPercent) / 100);
        const paymentDeadline = Date.now() + (matchingTier.paymentDeadlineDays * 24 * 60 * 60 * 1000);

        await database.insert(settlementOffers).values({
          userId: ctx.user.id,
          contactId: contact.id,
          tierId: matchingTier.id,
          campaignId: input.campaignId || null,
          originalBalance: balance,
          discountPercent: matchingTier.discountPercent,
          settlementAmount,
          paymentDeadline,
          status: "pending",
        });

        offersCreated++;
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "settlement.generateOffers",
        resource: "settlementOffers",
        details: { contactListId: input.contactListId, offersCreated, tiersUsed: tiers.length },
      });

      return { offersCreated, totalContacts: contactRows.length };
    }),

  /** List settlement offers with filters */
  listOffers: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      contactListId: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return { offers: [], total: 0 };

      const conditions = [];
      if (input.status) conditions.push(eq(settlementOffers.status, input.status as any));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [offers, countResult] = await Promise.all([
        database.select({
          offer: settlementOffers,
          contact: {
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            phoneNumber: contacts.phoneNumber,
            creditorName: contacts.creditorName,
            accountNumber: contacts.accountNumber,
          },
          tier: {
            name: settlementTiers.name,
          },
        })
          .from(settlementOffers)
          .leftJoin(contacts, eq(settlementOffers.contactId, contacts.id))
          .leftJoin(settlementTiers, eq(settlementOffers.tierId, settlementTiers.id))
          .where(whereClause)
          .orderBy(desc(settlementOffers.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        database.select({ count: sql<number>`count(*)` }).from(settlementOffers).where(whereClause),
      ]);

      return { offers, total: countResult[0]?.count || 0 };
    }),

  /** Update offer status (accept, decline, mark paid, etc.) */
  updateOfferStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["presented", "accepted", "declined", "paid", "partial_paid", "voided"]),
      amountPaid: z.number().optional(),
      declineReason: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const setData: Record<string, any> = { status: input.status };
      if (input.amountPaid !== undefined) setData.amountPaid = input.amountPaid;
      if (input.declineReason) setData.declineReason = input.declineReason;
      if (input.notes) setData.notes = input.notes;
      if (input.status === "paid" || input.status === "partial_paid") setData.paidAt = Date.now();

      await database.update(settlementOffers).set(setData).where(eq(settlementOffers.id, input.id));

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "settlement.updateOfferStatus",
        resource: "settlementOffers",
        resourceId: input.id,
        details: { status: input.status, amountPaid: input.amountPaid },
      });

      return { success: true };
    }),

  /** Get settlement stats/dashboard */
  stats: protectedProcedure.query(async () => {
    const database = await getDb();
    if (!database) return null;

    const [statusCounts] = await database.select({
      total: sql<number>`count(*)`,
      pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)`,
      presented: sql<number>`sum(case when status = 'presented' then 1 else 0 end)`,
      accepted: sql<number>`sum(case when status = 'accepted' then 1 else 0 end)`,
      declined: sql<number>`sum(case when status = 'declined' then 1 else 0 end)`,
      paid: sql<number>`sum(case when status = 'paid' then 1 else 0 end)`,
      expired: sql<number>`sum(case when status = 'expired' then 1 else 0 end)`,
      totalOriginalBalance: sql<number>`coalesce(sum(originalBalance), 0)`,
      totalSettlementAmount: sql<number>`coalesce(sum(settlementAmount), 0)`,
      totalAmountPaid: sql<number>`coalesce(sum(amountPaid), 0)`,
    }).from(settlementOffers);

    return statusCounts;
  }),
});

// ─── Collection Import ──────────────────────────────────────────────────────

const collectionImportRouter = router({
  /** Get known field mappings for common collection software */
  getPresets: protectedProcedure.query(() => {
    return {
      presets: [
        {
          id: "dakcs",
          name: "DAKCS",
          description: "DAKCS Collection Software export",
          mapping: {
            "DEBTOR_FIRST": "firstName",
            "DEBTOR_LAST": "lastName",
            "PHONE_HOME": "phoneNumber",
            "PHONE_WORK": "phoneNumber2",
            "PHONE_CELL": "phoneNumber",
            "EMAIL": "email",
            "CREDITOR": "creditorName",
            "ACCT_NUMBER": "accountNumber",
            "ORIGINAL_BAL": "originalBalance",
            "CURRENT_BAL": "currentBalance",
            "PLACE_DATE": "placementDate",
            "DEBT_TYPE": "debtType",
            "STATUS": "debtorStatus",
            "STATE": "state",
            "DB_NAME": "databaseName",
          },
        },
        {
          id: "latitude",
          name: "Latitude by Genesys",
          description: "Latitude Collection Software export",
          mapping: {
            "FirstName": "firstName",
            "LastName": "lastName",
            "HomePhone": "phoneNumber",
            "WorkPhone": "phoneNumber2",
            "CellPhone": "phoneNumber",
            "EmailAddress": "email",
            "ClientName": "creditorName",
            "AccountNumber": "accountNumber",
            "OriginalBalance": "originalBalance",
            "CurrentBalance": "currentBalance",
            "PlacementDate": "placementDate",
            "DebtCategory": "debtType",
            "AccountStatus": "debtorStatus",
            "State": "state",
          },
        },
        {
          id: "collectbank",
          name: "Collect!",
          description: "Collect! Software export",
          mapping: {
            "First Name": "firstName",
            "Last Name": "lastName",
            "Phone 1": "phoneNumber",
            "Phone 2": "phoneNumber2",
            "Email": "email",
            "Client": "creditorName",
            "File Number": "accountNumber",
            "Original Owing": "originalBalance",
            "Owing": "currentBalance",
            "Received": "placementDate",
            "Type": "debtType",
            "Status": "debtorStatus",
            "State/Province": "state",
          },
        },
        {
          id: "csv_generic",
          name: "Generic CSV",
          description: "Standard CSV with common column names",
          mapping: {
            "first_name": "firstName",
            "last_name": "lastName",
            "phone": "phoneNumber",
            "phone2": "phoneNumber2",
            "email": "email",
            "creditor": "creditorName",
            "account_number": "accountNumber",
            "original_balance": "originalBalance",
            "current_balance": "currentBalance",
            "placement_date": "placementDate",
            "debt_type": "debtType",
            "debtor_status": "debtorStatus",
            "state": "state",
            "database_name": "databaseName",
          },
        },
      ],
      targetFields: [
        { key: "firstName", label: "First Name", required: false },
        { key: "lastName", label: "Last Name", required: false },
        { key: "phoneNumber", label: "Phone 1", required: true },
        { key: "phoneNumber2", label: "Phone 2", required: false },
        { key: "email", label: "Email", required: false },
        { key: "company", label: "Company", required: false },
        { key: "state", label: "State", required: false },
        { key: "databaseName", label: "Database Name", required: false },
        { key: "creditorName", label: "Creditor Name", required: false },
        { key: "accountNumber", label: "Account Number", required: false },
        { key: "originalBalance", label: "Original Balance", required: false },
        { key: "currentBalance", label: "Current Balance", required: false },
        { key: "placementDate", label: "Placement Date", required: false },
        { key: "debtType", label: "Debt Type", required: false },
        { key: "debtorStatus", label: "Debtor Status", required: false },
      ],
    };
  }),

  /** Start a collection import job */
  startImport: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      sourceType: z.enum(["csv", "dakcs", "latitude", "collectbank", "custom"]),
      fileName: z.string(),
      fileData: z.string(), // base64 encoded CSV content
      fieldMapping: z.record(z.string(), z.string()),
      targetListId: z.number().optional(),
      newListName: z.string().optional(),
      skipDuplicates: z.boolean().default(true),
      updateExisting: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Decode CSV data
      const csvContent = Buffer.from(input.fileData, "base64").toString("utf-8");
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV file must have at least a header and one data row" });

      const headers = parseCSVLine(lines[0]);
      const totalRows = lines.length - 1;

      // Upload file to S3 for record-keeping
      let s3Key: string | undefined;
      let s3Url: string | undefined;
      try {
        const fileBuffer = Buffer.from(csvContent, "utf-8");
        const key = `collection-imports/${Date.now()}-${input.fileName}`;
        const result = await storagePut(key, fileBuffer, "text/csv");
        s3Key = result.key;
        s3Url = result.url;
      } catch (err) {
        console.warn("[CollectionImport] S3 upload failed, continuing without:", err);
      }

      // Create or get target list
      let targetListId = input.targetListId;
      if (!targetListId && input.newListName) {
        const newListResult = await database.insert(contactLists).values({
          userId: ctx.user.id,
          name: input.newListName,
          description: `Imported from ${input.sourceType}: ${input.fileName}`,
        });
        targetListId = newListResult[0].insertId;
      }

      if (!targetListId) throw new TRPCError({ code: "BAD_REQUEST", message: "Must specify a target list or provide a new list name" });

      // Create import job
      const jobResult = await database.insert(collectionImportJobs).values({
        userId: ctx.user.id,
        name: input.name,
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileSize: csvContent.length,
        s3Key: s3Key || null,
        s3Url: s3Url || null,
        fieldMapping: input.fieldMapping,
        targetListId,
        skipDuplicates: input.skipDuplicates ? 1 : 0,
        updateExisting: input.updateExisting ? 1 : 0,
        status: "importing" as const,
        totalRows,
      });

      const jobId = jobResult[0].insertId;

      // Process import in background
      processCollectionImport(jobId, headers, lines.slice(1), input.fieldMapping, targetListId, ctx.user.id, input.skipDuplicates, input.updateExisting)
        .catch(err => {
          console.error("[CollectionImport] Job failed:", err);
        });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "collectionImport.start",
        resource: "collectionImportJobs",
        resourceId: jobId,
        details: { fileName: input.fileName, sourceType: input.sourceType, totalRows },
      });

      return { jobId, totalRows, targetListId };
    }),

  /** Get import job status */
  getJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return null;

      const [job] = await database.select().from(collectionImportJobs)
        .where(eq(collectionImportJobs.id, input.jobId));

      return job || null;
    }),

  /** List import jobs */
  listJobs: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return { jobs: [], total: 0 };

      const [jobs, countResult] = await Promise.all([
        database.select().from(collectionImportJobs)
          .orderBy(desc(collectionImportJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        database.select({ count: sql<number>`count(*)` }).from(collectionImportJobs),
      ]);

      return { jobs, total: countResult[0]?.count || 0 };
    }),

  /** Parse CSV headers for field mapping preview */
  parseHeaders: protectedProcedure
    .input(z.object({
      fileData: z.string(), // base64 encoded
      sourceType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const csvContent = Buffer.from(input.fileData, "base64").toString("utf-8");
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty CSV file" });

      const headers = parseCSVLine(lines[0]);
      const sampleRows = lines.slice(1, 4).map(line => parseCSVLine(line));

      return { headers, sampleRows, totalRows: lines.length - 1 };
    }),
});

// Background import processor
async function processCollectionImport(
  jobId: number,
  headers: string[],
  dataLines: string[],
  fieldMapping: Record<string, string>,
  targetListId: number,
  userId: number,
  skipDuplicates: boolean,
  updateExisting: boolean
) {
  const database = await getDb();
  if (!database) return;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ row: number; error: string }> = [];

  // Build reverse mapping: our field → CSV column index
  const reverseMap: Record<string, number> = {};
  for (const [csvCol, ourField] of Object.entries(fieldMapping)) {
    const idx = headers.findIndex(h => h.trim() === csvCol.trim());
    if (idx >= 0) reverseMap[String(ourField)] = idx;
  }

  for (let i = 0; i < dataLines.length; i++) {
    try {
      const values = parseCSVLine(dataLines[i]);
      const getVal = (field: string) => {
        const idx = reverseMap[field];
        return idx !== undefined ? values[idx]?.trim() || null : null;
      };

      const phoneNumber = getVal("phoneNumber");
      if (!phoneNumber) {
        errors.push({ row: i + 2, error: "Missing phone number" });
        failed++;
        continue;
      }

      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        errors.push({ row: i + 2, error: `Invalid phone number: ${phoneNumber}` });
        failed++;
        continue;
      }

      // Check for duplicates
      if (skipDuplicates) {
        const existing = await database.select({ id: contacts.id }).from(contacts)
          .where(and(
            eq(contacts.listId, targetListId),
            eq(contacts.phoneNumber, cleanPhone),
          ))
          .limit(1);

        if (existing.length > 0) {
          if (updateExisting) {
            // Update existing contact with new data
            const updateData = buildContactData(getVal);
            delete (updateData as any).phoneNumber; // Don't update the phone
            if (Object.keys(updateData).length > 0) {
              await database.update(contacts).set(updateData).where(eq(contacts.id, existing[0].id));
            }
            imported++;
          } else {
            skipped++;
          }
          continue;
        }
      }

      // Build contact data
      const contactData = buildContactData(getVal);

      await database.insert(contacts).values({
        listId: targetListId,
        userId,
        phoneNumber: cleanPhone,
        ...contactData,
      });

      imported++;

      // Update progress every 50 rows
      if ((imported + skipped + failed) % 50 === 0) {
        await database.update(collectionImportJobs)
          .set({ importedRows: imported, skippedRows: skipped, failedRows: failed })
          .where(eq(collectionImportJobs.id, jobId));
      }
    } catch (err: any) {
      errors.push({ row: i + 2, error: err.message?.substring(0, 200) || "Unknown error" });
      failed++;
    }
  }

  // Update contact list count
  const [countResult] = await database.select({ count: sql<number>`count(*)` }).from(contacts)
    .where(eq(contacts.listId, targetListId));
  await database.update(contactLists)
    .set({ contactCount: countResult?.count || 0 })
    .where(eq(contactLists.id, targetListId));

  // Finalize job
  await database.update(collectionImportJobs)
    .set({
      status: "completed",
      importedRows: imported,
      skippedRows: skipped,
      failedRows: failed,
      errorLog: errors.length > 0 ? errors.slice(0, 100) : null,
      completedAt: new Date(),
    })
    .where(eq(collectionImportJobs.id, jobId));
}

function buildContactData(getVal: (field: string) => string | null): Record<string, any> {
  const data: Record<string, any> = {};

  const strFields = ["firstName", "lastName", "email", "company", "state", "databaseName",
    "creditorName", "accountNumber", "debtType", "debtorStatus"];
  for (const f of strFields) {
    const v = getVal(f);
    if (v) data[f] = v;
  }

  const phone2 = getVal("phoneNumber2");
  if (phone2) data.phoneNumber2 = phone2.replace(/\D/g, "");

  // Parse balance fields (handle dollar signs, commas)
  for (const balField of ["originalBalance", "currentBalance"]) {
    const v = getVal(balField);
    if (v) {
      const cleaned = v.replace(/[$,\s]/g, "");
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) data[balField] = Math.round(parsed * 100); // Convert to cents
    }
  }

  // Parse placement date
  const placementDate = getVal("placementDate");
  if (placementDate) {
    const parsed = Date.parse(placementDate);
    if (!isNaN(parsed)) data.placementDate = parsed;
  }

  return data;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─── Combined Router ────────────────────────────────────────────────────────

export const debtCollectionRouter = router({
  skipTrace: skipTraceRouter,
  settlement: settlementRouter,
  collectionImport: collectionImportRouter,
});
