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
import { startCampaign, pauseCampaign, cancelCampaign, isCampaignActive, getActiveCampaignIds, getDialerLiveStats, resumeCampaignAfterRestart } from "./services/dialer";
import { invokeLLM } from "./_core/llm";
import { generateScriptPreview } from "./services/script-audio";
import type { ScriptSegment } from "../drizzle/schema";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { sendPasswordResetEmail, sendVerificationEmail, testSmtpConnection, getSmtpConfig } from "./services/email";
import { validatePassword } from "../shared/passwordValidation";
import { liveAgentRouter } from "./routers/live-agents";
import { getNotificationChannelConfig, testEmailChannel, testSmsChannel, CHANNEL_SETTINGS_KEYS } from "./services/notification-dispatcher";
import { recordingsRouter, wallboardRouter } from "./routers/recordings";
import { voiceAiRouter, supervisorRouter } from "./routers/voice-ai";
import { agentAssistRouter } from "./routers/agent-assist";
import { fetchFreePBXDestinations, createInboundRoutes, deleteInboundRoutes, listInboundRoutes, checkExistingRoutes, updateInboundRoute } from "./services/freepbx-routes";

/** Server-side password strength validation helper */
function assertPasswordStrength(password: string) {
  const result = validatePassword(password);
  if (!result.isValid) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Password too weak: ${result.errors.join(", ")}` });
  }
}

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
      assertPasswordStrength(input.password);
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
      return db.getDashboardStats();
    }),
    amiStatus: protectedProcedure.query(async () => {
      const agents = await db.getPbxAgents();
      const HEARTBEAT_THRESHOLD = 60000; // 60s — generous window to avoid false "offline" during DB-heavy ops
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD;
      });
      // Check agent versions
      const REQUIRED_VERSION = "1.5.0";
      const outdatedAgents = onlineAgents.filter((a: any) => {
        const caps = a.capabilities as any;
        return !caps?.agentVersion || caps.agentVersion < REQUIRED_VERSION;
      });
      return {
        connected: onlineAgents.length > 0,
        agents: agents.length,
        onlineAgents: onlineAgents.length,
        message: onlineAgents.length > 0
          ? `${onlineAgents.length} PBX agent(s) online`
          : "No PBX agents online",
        requiredVersion: REQUIRED_VERSION,
        outdatedAgents: outdatedAgents.length,
        agentVersions: onlineAgents.map((a: any) => ({
          name: a.name,
          version: (a.capabilities as any)?.agentVersion || "unknown",
          hasMultiSegment: ((a.capabilities as any)?.agentFeatures || []).includes("multi_segment_audio"),
        })),
      };
    }),
    activeCampaigns: protectedProcedure.query(async () => {
      return { ids: getActiveCampaignIds() };
    }),
    dialerLive: protectedProcedure.query(async ({ ctx }) => {
      return getDialerLiveStats();
    }),
    callActivity: protectedProcedure.input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional()).query(async ({ ctx, input }) => {
      return db.getRecentCallActivity(input?.limit ?? 50);
    }),
    areaCodeDistribution: protectedProcedure.input(z.object({ campaignId: z.number().optional(), hours: z.number().min(1).max(168).default(24) }).optional()).query(async ({ ctx, input }) => {
      return db.getAreaCodeDistribution(input?.campaignId, input?.hours ?? 24);
    }),

    /** System health check — returns status of all integrations at a glance */
    systemHealth: protectedProcedure.query(async () => {
      // 1. AMI / PBX Agent status
      const agents = await db.getPbxAgents();
      const HEARTBEAT_THRESHOLD = 60000; // 60s — generous window to avoid false "offline" during DB-heavy ops
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD;
      });
      const amiOk = onlineAgents.length > 0;

      // 2. SSH config status (just check if credentials are set)
      const sshHost = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPass = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      const sshConfigured = !!(sshHost && sshUser && sshPass);

      // 3. TTS API key status
      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
      const googleKey = await db.getAppSetting("google_tts_api_key") || process.env.GOOGLE_TTS_API_KEY;

      // 4. Database connectivity (if we got here, DB is working)
      const dbOk = true;

      return {
        ami: {
          status: amiOk ? "connected" as const : "disconnected" as const,
          detail: amiOk ? `${onlineAgents.length} PBX agent(s) online` : "No PBX agents online",
        },
        ssh: {
          status: sshConfigured ? "configured" as const : "not_configured" as const,
          detail: sshConfigured ? `${sshUser}@${sshHost}` : "SSH credentials not set — go to Settings",
        },
        openai: {
          status: openaiKey ? "configured" as const : "not_configured" as const,
          detail: openaiKey ? "API key set" : "No API key — go to Settings",
        },
        google: {
          status: googleKey ? "configured" as const : "not_configured" as const,
          detail: googleKey ? "API key set" : "No API key — go to Settings",
        },
        database: {
          status: dbOk ? "connected" as const : "error" as const,
          detail: dbOk ? "Connected" : "Connection error",
        },
      };
    }),
  }),

  contactLists: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getContactLists();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const list = await db.getContactList(input.id);
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
      await db.updateContactList(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteContactList(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.delete", resource: "contactList", resourceId: input.id });
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      let deleted = 0;
      for (const id of input.ids) {
        try {
          await db.deleteContactList(id);
          deleted++;
        } catch (_) { /* skip lists that don't exist or aren't owned */ }
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.bulkDelete", resource: "contactList", details: { deleted, ids: input.ids } });
      return { deleted };
    }),
    // ─── Contact Segmentation ──────────────────────────────────────────
    segmentation: protectedProcedure.input(z.object({ listId: z.number() })).query(async ({ input }) => {
      return db.getContactSegmentation(input.listId);
    }),
    // ─── Contact Dedup ─────────────────────────────────────────────────
    findDuplicates: protectedProcedure.input(z.object({
      listIds: z.array(z.number()).optional(),
    })).query(async ({ input }) => {
      return db.findDuplicateContacts(input.listIds);
    }),
    removeDuplicates: protectedProcedure.input(z.object({
      listId: z.number(),
      keepStrategy: z.enum(["first", "last"]).default("first"),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.removeDuplicateContacts(input.listId, input.keepStrategy);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.removeDuplicates", resource: "contactList", resourceId: input.listId, details: result });
      return result;
    }),
    // ─── Vtiger CRM Import ─────────────────────────────────────────────
    vtigerTest: protectedProcedure.mutation(async () => {
      const { testVtigerConnection } = await import("./services/vtiger-crm");
      return testVtigerConnection();
    }),
    vtigerContacts: protectedProcedure.input(z.object({
      limit: z.number().default(100),
      offset: z.number().default(0),
      query: z.string().optional(),
    })).query(async ({ input }) => {
      const { fetchVtigerContacts } = await import("./services/vtiger-crm");
      return fetchVtigerContacts(input);
    }),
    vtigerImport: protectedProcedure.input(z.object({
      listId: z.number(),
      limit: z.number().default(10000),
      query: z.string().optional(),
      phoneField: z.enum(["phone", "mobile", "both"]).default("both"),
    })).mutation(async ({ ctx, input }) => {
      const { importVtigerContacts } = await import("./services/vtiger-crm");
      const result = await importVtigerContacts(input.listId, ctx.user.id, { limit: input.limit, query: input.query, phoneField: input.phoneField });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "contactList.vtigerImport", resource: "contactList", resourceId: input.listId, details: result });
      return result;
    }),
    vtigerCount: protectedProcedure.input(z.object({ query: z.string().optional() })).query(async ({ input }) => {
      const { getVtigerContactCount } = await import("./services/vtiger-crm");
      return getVtigerContactCount(input.query);
    }),
  }),

  contacts: router({
    list: protectedProcedure.input(z.object({ listId: z.number() })).query(async ({ ctx, input }) => {
      return db.getContacts(input.listId);
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
      await db.updateContact(id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      await db.deleteContacts(input.ids);
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
      return db.previewImport(input.phoneNumbers, input.listId, { skipDupeCheck: input.skipDupeCheck });
    }),
  }),

  audio: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getAudioFiles();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const file = await db.getAudioFile(input.id);
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
      await db.deleteAudioFile(input.id);
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
    // ─── Export / Import ─────────────────────────────────────────────
    exportAll: protectedProcedure.query(async ({ ctx }) => {
      const files = await db.getAudioFiles();
      const exportData = files.map(f => ({
        name: f.name,
        text: f.text,
        voice: f.voice,
        s3Url: f.s3Url,
        s3Key: f.s3Key,
        duration: f.duration,
        fileSize: f.fileSize,
        status: f.status,
      }));
      return { version: "1.0", type: "audio_files", exportedAt: Date.now(), count: exportData.length, data: exportData };
    }),
    importAll: protectedProcedure.input(z.object({
      data: z.array(z.object({
        name: z.string(),
        text: z.string(),
        voice: z.string(),
        s3Url: z.string().nullable().optional(),
        s3Key: z.string().nullable().optional(),
        duration: z.number().nullable().optional(),
        fileSize: z.number().nullable().optional(),
        status: z.enum(["generating", "ready", "failed"]).optional(),
      })),
      skipDuplicates: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getAudioFiles();
      const existingNames = new Set(existing.map(f => f.name.toLowerCase()));
      let imported = 0;
      let skipped = 0;
      for (const item of input.data) {
        if (input.skipDuplicates && existingNames.has(item.name.toLowerCase())) {
          skipped++;
          continue;
        }
        await db.createAudioFile({
          userId: ctx.user.id,
          name: item.name,
          text: item.text,
          voice: item.voice,
          s3Url: item.s3Url || null,
          s3Key: item.s3Key || null,
          duration: item.duration || null,
          fileSize: item.fileSize || null,
          status: item.s3Url ? "ready" : "failed",
        });
        imported++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.import", resource: "audioFile", details: { imported, skipped, total: input.data.length } });
      return { success: true, imported, skipped, total: input.data.length };
    }),
  }),

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCampaigns();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
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
      didLabel: z.string().max(100).optional().nullable(), // Filter DID rotation by label
      pacingMode: z.enum(["fixed", "adaptive", "predictive"]).optional(),
      pacingTargetDropRate: z.number().min(1).max(20).optional(),
      pacingMinConcurrent: z.number().min(1).max(50).optional(),
      pacingMaxConcurrent: z.number().min(1).max(100).optional(),
      scriptId: z.number().optional(),
      callbackNumber: z.string().max(20).optional(),
      useDidCallbackNumber: z.number().min(0).max(1).optional(),
      // Predictive dialer
      predictiveAgentCount: z.number().min(1).max(50).optional(),
      predictiveMaxAbandonRate: z.number().min(1).max(10).optional(),
      // AMD / Voicemail drop
      amdEnabled: z.number().min(0).max(1).optional(),
      voicemailAudioId: z.number().optional(),
      voicemailMessage: z.string().max(2000).optional(),
      // IVR Payment
      ivrPaymentEnabled: z.number().min(0).max(1).optional(),
      ivrPaymentDigit: z.string().max(1).optional(),
      ivrPaymentAmount: z.number().min(0).optional(),
      // Timezone enforcement
      tzEnforcementEnabled: z.number().min(0).max(1).optional(),
      tcpaStartHour: z.number().min(0).max(23).optional(),
      tcpaEndHour: z.number().min(0).max(23).optional(),
      // Routing mode & Voice AI
      routingMode: z.enum(["broadcast", "live_agent", "hybrid", "voice_ai"]).optional(),
      voiceAiPromptId: z.number().optional(),
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
      didLabel: z.string().max(100).optional().nullable(), // Filter DID rotation by label
      pacingMode: z.enum(["fixed", "adaptive", "predictive"]).optional(),
      pacingTargetDropRate: z.number().min(1).max(20).optional(),
      pacingMinConcurrent: z.number().min(1).max(50).optional(),
      pacingMaxConcurrent: z.number().min(1).max(100).optional(),
      scriptId: z.number().optional(),
      callbackNumber: z.string().max(20).optional(),
      useDidCallbackNumber: z.number().min(0).max(1).optional(),
      // Predictive dialer
      predictiveAgentCount: z.number().min(1).max(50).optional(),
      predictiveMaxAbandonRate: z.number().min(1).max(10).optional(),
      // AMD / Voicemail drop
      amdEnabled: z.number().min(0).max(1).optional(),
      voicemailAudioId: z.number().optional(),
      voicemailMessage: z.string().max(2000).optional(),
      // IVR Payment
      ivrPaymentEnabled: z.number().min(0).max(1).optional(),
      ivrPaymentDigit: z.string().max(1).optional(),
      ivrPaymentAmount: z.number().min(0).optional(),
      // Timezone enforcement
      tzEnforcementEnabled: z.number().min(0).max(1).optional(),
      tcpaStartHour: z.number().min(0).max(23).optional(),
      tcpaEndHour: z.number().min(0).max(23).optional(),
      // Routing mode & Voice AI
      routingMode: z.enum(["broadcast", "live_agent", "hybrid", "voice_ai"]).optional(),
      voiceAiPromptId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const campaign = await db.getCampaign(id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update a running campaign" });
      await db.updateCampaign(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (campaign?.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Stop the campaign before deleting" });
      await db.deleteCampaign(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.delete", resource: "campaign", resourceId: input.id });
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(10000) })).mutation(async ({ ctx, input }) => {
      let deleted = 0;
      const skipped: number[] = [];
      for (const id of input.ids) {
        const campaign = await db.getCampaign(id);
        if (campaign?.status === "running") { skipped.push(id); continue; }
        await db.deleteCampaign(id);
        deleted++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.bulkDelete", resource: "campaign", details: { deleted, skipped: skipped.length } });
      return { success: true, deleted, skipped: skipped.length };
    }),
    resetCallHistory: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset call history while campaign is running" });
      const result = await db.resetCampaignCallHistory(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.resetCallHistory", resource: "campaign", resourceId: input.id, details: { deletedLogs: result.deletedLogs } });
      return { success: true, deletedLogs: result.deletedLogs };
    }),
    getRetriableCount: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      const count = await db.getRetriableContactCount(input.id);
      return { count };
    }),
    retryFailed: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot retry failed contacts while campaign is running" });
      const result = await db.retryFailedContacts(input.id);
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
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Only cancelled campaigns can be reactivated" });
      await db.updateCampaign(input.id, { status: "draft" });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.reactivate", resource: "campaign", resourceId: input.id });
      return { success: true };
    }),
    replay: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "completed" && campaign.status !== "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed or cancelled campaigns can be replayed" });
      }
      // Reset campaign stats and set to draft
      await db.updateCampaign(input.id, {
        status: "draft",
        completedCalls: 0,
        answeredCalls: 0,
        failedCalls: 0,
        startedAt: null,
        completedAt: null,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "campaign.replay",
        resource: "campaign",
        resourceId: input.id,
        details: { previousStatus: campaign.status },
      });
      return { success: true };
    }),
    forceResume: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      // Allow force resume for campaigns that are "running" in DB but not active in memory (stuck state)
      if (campaign.status !== "running" && campaign.status !== "paused") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only running or paused campaigns can be force-resumed" });
      }
      // If already active in memory, nothing to do
      if (isCampaignActive(input.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign is already actively running" });
      }
      // Set to running if paused
      if (campaign.status === "paused") {
        await db.updateCampaign(input.id, { status: "running" });
      }
      // Resume the dialer loop
      await resumeCampaignAfterRestart(input.id, ctx.user.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.forceResume", resource: "campaign", resourceId: input.id });
      return { success: true };
    }),
    stats: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const stats = await db.getCampaignStats(input.id);
      return { ...stats, isActive: isCampaignActive(input.id) };
    }),
    // Campaign Cloning
    clone: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.cloneCampaign(input.id, input.name);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.clone", resource: "campaign", resourceId: result.id, details: { clonedFrom: input.id } });
      return result;
    }),
    // ─── Campaign Scheduling ──────────────────────────────────────────
    schedule: protectedProcedure.input(z.object({
      campaignId: z.number(),
      scheduledAt: z.number(), // Unix timestamp ms
    })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "draft" && campaign.status !== "paused") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft or paused campaigns can be scheduled" });
      }
      if (input.scheduledAt <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future" });
      }
      // Cancel any existing pending schedule
      await db.cancelCampaignSchedule(input.campaignId);
      const result = await db.createCampaignSchedule({
        campaignId: input.campaignId,
        scheduledAt: input.scheduledAt,
        userId: ctx.user.id,
        status: "pending",
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.scheduled", resource: "campaign", resourceId: input.campaignId, details: { scheduledAt: input.scheduledAt } });
      return { id: result.id, scheduledAt: input.scheduledAt };
    }),
    cancelSchedule: protectedProcedure.input(z.object({ campaignId: z.number() })).mutation(async ({ ctx, input }) => {
      await db.cancelCampaignSchedule(input.campaignId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.scheduleCancelled", resource: "campaign", resourceId: input.campaignId });
      return { success: true };
    }),
    getSchedule: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCampaignSchedule(input.campaignId) ?? null;
    }),
    scheduleHistory: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCampaignScheduleHistory(input.campaignId);
    }),
  }),

  // ─── Campaign Templates ──────────────────────────────────────────────
  campaignTemplates: router({
    list: protectedProcedure.query(async () => {
      return db.getCampaignTemplates();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const tpl = await db.getCampaignTemplate(input.id);
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      return tpl;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      config: z.record(z.string(), z.any()), // JSON campaign config object
    })).mutation(async ({ ctx, input }) => {
      return db.createCampaignTemplate({
        name: input.name,
        description: input.description || null,
        config: input.config as any,
        userId: ctx.user.id,
      });
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      config: z.record(z.string(), z.any()).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.updateCampaignTemplate(input.id, {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.config && { config: input.config as any }),
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteCampaignTemplate(input.id);
      return { success: true };
    }),
    saveFromCampaign: protectedProcedure.input(z.object({
      campaignId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const config = {
        scriptId: campaign.scriptId,
        listId: campaign.contactListId,
        callerIdStrategy: campaign.callerIdNumber || undefined,
        retryAttempts: campaign.retryAttempts,
        retryDelay: campaign.retryDelay,
        ivrEnabled: campaign.ivrEnabled,
        ivrConfig: campaign.ivrOptions,
        voiceAiEnabled: campaign.routingMode === "voice_ai" ? 1 : 0,
        voiceAiPersonaId: campaign.voiceAiPromptId,
        usePersonalizedTTS: campaign.usePersonalizedTTS,
        ttsSpeed: campaign.ttsSpeed,
      };
      return db.createCampaignTemplate({
        name: input.name,
        description: input.description || `Saved from campaign "${campaign.name}"`,
        config: config as any,
        userId: ctx.user.id,
      });
    }),
  }),

  callLogs: router({
    list: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCallLogs(input.campaignId);
    }),
    export: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      const logs = await db.getCallLogsForExport(input.campaignId);
      const campaign = await db.getCampaign(input.campaignId);
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
    filtered: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      action: z.string().optional(),
      resource: z.string().optional(),
      search: z.string().optional(),
    })).query(async ({ input }) => {
      return db.getAuditLogsFiltered(input);
    }),
    actions: protectedProcedure.query(async () => {
      return db.getAuditLogActions();
    }),
  }),

  dnc: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ ctx, input }) => {
      return db.getDncEntries(input.search);
    }),
    count: protectedProcedure.query(async ({ ctx }) => {
      return { count: await db.getDncCount() };
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
      await db.removeDncEntry(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "dnc.remove", resource: "dnc", resourceId: input.id });
      return { success: true };
    }),
    bulkRemove: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      await db.bulkRemoveDnc(input.ids);
      return { success: true };
    }),
    check: protectedProcedure.input(z.object({ phoneNumber: z.string() })).query(async ({ ctx, input }) => {
      return { onDnc: await db.isPhoneOnDnc(input.phoneNumber) };
    }),
  }),

  callerIds: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCallerIds();
    }),
    getLabels: protectedProcedure.query(async () => {
      const all = await db.getCallerIds();
      const labels = all.map(c => c.label).filter(Boolean) as string[];
      return Array.from(new Set(labels)).sort();
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
      await db.updateCallerId(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      // Look up the phone number before deleting so we can remove the FreePBX route
      const allCids = await db.getCallerIds();
      const cid = allCids.find(c => c.id === input.id);
      await db.deleteCallerId(input.id);
      // Best-effort: also delete the inbound route on FreePBX
      if (cid?.phoneNumber) {
        try {
          const result = await deleteInboundRoutes([cid.phoneNumber]);
          if (result.deleted > 0) {
            console.log(`[CallerID Delete] Also removed inbound route for ${cid.phoneNumber}`);
          }
        } catch (e: any) {
          console.warn(`[CallerID Delete] Could not remove inbound route for ${cid.phoneNumber}: ${e.message}`);
        }
      }
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      // Look up phone numbers before deleting so we can remove FreePBX routes
      const allCids = await db.getCallerIds();
      const phoneNumbers = allCids.filter(c => input.ids.includes(c.id)).map(c => c.phoneNumber);
      await db.bulkDeleteCallerIds(input.ids);
      // Best-effort: also delete inbound routes on FreePBX
      if (phoneNumbers.length > 0) {
        try {
          const result = await deleteInboundRoutes(phoneNumbers);
          if (result.deleted > 0) {
            console.log(`[CallerID BulkDelete] Also removed ${result.deleted} inbound route(s) from FreePBX`);
          }
        } catch (e: any) {
          console.warn(`[CallerID BulkDelete] Could not remove inbound routes: ${e.message}`);
        }
      }
      return { success: true };
    }),
    bulkUpdate: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(10000),
      label: z.string().max(255).optional(),
      isActive: z.number().min(0).max(1).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { ids, ...data } = input;
      await db.bulkUpdateCallerIds(ids, data);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.bulkUpdate", resource: "callerId", details: { count: ids.length, fields: Object.keys(data) } });
      return { success: true, count: ids.length };
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
        callerIdsToCheck = await db.getCallerIds();
        callerIdsToCheck = callerIdsToCheck.filter(c => idsToCheck.includes(c.id));
      } else {
        // Get all due for check
        callerIdsToCheck = await db.getCallerIdsForHealthCheck();
      }
      if (callerIdsToCheck.length === 0) {
        return { queued: 0, message: "No caller IDs need checking right now" };
      }
      // Flood guard: prevent health check queue from growing too large
      const pendingHealthChecks = await db.getPendingHealthCheckCount();
      if (pendingHealthChecks >= 50) {
        return { queued: 0, message: `${pendingHealthChecks} health checks already pending. Wait for them to complete before queuing more.` };
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
          priority: 10, // Lowest priority — real calls always go first
          userId: ctx.user.id,
        });
        queued++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.healthCheck", resource: "callerId", details: { queued } });
      return { queued, message: `${queued} health check(s) queued` };
    }),
    resetHealth: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.resetCallerIdHealth(input.id);
      return { success: true };
    }),
    // Health check schedule endpoints
    getSchedule: protectedProcedure.query(async ({ ctx }) => {
      const schedule = await db.getHealthCheckSchedule();
      return schedule || { enabled: 0, intervalHours: 24, lastRunAt: null, nextRunAt: null };
    }),
    updateSchedule: protectedProcedure.input(z.object({
      enabled: z.boolean(),
      intervalHours: z.number().min(1).max(168), // 1 hour to 7 days
    })).mutation(async ({ ctx, input }) => {
      const result = await db.upsertHealthCheckSchedule({
        enabled: input.enabled ? 1 : 0,
        intervalHours: input.intervalHours,
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "callerId.updateSchedule", resource: "callerId", details: { enabled: input.enabled, intervalHours: input.intervalHours } });
      return result;
    }),
    // Per-DID Analytics endpoints
    analyticsSummary: protectedProcedure.query(async ({ ctx }) => {
      return db.getDidAnalyticsSummary();
    }),
    callVolume: protectedProcedure.input(z.object({
      callerIdStr: z.string().optional(),
      days: z.number().min(1).max(90).default(7),
    }).optional()).query(async ({ ctx, input }) => {
      return db.getDidCallVolume(input?.callerIdStr, input?.days || 7);
    }),
    flagHistory: protectedProcedure.query(async ({ ctx }) => {
      return db.getDidFlagHistory();
    }),
    campaignBreakdown: protectedProcedure.input(z.object({
      callerIdStr: z.string().min(1),
    })).query(async ({ ctx, input }) => {
      return db.getDidCampaignBreakdown(input.callerIdStr);
    }),

    // ─── Inbound Route Management ────────────────────────────────────────

    /** Fetch available FreePBX destinations (queues, ring groups, IVRs, extensions, etc.) */
    getFreePBXDestinations: adminProcedure.query(async () => {
      try {
        const dests = await fetchFreePBXDestinations();
        console.log(`[FreePBX Routes] Fetched ${dests.length} destinations: ${Object.entries(dests.reduce((acc: Record<string, number>, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {})).map(([k,v]) => `${k}=${v}`).join(', ')}`);
        return dests;
      } catch (e: any) {
        console.error(`[FreePBX Routes] Failed to fetch destinations:`, e.message);
        // Return terminate options as fallback so UI isn't completely empty
        return [
          { type: "terminate" as const, id: "hangup", name: "Hangup", destination: "app-blackhole,hangup,1" },
          { type: "terminate" as const, id: "congestion", name: "Congestion", destination: "app-blackhole,congestion,1" },
          { type: "terminate" as const, id: "busy", name: "Play Busy", destination: "app-blackhole,busy,1" },
        ];
      }
    }),

    /** List existing inbound routes on FreePBX */
    listInboundRoutes: adminProcedure.query(async () => {
      return listInboundRoutes();
    }),

    /** Check which DIDs already have inbound routes */
    checkInboundRoutes: adminProcedure.input(z.object({
      dids: z.array(z.string().min(1)).min(1).max(1000),
    })).query(async ({ input }) => {
      const existing = await checkExistingRoutes(input.dids);
      return Object.fromEntries(existing);
    }),

    /** Create inbound routes on FreePBX for imported DIDs */
    createInboundRoutes: adminProcedure.input(z.object({
      routes: z.array(z.object({
        did: z.string().min(1).max(20),
        destination: z.string().min(1), // FreePBX destination format e.g. "ext-queues,400,1"
        description: z.string().max(255).default("TTS Dialer"),
        cidPrefix: z.string().max(50).optional(),
      })).min(1).max(1000),
    })).mutation(async ({ ctx, input }) => {
      const results = await createInboundRoutes(input.routes);
      const created = results.filter(r => r.success && !r.alreadyExists).length;
      const skipped = results.filter(r => r.alreadyExists).length;
      const failed = results.filter(r => !r.success).length;
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.createInboundRoutes",
        resource: "callerId",
        details: { created, skipped, failed, total: input.routes.length },
      });
      return { results, summary: { created, skipped, failed } };
    }),

    /** Delete inbound routes from FreePBX */
    deleteInboundRoutes: adminProcedure.input(z.object({
      dids: z.array(z.string().min(1)).min(1).max(1000),
    })).mutation(async ({ ctx, input }) => {
      const result = await deleteInboundRoutes(input.dids);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.deleteInboundRoutes",
        resource: "callerId",
        details: { deleted: result.deleted, dids: input.dids },
      });
      return result;
    }),

    /** Bulk create caller IDs AND inbound routes in one step */
    bulkCreateWithRoutes: adminProcedure.input(z.object({
      entries: z.array(z.object({
        phoneNumber: z.string().min(1).max(20),
        label: z.string().max(255).optional(),
        inboundRoute: z.object({
          destination: z.string().min(1),
          description: z.string().max(255).default("TTS Dialer"),
          cidPrefix: z.string().max(50).optional(),
        }).optional(),
      })).min(1).max(1000),
    })).mutation(async ({ ctx, input }) => {
      // Step 1: Create caller IDs in our database
      const callerIdData = input.entries.map(e => ({
        phoneNumber: e.phoneNumber,
        label: e.label,
        userId: ctx.user.id,
      }));
      const callerIdResult = await db.bulkCreateCallerIds(callerIdData);

      // Step 2: Create inbound routes on FreePBX for entries that have route config
      const routeEntries = input.entries.filter(e => e.inboundRoute);
      console.log(`[bulkCreateWithRoutes] Total entries: ${input.entries.length}, entries with routes: ${routeEntries.length}`);
      if (routeEntries.length > 0) {
        console.log(`[bulkCreateWithRoutes] Route destinations:`, routeEntries.map(e => ({ phone: e.phoneNumber, dest: e.inboundRoute?.destination })));
      }
      let routeResults = null;
      if (routeEntries.length > 0) {
        const routes = routeEntries.map(e => ({
          did: e.phoneNumber,
          destination: e.inboundRoute!.destination,
          description: e.inboundRoute!.description,
          cidPrefix: e.inboundRoute?.cidPrefix,
        }));
        console.log(`[bulkCreateWithRoutes] Calling createInboundRoutes with ${routes.length} routes`);
        const results = await createInboundRoutes(routes);
        console.log(`[bulkCreateWithRoutes] createInboundRoutes returned ${results.length} results:`, results.map(r => ({ did: r.did, success: r.success, exists: r.alreadyExists, error: r.error })));
        const created = results.filter(r => r.success && !r.alreadyExists).length;
        const skipped = results.filter(r => r.alreadyExists).length;
        const failed = results.filter(r => !r.success).length;
        routeResults = { results, summary: { created, skipped, failed } };
      } else {
        console.log(`[bulkCreateWithRoutes] No entries have inbound routes configured — skipping FreePBX route creation`);
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkCreateWithRoutes",
        resource: "callerId",
        details: {
          callerIds: callerIdResult.count,
          dupes: callerIdResult.duplicatesOmitted,
          routes: routeResults?.summary || null,
        },
      });

      return {
        callerIds: callerIdResult,
        inboundRoutes: routeResults,
      };
    }),

    /** Update an existing inbound route's destination, description, or CID prefix */
    updateInboundRoute: adminProcedure.input(z.object({
      did: z.string().min(1),
      destination: z.string().min(1).optional(),
      description: z.string().max(255).optional(),
      cidPrefix: z.string().max(50).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await updateInboundRoute(input.did, {
        destination: input.destination,
        description: input.description,
        cidPrefix: input.cidPrefix,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.updateInboundRoute",
        resource: "callerId",
        details: { did: input.did, updates: { destination: input.destination, description: input.description, cidPrefix: input.cidPrefix } },
      });
      return result;
    }),
  }),

  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getBroadcastTemplates();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const template = await db.getBroadcastTemplate(input.id);
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
      await db.updateBroadcastTemplate(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteBroadcastTemplate(input.id);
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      const deleted = await db.bulkDeleteBroadcastTemplates(input.ids);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "template.bulkDelete", resource: "template", details: { count: deleted } });
      return { deleted };
    }),
  }),

  analytics: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      return db.getCallAnalytics();
    }),
    campaign: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      const result = await db.getCampaignAnalytics(input.campaignId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),
    abTest: protectedProcedure.input(z.object({ group: z.string() })).query(async ({ ctx, input }) => {
      return db.getABTestResults(input.group);
    }),
  }),

  // Contact Scoring
  scoring: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getContactScores();
    }),
    get: protectedProcedure.input(z.object({ contactId: z.number() })).query(async ({ ctx, input }) => {
      return db.getContactScore(input.contactId);
    }),
    recalculate: protectedProcedure.input(z.object({ contactId: z.number() })).mutation(async ({ ctx, input }) => {
      await db.recalculateContactScore(input.contactId);
      return { success: true };
    }),
    updateTags: protectedProcedure.input(z.object({
      contactId: z.number(),
      tags: z.array(z.string()),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const score = await db.getContactScore(input.contactId);
      if (!score) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateContactScore(score.id, { tags: input.tags, notes: input.notes });
      return { success: true };
    }),
  }),

  // Cost Estimator
  costEstimator: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getCostSettings();
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
      await db.upsertCostSettings(input);
      return { success: true };
    }),
    estimate: protectedProcedure.input(z.object({
      contactCount: z.number().min(1),
      messageLength: z.number().min(1),
      retryAttempts: z.number().min(0).max(5).optional(),
      expectedAnswerRate: z.number().min(0).max(100).optional(),
    })).query(async ({ ctx, input }) => {
      const settings = await db.getCostSettings();
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
      // ─── Pre-flight check: ensure PBX agent is online ─────────────
      const agents = await db.getPbxAgents();
      const onlineAgent = agents.find((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - Number(a.lastHeartbeat) < 60000;
      });
      if (!onlineAgent) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No PBX agent is currently online. Make sure your FreePBX agent service is running and connected.",
        });
      }

      const audioFile = await db.getAudioFile(input.audioFileId);
      if (!audioFile || !audioFile.s3Url) throw new TRPCError({ code: "BAD_REQUEST", message: "Audio file not ready" });

      // Queue-based approach: enqueue the call for the PBX agent to pick up
      // The PBX agent polls /api/pbx/poll, originates via local AMI, and reports back
      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      const channel = `PJSIP/${phoneNumber}@vitel-outbound`;
      const audioName = `quicktest_${audioFile.id}`;

      // Resolve caller ID — use selected DID or pick a random active one
      let callerIdStr: string | undefined;
      const callerIdList = await db.getCallerIds();
      if (input.callerIdId) {
        const selectedCid = callerIdList.find(c => c.id === input.callerIdId);
        if (selectedCid) callerIdStr = selectedCid.phoneNumber;
      }
      // If no caller ID selected, pick a random active DID to avoid trunk default (1111111111)
      if (!callerIdStr) {
        const activeDids = callerIdList.filter(c => c.isActive && !c.autoDisabled);
        if (activeDids.length > 0) {
          const randomDid = activeDids[Math.floor(Math.random() * activeDids.length)];
          callerIdStr = randomDid.phoneNumber;
          console.log(`[QuickTest] No caller ID selected, using random DID: ${callerIdStr}`);
        }
      }

      console.log(`[QuickTest] Enqueuing call to ${phoneNumber} with audio URL: ${audioFile.s3Url.substring(0, 80)}...${callerIdStr ? ` CallerID: ${callerIdStr}` : ''}`);

      const queueResult = await db.enqueueCall({
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
        priority: 0, // Quick test = absolute highest priority (above campaign calls)
      });

      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "quickTest.call", resource: "audioFile", resourceId: input.audioFileId, details: { phoneNumber: input.phoneNumber } });
      return { success: true, message: `Call queued to ${phoneNumber} (Agent: ${onlineAgent.name})`, queueId: queueResult?.id };
    }),
    /** Poll call queue status — used by UI to show real-time call result */
    getCallStatus: protectedProcedure
      .input(z.object({ queueId: z.number() }))
      .query(async ({ input }) => {
        const item = await db.getCallQueueItem(input.queueId);
        if (!item) return { status: "not_found" as const, message: "Call not found", failureReason: "", duration: 0, claimedBy: null };
        const result = item.result as string | null;
        const details = (item.resultDetails || {}) as Record<string, any>;
        const status = item.status as string;
        let failureReason = "";
        if (status === "failed" || result === "failed") {
          if (details.error) failureReason = details.error;
          else if (details.reason) {
            const map: Record<string, string> = {
              "0": "Call could not be originated — check SIP trunk and dialplan on PBX",
              "1": "Unallocated number", "17": "User busy", "18": "No user responding",
              "19": "No answer", "21": "Call rejected", "27": "Destination out of order",
              "28": "Invalid number format", "31": "Normal, unspecified",
            };
            failureReason = map[String(details.reason)] || `Hangup cause: ${details.reason}`;
          } else failureReason = "Call failed — no specific reason from PBX agent";
        }
        return {
          status: status as "pending" | "claimed" | "dialing" | "completed" | "failed" | "not_found",
          result: result || null,
          duration: details.duration || 0,
          failureReason,
          claimedBy: (item as any).claimedBy || null,
        };
      }),
  }),

  reports: router({
    exportCampaign: protectedProcedure.input(z.object({ campaignId: z.number() })).mutation(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      const logs = await db.getCallLogsForExport(input.campaignId);
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
      const campaigns = await db.getCampaigns();
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
      // Get group memberships and verification status for each user
      const usersWithGroups = await Promise.all(allUsers.map(async (u) => {
        const groups = await db.getUserGroupMemberships(u.id);
        const localAuthRecord = await db.getLocalAuthByUserId(u.id);
        return {
          ...u,
          groups: groups.map(g => ({ id: g.id, name: g.name })),
          isVerified: localAuthRecord ? !!localAuthRecord.isVerified : true, // OAuth users are always verified
          hasLocalAuth: !!localAuthRecord,
        };
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
      skipVerification: z.boolean().optional(),
      origin: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existing = await db.getLocalAuthByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      // Create user with a unique openId for local auth
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await db.upsertUser({ openId, name: input.name, email: input.email, loginMethod: "email", role: input.role || "user" });
      const user = await db.getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Validate password strength
      assertPasswordStrength(input.password);
      // Create local auth record
      const passwordHash = await bcrypt.hash(input.password, 12);
      const shouldVerify = input.skipVerification ? 1 : 0;
      await db.createLocalAuth({ userId: user.id, email: input.email, passwordHash, isVerified: shouldVerify });
      // Send verification email if not skipped
      let emailSent = false;
      if (!input.skipVerification) {
        const verifyToken = `verify_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
        const verifyExpiry = Date.now() + 86400000; // 24 hours
        await db.setVerificationToken(input.email, verifyToken, verifyExpiry);
        const origin = input.origin || "";
        if (origin) {
          emailSent = await sendVerificationEmail(input.email, verifyToken, origin);
        }
      }
      // Add to groups
      if (input.groupIds) {
        for (const gid of input.groupIds) {
          await db.addUserToGroup(user.id, gid);
        }
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.create", resource: "user", resourceId: user.id, details: { email: input.email, method: "email", verified: !!input.skipVerification } });
      return { success: true, userId: user.id, emailSent };
    }),
    /** Delete a user (admin only) */
    deleteUser: adminProcedure.input(z.object({
      userId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      // Prevent admin from deleting themselves
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
      }
      const targetUser = await db.getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await db.deleteUser(input.userId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.delete", resource: "user", resourceId: input.userId, details: { deletedEmail: targetUser.email, deletedName: targetUser.name } });
      return { success: true };
    }),

    /** Bulk delete users (admin only) */
    bulkDeleteUsers: adminProcedure.input(z.object({
      userIds: z.array(z.number()).min(1).max(100),
    })).mutation(async ({ ctx, input }) => {
      // Filter out the current admin's ID to prevent self-deletion
      const idsToDelete = input.userIds.filter(id => id !== ctx.user.id);
      if (idsToDelete.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid users to delete (you cannot delete your own account)" });
      }
      const deletedUsers: Array<{ id: number; email: string | null; name: string | null }> = [];
      for (const userId of idsToDelete) {
        const targetUser = await db.getUserById(userId);
        if (targetUser) {
          await db.deleteUser(userId);
          deletedUsers.push({ id: userId, email: targetUser.email, name: targetUser.name });
        }
      }
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "user.bulkDelete",
        resource: "user",
        details: { count: deletedUsers.length, deletedUsers: deletedUsers.map(u => ({ id: u.id, email: u.email, name: u.name })) },
      });
      return { success: true, deletedCount: deletedUsers.length, skipped: input.userIds.length - idsToDelete.length };
    }),

    /** Admin reset password for any user (admin only) */
    adminResetPassword: adminProcedure.input(z.object({
      userId: z.number(),
      newPassword: z.string().min(8).max(100),
    })).mutation(async ({ ctx, input }) => {
      assertPasswordStrength(input.newPassword);
      const authRecord = await db.getLocalAuthByUserId(input.userId);
      if (!authRecord) throw new TRPCError({ code: "BAD_REQUEST", message: "User does not have email/password login" });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.updateLocalAuthPassword(input.userId, newHash);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.adminResetPassword", resource: "user", resourceId: input.userId });
      return { success: true };
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
      // Check email verification status
      if (!authRecord.isVerified) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Email not verified. Please check your inbox for the verification link, or ask an admin to resend it." });
      }
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
      assertPasswordStrength(input.newPassword);
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
      origin: z.string().url().optional(),
    })).mutation(async ({ ctx, input }) => {
      const authRecord = await db.getLocalAuthByEmail(input.email);
      if (!authRecord) return { success: true }; // Don't reveal if email exists
      const token = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const expiry = Date.now() + 3600000; // 1 hour
      await db.setResetToken(input.email, token, expiry);
      // Determine origin for reset link
      const origin = input.origin || `${ctx.req.protocol}://${ctx.req.get("host")}`;
      // Send password reset email
      const emailSent = await sendPasswordResetEmail(input.email, token, origin);
      if (!emailSent) {
        console.warn(`[Auth] Password reset email could not be sent to ${input.email} — SMTP may not be configured`);
      }
      console.log(`[Auth] Password reset requested for ${input.email} (email sent: ${emailSent})`);
      return { success: true };
    }),
    resetPassword: publicProcedure.input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    })).mutation(async ({ input }) => {
      assertPasswordStrength(input.newPassword);
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
    /** Verify email address using token from verification email */
    verifyEmail: publicProcedure.input(z.object({
      token: z.string().min(1),
    })).mutation(async ({ input }) => {
      const authRecord = await db.getLocalAuthByVerificationToken(input.token);
      if (!authRecord) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired verification token" });
      if (authRecord.verificationTokenExpiry && authRecord.verificationTokenExpiry < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Verification token has expired. Please ask an admin to resend the verification email." });
      }
      await db.markEmailVerified(authRecord.userId);
      return { success: true };
    }),
    /** Resend verification email (admin only) */
    resendVerification: adminProcedure.input(z.object({
      userId: z.number(),
      origin: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const authRecord = await db.getLocalAuthByUserId(input.userId);
      if (!authRecord) throw new TRPCError({ code: "BAD_REQUEST", message: "User does not have email/password login" });
      if (authRecord.isVerified) throw new TRPCError({ code: "BAD_REQUEST", message: "Email is already verified" });
      const verifyToken = `verify_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const verifyExpiry = Date.now() + 86400000; // 24 hours
      await db.setVerificationToken(authRecord.email, verifyToken, verifyExpiry);
      const origin = input.origin || "";
      let emailSent = false;
      if (origin) {
        emailSent = await sendVerificationEmail(authRecord.email, verifyToken, origin);
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "auth.resendVerification", resource: "user", resourceId: input.userId, details: { email: authRecord.email, emailSent } });
      return { success: true, emailSent };
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
      return db.getCallScripts();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const script = await db.getCallScript(input.id);
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
      // Create initial version snapshot
      await db.createScriptVersion({
        scriptId: result.id,
        version: 1,
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
        changeType: "created",
        changeSummary: "Initial script creation",
        name: input.name,
        description: input.description || null,
        callbackNumber: input.callbackNumber || null,
        segments: input.segments as ScriptSegment[],
        status: "active",
      });
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
      // Snapshot current state before update for version history
      const currentScript = await db.getCallScript(id);
      if (currentScript) {
        const latestVersion = await db.getLatestScriptVersionNumber(id);
        // Build change summary
        const changes: string[] = [];
        if (data.name && data.name !== currentScript.name) changes.push(`Name: "${currentScript.name}" → "${data.name}"`);
        if (data.segments) changes.push(`Segments updated (${data.segments.length} segments)`);
        if (data.status && data.status !== currentScript.status) changes.push(`Status: ${currentScript.status} → ${data.status}`);
        if (data.callbackNumber !== undefined && data.callbackNumber !== currentScript.callbackNumber) changes.push(`Callback # changed`);
        if (data.description !== undefined && data.description !== currentScript.description) changes.push(`Description updated`);
        await db.createScriptVersion({
          scriptId: id,
          version: latestVersion + 1,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          changeType: "edited",
          changeSummary: changes.length > 0 ? changes.join("; ") : "Script updated",
          name: data.name || currentScript.name,
          description: data.description !== undefined ? (data.description || null) : (currentScript.description || null),
          callbackNumber: data.callbackNumber !== undefined ? (data.callbackNumber || null) : (currentScript.callbackNumber || null),
          segments: (data.segments || currentScript.segments) as ScriptSegment[],
          status: (data.status || currentScript.status) as "draft" | "active" | "archived",
        });
      }
      await db.updateCallScript(id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCallScript(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.delete", resource: "callScript", resourceId: input.id });
      return { success: true };
    }),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(10000) })).mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        await db.deleteCallScript(id);
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
    // Version history
    versions: protectedProcedure.input(z.object({ scriptId: z.number() })).query(async ({ input }) => {
      return db.getScriptVersions(input.scriptId);
    }),
    getVersion: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const version = await db.getScriptVersion(input.id);
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });
      return version;
    }),
    revertToVersion: protectedProcedure.input(z.object({
      scriptId: z.number(),
      versionId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const version = await db.getScriptVersion(input.versionId);
      if (!version || version.scriptId !== input.scriptId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found for this script" });
      }
      // Apply the version snapshot to the script
      await db.updateCallScript(input.scriptId, {
        name: version.name,
        description: version.description,
        callbackNumber: version.callbackNumber,
        segments: version.segments as ScriptSegment[],
        status: version.status as "draft" | "active" | "archived",
      });
      // Create a new version entry for the revert
      const latestVersion = await db.getLatestScriptVersionNumber(input.scriptId);
      await db.createScriptVersion({
        scriptId: input.scriptId,
        version: latestVersion + 1,
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
        changeType: "reverted",
        changeSummary: `Reverted to version ${version.version}`,
        name: version.name,
        description: version.description,
        callbackNumber: version.callbackNumber,
        segments: version.segments as ScriptSegment[],
        status: version.status as "draft" | "active" | "archived",
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.revert", resource: "callScript", resourceId: input.scriptId, details: { revertedToVersion: version.version } });
      return { success: true };
    }),
    // Performance metrics
    metrics: protectedProcedure.query(async () => {
      return db.getScriptPerformanceMetrics();
    }),
    scriptMetrics: protectedProcedure.input(z.object({ scriptId: z.number() })).query(async ({ input }) => {
      const rows = await db.getScriptPerformanceMetrics(input.scriptId);
      return rows[0] || null;
    }),
    // ─── Export / Import ─────────────────────────────────────────────
    exportAll: protectedProcedure.query(async ({ ctx }) => {
      const scripts = await db.getCallScripts();
      const exportData = scripts.map(s => ({
        name: s.name,
        description: s.description,
        callbackNumber: s.callbackNumber,
        segments: s.segments,
        status: s.status,
        estimatedDuration: s.estimatedDuration,
      }));
      return { version: "1.0", type: "call_scripts", exportedAt: Date.now(), count: exportData.length, data: exportData };
    }),
    importAll: protectedProcedure.input(z.object({
      data: z.array(z.object({
        name: z.string(),
        description: z.string().nullable().optional(),
        callbackNumber: z.string().nullable().optional(),
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
        })),
        status: z.enum(["draft", "active", "archived"]).optional(),
        estimatedDuration: z.number().nullable().optional(),
      })),
      skipDuplicates: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getCallScripts();
      const existingNames = new Set(existing.map(s => s.name.toLowerCase()));
      let imported = 0;
      let skipped = 0;
      for (const item of input.data) {
        if (input.skipDuplicates && existingNames.has(item.name.toLowerCase())) {
          skipped++;
          continue;
        }
        const result = await db.createCallScript({
          userId: ctx.user.id,
          name: item.name,
          description: item.description || null,
          callbackNumber: item.callbackNumber || null,
          segments: item.segments as ScriptSegment[],
          status: item.status || "active",
          estimatedDuration: item.estimatedDuration || null,
        });
        // Create initial version for imported script
        await db.createScriptVersion({
          scriptId: result.id,
          version: 1,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          changeType: "created",
          changeSummary: "Imported from backup",
          name: item.name,
          description: item.description || null,
          callbackNumber: item.callbackNumber || null,
          segments: item.segments as ScriptSegment[],
          status: item.status || "active",
        });
        imported++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.import", resource: "callScript", details: { imported, skipped, total: input.data.length } });
      return { success: true, imported, skipped, total: input.data.length };
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
      const HEARTBEAT_THRESHOLD = 60000; // 60s — generous window
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD;
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
      const HEARTBEAT_THRESHOLD = 60000; // 60s — generous window
      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD;
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
        return db.getAgentMetrics();
      }),

    agentTimeSeries: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        days: z.number().min(1).max(90).default(7),
      }))
      .query(async ({ ctx, input }) => {
        return db.getAgentCallTimeSeries(input.agentId, input.days);
      }),

    agentDailyStats: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        days: z.number().min(1).max(90).default(30),
      }))
      .query(async ({ ctx, input }) => {
        return db.getAgentDailyStats(input.agentId, input.days);
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

    /** Restart PBX agent service on FreePBX server via SSH */
    restartAgent: protectedProcedure
      .input(z.object({ agentId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
        const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
        const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
        if (!host || !sshUser || !sshPassword) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SSH credentials not configured. Go to Settings > FreePBX to configure SSH access." });
        }

        const agent = await db.getPbxAgentByAgentId(input.agentId);
        if (!agent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
        }

        const { Client: SSHClient } = await import("ssh2");
        const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
          const conn = new SSHClient();
          const timeout = setTimeout(() => {
            conn.end();
            resolve({ success: false, output: "", error: "SSH connection timed out after 30 seconds" });
          }, 30000);

          conn.on("ready", () => {
            // Restart the pbx-agent service; also restart voice-ai-bridge if it exists
            const cmd = `systemctl restart pbx-agent 2>&1; echo "PBX_EXIT=$?"; if systemctl is-enabled voice-ai-bridge 2>/dev/null; then systemctl restart voice-ai-bridge 2>&1; echo "BRIDGE_EXIT=$?"; fi; sleep 2; systemctl is-active pbx-agent 2>&1; echo "---"; systemctl is-active voice-ai-bridge 2>&1 || true`;
            conn.exec(cmd, (err, stream) => {
              if (err) {
                clearTimeout(timeout);
                conn.end();
                resolve({ success: false, output: "", error: err.message });
                return;
              }
              let output = "";
              stream.on("data", (data: Buffer) => { output += data.toString(); });
              stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
              stream.on("close", (code: number) => {
                clearTimeout(timeout);
                conn.end();
                const isSuccess = output.includes("PBX_EXIT=0") || output.includes("active");
                resolve({
                  success: isSuccess,
                  output: output.trim(),
                  error: !isSuccess ? `Restart may have failed. Exit code: ${code}` : undefined,
                });
              });
            });
          });

          conn.on("error", (err: Error) => {
            clearTimeout(timeout);
            let errorMsg = err.message;
            if (errorMsg.includes("Authentication")) errorMsg = "SSH authentication failed";
            else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "SSH connection refused";
            else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "SSH connection timed out";
            resolve({ success: false, output: "", error: errorMsg });
          });

          conn.connect({
            host,
            port: 22,
            username: sshUser,
            password: sshPassword,
            readyTimeout: 15000,
          });
        });

        // Audit log
        await db.createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          action: "freepbx.restartAgent",
          resource: "pbx-agent",
          details: { success: result.success, agentId: input.agentId, agentName: agent.name, host, error: result.error },
        });

        return result;
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
      await db.upsertAppSetting(input.key, input.value, input.description, input.isSecret);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "settings.update", resource: "appSettings", details: { key: input.key, isSecret: input.isSecret ? true : false } });
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
        await db.upsertAppSetting(setting.key, setting.value, setting.description, setting.isSecret);
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "settings.bulkUpdate", resource: "appSettings", details: { keys: input.map(s => s.key), count: input.length } });
      return { success: true, count: input.length };
    }),

    /** Delete a setting (admin only) */
    delete: adminProcedure.input(z.object({ key: z.string() })).mutation(async ({ ctx, input }) => {
      await db.deleteAppSetting(input.key);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "settings.delete", resource: "appSettings", details: { key: input.key } });
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

    /** Test SMTP connection (admin only) */
    testSmtp: adminProcedure.mutation(async () => {
      const result = await testSmtpConnection();
      return result;
    }),

    /** Get SMTP configuration status */
    smtpStatus: protectedProcedure.query(async () => {
      const config = await getSmtpConfig();
      return {
        configured: !!config,
        host: config?.host || null,
        port: config?.port || null,
        fromEmail: config?.fromEmail || null,
        fromName: config?.fromName || null,
      };
    }),

    /** Get branding settings (public - needed for all users to see the brand) */
    getBranding: publicProcedure.query(async () => {
      const [appName, logoUrl, primaryColor, accentColor, tagline] = await Promise.all([
        db.getAppSetting("branding_app_name"),
        db.getAppSetting("branding_logo_url"),
        db.getAppSetting("branding_primary_color"),
        db.getAppSetting("branding_accent_color"),
        db.getAppSetting("branding_tagline"),
      ]);
      return {
        appName: appName || "AI TTS Broadcast Dialer",
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || "#16a34a",
        accentColor: accentColor || "#f97316",
        tagline: tagline || "Intelligent Voice Broadcasting Platform",
      };
    }),

    /** Upload logo image (admin only) - accepts base64 */
    uploadLogo: adminProcedure.input(z.object({
      base64: z.string().min(1),
      mimeType: z.enum(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]),
      fileName: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const { storagePut } = await import("./storage");
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length > 2 * 1024 * 1024) throw new Error("Logo must be under 2MB");
      const ext = input.mimeType.split("/")[1] === "svg+xml" ? "svg" : input.mimeType.split("/")[1];
      const fileKey = `branding/logo-${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.upsertAppSetting("branding_logo_url", url, "Client logo URL");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "branding.uploadLogo", resource: "appSettings", details: { url, size: buffer.length } });
      return { url };
    }),

    /** Reconnect AMI with fresh settings from DB (admin only) */
    freepbxReconnect: adminProcedure.mutation(async ({ ctx }) => {
      const { reconnectAMI } = await import("./services/ami");
      const result = await reconnectAMI();
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "freepbx.reconnect", resource: "freepbx", details: { success: result.success, host: result.host, error: result.error } });
      return result;
    }),

    /** Test FreePBX AMI connection with provided credentials (admin only) */
    freepbxTestConnection: adminProcedure.input(z.object({
      host: z.string().min(1),
      port: z.coerce.number().int().min(1).max(65535).default(5038),
      username: z.string().min(1),
      password: z.string().min(1),
    })).mutation(async ({ input }) => {
      const { testAMIConnection } = await import("./services/ami");
      const result = await testAMIConnection({
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
      });
      return result;
    }),

    /** Test FreePBX SSH connection with provided credentials (admin only) */
    freepbxTestSsh: adminProcedure.input(z.object({
      host: z.string().min(1),
      port: z.coerce.number().int().min(1).max(65535).default(22),
      username: z.string().min(1),
      password: z.string().min(1),
    })).mutation(async ({ input }) => {
      const { Client: SSHClient } = await import("ssh2");
      return new Promise<{ success: boolean; error?: string; latencyMs?: number }>((resolve) => {
        const conn = new SSHClient();
        const start = Date.now();
        const timeout = setTimeout(() => {
          conn.end();
          resolve({ success: false, error: "Connection timeout (10s)" });
        }, 10000);

        conn.on("ready", () => {
          const latencyMs = Date.now() - start;
          // Run a quick command to verify shell access
          conn.exec("echo ok", (err, stream) => {
            clearTimeout(timeout);
            if (err) {
              conn.end();
              resolve({ success: true, latencyMs }); // Connected but exec failed - still a success
              return;
            }
            let output = "";
            stream.on("data", (data: Buffer) => { output += data.toString(); });
            stream.on("close", () => {
              conn.end();
              resolve({ success: true, latencyMs });
            });
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          let errorMsg = err.message;
          if (errorMsg.includes("Authentication")) errorMsg = "Authentication failed — check username/password";
          else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "Connection refused — SSH not running on this port";
          else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "Connection timed out — check host/port";
          resolve({ success: false, error: errorMsg });
        });

        conn.connect({
          host: input.host,
          port: input.port,
          username: input.username,
          password: input.password,
          readyTimeout: 10000,
        });
      });
    }),

    /** Save FreePBX settings and auto-reconnect AMI (admin only) */
    freepbxSaveAndReconnect: adminProcedure.input(z.array(z.object({
      key: z.string().min(1).max(100),
      value: z.string().nullable(),
      description: z.string().optional(),
      isSecret: z.number().optional(),
    }))).mutation(async ({ ctx, input }) => {
      // Save all settings
      for (const setting of input) {
        await db.upsertAppSetting(setting.key, setting.value, setting.description, setting.isSecret);
      }
      // Auto-reconnect AMI with fresh settings
      let reconnectResult: { success: boolean; host: string; port: number; error?: string } = { success: false, host: "", port: 0, error: "" };
      try {
        const { reconnectAMI } = await import("./services/ami");
        reconnectResult = await reconnectAMI();
      } catch (err: any) {
        reconnectResult = { success: false, host: "", port: 0, error: err.message };
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "freepbx.saveSettings", resource: "freepbx", details: { keys: input.map(s => s.key), count: input.length, reconnectSuccess: reconnectResult.success } });
      return {
        saved: true,
        count: input.length,
        reconnect: reconnectResult,
      };
    }),

    /** Get notification preferences */
    getNotificationPrefs: protectedProcedure.query(async () => {
      const prefs = await db.getNotificationPreferences();
      return { preferences: prefs, types: db.NOTIFICATION_TYPES };
    }),

    /** Update a notification preference (admin only) */
    setNotificationPref: adminProcedure.input(z.object({
      key: z.string().min(1),
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      await db.setNotificationPreference(input.key, input.enabled);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "notifications.update", resource: "notificationPref", details: { key: input.key, enabled: input.enabled } });
      return { success: true };
    }),

    /** Bulk update notification preferences (admin only) */
    bulkSetNotificationPrefs: adminProcedure.input(z.array(z.object({
      key: z.string().min(1),
      enabled: z.boolean(),
    }))).mutation(async ({ ctx, input }) => {
      for (const pref of input) {
        await db.setNotificationPreference(pref.key, pref.enabled);
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "notifications.bulkUpdate", resource: "notificationPref", details: { keys: input.map(p => p.key), count: input.length } });
      return { success: true, count: input.length };
    }),

    /** Restart FreePBX via SSH (admin only) */
    freepbxRestart: adminProcedure.mutation(async ({ ctx }) => {
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;

      if (!host || !sshUser || !sshPassword) {
        return { success: false, error: "SSH credentials not configured" };
      }

      const { Client: SSHClient } = await import("ssh2");
      return new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => {
          conn.end();
          resolve({ success: false, error: "Connection timeout (30s)" });
        }, 30000);

        conn.on("ready", () => {
          // Run fwconsole restart to restart FreePBX services
          conn.exec("fwconsole restart 2>&1", (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              conn.end();
              resolve({ success: false, error: err.message });
              return;
            }
            let output = "";
            stream.on("data", (data: Buffer) => { output += data.toString(); });
            stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
            stream.on("close", (code: number) => {
              clearTimeout(timeout);
              conn.end();
              resolve({
                success: code === 0 || code === null,
                output: output.trim().slice(0, 2000),
                error: code !== 0 && code !== null ? `Exit code: ${code}` : undefined,
              });
            });
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          let errorMsg = err.message;
          if (errorMsg.includes("Authentication")) errorMsg = "Authentication failed — check SSH credentials";
          else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "Connection refused — SSH not running";
          else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "Connection timed out — check host";
          resolve({ success: false, error: errorMsg });
        });

        conn.connect({
          host,
          port: 22,
          username: sshUser,
          password: sshPassword,
          readyTimeout: 15000,
        });
      }).then(async (result) => {
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "freepbx.restart", resource: "freepbx", details: { success: result.success, error: result.error } });
        return result;
      });
    }),

    /** Get notification channel configuration */
    getNotificationChannels: protectedProcedure.query(async () => {
      return getNotificationChannelConfig();
    }),

    /** Update notification channel settings (admin only) */
    updateNotificationChannel: adminProcedure.input(z.object({
      settings: z.array(z.object({
        key: z.string().min(1),
        value: z.string().nullable(),
        isSecret: z.number().default(0),
      })),
    })).mutation(async ({ ctx, input }) => {
      for (const setting of input.settings) {
        await db.upsertAppSetting(setting.key, setting.value, `Notification channel: ${setting.key}`, setting.isSecret, ctx.user.id);
      }
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "notificationChannels.update",
        resource: "notificationChannel",
        details: { keys: input.settings.map(s => s.key) },
      });
      return { success: true };
    }),

    /** Test email notification channel (admin only) */
    testEmailChannel: adminProcedure.input(z.object({
      testRecipient: z.string().email().optional(),
    }).optional()).mutation(async ({ input }) => {
      return testEmailChannel(input?.testRecipient);
    }),

    /** Test SMS notification channel (admin only) */
    testSmsChannel: adminProcedure.input(z.object({
      testRecipient: z.string().optional(),
    }).optional()).mutation(async ({ input }) => {
      return testSmsChannel(input?.testRecipient);
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

  liveAgents: liveAgentRouter,
  recordings: recordingsRouter,
  wallboard: wallboardRouter,
  voiceAi: voiceAiRouter,
  supervisor: supervisorRouter,
  agentAssist: agentAssistRouter,

  // ─── Agent Dashboard (for agent role users) ────────────────────────────
  agentDashboard: router({
    /** Get the linked agent for the current user */
    myAgent: protectedProcedure.query(async ({ ctx }) => {
      const agent = await db.getLinkedAgentForUser(ctx.user.id);
      return agent || null;
    }),

    /** Get today's stats for the linked agent */
    todayStats: protectedProcedure.query(async ({ ctx }) => {
      const agent = await db.getLinkedAgentForUser(ctx.user.id);
      if (!agent) return null;
      return db.getAgentTodayStats(agent.id);
    }),

    /** Get performance stats for the linked agent */
    performance: protectedProcedure.query(async ({ ctx }) => {
      const agent = await db.getLinkedAgentForUser(ctx.user.id);
      if (!agent) return null;
      return db.getAgentPerformanceStats(agent.id);
    }),

    /** Get call history for the linked agent */
    callHistory: protectedProcedure.input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional()).query(async ({ ctx, input }) => {
      const agent = await db.getLinkedAgentForUser(ctx.user.id);
      if (!agent) return [];
      return db.getAgentCallHistory(agent.id, input?.limit ?? 50);
    }),

    /** Get all live agents for admin linking */
    availableAgents: protectedProcedure.query(async () => {
      return db.getAllLiveAgentsForLinking();
    }),

    /** Admin: link a user to an agent */
    linkAgent: adminProcedure.input(z.object({
      userId: z.number(),
      agentId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      await db.linkUserToAgent(input.userId, input.agentId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.linkAgent", resource: "user", resourceId: input.userId, details: { agentId: input.agentId } });
      return { success: true };
    }),

    /** Admin: unlink a user from an agent */
    unlinkAgent: adminProcedure.input(z.object({
      userId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      await db.unlinkUserFromAgent(input.userId);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "user.unlinkAgent", resource: "user", resourceId: input.userId });
      return { success: true };
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
      const pbxOnline = agents.some((a: any) => a.lastHeartbeat && Date.now() - new Date(a.lastHeartbeat).getTime() < 60000);

      // Step 3: Caller IDs imported (at least one caller ID)
      const callerIds = await db.getCallerIds();
      const hasCallerIds = callerIds.length > 0;

      // Step 4: Contacts imported (at least one contact list with contacts)
      const contactLists = await db.getContactLists();
      const hasContacts = contactLists.some((l: any) => (l.contactCount ?? 0) > 0);

      // Step 5: API Keys configured (at least OpenAI or Google TTS)
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogleTTS = !!process.env.GOOGLE_TTS_API_KEY;
      const hasApiKeys = hasOpenAI || hasGoogleTTS;
      const apiKeyDetail = hasApiKeys
        ? [hasOpenAI && "OpenAI", hasGoogleTTS && "Google TTS"].filter(Boolean).join(" + ")
        : undefined;

      // Step 6: Voice AI Bridge installed
      const bridgeChecks = await db.getBridgeHealthChecks(1);
      const hasBridge = bridgeChecks.length > 0 && bridgeChecks[0].status === "healthy";

      // Step 7: Campaign created
      const campaigns = await db.getCampaigns();
      const hasCampaigns = campaigns.length > 0;

      // Step 8: System health — all critical services up
      const systemHealthy = pbxOnline && hasCallerIds && hasApiKeys;

      const steps = [
        { id: "account", label: "Create Account", completed: accountCreated },
        { id: "pbx", label: "Connect FreePBX", completed: pbxConnected, detail: pbxOnline ? "Online" : pbxConnected ? "Registered (offline)" : undefined },
        { id: "callerIds", label: "Add Caller IDs", completed: hasCallerIds, detail: hasCallerIds ? `${callerIds.length} DID(s)` : undefined },
        { id: "contacts", label: "Import Contacts", completed: hasContacts, detail: hasContacts ? `${contactLists.length} list(s)` : undefined },
        { id: "apiKeys", label: "Configure API Keys", completed: hasApiKeys, detail: apiKeyDetail },
        { id: "voiceAiBridge", label: "Install Voice AI Bridge", completed: hasBridge, detail: hasBridge ? "Connected" : undefined },
        { id: "campaign", label: "Create Campaign", completed: hasCampaigns, detail: hasCampaigns ? `${campaigns.length} campaign(s)` : undefined },
        { id: "systemHealth", label: "System Health Check", completed: systemHealthy, detail: systemHealthy ? "All systems go" : undefined },
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

  // ─── Bridge Health Checks ──────────────────────────────────────────────
  bridgeHealth: router({
    history: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(500).default(100),
    }).optional()).query(async ({ input }) => {
      return db.getBridgeHealthChecks(input?.limit ?? 100);
    }),
    stats: protectedProcedure.query(async () => {
      return db.getBridgeHealthStats();
    }),
    runCheck: adminProcedure.mutation(async () => {
      // Trigger a manual health check
      const { Client: SSHClient } = await import("ssh2");
      const host = process.env.FREEPBX_HOST;
      const sshUser = process.env.FREEPBX_SSH_USER;
      const sshPass = process.env.FREEPBX_SSH_PASSWORD;
      if (!host || !sshUser || !sshPass) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SSH credentials not configured" });
      }
      const startTime = Date.now();
      try {
        const result = await new Promise<{ agentRunning: boolean; bridgeRunning: boolean; output: string }>((resolve, reject) => {
          const conn = new SSHClient();
          let output = "";
          conn.on("ready", () => {
            conn.exec(`systemctl is-active pbx-agent 2>/dev/null; echo "---"; systemctl is-active voice-ai-bridge 2>/dev/null`, (err, stream) => {
              if (err) { conn.end(); reject(err); return; }
              stream.on("data", (data: Buffer) => { output += data.toString(); });
              stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
              stream.on("close", () => {
                conn.end();
                const parts = output.trim().split("---").map(s => s.trim());
                resolve({ agentRunning: parts[0] === "active", bridgeRunning: (parts[1] || "") === "active", output: output.trim() });
              });
            });
          });
          conn.on("error", reject);
          conn.connect({ host, port: 22, username: sshUser, password: sshPass, readyTimeout: 10000 });
          setTimeout(() => { conn.end(); reject(new Error("SSH timeout")); }, 15000);
        });
        const responseTime = Date.now() - startTime;
        const status = result.agentRunning && result.bridgeRunning ? "healthy" : "offline";
        await db.createBridgeHealthCheck({ checkType: "manual", status, responseTimeMs: responseTime, agentId: host, details: JSON.stringify(result), checkedAt: Date.now() });
        return { status, responseTimeMs: responseTime, agentRunning: result.agentRunning, bridgeRunning: result.bridgeRunning };
      } catch (err: any) {
        const responseTime = Date.now() - startTime;
        await db.createBridgeHealthCheck({ checkType: "manual", status: "error", responseTimeMs: responseTime, agentId: host, errorMessage: err.message, checkedAt: Date.now() });
        return { status: "error" as const, responseTimeMs: responseTime, error: err.message };
      }
    }),
  }),

  // ─── Global Search ──────────────────────────────────────────────────────
  globalSearch: router({
    search: protectedProcedure.input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().min(1).max(50).default(20),
    })).query(async ({ input }) => {
      const q = `%${input.query}%`;
      const dbInst = await db.getDb();
      if (!dbInst) return { results: [] };
      const { campaigns, contactLists, callScripts, callerIds, voiceAiPrompts } = await import("../drizzle/schema");
      const { like, or } = await import("drizzle-orm");

      const [campaignResults, listResults, scriptResults, callerIdResults, promptResults] = await Promise.all([
        dbInst.select({ id: campaigns.id, name: campaigns.name, type: campaigns.status }).from(campaigns).where(or(like(campaigns.name, q), like(campaigns.description, q))).limit(input.limit),
        dbInst.select({ id: contactLists.id, name: contactLists.name }).from(contactLists).where(like(contactLists.name, q)).limit(input.limit),
        dbInst.select({ id: callScripts.id, name: callScripts.name }).from(callScripts).where(or(like(callScripts.name, q), like(callScripts.description, q))).limit(input.limit),
        dbInst.select({ id: callerIds.id, name: callerIds.phoneNumber }).from(callerIds).where(or(like(callerIds.phoneNumber, q), like(callerIds.label, q))).limit(input.limit),
        dbInst.select({ id: voiceAiPrompts.id, name: voiceAiPrompts.name }).from(voiceAiPrompts).where(or(like(voiceAiPrompts.name, q), like(voiceAiPrompts.description, q))).limit(input.limit),
      ]);

      const results = [
        ...campaignResults.map(r => ({ id: r.id, name: r.name, category: "campaign" as const, detail: r.type, url: `/campaigns/${r.id}` })),
        ...listResults.map(r => ({ id: r.id, name: r.name, category: "contactList" as const, url: `/contact-lists/${r.id}` })),
        ...scriptResults.map(r => ({ id: r.id, name: r.name, category: "script" as const, url: `/scripts` })),
        ...callerIdResults.map(r => ({ id: r.id, name: r.name, category: "callerId" as const, url: `/caller-ids` })),
        ...promptResults.map(r => ({ id: r.id, name: r.name, category: "voiceAiPrompt" as const, url: `/voice-ai` })),
      ];

      return { results: results.slice(0, input.limit) };
    }),
  }),

  // ─── PBX Agent Auto-Update ────────────────────────────────────────────
  agentAutoUpdate: router({
    checkVersion: protectedProcedure.query(async () => {
      const dbInst = await db.getDb();
      if (!dbInst) return { currentVersion: null, latestVersion: "2.1.0", needsUpdate: false };
      const { pbxAgents } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const agents = await dbInst.select().from(pbxAgents).orderBy(desc(pbxAgents.lastHeartbeat)).limit(1);
      const agent = agents[0];
      const currentVersion = agent?.capabilities ? (JSON.parse(agent.capabilities as unknown as string)?.agentVersion || null) : null;
      const latestVersion = "2.1.0";
      return {
        currentVersion,
        latestVersion,
        needsUpdate: currentVersion !== null && currentVersion !== latestVersion,
        agentName: agent?.name || null,
        agentId: agent?.id || null,
      };
    }),
    update: adminProcedure.mutation(async ({ ctx }) => {
      const { Client: SSHClient } = await import("ssh2");
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPass = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      if (!host || !sshUser || !sshPass) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SSH credentials not configured" });
      }
      return new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => { conn.end(); resolve({ success: false, error: "SSH timeout (60s)" }); }, 60000);
        conn.on("ready", () => {
          // Stop the agent, pull latest code, restart
          const cmd = `cd /opt/pbx-agent && systemctl stop pbx-agent 2>/dev/null; curl -sL "https://${host}:443/api/pbx/installer" -o /tmp/pbx-update.sh 2>/dev/null; bash /tmp/pbx-update.sh 2>&1 || (systemctl restart pbx-agent 2>&1); echo "UPDATE_DONE"`;
          conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timeout); conn.end(); resolve({ success: false, error: err.message }); return; }
            let output = "";
            stream.on("data", (data: Buffer) => { output += data.toString(); });
            stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
            stream.on("close", (code: number) => {
              clearTimeout(timeout);
              conn.end();
              resolve({ success: code === 0 || code === null || output.includes("UPDATE_DONE"), output: output.trim().slice(0, 3000) });
            });
          });
        });
        conn.on("error", (err: Error) => { clearTimeout(timeout); resolve({ success: false, error: err.message }); });
        conn.connect({ host, port: 22, username: sshUser, password: sshPass, readyTimeout: 15000 });
      }).then(async (result) => {
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "agent.autoUpdate", resource: "pbx-agent", details: { success: result.success } });
        return result;
      });
    }),
  }),


  // ─── Rate Limit Alerts ───────────────────────────────────────────────
  rateLimits: router({
    status: protectedProcedure.query(async () => {
      const dbInst = await db.getDb();
      if (!dbInst) return { activeCalls: 0, maxConcurrent: 50, cpsLimit: 5, callsLastMinute: 0, callsLastHour: 0, trunkCapacity: 100, utilizationPct: 0, alerts: [] };
      const { callQueue, pbxAgents } = await import("../drizzle/schema");
      const { eq, count, gte, and } = await import("drizzle-orm");
      const now = Date.now();
      const oneMinAgo = now - 60000;
      const oneHourAgo = now - 3600000;

      const [activeResult, agents, minuteResult, hourResult] = await Promise.all([
        dbInst.select({ count: count() }).from(callQueue).where(eq(callQueue.status, "in_progress")),
        dbInst.select().from(pbxAgents),
        dbInst.select({ count: count() }).from(callQueue).where(and(gte(callQueue.createdAt, new Date(oneMinAgo)))),
        dbInst.select({ count: count() }).from(callQueue).where(and(gte(callQueue.createdAt, new Date(oneHourAgo)))),
      ]);

      const activeCalls = activeResult[0]?.count ?? 0;
      const totalMaxConcurrent = agents.reduce((sum, a) => sum + (a.maxCalls || 5), 0);
      const totalCps = agents.reduce((sum, a) => sum + ((a as any).cpsLimit || 5), 0);
      const trunkCapacity = Math.max(totalMaxConcurrent, 100);
      const callsLastMinute = minuteResult[0]?.count ?? 0;
      const callsLastHour = hourResult[0]?.count ?? 0;
      const utilizationPct = trunkCapacity > 0 ? Math.round((activeCalls / trunkCapacity) * 100) : 0;

      const alerts: { level: "warning" | "critical"; message: string }[] = [];
      if (utilizationPct >= 90) alerts.push({ level: "critical", message: `Trunk utilization at ${utilizationPct}% (${activeCalls}/${trunkCapacity})` });
      else if (utilizationPct >= 70) alerts.push({ level: "warning", message: `Trunk utilization at ${utilizationPct}% (${activeCalls}/${trunkCapacity})` });
      if (callsLastMinute > totalCps * 50) alerts.push({ level: "warning", message: `High call volume: ${callsLastMinute} calls in last minute` });

      return { activeCalls, maxConcurrent: totalMaxConcurrent, cpsLimit: totalCps, callsLastMinute, callsLastHour, trunkCapacity, utilizationPct, alerts };
    }),
  }),

  // ─── Client Deployments (Admin Dashboard) ──────────────────────────────
  deployments: router({
    /** List all client deployments (admin only) */
    list: adminProcedure.query(async () => {
      return db.listClientDeployments();
    }),

    /** Get a single deployment by ID */
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const deployment = await db.getClientDeployment(input.id);
      if (!deployment) throw new TRPCError({ code: "NOT_FOUND", message: "Deployment not found" });
      return deployment;
    }),

    /** Create a new client deployment record */
    create: adminProcedure.input(z.object({
      clientName: z.string().min(1).max(255),
      serverIp: z.string().min(1).max(45),
      domain: z.string().max(255).optional(),
      version: z.string().max(50).optional(),
      environment: z.enum(["production", "staging", "development"]).default("production"),
      pbxHost: z.string().max(255).optional(),
      notes: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().max(20).optional(),
    })).mutation(async ({ ctx, input }) => {
      const id = await db.createClientDeployment({
        ...input,
        domain: input.domain || null,
        version: input.version || null,
        pbxHost: input.pbxHost || null,
        notes: input.notes || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        status: "provisioning",
        installedAt: Date.now(),
      });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "deployment.create", resource: "clientDeployment", resourceId: id, details: { clientName: input.clientName, serverIp: input.serverIp } });
      return { id };
    }),

    /** Update an existing deployment */
    update: adminProcedure.input(z.object({
      id: z.number(),
      clientName: z.string().min(1).max(255).optional(),
      serverIp: z.string().min(1).max(45).optional(),
      domain: z.string().max(255).nullable().optional(),
      version: z.string().max(50).nullable().optional(),
      environment: z.enum(["production", "staging", "development"]).optional(),
      status: z.enum(["online", "offline", "degraded", "maintenance", "provisioning"]).optional(),
      pbxHost: z.string().max(255).nullable().optional(),
      pbxAgentVersion: z.string().max(50).nullable().optional(),
      bridgeStatus: z.enum(["connected", "disconnected", "unknown"]).optional(),
      sslExpiry: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      contactEmail: z.string().email().nullable().optional(),
      contactPhone: z.string().max(20).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateClientDeployment(id, data);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "deployment.update", resource: "clientDeployment", resourceId: id, details: data });
      return { success: true };
    }),

    /** Delete a deployment record */
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteClientDeployment(input.id);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "deployment.delete", resource: "clientDeployment", resourceId: input.id });
      return { success: true };
    }),

    /** Heartbeat endpoint for client installations to report status (public with API key auth) */
    heartbeat: publicProcedure.input(z.object({
      deploymentId: z.number(),
      apiKey: z.string().min(1),
      version: z.string().optional(),
      status: z.enum(["online", "offline", "degraded", "maintenance"]).optional(),
      diskUsagePercent: z.number().min(0).max(100).optional(),
      memoryUsageMb: z.number().min(0).optional(),
      cpuUsagePercent: z.number().min(0).max(100).optional(),
      pbxAgentVersion: z.string().optional(),
      bridgeStatus: z.enum(["connected", "disconnected", "unknown"]).optional(),
    })).mutation(async ({ input }) => {
      // Simple API key check — use the deployment heartbeat key from app settings
      const expectedKey = await db.getAppSetting("deployment_heartbeat_api_key");
      if (!expectedKey || input.apiKey !== expectedKey) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid API key" });
      }
      const { deploymentId, apiKey, ...data } = input;
      await db.updateDeploymentHeartbeat(deploymentId, data);
      return { success: true };
    }),

    /** Get deployment summary stats */
    stats: adminProcedure.query(async () => {
      const deployments = await db.listClientDeployments();
      const now = Date.now();
      const fiveMinAgo = now - 5 * 60 * 1000;
      const online = deployments.filter(d => d.status === "online" && d.lastHeartbeat && d.lastHeartbeat > fiveMinAgo).length;
      const degraded = deployments.filter(d => d.status === "degraded").length;
      const offline = deployments.filter(d => d.status === "offline" || (d.lastHeartbeat && d.lastHeartbeat < fiveMinAgo && d.status === "online")).length;
      const maintenance = deployments.filter(d => d.status === "maintenance").length;
      const provisioning = deployments.filter(d => d.status === "provisioning").length;
      return { total: deployments.length, online, degraded, offline, maintenance, provisioning };
    }),
  }),
});

export type AppRouter = typeof appRouter;
