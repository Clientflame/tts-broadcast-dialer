import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { generateTTS, TTS_VOICES } from "./services/tts";
import { getAMIStatus, getAMIClient } from "./services/ami";
import { startCampaign, pauseCampaign, cancelCampaign, isCampaignActive, getActiveCampaignIds } from "./services/dialer";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return db.getDashboardStats(ctx.user.id);
    }),
    amiStatus: protectedProcedure.query(async () => {
      return getAMIStatus();
    }),
    activeCampaigns: protectedProcedure.query(async () => {
      return { ids: getActiveCampaignIds() };
    }),
  }),

  contactLists: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getContactLists(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const list = await db.getContactList(input.id, ctx.user.id);
      if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Contact list not found" });
      return list;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createContactList({ ...input, userId: ctx.user.id });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.create", resource: "contactList", resourceId: result.id });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateContactList(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteContactList(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.delete", resource: "contactList", resourceId: input.id });
      return { success: true };
    }),
  }),

  contacts: router({
    list: protectedProcedure.input(z.object({ listId: z.number() })).query(async ({ ctx, input }) => {
      return db.getContacts(input.listId, ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
      listId: z.number(),
      phoneNumber: z.string().min(1).max(20),
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      email: z.string().email().max(320).optional(),
      company: z.string().max(255).optional(),
      customFields: z.record(z.string(), z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createContact({ ...input, userId: ctx.user.id });
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      phoneNumber: z.string().min(1).max(20).optional(),
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      email: z.string().email().max(320).optional(),
      company: z.string().max(255).optional(),
      status: z.enum(["active", "inactive", "dnc"]).optional(),
      customFields: z.record(z.string(), z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateContact(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      await db.deleteContacts(input.ids, ctx.user.id);
      return { success: true };
    }),
    import: protectedProcedure.input(z.object({
      listId: z.number(),
      contacts: z.array(z.object({
        phoneNumber: z.string().min(1),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        customFields: z.record(z.string(), z.string()).optional(),
      })).min(1).max(10000),
    })).mutation(async ({ ctx, input }) => {
      const contactData = input.contacts.map(c => ({
        ...c,
        listId: input.listId,
        userId: ctx.user.id,
      })) as any;
      const result = await db.bulkCreateContacts(contactData);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contacts.import", resource: "contacts", resourceId: input.listId, details: { count: result.count } });
      return result;
    }),
  }),

  audio: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getAudioFiles(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const file = await db.getAudioFile(input.id, ctx.user.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Audio file not found" });
      return file;
    }),
    generate: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      text: z.string().min(1).max(5000),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]),
    })).mutation(async ({ ctx, input }) => {
      const record = await db.createAudioFile({
        userId: ctx.user.id,
        name: input.name,
        text: input.text,
        voice: input.voice,
        status: "generating",
      });
      generateTTS({ text: input.text, voice: input.voice, name: input.name })
        .then(async (result) => {
          await db.updateAudioFile(record.id, {
            s3Url: result.s3Url,
            s3Key: result.s3Key,
            fileSize: result.fileSize,
            status: "ready",
          });
        })
        .catch(async (err) => {
          console.error("[TTS] Generation failed:", err);
          await db.updateAudioFile(record.id, { status: "failed" });
        });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.generate", resource: "audioFile", resourceId: record.id, details: { voice: input.voice } });
      return record;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteAudioFile(input.id, ctx.user.id);
      return { success: true };
    }),
    voices: publicProcedure.query(() => TTS_VOICES),
  }),

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCampaigns(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      return campaign;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      contactListId: z.number(),
      audioFileId: z.number().optional(),
      messageText: z.string().optional(),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
      callerIdNumber: z.string().max(20).optional(),
      callerIdName: z.string().max(100).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      scheduledAt: z.number().optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createCampaign({ ...input, userId: ctx.user.id });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.create", resource: "campaign", resourceId: result.id });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      contactListId: z.number().optional(),
      audioFileId: z.number().optional(),
      messageText: z.string().optional(),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
      callerIdNumber: z.string().max(20).optional(),
      callerIdName: z.string().max(100).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      scheduledAt: z.number().optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const campaign = await db.getCampaign(id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update a running campaign" });
      await db.updateCampaign(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (campaign?.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Stop the campaign before deleting" });
      await db.deleteCampaign(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.delete", resource: "campaign", resourceId: input.id });
      return { success: true };
    }),
    start: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await startCampaign(input.id, ctx.user.id);
      return { success: true };
    }),
    pause: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await pauseCampaign(input.id, ctx.user.id);
      return { success: true };
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await cancelCampaign(input.id, ctx.user.id);
      return { success: true };
    }),
    stats: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const stats = await db.getCampaignStats(input.id);
      return { ...stats, isActive: isCampaignActive(input.id) };
    }),
  }),

  callLogs: router({
    list: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCallLogs(input.campaignId, ctx.user.id);
    }),
  }),

  auditLogs: router({
    list: protectedProcedure.input(z.object({ limit: z.number().min(1).max(500).optional() })).query(async ({ input }) => {
      return db.getAuditLogs(input.limit || 100);
    }),
  }),

  dnc: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ ctx, input }) => {
      return db.getDncEntries(ctx.user.id, input.search);
    }),
    count: protectedProcedure.query(async ({ ctx }) => {
      return { count: await db.getDncCount(ctx.user.id) };
    }),
    add: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(1).max(20),
      reason: z.string().max(255).optional(),
      source: z.enum(["manual", "import", "opt-out", "complaint"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.addToDnc({ ...input, userId: ctx.user.id, addedBy: ctx.user.name || "Unknown" });
      if (!result.duplicate) {
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "dnc.add", resource: "dnc", resourceId: result.id, details: { phoneNumber: input.phoneNumber } });
      }
      return result;
    }),
    bulkAdd: protectedProcedure.input(z.object({
      entries: z.array(z.object({
        phoneNumber: z.string().min(1),
        reason: z.string().optional(),
        source: z.enum(["manual", "import", "opt-out", "complaint"]).optional(),
      })).min(1).max(10000),
    })).mutation(async ({ ctx, input }) => {
      const data = input.entries.map(e => ({ ...e, userId: ctx.user.id, addedBy: ctx.user.name || "Unknown" }));
      const result = await db.bulkAddToDnc(data);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "dnc.bulkAdd", resource: "dnc", details: { added: result.added, duplicates: result.duplicates } });
      return result;
    }),
    remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.removeDncEntry(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "dnc.remove", resource: "dnc", resourceId: input.id });
      return { success: true };
    }),
    bulkRemove: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      await db.bulkRemoveDnc(input.ids, ctx.user.id);
      return { success: true };
    }),
    check: protectedProcedure.input(z.object({ phoneNumber: z.string() })).query(async ({ ctx, input }) => {
      return { onDnc: await db.isPhoneOnDnc(input.phoneNumber, ctx.user.id) };
    }),
  }),

  freepbx: router({
    status: protectedProcedure.query(async () => {
      return getAMIStatus();
    }),
    testConnection: protectedProcedure.mutation(async () => {
      try {
        const ami = getAMIClient();
        await ami.connect();
        return { success: true, message: "Connected to FreePBX AMI successfully" };
      } catch (err) {
        return { success: false, message: (err as Error).message };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
