import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { generateTTS, TTS_VOICES, generateVoiceSample, GOOGLE_TTS_VOICES, generateGoogleTTS, generateGoogleVoiceSample, generateGooglePersonalizedTTS, type GoogleTTSVoice } from "./services/tts";
// AMI is now handled by the PBX agent on the FreePBX server
// import { getAMIStatus, getAMIClient } from "./services/ami";
import { startCampaign, pauseCampaign, cancelCampaign, isCampaignActive, getActiveCampaignIds, getDialerLiveStats } from "./services/dialer";
import { invokeLLM } from "./_core/llm";
import { generateScriptPreview } from "./services/script-audio";
import type { ScriptSegment } from "../drizzle/schema";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";

// Shared voice enums for OpenAI and Google TTS
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const GOOGLE_VOICES = ["en-US-Journey-D", "en-US-Journey-F", "en-US-Journey-O", "en-US-Studio-M", "en-US-Studio-O", "en-US-Studio-Q", "en-US-Neural2-A", "en-US-Neural2-C", "en-US-Neural2-D", "en-US-Neural2-F", "en-US-Wavenet-A", "en-US-Wavenet-C", "en-US-Wavenet-D", "en-US-Wavenet-F"] as const;
const ALL_VOICES = [...OPENAI_VOICES, ...GOOGLE_VOICES] as const;
const voiceEnum = z.enum(ALL_VOICES as unknown as [string, ...string[]]);

// US area code to timezone mapping (simplified)
const AREA_CODE_TIMEZONE: Record<string, string> = {
  "201":"America/New_York","202":"America/New_York","203":"America/New_York","205":"America/Chicago",
  "206":"America/Los_Angeles","207":"America/New_York","208":"America/Boise","209":"America/Los_Angeles",
  "210":"America/Chicago","212":"America/New_York","213":"America/Los_Angeles","214":"America/Chicago",
  "215":"America/New_York","216":"America/New_York","217":"America/Chicago","218":"America/Chicago",
  "219":"America/Chicago","224":"America/Chicago","225":"America/Chicago","228":"America/Chicago",
  "229":"America/New_York","231":"America/New_York","234":"America/New_York","239":"America/New_York",
  "240":"America/New_York","248":"America/New_York","251":"America/Chicago","252":"America/New_York",
  "253":"America/Los_Angeles","254":"America/Chicago","256":"America/Chicago","260":"America/New_York",
  "262":"America/Chicago","267":"America/New_York","269":"America/New_York","270":"America/New_York",
  "276":"America/New_York","281":"America/Chicago","301":"America/New_York","302":"America/New_York",
  "303":"America/Denver","304":"America/New_York","305":"America/New_York","307":"America/Denver",
  "308":"America/Chicago","309":"America/Chicago","310":"America/Los_Angeles","312":"America/Chicago",
  "313":"America/New_York","314":"America/Chicago","315":"America/New_York","316":"America/Chicago",
  "317":"America/New_York","318":"America/Chicago","319":"America/Chicago","320":"America/Chicago",
  "321":"America/New_York","323":"America/Los_Angeles","325":"America/Chicago","330":"America/New_York",
  "331":"America/Chicago","334":"America/Chicago","336":"America/New_York","337":"America/Chicago",
  "339":"America/New_York","347":"America/New_York","351":"America/New_York","352":"America/New_York",
  "360":"America/Los_Angeles","361":"America/Chicago","385":"America/Denver","386":"America/New_York",
  "401":"America/New_York","402":"America/Chicago","404":"America/New_York","405":"America/Chicago",
  "406":"America/Denver","407":"America/New_York","408":"America/Los_Angeles","409":"America/Chicago",
  "410":"America/New_York","412":"America/New_York","413":"America/New_York","414":"America/Chicago",
  "415":"America/Los_Angeles","417":"America/Chicago","419":"America/New_York","423":"America/New_York",
  "424":"America/Los_Angeles","425":"America/Los_Angeles","430":"America/Chicago","432":"America/Chicago",
  "434":"America/New_York","435":"America/Denver","440":"America/New_York","442":"America/Los_Angeles",
  "443":"America/New_York","469":"America/Chicago","470":"America/New_York","475":"America/New_York",
  "478":"America/New_York","479":"America/Chicago","480":"America/Phoenix","484":"America/New_York",
  "501":"America/Chicago","502":"America/New_York","503":"America/Los_Angeles","504":"America/Chicago",
  "505":"America/Denver","507":"America/Chicago","508":"America/New_York","509":"America/Los_Angeles",
  "510":"America/Los_Angeles","512":"America/Chicago","513":"America/New_York","515":"America/Chicago",
  "516":"America/New_York","517":"America/New_York","518":"America/New_York","520":"America/Phoenix",
  "530":"America/Los_Angeles","531":"America/Chicago","534":"America/Chicago","539":"America/Chicago",
  "540":"America/New_York","541":"America/Los_Angeles","551":"America/New_York","559":"America/Los_Angeles",
  "561":"America/New_York","562":"America/Los_Angeles","563":"America/Chicago","567":"America/New_York",
  "570":"America/New_York","571":"America/New_York","573":"America/Chicago","574":"America/New_York",
  "575":"America/Denver","580":"America/Chicago","585":"America/New_York","586":"America/New_York",
  "601":"America/Chicago","602":"America/Phoenix","603":"America/New_York","605":"America/Chicago",
  "606":"America/New_York","607":"America/New_York","608":"America/Chicago","609":"America/New_York",
  "610":"America/New_York","612":"America/Chicago","614":"America/New_York","615":"America/Chicago",
  "616":"America/New_York","617":"America/New_York","618":"America/Chicago","619":"America/Los_Angeles",
  "620":"America/Chicago","623":"America/Phoenix","626":"America/Los_Angeles","628":"America/Los_Angeles",
  "629":"America/Chicago","630":"America/Chicago","631":"America/New_York","636":"America/Chicago",
  "641":"America/Chicago","646":"America/New_York","650":"America/Los_Angeles","651":"America/Chicago",
  "657":"America/Los_Angeles","660":"America/Chicago","661":"America/Los_Angeles","662":"America/Chicago",
  "667":"America/New_York","669":"America/Los_Angeles","678":"America/New_York","681":"America/New_York",
  "682":"America/Chicago","701":"America/Chicago","702":"America/Los_Angeles","703":"America/New_York",
  "704":"America/New_York","706":"America/New_York","707":"America/Los_Angeles","708":"America/Chicago",
  "712":"America/Chicago","713":"America/Chicago","714":"America/Los_Angeles","715":"America/Chicago",
  "716":"America/New_York","717":"America/New_York","718":"America/New_York","719":"America/Denver",
  "720":"America/Denver","724":"America/New_York","725":"America/Los_Angeles","727":"America/New_York",
  "731":"America/Chicago","732":"America/New_York","734":"America/New_York","737":"America/Chicago",
  "740":"America/New_York","743":"America/New_York","747":"America/Los_Angeles","754":"America/New_York",
  "757":"America/New_York","760":"America/Los_Angeles","762":"America/New_York","763":"America/Chicago",
  "765":"America/New_York","769":"America/Chicago","770":"America/New_York","772":"America/New_York",
  "773":"America/Chicago","774":"America/New_York","775":"America/Los_Angeles","779":"America/Chicago",
  "781":"America/New_York","785":"America/Chicago","786":"America/New_York","801":"America/Denver",
  "802":"America/New_York","803":"America/New_York","804":"America/New_York","805":"America/Los_Angeles",
  "806":"America/Chicago","808":"Pacific/Honolulu","810":"America/New_York","812":"America/New_York",
  "813":"America/New_York","814":"America/New_York","815":"America/Chicago","816":"America/Chicago",
  "817":"America/Chicago","818":"America/Los_Angeles","828":"America/New_York","830":"America/Chicago",
  "831":"America/Los_Angeles","832":"America/Chicago","843":"America/New_York","845":"America/New_York",
  "847":"America/Chicago","848":"America/New_York","850":"America/Chicago","856":"America/New_York",
  "857":"America/New_York","858":"America/Los_Angeles","859":"America/New_York","860":"America/New_York",
  "862":"America/New_York","863":"America/New_York","864":"America/New_York","865":"America/New_York",
  "870":"America/Chicago","872":"America/Chicago","878":"America/New_York","901":"America/Chicago",
  "903":"America/Chicago","904":"America/New_York","906":"America/New_York","907":"America/Anchorage",
  "908":"America/New_York","909":"America/Los_Angeles","910":"America/New_York","912":"America/New_York",
  "913":"America/Chicago","914":"America/New_York","915":"America/Denver","916":"America/Los_Angeles",
  "917":"America/New_York","918":"America/Chicago","919":"America/New_York","920":"America/Chicago",
  "925":"America/Los_Angeles","928":"America/Phoenix","929":"America/New_York","931":"America/Chicago",
  "936":"America/Chicago","937":"America/New_York","938":"America/Chicago","940":"America/Chicago",
  "941":"America/New_York","947":"America/New_York","949":"America/Los_Angeles","951":"America/Los_Angeles",
  "952":"America/Chicago","954":"America/New_York","956":"America/Chicago","959":"America/New_York",
  "970":"America/Denver","971":"America/Los_Angeles","972":"America/Chicago","973":"America/New_York",
  "978":"America/New_York","979":"America/Chicago","980":"America/New_York","984":"America/New_York",
  "985":"America/Chicago","989":"America/New_York",
};

// TCPA calling windows by timezone
const TCPA_WINDOWS: Record<string, { start: number; end: number }> = {
  "America/New_York": { start: 8, end: 21 },
  "America/Chicago": { start: 8, end: 21 },
  "America/Denver": { start: 8, end: 21 },
  "America/Los_Angeles": { start: 8, end: 21 },
  "America/Phoenix": { start: 8, end: 21 },
  "America/Anchorage": { start: 8, end: 21 },
  "Pacific/Honolulu": { start: 8, end: 21 },
  "America/Boise": { start: 8, end: 21 },
};

function getAreaCode(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.substring(1, 4);
  if (digits.length === 10) return digits.substring(0, 3);
  return null;
}

function getTimezoneFromPhone(phone: string): string {
  const areaCode = getAreaCode(phone);
  if (areaCode && AREA_CODE_TIMEZONE[areaCode]) return AREA_CODE_TIMEZONE[areaCode];
  return "America/New_York";
}

function isWithinTCPAWindow(phone: string): { allowed: boolean; timezone: string; localHour: number } {
  const tz = getTimezoneFromPhone(phone);
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const hour = localTime.getHours();
  const window = TCPA_WINDOWS[tz] || { start: 8, end: 21 };
  return { allowed: hour >= window.start && hour < window.end, timezone: tz, localHour: hour };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    /** Returns auth configuration so the frontend knows which login modes are available */
    config: publicProcedure.query(async () => {
      const oauthConfigured = Boolean(process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID && process.env.VITE_OAUTH_PORTAL_URL);
      const allUsers = await db.getAllUsers();
      const hasUsers = allUsers.length > 0;
      return { oauthConfigured, hasUsers, standaloneMode: !oauthConfigured };
    }),
    /** First-time setup: create the initial admin account (only works when no users exist) */
    setup: publicProcedure.input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8).max(100),
    })).mutation(async ({ ctx, input }) => {
      const allUsers = await db.getAllUsers();
      if (allUsers.length > 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Setup already completed. Users already exist." });
      }
      // Create the first user as admin
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await db.upsertUser({ openId, name: input.name, email: input.email, loginMethod: "email", role: "admin" });
      const user = await db.getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create admin user" });
      const passwordHash = await bcrypt.hash(input.password, 12);
      await db.createLocalAuth({ userId: user.id, email: input.email, passwordHash, isVerified: 1 });
      // Auto-login the new admin
      const token = await sdk.createSessionToken(user.openId, { name: user.name || "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return db.getDashboardStats(ctx.user.id);
    }),
    amiStatus: protectedProcedure.query(async () => {
      const agents = await db.getPbxAgents();
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < 30000;
      });
      return {
        connected: onlineAgents.length > 0,
        agents: agents.length,
        onlineAgents: onlineAgents.length,
        message: onlineAgents.length > 0
          ? `${onlineAgents.length} PBX agent(s) online`
          : "No PBX agents online",
      };
    }),
    activeCampaigns: protectedProcedure.query(async () => {
      return { ids: getActiveCampaignIds() };
    }),
    dialerLive: protectedProcedure.query(async ({ ctx }) => {
      return getDialerLiveStats(ctx.user.id);
    }),
    callActivity: protectedProcedure.input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional()).query(async ({ ctx, input }) => {
      return db.getRecentCallActivity(ctx.user.id, input?.limit ?? 50);
    }),
    areaCodeDistribution: protectedProcedure.input(z.object({ campaignId: z.number().optional(), hours: z.number().min(1).max(168).default(24) }).optional()).query(async ({ ctx, input }) => {
      return db.getAreaCodeDistribution(ctx.user.id, input?.campaignId, input?.hours ?? 24);
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
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      let deleted = 0;
      for (const id of input.ids) {
        try {
          await db.deleteContactList(id, ctx.user.id);
          deleted++;
        } catch (_) { /* skip lists that don't exist or aren't owned */ }
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.bulkDelete", resource: "contactList", details: { deleted, ids: input.ids } });
      return { deleted };
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
      state: z.string().max(50).optional(),
      databaseName: z.string().max(255).optional(),
      customFields: z.record(z.string(), z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createContact({ ...input, userId: ctx.user.id } as any);
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
        state: z.string().optional(),
        databaseName: z.string().optional(),
        customFields: z.record(z.string(), z.string()).optional(),
      })).min(1).max(50000),
      skipDupeCheck: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const contactData = input.contacts.map(c => ({
        ...c, listId: input.listId, userId: ctx.user.id,
      })) as any;
      const result = await db.bulkCreateContacts(contactData, { skipDupeCheck: input.skipDupeCheck });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contacts.import", resource: "contacts", resourceId: input.listId, details: { count: result.count, dupes: result.duplicatesOmitted, dnc: result.dncOmitted, skipDupeCheck: input.skipDupeCheck } });
      return result;
    }),
    previewImport: protectedProcedure.input(z.object({
      listId: z.number(),
      phoneNumbers: z.array(z.string()).min(1).max(50000),
      skipDupeCheck: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.previewImport(input.phoneNumbers, ctx.user.id, input.listId, { skipDupeCheck: input.skipDupeCheck });
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
      voice: voiceEnum,
      speed: z.number().min(0.25).max(4.0).optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const provider = input.ttsProvider || (GOOGLE_VOICES.includes(input.voice as any) ? "google" : "openai");
      const record = await db.createAudioFile({
        userId: ctx.user.id, name: input.name, text: input.text, voice: input.voice, status: "generating",
      });
      const generateFn = provider === "google"
        ? generateGoogleTTS({ text: input.text, voice: input.voice as GoogleTTSVoice, name: input.name, speed: input.speed })
        : generateTTS({ text: input.text, voice: input.voice as any, name: input.name, speed: input.speed });
      generateFn
        .then(async (result) => {
          await db.updateAudioFile(record.id, { s3Url: result.s3Url, s3Key: result.s3Key, fileSize: result.fileSize, status: "ready" });
        })
        .catch(async (err) => {
          console.error("[TTS] Generation failed:", err);
          await db.updateAudioFile(record.id, { status: "failed" });
        });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.generate", resource: "audioFile", resourceId: record.id, details: { voice: input.voice, provider } });
      return record;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteAudioFile(input.id, ctx.user.id);
      return { success: true };
    }),
    voices: publicProcedure.query(() => ({ openai: TTS_VOICES, google: GOOGLE_TTS_VOICES })),
    voiceSample: protectedProcedure.input(z.object({
      voice: voiceEnum,
      speed: z.number().min(0.25).max(4.0).optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
    })).mutation(async ({ input }) => {
      const provider = input.ttsProvider || (GOOGLE_VOICES.includes(input.voice as any) ? "google" : "openai");
      const result = provider === "google"
        ? await generateGoogleVoiceSample(input.voice as GoogleTTSVoice, input.speed)
        : await generateVoiceSample(input.voice as any, input.speed);
      return { url: result.url };
    }),
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
      voice: voiceEnum.optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      callerIdNumber: z.string().max(20).optional(),
      callerIdName: z.string().max(100).optional(),
      ivrEnabled: z.number().min(0).max(1).optional(),
      ivrOptions: z.array(z.object({ digit: z.string(), action: z.string(), label: z.string() })).optional(),
      abTestGroup: z.string().max(50).optional(),
      abTestVariant: z.string().max(10).optional(),
      targetStates: z.array(z.string()).optional(),
      targetAreaCodes: z.array(z.string()).optional(),
      useGeoCallerIds: z.number().min(0).max(1).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      cpsLimit: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      scheduledAt: z.number().optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
      usePersonalizedTTS: z.number().min(0).max(1).optional(),
      ttsSpeed: z.string().max(10).optional(),
      useDidRotation: z.number().min(0).max(1).optional(),
      pacingMode: z.enum(["fixed", "adaptive", "predictive"]).optional(),
      pacingTargetDropRate: z.number().min(1).max(20).optional(),
      pacingMinConcurrent: z.number().min(1).max(50).optional(),
      pacingMaxConcurrent: z.number().min(1).max(100).optional(),
      scriptId: z.number().optional(),
      callbackNumber: z.string().max(20).optional(),
      useDidCallbackNumber: z.number().min(0).max(1).optional(),
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
      voice: voiceEnum.optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      callerIdNumber: z.string().max(20).optional(),
      callerIdName: z.string().max(100).optional(),
      ivrEnabled: z.number().min(0).max(1).optional(),
      ivrOptions: z.array(z.object({ digit: z.string(), action: z.string(), label: z.string() })).optional(),
      abTestGroup: z.string().max(50).optional(),
      abTestVariant: z.string().max(10).optional(),
      targetStates: z.array(z.string()).optional(),
      targetAreaCodes: z.array(z.string()).optional(),
      useGeoCallerIds: z.number().min(0).max(1).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      cpsLimit: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      scheduledAt: z.number().optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
      usePersonalizedTTS: z.number().min(0).max(1).optional(),
      ttsSpeed: z.string().max(10).optional(),
      useDidRotation: z.number().min(0).max(1).optional(),
      pacingMode: z.enum(["fixed", "adaptive", "predictive"]).optional(),
      pacingTargetDropRate: z.number().min(1).max(20).optional(),
      pacingMinConcurrent: z.number().min(1).max(50).optional(),
      pacingMaxConcurrent: z.number().min(1).max(100).optional(),
      scriptId: z.number().optional(),
      callbackNumber: z.string().max(20).optional(),
      useDidCallbackNumber: z.number().min(0).max(1).optional(),
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
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      let deleted = 0;
      const skipped: number[] = [];
      for (const id of input.ids) {
        const campaign = await db.getCampaign(id, ctx.user.id);
        if (campaign?.status === "running") { skipped.push(id); continue; }
        await db.deleteCampaign(id, ctx.user.id);
        deleted++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.bulkDelete", resource: "campaign", details: { deleted, skipped: skipped.length } });
      return { success: true, deleted, skipped: skipped.length };
    }),
    resetCallHistory: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset call history while campaign is running" });
      const result = await db.resetCampaignCallHistory(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.resetCallHistory", resource: "campaign", resourceId: input.id, details: { deletedLogs: result.deletedLogs } });
      return { success: true, deletedLogs: result.deletedLogs };
    }),
    getRetriableCount: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      const count = await db.getRetriableContactCount(input.id, ctx.user.id);
      return { count };
    }),
    retryFailed: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot retry failed contacts while campaign is running" });
      const result = await db.retryFailedContacts(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.retryFailed", resource: "campaign", resourceId: input.id, details: { retriedCount: result.retriedCount, deletedLogs: result.deletedLogs } });
      return { success: true, retriedCount: result.retriedCount, deletedLogs: result.deletedLogs };
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
    reactivate: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Only cancelled campaigns can be reactivated" });
      await db.updateCampaign(input.id, ctx.user.id, { status: "draft" });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.reactivate", resource: "campaign", resourceId: input.id });
      return { success: true };
    }),
    stats: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const stats = await db.getCampaignStats(input.id);
      return { ...stats, isActive: isCampaignActive(input.id) };
    }),
    // Campaign Cloning
    clone: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.cloneCampaign(input.id, ctx.user.id, input.name);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.clone", resource: "campaign", resourceId: result.id, details: { clonedFrom: input.id } });
      return result;
    }),
  }),

  callLogs: router({
    list: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCallLogs(input.campaignId, ctx.user.id);
    }),
    export: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      const logs = await db.getCallLogsForExport(input.campaignId, ctx.user.id);
      const campaign = await db.getCampaign(input.campaignId, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      // Generate CSV content
      const headers = ["ID","Phone Number","Contact Name","Status","Duration (s)","Attempt","DTMF Response","IVR Action","Caller ID Used","Error","Started At","Answered At","Ended At"];
      const rows = logs.map(l => [
        l.id, l.phoneNumber, l.contactName || "", l.status, l.duration ?? "", l.attempt,
        l.dtmfResponse || "", l.ivrAction || "", l.callerIdUsed || "", l.errorMessage || "",
        l.startedAt ? new Date(l.startedAt).toISOString() : "",
        l.answeredAt ? new Date(l.answeredAt).toISOString() : "",
        l.endedAt ? new Date(l.endedAt).toISOString() : "",
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      return { csv, campaignName: campaign.name, totalRows: logs.length };
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
      })).min(1).max(50000),
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

  callerIds: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCallerIds(ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(1).max(20),
      label: z.string().max(255).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createCallerId({ ...input, userId: ctx.user.id });
      if (result.duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: `Caller ID ${input.phoneNumber} already exists` });
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.create", resource: "callerId", resourceId: result.id });
      return result;
    }),
    bulkCreate: protectedProcedure.input(z.object({
      entries: z.array(z.object({
        phoneNumber: z.string().min(1).max(20),
        label: z.string().max(255).optional(),
      })).min(1).max(1000),
    })).mutation(async ({ ctx, input }) => {
      const data = input.entries.map(e => ({ ...e, userId: ctx.user.id }));
      const result = await db.bulkCreateCallerIds(data);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.bulkCreate", resource: "callerId", details: { count: result.count, dupes: result.duplicatesOmitted } });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      phoneNumber: z.string().min(1).max(20).optional(),
      label: z.string().max(255).optional(),
      isActive: z.number().min(0).max(1).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateCallerId(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCallerId(input.id, ctx.user.id);
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      await db.bulkDeleteCallerIds(input.ids, ctx.user.id);
      return { success: true };
    }),
    // Set region mappings for geo targeting
    setRegions: protectedProcedure.input(z.object({
      callerIdId: z.number(),
      regions: z.array(z.object({
        state: z.string().optional(),
        areaCode: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await db.setCallerIdRegions(input.callerIdId, input.regions);
      return { success: true };
    }),
    getRegions: protectedProcedure.input(z.object({ callerIdId: z.number() })).query(async ({ input }) => {
      return db.getCallerIdRegions(input.callerIdId);
    }),
    // Health check endpoints
    triggerHealthCheck: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(50).optional(),
    }).optional()).mutation(async ({ ctx, input }) => {
      // Queue health checks for specified IDs or all due IDs
      const idsToCheck = input?.ids;
      let callerIdsToCheck;
      if (idsToCheck && idsToCheck.length > 0) {
        // Specific IDs requested
        callerIdsToCheck = await db.getCallerIds(ctx.user.id);
        callerIdsToCheck = callerIdsToCheck.filter(c => idsToCheck.includes(c.id));
      } else {
        // Get all due for check
        callerIdsToCheck = await db.getCallerIdsForHealthCheck(ctx.user.id);
      }
      if (callerIdsToCheck.length === 0) {
        return { queued: 0, message: "No caller IDs need checking right now" };
      }
      // Health check strategy: dial a known test number USING the DID as caller ID.
      // This validates the DID can successfully place outbound calls through the trunk.
      // We use Asterisk's built-in echo test (extension 10000) or a short ring to a
      // known good number. The PBX agent detects context="health-check" and handles
      // the call specially - it dials a test destination and reports back.
      // The test destination is a brief outbound call to validate trunk + DID.
      const HEALTH_CHECK_TEST_NUMBER = "0000000000"; // Placeholder - PBX agent uses echo test
      let queued = 0;
      for (const cid of callerIdsToCheck) {
        await db.enqueueCall({
          phoneNumber: HEALTH_CHECK_TEST_NUMBER,
          channel: `PJSIP/${HEALTH_CHECK_TEST_NUMBER}@vitel-outbound`,
          context: "health-check",
          callerIdStr: cid.phoneNumber,
          audioUrl: "",
          audioName: "health-check",
          variables: {
            healthCheckCallerIdId: String(cid.id),
            healthCheck: "true",
            CALLER_ID: cid.phoneNumber,
            healthCheckDID: cid.phoneNumber,
          },
          priority: 1,
          userId: ctx.user.id,
        });
        queued++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.healthCheck", resource: "callerId", details: { queued } });
      return { queued, message: `${queued} health check(s) queued` };
    }),
    resetHealth: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.resetCallerIdHealth(input.id, ctx.user.id);
      return { success: true };
    }),
    // Health check schedule endpoints
    getSchedule: protectedProcedure.query(async ({ ctx }) => {
      const schedule = await db.getHealthCheckSchedule(ctx.user.id);
      return schedule || { enabled: 0, intervalHours: 24, lastRunAt: null, nextRunAt: null };
    }),
    updateSchedule: protectedProcedure.input(z.object({
      enabled: z.boolean(),
      intervalHours: z.number().min(1).max(168), // 1 hour to 7 days
    })).mutation(async ({ ctx, input }) => {
      const result = await db.upsertHealthCheckSchedule(ctx.user.id, {
        enabled: input.enabled ? 1 : 0,
        intervalHours: input.intervalHours,
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.updateSchedule", resource: "callerId", details: { enabled: input.enabled, intervalHours: input.intervalHours } });
      return result;
    }),
    // Per-DID Analytics endpoints
    analyticsSummary: protectedProcedure.query(async ({ ctx }) => {
      return db.getDidAnalyticsSummary(ctx.user.id);
    }),
    callVolume: protectedProcedure.input(z.object({
      callerIdStr: z.string().optional(),
      days: z.number().min(1).max(90).default(7),
    }).optional()).query(async ({ ctx, input }) => {
      return db.getDidCallVolume(ctx.user.id, input?.callerIdStr, input?.days || 7);
    }),
    flagHistory: protectedProcedure.query(async ({ ctx }) => {
      return db.getDidFlagHistory(ctx.user.id);
    }),
    campaignBreakdown: protectedProcedure.input(z.object({
      callerIdStr: z.string().min(1),
    })).query(async ({ ctx, input }) => {
      return db.getDidCampaignBreakdown(ctx.user.id, input.callerIdStr);
    }),
  }),

  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getBroadcastTemplates(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const template = await db.getBroadcastTemplate(input.id, ctx.user.id);
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      messageText: z.string().optional(),
      voice: voiceEnum.optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createBroadcastTemplate({ ...input, userId: ctx.user.id });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "template.create", resource: "template", resourceId: result.id });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      messageText: z.string().optional(),
      voice: voiceEnum.optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      maxConcurrentCalls: z.number().min(1).max(10).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(60).max(3600).optional(),
      timezone: z.string().max(64).optional(),
      timeWindowStart: z.string().max(5).optional(),
      timeWindowEnd: z.string().max(5).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateBroadcastTemplate(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteBroadcastTemplate(input.id, ctx.user.id);
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      const deleted = await db.bulkDeleteBroadcastTemplates(input.ids, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "template.bulkDelete", resource: "template", details: { count: deleted } });
      return { deleted };
    }),
  }),

  analytics: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      return db.getCallAnalytics(ctx.user.id);
    }),
    campaign: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      const result = await db.getCampaignAnalytics(input.campaignId, ctx.user.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),
    abTest: protectedProcedure.input(z.object({ group: z.string() })).query(async ({ ctx, input }) => {
      return db.getABTestResults(input.group, ctx.user.id);
    }),
  }),

  // Contact Scoring
  scoring: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getContactScores(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ contactId: z.number() })).query(async ({ ctx, input }) => {
      return db.getContactScore(input.contactId, ctx.user.id);
    }),
    recalculate: protectedProcedure.input(z.object({ contactId: z.number() })).mutation(async ({ ctx, input }) => {
      await db.recalculateContactScore(input.contactId, ctx.user.id);
      return { success: true };
    }),
    updateTags: protectedProcedure.input(z.object({
      contactId: z.number(),
      tags: z.array(z.string()),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const score = await db.getContactScore(input.contactId, ctx.user.id);
      if (!score) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateContactScore(score.id, { tags: input.tags, notes: input.notes });
      return { success: true };
    }),
  }),

  // Cost Estimator
  costEstimator: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getCostSettings(ctx.user.id);
      return settings || {
        trunkCostPerMinute: "0.01",
        ttsCostPer1kChars: "0.015",
        currency: "USD",
        avgCallDurationSecs: 30,
      };
    }),
    updateSettings: protectedProcedure.input(z.object({
      trunkCostPerMinute: z.string().optional(),
      ttsCostPer1kChars: z.string().optional(),
      currency: z.string().max(10).optional(),
      avgCallDurationSecs: z.number().min(1).max(600).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertCostSettings(ctx.user.id, input);
      return { success: true };
    }),
    estimate: protectedProcedure.input(z.object({
      contactCount: z.number().min(1),
      messageLength: z.number().min(1),
      retryAttempts: z.number().min(0).max(5).optional(),
      expectedAnswerRate: z.number().min(0).max(100).optional(),
    })).query(async ({ ctx, input }) => {
      const settings = await db.getCostSettings(ctx.user.id);
      const trunkRate = parseFloat(settings?.trunkCostPerMinute ?? "0.01");
      const ttsRate = parseFloat(settings?.ttsCostPer1kChars ?? "0.015");
      const avgDuration = settings?.avgCallDurationSecs ?? 30;
      const currency = settings?.currency ?? "USD";
      const answerRate = (input.expectedAnswerRate ?? 30) / 100;
      const totalAttempts = input.contactCount * (1 + (input.retryAttempts ?? 0));
      const answeredCalls = Math.round(totalAttempts * answerRate);
      // Trunk cost: per-minute billing, rounded up
      const totalMinutes = Math.ceil((answeredCalls * avgDuration) / 60);
      const trunkCost = totalMinutes * trunkRate;
      // TTS cost: OpenAI charges per 1M characters for tts-1, ~$15/1M chars
      // But we generate once and reuse, so it's just the message generation cost
      const ttsCost = (input.messageLength / 1000) * ttsRate;
      const totalCost = trunkCost + ttsCost;
      return {
        currency,
        contactCount: input.contactCount,
        totalAttempts,
        expectedAnswered: answeredCalls,
        totalMinutes,
        trunkCost: Math.round(trunkCost * 100) / 100,
        ttsCost: Math.round(ttsCost * 1000) / 1000,
        totalEstimatedCost: Math.round(totalCost * 100) / 100,
        breakdown: {
          trunkRatePerMin: trunkRate,
          ttsRatePer1kChars: ttsRate,
          avgCallDurationSecs: avgDuration,
          answerRatePercent: Math.round(answerRate * 100),
        },
      };
    }),
  }),

  // Timezone & TCPA
  timezone: router({
    detect: protectedProcedure.input(z.object({ phoneNumber: z.string() })).query(({ input }) => {
      const tz = getTimezoneFromPhone(input.phoneNumber);
      const tcpa = isWithinTCPAWindow(input.phoneNumber);
      return { ...tcpa, areaCode: getAreaCode(input.phoneNumber) };
    }),
    checkBatch: protectedProcedure.input(z.object({
      phoneNumbers: z.array(z.string()).min(1).max(1000),
    })).query(({ input }) => {
      const results = input.phoneNumbers.map(phone => {
        const tcpa = isWithinTCPAWindow(phone);
        return { phoneNumber: phone, ...tcpa, areaCode: getAreaCode(phone) };
      });
      const callable = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;
      return { results, summary: { callable, blocked, total: results.length } };
    }),
  }),

  // AI Message Generator
  aiGenerator: router({
    generate: protectedProcedure.input(z.object({
      topic: z.string().min(1).max(500),
      tone: z.enum(["professional", "friendly", "urgent", "casual", "formal"]).optional(),
      maxLength: z.number().min(50).max(2000).optional(),
      industry: z.string().max(100).optional(),
      callToAction: z.string().max(200).optional(),
    })).mutation(async ({ input }) => {
      const prompt = `Generate a broadcast phone call script/message for the following:
Topic: ${input.topic}
Tone: ${input.tone || "professional"}
Industry: ${input.industry || "general"}
${input.callToAction ? `Call to Action: ${input.callToAction}` : ""}
Max Length: approximately ${input.maxLength || 300} characters

Requirements:
- Write as if speaking directly to the listener on a phone call
- Keep it concise and clear for audio delivery
- Include a brief greeting and closing
- Do not include stage directions or notes, just the spoken text
- Make it sound natural, not robotic

Return ONLY the message text, nothing else.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert broadcast message copywriter. Generate concise, effective phone broadcast messages." },
          { role: "user", content: prompt },
        ],
      });
      const message = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content.trim()
        : "";
      return { message, charCount: message.length };
    }),
  }),

  quickTest: router({
    dial: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(1).max(20),
      audioFileId: z.number(),
      callerIdId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const audioFile = await db.getAudioFile(input.audioFileId, ctx.user.id);
      if (!audioFile || !audioFile.s3Url) throw new TRPCError({ code: "BAD_REQUEST", message: "Audio file not ready" });

      // Queue-based approach: enqueue the call for the PBX agent to pick up
      // The PBX agent polls /api/pbx/poll, originates via local AMI, and reports back
      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      const channel = `PJSIP/${phoneNumber}@vitel-outbound`;
      const audioName = `quicktest_${audioFile.id}`;

      // Resolve caller ID if specified
      let callerIdStr: string | undefined;
      if (input.callerIdId) {
        const callerIdList = await db.getCallerIds(ctx.user.id);
        const selectedCid = callerIdList.find(c => c.id === input.callerIdId);
        if (selectedCid) callerIdStr = selectedCid.phoneNumber;
      }

      console.log(`[QuickTest] Enqueuing call to ${phoneNumber} with audio URL: ${audioFile.s3Url.substring(0, 80)}...${callerIdStr ? ` CallerID: ${callerIdStr}` : ''}`);

      await db.enqueueCall({
        userId: ctx.user.id,
        phoneNumber,
        channel,
        context: "tts-broadcast",
        audioUrl: audioFile.s3Url,
        audioName,
        callerIdStr,
        variables: {
          AUDIO_URL: audioFile.s3Url,
          AUDIO_NAME: audioName,
          ...(callerIdStr ? { CALLER_ID: callerIdStr } : {}),
        },
        status: "pending",
        priority: 1, // Quick test = highest priority
      });

      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "quickTest.call", resource: "audioFile", resourceId: input.audioFileId, details: { phoneNumber: input.phoneNumber } });
      return { success: true, message: "Call queued - PBX agent will dial shortly" };
    }),
  }),

  reports: router({
    exportCampaign: protectedProcedure.input(z.object({ campaignId: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.campaignId, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      const logs = await db.getCallLogsForExport(input.campaignId, ctx.user.id);
      const headers = ["Contact Name","Phone","Status","Duration (s)","Timestamp","Attempt","Caller ID"];
      const rows = logs.map((l: any) => [
        l.contactName || "", l.phoneNumber, l.status, l.duration || 0,
        l.startedAt ? new Date(l.startedAt).toISOString() : "", l.attemptNumber || 1, l.callerIdUsed || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r: any[]) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "reports.export", resource: "campaign", resourceId: input.campaignId });
      return { csv, filename: `campaign_${campaign.name.replace(/[^a-zA-Z0-9]/g, "_")}_report.csv` };
    }),
    exportAll: protectedProcedure.mutation(async ({ ctx }) => {
      const campaigns = await db.getCampaigns(ctx.user.id);
      const headers = ["Campaign","Status","Total Contacts","Completed","Voice","Created","Started","Completed At"];
      const rows = campaigns.map((c: any) => [
        c.name, c.status, c.totalContacts, c.completedCalls, c.voice || "alloy",
        new Date(c.createdAt).toISOString(), c.startedAt ? new Date(c.startedAt).toISOString() : "",
        c.completedAt ? new Date(c.completedAt).toISOString() : "",
      ]);
      const csv = [headers.join(","), ...rows.map((r: any[]) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      return { csv, filename: `all_campaigns_report_${new Date().toISOString().split("T")[0]}.csv` };
    }),
  }),

  // ─── User Management (Admin) ──────────────────────────────────────────────
  userManagement: router({
    list: adminProcedure.query(async () => {
      const allUsers = await db.getAllUsers();
      // Get group memberships for each user
      const usersWithGroups = await Promise.all(allUsers.map(async (u) => {
        const groups = await db.getUserGroupMemberships(u.id);
        return { ...u, groups: groups.map(g => ({ id: g.id, name: g.name })) };
      }));
      return usersWithGroups;
    }),
    updateRole: adminProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin"]),
    })).mutation(async ({ ctx, input }) => {
      await db.updateUserRole(input.userId, input.role);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.updateRole", resource: "user", resourceId: input.userId, details: { newRole: input.role } });
      return { success: true };
    }),
    addToGroup: adminProcedure.input(z.object({
      userId: z.number(),
      groupId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      await db.addUserToGroup(input.userId, input.groupId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.addToGroup", resource: "user", resourceId: input.userId, details: { groupId: input.groupId } });
      return { success: true };
    }),
    removeFromGroup: adminProcedure.input(z.object({
      userId: z.number(),
      groupId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      await db.removeUserFromGroup(input.userId, input.groupId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.removeFromGroup", resource: "user", resourceId: input.userId, details: { groupId: input.groupId } });
      return { success: true };
    }),
    getPermissions: protectedProcedure.input(z.object({ userId: z.number().optional() })).query(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.user.id;
      // Non-admin can only check their own permissions
      if (ctx.user.role !== "admin" && targetUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const perms = await db.getUserPermissions(targetUserId);
      return perms;
    }),
    createWithPassword: adminProcedure.input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8).max(100),
      role: z.enum(["user", "admin"]).optional(),
      groupIds: z.array(z.number()).optional(),
    })).mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existing = await db.getLocalAuthByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      // Create user with a unique openId for local auth
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await db.upsertUser({ openId, name: input.name, email: input.email, loginMethod: "email", role: input.role || "user" });
      const user = await db.getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Create local auth record
      const passwordHash = await bcrypt.hash(input.password, 12);
      await db.createLocalAuth({ userId: user.id, email: input.email, passwordHash, isVerified: 1 });
      // Add to groups
      if (input.groupIds) {
        for (const gid of input.groupIds) {
          await db.addUserToGroup(user.id, gid);
        }
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.create", resource: "user", resourceId: user.id, details: { email: input.email, method: "email" } });
      return { success: true, userId: user.id };
    }),
  }),

  // ─── User Groups ──────────────────────────────────────────────────────────
  groups: router({
    list: protectedProcedure.query(async () => {
      return db.getUserGroups();
    }),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const group = await db.getUserGroup(input.id);
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      const members = await db.getGroupMembers(input.id);
      return { ...group, members };
    }),
    create: adminProcedure.input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      permissions: z.record(z.string(), z.boolean()).optional(),
      isDefault: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createUserGroup({
        name: input.name,
        description: input.description || null,
        permissions: input.permissions || {},
        isDefault: input.isDefault ? 1 : 0,
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "group.create", resource: "group", resourceId: result?.id, details: { name: input.name } });
      return { success: true, id: result?.id };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      permissions: z.record(z.string(), z.boolean()).optional(),
      isDefault: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateUserGroup(id, {
        ...data,
        isDefault: data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : undefined,
      } as any);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "group.update", resource: "group", resourceId: id });
      return { success: true };
    }),
    remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteUserGroup(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "group.delete", resource: "group", resourceId: input.id });
      return { success: true };
    }),
  }),

  // ─── Local Auth (Email/Password Login) ────────────────────────────────────
  localAuth: router({
    login: publicProcedure.input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const authRecord = await db.getLocalAuthByEmail(input.email);
      if (!authRecord) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      const valid = await bcrypt.compare(input.password, authRecord.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      const user = await db.getUserById(authRecord.userId);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User account not found" });
      // Create session token
      const token = await sdk.createSessionToken(user.openId, { name: user.name || "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      await db.createAuditLog({ userId: user.id, userName: user.name || undefined, action: "auth.login", resource: "user", resourceId: user.id, details: { method: "email" } });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),
    changePassword: protectedProcedure.input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    })).mutation(async ({ ctx, input }) => {
      const authRecord = await db.getLocalAuthByUserId(ctx.user.id);
      if (!authRecord) throw new TRPCError({ code: "BAD_REQUEST", message: "No password login configured for this account" });
      const valid = await bcrypt.compare(input.currentPassword, authRecord.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.updateLocalAuthPassword(ctx.user.id, newHash);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "auth.changePassword", resource: "user", resourceId: ctx.user.id });
      return { success: true };
    }),
    resetPasswordRequest: publicProcedure.input(z.object({
      email: z.string().email(),
    })).mutation(async ({ input }) => {
      const authRecord = await db.getLocalAuthByEmail(input.email);
      if (!authRecord) return { success: true }; // Don't reveal if email exists
      const token = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const expiry = Date.now() + 3600000; // 1 hour
      await db.setResetToken(input.email, token, expiry);
      // In production, send email with reset link. For now, log it.
      console.log(`[Auth] Password reset token for ${input.email}: ${token}`);
      return { success: true };
    }),
    resetPassword: publicProcedure.input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    })).mutation(async ({ input }) => {
      const authRecord = await db.getLocalAuthByResetToken(input.token);
      if (!authRecord) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
      if (authRecord.resetTokenExpiry && authRecord.resetTokenExpiry < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset token has expired" });
      }
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.updateLocalAuthPassword(authRecord.userId, newHash);
      await db.clearResetToken(authRecord.userId);
      return { success: true };
    }),
  }),

  // ─── Available Permissions (reference list) ───────────────────────────────
  permissions: router({
    list: protectedProcedure.query(() => {
      return [
        { key: "campaigns.view", label: "View Campaigns", category: "Campaigns" },
        { key: "campaigns.create", label: "Create Campaigns", category: "Campaigns" },
        { key: "campaigns.edit", label: "Edit Campaigns", category: "Campaigns" },
        { key: "campaigns.delete", label: "Delete Campaigns", category: "Campaigns" },
        { key: "campaigns.start", label: "Start/Stop Campaigns", category: "Campaigns" },
        { key: "contacts.view", label: "View Contacts", category: "Contacts" },
        { key: "contacts.create", label: "Create Contacts", category: "Contacts" },
        { key: "contacts.edit", label: "Edit Contacts", category: "Contacts" },
        { key: "contacts.delete", label: "Delete Contacts", category: "Contacts" },
        { key: "contacts.import", label: "Import Contacts", category: "Contacts" },
        { key: "audio.view", label: "View Audio Files", category: "Audio" },
        { key: "audio.create", label: "Generate TTS Audio", category: "Audio" },
        { key: "audio.delete", label: "Delete Audio Files", category: "Audio" },
        { key: "callerIds.view", label: "View Caller IDs", category: "Caller IDs" },
        { key: "callerIds.manage", label: "Manage Caller IDs", category: "Caller IDs" },
        { key: "dnc.view", label: "View DNC List", category: "DNC" },
        { key: "dnc.manage", label: "Manage DNC List", category: "DNC" },
        { key: "reports.view", label: "View Reports", category: "Reports" },
        { key: "reports.export", label: "Export Reports", category: "Reports" },
        { key: "auditLog.view", label: "View Audit Log", category: "System" },
        { key: "freepbx.view", label: "View FreePBX Status", category: "System" },
        { key: "freepbx.manage", label: "Manage FreePBX Connection", category: "System" },
        { key: "settings.view", label: "View Settings", category: "System" },
        { key: "settings.manage", label: "Manage Settings", category: "System" },
      ];
    }),
  }),

  // ─── Call Scripts ────────────────────────────────────────────────────────
  callScripts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCallScripts(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const script = await db.getCallScript(input.id, ctx.user.id);
      if (!script) throw new TRPCError({ code: "NOT_FOUND" });
      return script;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      callbackNumber: z.string().max(20).optional(),
      segments: z.array(z.object({
        id: z.string(),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.string().optional(),
        audioFileId: z.number().optional(),
        audioName: z.string().optional(),
        audioUrl: z.string().optional(),
      })).min(1).max(20),
    })).mutation(async ({ ctx, input }) => {
      // Validate max 2 recorded segments
      const recordedCount = input.segments.filter(s => s.type === "recorded").length;
      if (recordedCount > 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 2 recorded audio segments allowed per script" });
      }
      const result = await db.createCallScript({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        callbackNumber: input.callbackNumber || null,
        segments: input.segments as ScriptSegment[],
        status: "active",
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.create", resource: "callScript", resourceId: result.id });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      callbackNumber: z.string().max(20).optional(),
      segments: z.array(z.object({
        id: z.string(),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.string().optional(),
        audioFileId: z.number().optional(),
        audioName: z.string().optional(),
        audioUrl: z.string().optional(),
      })).min(1).max(20).optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.segments) {
        const recordedCount = data.segments.filter(s => s.type === "recorded").length;
        if (recordedCount > 2) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 2 recorded audio segments allowed per script" });
        }
      }
      await db.updateCallScript(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCallScript(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.delete", resource: "callScript", resourceId: input.id });
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        await db.deleteCallScript(id, ctx.user.id);
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.bulkDelete", resource: "callScript", details: { count: input.ids.length } });
      return { success: true, deleted: input.ids.length };
    }),
    preview: protectedProcedure.input(z.object({
      segments: z.array(z.object({
        id: z.string(),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.string().optional(),
        audioFileId: z.number().optional(),
        audioName: z.string().optional(),
        audioUrl: z.string().optional(),
      })).min(1).max(20),
      callbackNumber: z.string().optional(),
    })).mutation(async ({ input }) => {
      const result = await generateScriptPreview({
        segments: input.segments as ScriptSegment[],
        callbackNumber: input.callbackNumber,
      });
      return result;
    }),
  }),

  pbxAgent: router({
    // List all registered PBX agents
    list: protectedProcedure.query(async () => {
      return db.getPbxAgents();
    }),
    // Register a new PBX agent and generate API key
    register: protectedProcedure.input(z.object({
      name: z.string().min(1).max(100),
    })).mutation(async ({ input }) => {
      const crypto = await import("crypto");
      const apiKey = `pbx_${crypto.randomBytes(32).toString("hex")}`;
      const agentId = `agent_${crypto.randomBytes(8).toString("hex")}`;
      const result = await db.registerPbxAgent({
        agentId,
        name: input.name,
        apiKey,
        status: "offline",
      });
      return { ...result, apiKey }; // Only returned once at creation
    }),
    // Delete a PBX agent
    delete: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ input }) => {
      await db.deletePbxAgent(input.id);
      return { success: true };
    }),
    // Get call queue stats
    queueStats: protectedProcedure.query(async () => {
      return db.getCallQueueStats();
    }),
    // Get recent queue items
    recentQueue: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(100).optional(),
    })).query(async ({ input }) => {
      const dbInst = await db.getDb();
      if (!dbInst) return [];
      const { callQueue } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return dbInst.select().from(callQueue).orderBy(desc(callQueue.createdAt)).limit(input.limit || 20);
    }),
  }),

  freepbx: router({
    status: protectedProcedure.query(async () => {
      const agents = await db.getPbxAgents();
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < 30000;
      });
      return {
        connected: onlineAgents.length > 0,
        agents: agents.length,
        onlineAgents: onlineAgents.length,
        message: onlineAgents.length > 0
          ? `${onlineAgents.length} PBX agent(s) online`
          : "No PBX agents online - install the PBX agent on your FreePBX server",
      };
    }),
    testConnection: protectedProcedure.mutation(async () => {
      const agents = await db.getPbxAgents();
      if (agents.length === 0) {
        return { success: false, message: "No PBX agents registered. Go to PBX Agent settings to register one." };
      }
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < 30000;
      });
      if (onlineAgents.length === 0) {
        return { success: false, message: "PBX agent registered but not online. Check the agent service on your FreePBX server." };
      }
      return { success: true, message: `${onlineAgents.length} PBX agent(s) connected and ready` };
    }),

    listAgents: protectedProcedure.query(async () => {
      return db.getPbxAgents();
    }),

    registerAgent: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        maxCalls: z.number().int().min(1).max(10).default(5),
        cpsLimit: z.number().int().min(1).max(10).default(1),
        cpsPacingMs: z.number().int().min(333).max(3000).default(1000),
      }))
      .mutation(async ({ input }) => {
        const crypto = await import("crypto");
        const agentId = `agent-${crypto.randomBytes(4).toString("hex")}`;
        const apiKey = `pbx-${crypto.randomBytes(32).toString("hex")}`;
        await db.registerPbxAgent({
          agentId,
          name: input.name,
          apiKey,
          status: "offline",
        });
        // Set maxCalls, cpsLimit, and cpsPacingMs from input
        if (input.maxCalls !== 5) {
          await db.updatePbxAgentMaxCalls(agentId, input.maxCalls);
        }
        if (input.cpsLimit !== 1) {
          await db.updatePbxAgentCps(agentId, input.cpsLimit);
        }
        if (input.cpsPacingMs !== 1000) {
          await db.updatePbxAgentCpsPacing(agentId, input.cpsPacingMs);
        }
        return { agentId, apiKey, name: input.name };
      }),

    updateAgentMaxCalls: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        maxCalls: z.number().int().min(1).max(10),
      }))
      .mutation(async ({ input }) => {
        await db.updatePbxAgentMaxCalls(input.agentId, input.maxCalls);
        return { success: true };
      }),

    updateAgentCps: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        cpsLimit: z.number().int().min(1).max(10),
      }))
      .mutation(async ({ input }) => {
        await db.updatePbxAgentCps(input.agentId, input.cpsLimit);
        return { success: true };
      }),

    updateAgentCpsPacing: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        cpsPacingMs: z.number().int().min(333).max(3000),
      }))
      .mutation(async ({ input }) => {
        await db.updatePbxAgentCpsPacing(input.agentId, input.cpsPacingMs);
        return { success: true };
      }),

    deleteAgent: protectedProcedure
      .input(z.object({ agentId: z.string() }))
      .mutation(async ({ input }) => {
        await db.deletePbxAgentByAgentId(input.agentId);
        return { success: true };
      }),

    queueStats: protectedProcedure.query(async () => {
      return db.getCallQueueStats();
    }),

    resetThrottle: protectedProcedure
      .input(z.object({ agentId: z.string() }))
      .mutation(async ({ input }) => {
        const { resetThrottle } = await import("./services/auto-throttle");
        await resetThrottle(input.agentId);
        return { success: true };
      }),

    getThrottleStatus: protectedProcedure
      .input(z.object({ agentId: z.string() }))
      .query(async ({ input }) => {
        const { getThrottleStatus } = await import("./services/auto-throttle");
        const agent = await db.getPbxAgentByAgentId(input.agentId);
        const status = getThrottleStatus(input.agentId);
        return {
          ...status,
          effectiveMaxCalls: agent?.effectiveMaxCalls ?? null,
          maxCalls: agent?.maxCalls ?? 5,
          throttleReason: agent?.throttleReason ?? null,
          throttleStartedAt: agent?.throttleStartedAt ?? null,
          carrierErrors: agent?.throttleCarrierErrors ?? 0,
        };
      }),
    throttleHistory: protectedProcedure
      .input(z.object({ agentId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return db.getThrottleHistory(input?.agentId, 100);
      }),

    agentMetrics: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getAgentMetrics(ctx.user.id);
      }),

    agentTimeSeries: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        days: z.number().min(1).max(90).default(7),
      }))
      .query(async ({ ctx, input }) => {
        return db.getAgentCallTimeSeries(ctx.user.id, input.agentId, input.days);
      }),

    agentDailyStats: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        days: z.number().min(1).max(90).default(30),
      }))
      .query(async ({ ctx, input }) => {
        return db.getAgentDailyStats(ctx.user.id, input.agentId, input.days);
      }),

    getInstallerCommand: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        origin: z.string().url(),
      }))
      .query(async ({ input }) => {
        const agent = await db.getPbxAgentByAgentId(input.agentId);
        if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
        const apiUrl = `${input.origin}/api/pbx`;
        const apiKey = agent.apiKey;
        const maxCalls = agent.maxCalls ?? 5;
        // Generate a one-liner curl command that downloads and runs the installer
        const oneLiner = `curl -sSL "${input.origin}/api/pbx/install?key=${encodeURIComponent(apiKey)}" | bash`;
        return { oneLiner, apiUrl, apiKey, maxCalls, agentName: agent.name };
      }),
  }),

  // ─── App Settings (TTS API keys, etc.) ─────────────────────────────────────
  appSettings: router({
    /** Get all settings (admin only). Secret values are masked for non-admins. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getAppSettings();
      // Mask secret values unless admin
      return settings.map(s => ({
        ...s,
        value: s.isSecret && ctx.user.role !== "admin" ? (s.value ? "••••••••" : null) : s.value,
      }));
    }),

    /** Get a single setting by key */
    get: protectedProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
      const value = await db.getAppSetting(input.key);
      return { key: input.key, value };
    }),

    /** Get TTS configuration status (which providers have keys) */
    ttsStatus: protectedProcedure.query(async () => {
      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
      const googleKey = await db.getAppSetting("google_tts_api_key") || process.env.GOOGLE_TTS_API_KEY;
      return {
        openaiConfigured: !!openaiKey,
        googleConfigured: !!googleKey,
      };
    }),

    /** Update a setting (admin only) */
    update: adminProcedure.input(z.object({
      key: z.string().min(1).max(100),
      value: z.string().nullable(),
      description: z.string().optional(),
      isSecret: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertAppSetting(input.key, input.value, input.description, input.isSecret, ctx.user.id);
      return { success: true };
    }),

    /** Bulk update settings (admin only) */
    bulkUpdate: adminProcedure.input(z.array(z.object({
      key: z.string().min(1).max(100),
      value: z.string().nullable(),
      description: z.string().optional(),
      isSecret: z.number().optional(),
    }))).mutation(async ({ ctx, input }) => {
      for (const setting of input) {
        await db.upsertAppSetting(setting.key, setting.value, setting.description, setting.isSecret, ctx.user.id);
      }
      return { success: true, count: input.length };
    }),

    /** Delete a setting (admin only) */
    delete: adminProcedure.input(z.object({ key: z.string() })).mutation(async ({ input }) => {
      await db.deleteAppSetting(input.key);
      return { success: true };
    }),

    /** Test an API key against the provider (admin only) */
    testTtsKey: adminProcedure.input(z.object({
      provider: z.enum(["openai", "google"]),
      apiKey: z.string().min(1),
    })).mutation(async ({ input }) => {
      try {
        if (input.provider === "openai") {
          // Test by listing models — lightweight, no cost
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { "Authorization": `Bearer ${input.apiKey}` },
          });
          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 401) return { valid: false, error: "Invalid API key — authentication failed" };
            if (res.status === 429) return { valid: false, error: "Rate limited — key may be valid but quota exceeded" };
            return { valid: false, error: `API returned ${res.status}: ${errText.slice(0, 200)}` };
          }
          return { valid: true, error: null };
        } else {
          // Google TTS — test by listing voices (free, no cost)
          const res = await fetch(
            `https://texttospeech.googleapis.com/v1/voices?key=${input.apiKey}&languageCode=en-US`
          );
          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 400 || res.status === 403) return { valid: false, error: "Invalid API key or TTS API not enabled" };
            return { valid: false, error: `API returned ${res.status}: ${errText.slice(0, 200)}` };
          }
          const data = await res.json();
          const voiceCount = data.voices?.length || 0;
          return { valid: true, error: null, detail: `Found ${voiceCount} en-US voices` };
        }
      } catch (err: any) {
        return { valid: false, error: err.message || "Network error" };
      }
    }),

    /** Get FreePBX connection settings status */
    freepbxStatus: protectedProcedure.query(async () => {
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const amiUser = await db.getAppSetting("freepbx_ami_user") || process.env.FREEPBX_AMI_USER;
      const amiPassword = await db.getAppSetting("freepbx_ami_password") || process.env.FREEPBX_AMI_PASSWORD;
      const amiPort = await db.getAppSetting("freepbx_ami_port") || process.env.FREEPBX_AMI_PORT;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      return {
        hostConfigured: !!host,
        amiConfigured: !!(amiUser && amiPassword),
        sshConfigured: !!(sshUser && sshPassword),
        host: host || null,
        amiPort: amiPort || "5038",
        amiUser: amiUser || null,
        sshUser: sshUser || null,
      };
    }),
  }),

  onboarding: router({
    /** Get onboarding status — checks which setup steps are completed */
    status: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.id;

      // Step 1: Account created (always true if they're authenticated)
      const accountCreated = true;

      // Step 2: FreePBX connected (at least one PBX agent registered)
      const agents = await db.getPbxAgents();
      const pbxConnected = agents.length > 0;
      const pbxOnline = agents.some((a: any) => a.lastHeartbeat && Date.now() - new Date(a.lastHeartbeat).getTime() < 30000);

      // Step 3: Caller IDs imported (at least one caller ID)
      const callerIds = await db.getCallerIds(userId);
      const hasCallerIds = callerIds.length > 0;

      // Step 4: Contacts imported (at least one contact list with contacts)
      const contactLists = await db.getContactLists(userId);
      const hasContacts = contactLists.some((l: any) => (l.contactCount ?? 0) > 0);

      // Step 5: Campaign created
      const campaigns = await db.getCampaigns(userId);
      const hasCampaigns = campaigns.length > 0;

      const steps = [
        { id: "account", label: "Create Account", completed: accountCreated },
        { id: "pbx", label: "Connect FreePBX", completed: pbxConnected, detail: pbxOnline ? "Online" : pbxConnected ? "Registered (offline)" : undefined },
        { id: "callerIds", label: "Add Caller IDs", completed: hasCallerIds, detail: hasCallerIds ? `${callerIds.length} DID(s)` : undefined },
        { id: "contacts", label: "Import Contacts", completed: hasContacts, detail: hasContacts ? `${contactLists.length} list(s)` : undefined },
        { id: "campaign", label: "Create Campaign", completed: hasCampaigns, detail: hasCampaigns ? `${campaigns.length} campaign(s)` : undefined },
      ];

      const completedCount = steps.filter(s => s.completed).length;
      const isComplete = completedCount === steps.length;

      return { steps, completedCount, totalSteps: steps.length, isComplete };
    }),

    /** Mark onboarding as dismissed (stores in localStorage on frontend) */
    dismiss: protectedProcedure.mutation(async () => {
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
