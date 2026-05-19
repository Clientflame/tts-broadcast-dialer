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
import { getAllPrefetchStats } from "./services/audio-prefetch";
import { invokeLLM } from "./_core/llm";
import { generateScriptPreview } from "./services/script-audio";
import type { ScriptSegment } from "../drizzle/schema";
import { callLogs, campaigns, contacts, callQueue, contactScores, apiRequestLogs } from "../drizzle/schema";
import { eq, and, sql, count, gte, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { sendPasswordResetEmail, sendVerificationEmail, testSmtpConnection, getSmtpConfig } from "./services/email";
import { validatePassword } from "../shared/passwordValidation";
import { liveAgentRouter } from "./routers/live-agents";
import { getNotificationChannelConfig, testEmailChannel, testSmsChannel, CHANNEL_SETTINGS_KEYS } from "./services/notification-dispatcher";
import { recordingsRouter, wallboardRouter } from "./routers/recordings";
import { voiceAiRouter, supervisorRouter } from "./routers/voice-ai";
import { agentAssistRouter } from "./routers/agent-assist";
import { inboundFilterRouter } from "./routers/inbound-filter";
import { updaterRouter } from "./routers/updater";
import { voicemailCreatorRouter } from "./routers/voicemail-creator";
import { debtCollectionRouter } from "./routers/debt-collection";
import { fetchFreePBXDestinations, createInboundRoutes, deleteInboundRoutes, listInboundRoutes, checkExistingRoutes, checkExistingRoutesDetailed, updateInboundRoute, bulkUpdateInboundRoutes } from "./services/freepbx-routes";

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
    prefetchStats: protectedProcedure.query(async () => {
      return getAllPrefetchStats();
    }),
    callActivity: protectedProcedure.input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional()).query(async ({ ctx, input }) => {
      return db.getRecentCallActivity(input?.limit ?? 50);
    }),
    areaCodeDistribution: protectedProcedure.input(z.object({ campaignId: z.number().optional(), hours: z.number().min(1).max(168).default(24) }).optional()).query(async ({ ctx, input }) => {
      return db.getAreaCodeDistribution(input?.campaignId, input?.hours ?? 24);
    }),

    /** Server info — returns server IP and hostname for display on dashboard */
    serverInfo: protectedProcedure.query(async () => {
      let serverIp = "Unknown";
      try {
        // Try to get public IP from an external service
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const data = await resp.json() as { ip: string };
          serverIp = data.ip;
        }
      } catch {
        // Fallback: try to get from network interfaces
        try {
          const os = await import("os");
          const interfaces = os.networkInterfaces();
          for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
              if (iface.family === "IPv4" && !iface.internal) {
                serverIp = iface.address;
                break;
              }
            }
            if (serverIp !== "Unknown") break;
          }
        } catch {}
      }
      const os = await import("os");
      const uptimeSecs = Math.floor(os.uptime());
      const startedAt = Date.now() - uptimeSecs * 1000;
      return {
        ip: serverIp,
        hostname: os.hostname(),
        uptimeSeconds: uptimeSecs,
        startedAt,
      };
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

      // 3. TTS API key status (only from database Settings, never env vars)
      const openaiKey = await db.getAppSetting("openai_api_key");
      const googleKey = await db.getAppSetting("google_tts_api_key");

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
    // ─── Update / Edit Audio File ─────────────────────────────────────
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      text: z.string().min(1).max(5000).optional(),
      voice: voiceEnum.optional(),
      speed: z.number().min(0.25).max(4.0).optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      tag: z.string().max(100).nullable().optional(),
      regenerate: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getAudioFile(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Audio file not found" });
      // Build update payload (only changed fields)
      const updates: Record<string, any> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.text !== undefined) updates.text = input.text;
      if (input.voice !== undefined) updates.voice = input.voice;
      if (input.tag !== undefined) updates.tag = input.tag;
      // Apply metadata updates first
      if (Object.keys(updates).length > 0) {
        await db.updateAudioFile(input.id, updates);
      }
      // If regenerate requested, re-trigger TTS generation
      if (input.regenerate) {
        const finalText = input.text ?? existing.text;
        const finalVoice = input.voice ?? existing.voice;
        const finalSpeed = input.speed ?? 1.0;
        const provider = input.ttsProvider ?? (GOOGLE_VOICES.includes(finalVoice as any) ? "google" : "openai");
        await db.updateAudioFile(input.id, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
        const generateFn = provider === "google"
          ? generateGoogleTTS({ text: finalText, voice: finalVoice as GoogleTTSVoice, name: input.name ?? existing.name, speed: finalSpeed })
          : generateTTS({ text: finalText, voice: finalVoice as any, name: input.name ?? existing.name, speed: finalSpeed });
        generateFn
          .then(async (result) => {
            await db.updateAudioFile(input.id, { s3Url: result.s3Url, s3Key: result.s3Key, fileSize: result.fileSize, status: "ready" });
          })
          .catch(async (err) => {
            console.error("[TTS] Regeneration failed:", err);
            await db.updateAudioFile(input.id, { status: "failed" });
          });
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.update", resource: "audioFile", resourceId: input.id, details: { ...updates, regenerate: !!input.regenerate } });
      return { success: true };
    }),
    // ─── Cancel Generating (set stuck files to failed) ───────────────
    cancelGenerating: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getAudioFile(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Audio file not found" });
      if (existing.status !== "generating") throw new TRPCError({ code: "BAD_REQUEST", message: "File is not in generating state" });
      await db.updateAudioFile(input.id, { status: "failed" });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.cancelGenerating", resource: "audioFile", resourceId: input.id });
      return { success: true };
    }),
    // ─── Regenerate (re-trigger TTS for failed/ready files) ──────────
    regenerate: protectedProcedure.input(z.object({
      id: z.number(),
      speed: z.number().min(0.25).max(4.0).optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getAudioFile(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Audio file not found" });
      const provider = input.ttsProvider ?? (GOOGLE_VOICES.includes(existing.voice as any) ? "google" : "openai");
      const speed = input.speed ?? 1.0;
      await db.updateAudioFile(input.id, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
      const generateFn = provider === "google"
        ? generateGoogleTTS({ text: existing.text, voice: existing.voice as GoogleTTSVoice, name: existing.name, speed })
        : generateTTS({ text: existing.text, voice: existing.voice as any, name: existing.name, speed });
      generateFn
        .then(async (result) => {
          await db.updateAudioFile(input.id, { s3Url: result.s3Url, s3Key: result.s3Key, fileSize: result.fileSize, status: "ready" });
        })
        .catch(async (err) => {
          console.error("[TTS] Regeneration failed:", err);
          await db.updateAudioFile(input.id, { status: "failed" });
        });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.regenerate", resource: "audioFile", resourceId: input.id, details: { voice: existing.voice, provider, speed } });
      return { success: true };
    }),
    // ─── Set Tag (quick tag assignment without opening edit dialog) ────
    setTag: protectedProcedure.input(z.object({
      id: z.number(),
      tag: z.string().max(100).nullable(),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getAudioFile(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Audio file not found" });
      await db.updateAudioFile(input.id, { tag: input.tag });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.setTag", resource: "audioFile", resourceId: input.id, details: { tag: input.tag } });
      return { success: true };
    }),
    // ─── Get unique tags for filter dropdown ──────────────────────────────
    tags: protectedProcedure.query(async ({ ctx }) => {
      const files = await db.getAudioFiles();
      const tags = Array.from(new Set(files.map(f => f.tag).filter(Boolean))) as string[];
      return tags.sort();
    }),
    // ─── Bulk Set Tag ─────────────────────────────────────────────
    bulkSetTag: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      tag: z.string().max(100).nullable(),
    })).mutation(async ({ ctx, input }) => {
      let updated = 0;
      for (const id of input.ids) {
        await db.updateAudioFile(id, { tag: input.tag });
        updated++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.bulkSetTag", resource: "audioFile", details: { ids: input.ids, tag: input.tag, updated } });
      return { success: true, updated };
    }),
    // ─── Bulk Regenerate (re-trigger TTS for multiple files) ──────────
    bulkRegenerate: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      speed: z.number().min(0.25).max(4.0).optional(),
    })).mutation(async ({ ctx, input }) => {
      let queued = 0;
      let skipped = 0;
      for (const id of input.ids) {
        const existing = await db.getAudioFile(id);
        if (!existing) { skipped++; continue; }
        const provider = GOOGLE_VOICES.includes(existing.voice as any) ? "google" : "openai";
        const speed = input.speed ?? 1.0;
        await db.updateAudioFile(id, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
        const generateFn = provider === "google"
          ? generateGoogleTTS({ text: existing.text, voice: existing.voice as GoogleTTSVoice, name: existing.name, speed })
          : generateTTS({ text: existing.text, voice: existing.voice as any, name: existing.name, speed });
        generateFn
          .then(async (result) => {
            await db.updateAudioFile(id, { s3Url: result.s3Url, s3Key: result.s3Key, fileSize: result.fileSize, status: "ready" });
          })
          .catch(async (err) => {
            console.error(`[TTS] Bulk regeneration failed for id ${id}:`, err);
            await db.updateAudioFile(id, { status: "failed" });
          });
        queued++;
      }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "audio.bulkRegenerate", resource: "audioFile", details: { ids: input.ids, queued, skipped } });
      return { success: true, queued, skipped };
    }),
    // ─── Voice Memo Upload (record from microphone) ──────────────────
    uploadRecording: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      audioBase64: z.string().min(1), // base64-encoded audio data
      mimeType: z.string().default("audio/webm"),
      duration: z.number().optional(), // duration in seconds
    })).mutation(async ({ ctx, input }) => {
      const { storagePut } = await import("./storage");
      // Decode base64 audio
      const audioBuffer = Buffer.from(input.audioBase64, "base64");
      const fileSize = audioBuffer.length;
      // 16MB limit
      if (fileSize > 16 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Recording exceeds 16MB limit" });
      }
      // Determine file extension from mime type
      const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("mp4") ? "m4a" : input.mimeType.includes("ogg") ? "ogg" : "wav";
      const suffix = Math.random().toString(36).substring(2, 8);
      const fileKey = `voice-memos/${ctx.user.id}/${Date.now()}-${suffix}.${ext}`;
      // Upload to S3
      const { url: s3Url, key: s3Key } = await storagePut(fileKey, audioBuffer, input.mimeType);
      // Create audio file record
      const record = await db.createAudioFile({
        userId: ctx.user.id,
        name: input.name,
        text: "[Voice Recording]",
        voice: "recording",
        s3Url,
        s3Key,
        fileSize,
        duration: input.duration ? Math.round(input.duration) : null,
        status: "ready",
        tag: "voice-memo",
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "audio.uploadRecording",
        resource: "audioFile",
        resourceId: record.id,
        details: { name: input.name, fileSize, mimeType: input.mimeType, duration: input.duration },
      });
      return { id: record.id, s3Url, fileSize };
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
      maxConcurrentCalls: z.number().min(1).max(200).optional(),
      cpsLimit: z.number().min(1).max(20).optional(),
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
      didPoolStrategy: z.enum(["all", "toll_free", "local", "area_code", "label", "manual"]).optional(),
      didRotationMode: z.enum(["round_robin", "random"]).optional(),
      didManualIds: z.string().max(2000).optional().nullable(), // JSON array of DID ids
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
      amdAction: z.enum(["leave_voicemail", "skip", "hangup"]).optional(),
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
      // Day-Part Script Rotation
      dayPartScripts: z.array(z.object({ startTime: z.string(), endTime: z.string(), scriptId: z.number(), label: z.string().optional() })).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { didManualIds: didManualIdsStr, ttsProvider, voicemailAudioId, voicemailMessage, ivrPaymentAmount, tzEnforcementEnabled, tcpaStartHour, tcpaEndHour, ...rest } = input;
      const didManualIds = didManualIdsStr ? JSON.parse(didManualIdsStr) : undefined;
      // Map input field names to actual DB column names
      const dbData: any = {
        ...rest,
        didManualIds,
        userId: ctx.user.id,
      };
      // ttsProvider doesn't exist as a column - it's determined at dial time from voice selection
      if (voicemailAudioId !== undefined) dbData.voicemailAudioFileId = voicemailAudioId;
      if (voicemailMessage !== undefined) dbData.voicemailMessageText = voicemailMessage;
      if (ivrPaymentAmount !== undefined) dbData.ivrPaymentAmountField = String(ivrPaymentAmount);
      if (tzEnforcementEnabled !== undefined) dbData.enforceContactTimezone = tzEnforcementEnabled;
      if (tcpaStartHour !== undefined) dbData.contactTzWindowStart = `${String(tcpaStartHour).padStart(2, '0')}:00`;
      if (tcpaEndHour !== undefined) dbData.contactTzWindowEnd = `${String(tcpaEndHour).padStart(2, '0')}:00`;
      // Auto-populate totalContacts from the contact list
      const contactCount = await db.getContactListContactCount(input.contactListId);
      dbData.totalContacts = contactCount;
      const result = await db.createCampaign(dbData);
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
      maxConcurrentCalls: z.number().min(1).max(200).optional(),
      cpsLimit: z.number().min(1).max(20).optional(),
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
      didPoolStrategy: z.enum(["all", "toll_free", "local", "area_code", "label", "manual"]).optional(),
      didRotationMode: z.enum(["round_robin", "random"]).optional(),
      didManualIds: z.string().max(2000).optional().nullable(), // JSON array of DID ids
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
      amdAction: z.enum(["leave_voicemail", "skip", "hangup"]).optional(),
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
      // Day-Part Script Rotation
      dayPartScripts: z.array(z.object({ startTime: z.string(), endTime: z.string(), scriptId: z.number(), label: z.string().optional() })).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, didManualIds: didManualIdsStr, ttsProvider, voicemailAudioId, voicemailMessage, ivrPaymentAmount, tzEnforcementEnabled, tcpaStartHour, tcpaEndHour, ...data } = input;
      const campaign = await db.getCampaign(id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update a running campaign" });
      const didManualIds = didManualIdsStr ? JSON.parse(didManualIdsStr) : didManualIdsStr;
      // Map input field names to actual DB column names
      const dbData: any = { ...data, didManualIds };
      if (voicemailAudioId !== undefined) dbData.voicemailAudioFileId = voicemailAudioId;
      if (voicemailMessage !== undefined) dbData.voicemailMessageText = voicemailMessage;
      if (ivrPaymentAmount !== undefined) dbData.ivrPaymentAmountField = String(ivrPaymentAmount);
      if (tzEnforcementEnabled !== undefined) dbData.enforceContactTimezone = tzEnforcementEnabled;
      if (tcpaStartHour !== undefined) dbData.contactTzWindowStart = `${String(tcpaStartHour).padStart(2, '0')}:00`;
      if (tcpaEndHour !== undefined) dbData.contactTzWindowEnd = `${String(tcpaEndHour).padStart(2, '0')}:00`;
      // Update totalContacts if contactListId changed
      if (input.contactListId && input.contactListId !== campaign.contactListId) {
        const contactCount = await db.getContactListContactCount(input.contactListId);
        dbData.totalContacts = contactCount;
      }
      await db.updateCampaign(id, dbData);
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
    // Real-Time Campaign Dashboard
    liveStats: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaign(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const stats = await db.getCampaignStats(input.id);
      const isActive = isCampaignActive(input.id);
      // Get answer rate trend (last 10 minutes in 1-minute buckets)
      const dbInst = await (await import("./db")).getDb();
      let answerRateTrend: { minute: string; answered: number; total: number; rate: number }[] = [];
      let callsPerMinute = 0;
      let etaMinutes: number | null = null;
      if (dbInst) {
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        const trendRows = await dbInst.select({
          minute: sql<string>`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%H:%i')`,
          total: count(),
          answered: sql<number>`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END)`,
        }).from(callLogs)
          .where(and(
            eq(callLogs.campaignId, input.id),
            sql`${callLogs.startedAt} >= ${tenMinAgo}`
          ))
          .groupBy(sql`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%H:%i')`)
          .orderBy(sql`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%H:%i')`);
        answerRateTrend = trendRows.map(r => ({
          minute: r.minute,
          total: Number(r.total),
          answered: Number(r.answered),
          rate: r.total ? Math.round((Number(r.answered) / Number(r.total)) * 100) : 0,
        }));
        // Calculate calls per minute from the last 5 minutes
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const [recentRate] = await dbInst.select({ cnt: count() }).from(callLogs)
          .where(and(eq(callLogs.campaignId, input.id), sql`${callLogs.startedAt} >= ${fiveMinAgo}`));
        callsPerMinute = Math.round((Number(recentRate?.cnt ?? 0) / 5) * 10) / 10;
        // ETA: remaining contacts / calls per minute
        if (callsPerMinute > 0 && stats.remaining > 0) {
          etaMinutes = Math.round(stats.remaining / callsPerMinute);
        }
      }
      const dialed = stats.completed + stats.failed + (stats.busy || 0) + (stats.noAnswer || 0);
      const answerRate = dialed > 0 ? Math.round((stats.answered / dialed) * 100) : 0;
      return {
        ...stats,
        isActive,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        startedAt: campaign.startedAt,
        answerRate,
        callsPerMinute,
        etaMinutes,
        answerRateTrend,
        dialed,
      };
    }),
    // Campaign Cloning with optional Schedule Offset
    clone: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255),
      scheduleOffsetMs: z.number().optional(), // offset in ms from now to schedule the clone
      scheduleAt: z.number().optional(), // absolute timestamp to schedule the clone
    })).mutation(async ({ ctx, input }) => {
      const result = await db.cloneCampaign(input.id, input.name);
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "campaign.clone", resource: "campaign", resourceId: result.id, details: { clonedFrom: input.id, scheduleOffset: input.scheduleOffsetMs, scheduleAt: input.scheduleAt } });
      // If schedule offset or absolute time provided, create a schedule for the clone
      const scheduledAt = input.scheduleAt || (input.scheduleOffsetMs ? Date.now() + input.scheduleOffsetMs : null);
      if (scheduledAt && scheduledAt > Date.now()) {
        await db.createCampaignSchedule({
          campaignId: result.id,
          scheduledAt,
          userId: ctx.user.id,
          status: "pending",
        });
      }
      return { ...result, scheduledAt: scheduledAt || null };
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
    /** Get all campaign schedules for calendar view */
    allSchedules: protectedProcedure.input(z.object({
      startMs: z.number().optional(),
      endMs: z.number().optional(),
    })).query(async ({ input }) => {
      return db.getAllCampaignSchedules(input.startMs, input.endMs);
    }),

    /** Test Call — dial the user's own number with sample merge fields to preview what contacts hear */
    testCall: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(10).max(15),
      scriptId: z.number().optional(),
      // For script-based calls
      callbackNumber: z.string().optional(),
      // For personalized TTS calls
      messageText: z.string().optional(),
      voice: z.string().optional(),
      ttsSpeed: z.string().optional(),
      ttsProvider: z.enum(["openai", "google"]).optional(),
      // Sample merge field values
      sampleFirstName: z.string().optional(),
      sampleLastName: z.string().optional(),
      sampleCompany: z.string().optional(),
      sampleCallbackNumber: z.string().optional(),
      // Caller ID to use
      callerIdNumber: z.string().optional(),
      callerIdName: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Validate at least one audio source is provided
      if (!input.scriptId && !input.messageText) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Either a script or message text is required for a test call" });
      }

      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      if (phoneNumber.length < 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number" });
      }

      const channel = await db.buildPjsipChannel(phoneNumber);

      // Build sample contact data for merge fields
      const sampleContact: import("./services/script-audio").ContactData = {
        firstName: input.sampleFirstName || "John",
        lastName: input.sampleLastName || "Smith",
        phoneNumber: phoneNumber,
        company: input.sampleCompany || "Acme Corp",
        state: "FL",
      };

      const callbackNumber = input.sampleCallbackNumber || input.callbackNumber || "4075551234";
      const voice = input.voice || "alloy";
      const speed = parseFloat(input.ttsSpeed || "1.0");
      const provider = input.ttsProvider || (voice.startsWith("en-US-") ? "google" : "openai");

      let audioUrl: string | null = null;
      let audioUrls: string[] | null = null;
      let audioName: string | null = null;

      // Script-based test call
      if (input.scriptId) {
        const script = await db.getCallScriptById(input.scriptId);
        if (!script || !script.segments || script.segments.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found or has no segments" });
        }

        const { generateScriptAudio } = await import("./services/script-audio");
        const result = await generateScriptAudio({
          segments: script.segments,
          contactData: sampleContact,
          callbackNumber,
          campaignId: 0,
          contactId: 0,
        });

        if (!result.success || result.audioUrls.length === 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to generate test call audio: ${result.errors.join(", ")}` });
        }

        audioUrls = result.audioUrls;
        audioUrl = result.combinedUrl || result.audioUrls[0];
        audioName = `test_call_script_${input.scriptId}_${Date.now()}`;
      }
      // Personalized TTS test call
      else if (input.messageText) {
        const { renderMessageTemplate } = await import("./services/tts");

        // Build variables for merge field rendering
        const variables: Record<string, string> = {
          first_name: sampleContact.firstName || "Valued Customer",
          last_name: sampleContact.lastName || "",
          full_name: [sampleContact.firstName, sampleContact.lastName].filter(Boolean).join(" ") || "Valued Customer",
          phone: sampleContact.phoneNumber,
          company: sampleContact.company || "",
          state: sampleContact.state || "",
          database_name: "",
          callback_number: "",
          caller_id: input.callerIdNumber || "4075551234",
        };

        // Format callback number for TTS (spoken digits)
        if (callbackNumber) {
          const digits = callbackNumber.replace(/\D/g, "");
          if (digits.length >= 10) {
            const digitWords: Record<string, string> = {
              "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
              "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
            };
            const areaCode = digits.slice(-10, -7).split("").map(d => digitWords[d]).join(" ");
            const prefix = digits.slice(-7, -4).split("").map(d => digitWords[d]).join(" ");
            const line = digits.slice(-4).split("").map(d => digitWords[d]).join(" ");
            variables.callback_number = `${areaCode}, ${prefix}, ${line}`;
          }
        }

        const renderedText = renderMessageTemplate(input.messageText, variables);

        // Generate TTS
        const isGoogleVoice = voice.startsWith("en-US-");
        let ttsBuffer: Buffer;

        if (isGoogleVoice) {
          const { getGoogleTTSApiKey } = await import("./services/tts");
          const apiKey = await getGoogleTTSApiKey();
          const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                input: { text: renderedText },
                voice: { languageCode: "en-US", name: voice },
                audioConfig: { audioEncoding: "MP3", speakingRate: speed },
              }),
            }
          );
          if (!response.ok) {
            const errText = await response.text();
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Google TTS failed: ${errText}` });
          }
          const data = await response.json();
          ttsBuffer = Buffer.from(data.audioContent, "base64");
        } else {
          const { getOpenAIApiKey } = await import("./services/tts");
          const apiKey = await getOpenAIApiKey();
          const response = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "tts-1-hd",
              input: renderedText,
              voice: voice,
              response_format: "mp3",
              speed,
            }),
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `OpenAI TTS failed: ${errText}` });
          }
          ttsBuffer = Buffer.from(await response.arrayBuffer());
        }

        // Upload to S3
        const { storagePut } = await import("./storage");
        const s3Key = `test-calls/test_${ctx.user.id}_${Date.now()}.mp3`;
        const { url } = await storagePut(s3Key, ttsBuffer, "audio/mpeg");
        audioUrl = url;
        audioName = `test_call_tts_${Date.now()}`;
      }

      if (!audioUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate audio for test call" });
      }

      // Build caller ID string
      let callerIdStr: string | undefined;
      if (input.callerIdNumber) {
        callerIdStr = `"${input.callerIdName || "Test Call"}" <${input.callerIdNumber}>`;
      }

      // Build variables for the PBX agent
      const variables: Record<string, string> = {
        CALLID: `testcall-${ctx.user.id}-${Date.now()}`,
        AUDIO_URL: audioUrl,
        AUDIO_NAME: audioName || `test_call_${Date.now()}`,
      };

      // Enqueue into call_queue with highest priority
      const { id: queueId } = await db.enqueueCall({
        userId: ctx.user.id,
        campaignId: null,
        callLogId: null,
        phoneNumber,
        channel,
        context: "tts-broadcast",
        callerIdStr: callerIdStr || null,
        audioUrl,
        audioUrls: audioUrls,
        audioName: audioName || null,
        variables,
        status: "pending",
        priority: 1, // Highest priority — test calls go first
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "campaign.testCall",
        resource: "campaign",
        resourceId: 0,
        details: { phoneNumber, scriptId: input.scriptId, queueId },
      });

      console.log(`[TestCall] Enqueued test call to ${phoneNumber} for user ${ctx.user.id} (queue #${queueId})`);

      return { success: true, queueId, message: `Test call queued to ${phoneNumber}` };
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

  // ─── Smart Campaign Scheduler ──────────────────────────────────────────
  scheduler: router({
    heatmap: protectedProcedure.query(async () => {
      return db.getBestTimeToCallHeatmap();
    }),
    volumeByHour: protectedProcedure.query(async () => {
      return db.getCallVolumeByHour();
    }),
    retryCandidates: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
      return db.getIntelligentRetryCandidates(input.campaignId);
    }),
  }),

  callLogs: router({
    list: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ ctx, input }) => {
      return db.getCallLogs(input.campaignId);
    }),
    paginated: protectedProcedure.input(z.object({
      campaignId: z.number(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      return db.getCampaignCallLogsPaginated(input);
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
    hangup: protectedProcedure.input(z.object({
      callLogId: z.number(),
      phoneNumber: z.string(),
      channel: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Find the active queue item for this call log
      const queueItem = await db.getCallQueueItemByCallLogId(input.callLogId);
      const queueId = queueItem?.id || 0;
      const channel = input.channel || queueItem?.channel || undefined;
      const { enqueueCommand } = await import("./services/call-control");
      const cmd = enqueueCommand({
        type: "hangup",
        queueId,
        channel,
        phoneNumber: input.phoneNumber,
        issuedBy: ctx.user.name || ctx.user.openId,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        action: "call_hangup",
        resource: "call",
        resourceId: input.callLogId,
        details: { phoneNumber: input.phoneNumber, channel, commandId: cmd.id, source: "call_history" },
      });
      return { success: true, commandId: cmd.id };
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
    // DNC Analytics
    stats: protectedProcedure.query(async () => {
      return db.getDncStats();
    }),
    // Disconnected Numbers sub-router
    disconnected: router({
      list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ ctx, input }) => {
        return db.getDisconnectedNumbers({ search: input.search });
      }),
      count: protectedProcedure.query(async () => {
        return { count: await db.getDisconnectedCount() };
      }),
      stats: protectedProcedure.query(async () => {
        return db.getDisconnectedStats();
      }),
      add: adminProcedure.input(z.object({
        phoneNumber: z.string().min(1).max(20),
        reason: z.string().optional(),
        autoAddToDnc: z.boolean().optional().default(true),
      })).mutation(async ({ ctx, input }) => {
        const result = await db.addDisconnectedNumber({
          phoneNumber: input.phoneNumber,
          reason: input.reason || "manual",
          autoAddToDnc: input.autoAddToDnc,
        });
        if (!result.duplicate) {
          await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "disconnected.add", resource: "disconnected", resourceId: result.id, details: { phoneNumber: input.phoneNumber } });
        }
        return result;
      }),
      bulkAdd: adminProcedure.input(z.object({
        entries: z.array(z.object({
          phoneNumber: z.string().min(1),
          reason: z.string().optional(),
        })).min(1).max(50000),
      })).mutation(async ({ ctx, input }) => {
        const result = await db.bulkAddDisconnectedNumbers(input.entries);
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "disconnected.bulkAdd", resource: "disconnected", details: { added: result.added, duplicates: result.duplicates, addedToDnc: result.addedToDnc } });
        return result;
      }),
      remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        await db.removeDisconnectedNumber(input.id);
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "disconnected.remove", resource: "disconnected", resourceId: input.id });
        return { success: true };
      }),
      bulkRemove: adminProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
        await db.bulkRemoveDisconnected(input.ids);
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "disconnected.bulkRemove", resource: "disconnected", details: { count: input.ids.length } });
        return { success: true };
      }),
      importCsv: adminProcedure.input(z.object({
        entries: z.array(z.object({
          phoneNumber: z.string().min(1),
          reason: z.string().optional(),
          databaseName: z.string().optional(),
        })).min(1).max(50000),
      })).mutation(async ({ ctx, input }) => {
        const result = await db.bulkAddDisconnectedNumbers(input.entries);
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "disconnected.importCsv", resource: "disconnected", details: { added: result.added, duplicates: result.duplicates, addedToDnc: result.addedToDnc } });
        return result;
      }),
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
    /** Create a single caller ID with an optional inbound route on FreePBX */
    createWithRoute: adminProcedure.input(z.object({
      phoneNumber: z.string().min(1).max(20),
      label: z.string().max(255).optional(),
      inboundRoute: z.object({
        destination: z.string().min(1),
        description: z.string().max(255).default("TTS Dialer"),
        cidPrefix: z.string().max(50).optional(),
      }).optional(),
    })).mutation(async ({ ctx, input }) => {
      // Step 1: Create caller ID in database
      const result = await db.createCallerId({ phoneNumber: input.phoneNumber, label: input.label, userId: ctx.user.id });
      if (result.duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: `Caller ID ${input.phoneNumber} already exists` });
      }

      // Step 2: Create inbound route on FreePBX if configured
      let routeResult = null;
      if (input.inboundRoute) {
        const routes = [{
          did: input.phoneNumber,
          destination: input.inboundRoute.destination,
          description: input.inboundRoute.description,
          cidPrefix: input.inboundRoute.cidPrefix,
        }];
        const results = await createInboundRoutes(routes);
        const r = results[0];
        routeResult = { success: r?.success ?? false, alreadyExists: r?.alreadyExists ?? false, error: r?.error };
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: input.inboundRoute ? "callerId.createWithRoute" : "callerId.create",
        resource: "callerId",
        resourceId: result.id,
        details: routeResult ? { route: routeResult } : undefined,
      });

      return { callerId: result, inboundRoute: routeResult };
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
          channel: await db.buildPjsipChannel(HEALTH_CHECK_TEST_NUMBER),
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

    /** Check which DIDs have inbound routes, returning full route details for conflict resolution */
    checkInboundRoutesDetailed: adminProcedure.input(z.object({
      dids: z.array(z.string().min(1)).min(1).max(1000),
    })).mutation(async ({ input }) => {
      const existing = await checkExistingRoutesDetailed(input.dids);
      const result: Record<string, { did: string; description: string; destination: string; cidPrefix: string }> = {};
      existing.forEach((route, did) => {
        result[did] = route;
      });
      return result;
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

      // Log to DID import history
      try {
        const firstRoute = routeEntries[0]?.inboundRoute;
        await db.createDidImportHistoryEntry({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          source: "manual",
          totalCount: input.entries.length,
          importedCount: callerIdResult.count,
          duplicatesSkipped: callerIdResult.duplicatesOmitted,
          routesCreated: routeResults?.summary?.created || 0,
          routesFailed: routeResults?.summary?.failed || 0,
          defaultDescription: firstRoute?.description || null,
          defaultDestination: firstRoute?.destination || null,
          cidPrefix: firstRoute?.cidPrefix || null,
          dids: input.entries.map(e => e.phoneNumber),
          errors: routeResults?.results?.filter((r: any) => !r.success).map((r: any) => `${r.did}: ${r.error}`) || null,
        });
      } catch (e) {
        console.error("[bulkCreateWithRoutes] Failed to log import history:", e);
      }

      return {
        callerIds: callerIdResult,
        inboundRoutes: routeResults,
      };
    }),

    /** Get DID import history log */
    getImportHistory: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }).optional()).query(async ({ ctx, input }) => {
      const limit = input?.limit || 50;
      // Admins see all history, regular users see only their own
      const userId = ctx.user.role === "admin" ? undefined : ctx.user.id;
      return db.getDidImportHistory(userId, limit);
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

    /** Bulk update inbound routes' destination, description, or CID prefix */
    bulkUpdateInboundRoutes: adminProcedure.input(z.object({
      dids: z.array(z.string().min(1)).min(1).max(500),
      destination: z.string().min(1).optional(),
      description: z.string().max(255).optional(),
      cidPrefix: z.string().max(50).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { dids, ...updates } = input;
      const result = await bulkUpdateInboundRoutes(dids, updates);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkUpdateInboundRoutes",
        resource: "callerId",
        details: { count: dids.length, updates },
      });
      return result;
    }),

    // ─── Vitelity DID Import ─────────────────────────────────────────────

    /** Test Vitelity API connection */
    testVitelityConnection: adminProcedure.query(async () => {
      const { testVitelityConnection } = await import("./services/vitelity");
      return testVitelityConnection();
    }),

    /** Fetch all DIDs from Vitelity account */
    listVitelityDIDs: adminProcedure.query(async () => {
      const { listVitelityDIDs } = await import("./services/vitelity");
      const dids = await listVitelityDIDs();
      return dids;
    }),

    /** Import selected DIDs from Vitelity into our system (with optional inbound routes) */
    importFromVitelity: adminProcedure.input(z.object({
      dids: z.array(z.object({
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
      const callerIdData = input.dids.map(d => ({
        phoneNumber: d.phoneNumber,
        label: d.label,
        userId: ctx.user.id,
      }));
      const callerIdResult = await db.bulkCreateCallerIds(callerIdData);

      // Step 2: Create inbound routes on FreePBX for entries that have route config
      const routeEntries = input.dids.filter(d => d.inboundRoute);
      let routeResults = null;
      if (routeEntries.length > 0) {
        const routes = routeEntries.map(d => ({
          did: d.phoneNumber,
          destination: d.inboundRoute!.destination,
          description: d.inboundRoute!.description,
          cidPrefix: d.inboundRoute?.cidPrefix,
        }));
        const results = await createInboundRoutes(routes);
        const created = results.filter(r => r.success && !r.alreadyExists).length;
        const skipped = results.filter(r => r.alreadyExists).length;
        const failed = results.filter(r => !r.success).length;
        routeResults = { results, summary: { created, skipped, failed } };
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.importFromVitelity",
        resource: "callerId",
        details: {
          callerIds: callerIdResult.count,
          dupes: callerIdResult.duplicatesOmitted,
          routes: routeResults?.summary || null,
          source: "vitelity",
        },
      });

      // Log to DID import history
      try {
        const firstRoute = routeEntries[0]?.inboundRoute;
        await db.createDidImportHistoryEntry({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          source: "vitelity",
          totalCount: input.dids.length,
          importedCount: callerIdResult.count,
          duplicatesSkipped: callerIdResult.duplicatesOmitted,
          routesCreated: routeResults?.summary?.created || 0,
          routesFailed: routeResults?.summary?.failed || 0,
          defaultDescription: firstRoute?.description || null,
          defaultDestination: firstRoute?.destination || null,
          cidPrefix: firstRoute?.cidPrefix || null,
          dids: input.dids.map(d => d.phoneNumber),
          errors: routeResults?.results?.filter((r: any) => !r.success).map((r: any) => `${r.did}: ${r.error}`) || null,
        });
      } catch (e) {
        console.error("[importFromVitelity] Failed to log import history:", e);
      }

      return {
        callerIds: callerIdResult,
        inboundRoutes: routeResults,
      };
    }),

    /** @deprecated - Vitelity v1.0 listavailstates is deprecated. Returns empty array. */
    availableStates: adminProcedure.query(async () => {
      return [] as string[];
    }),

    /** @deprecated - Vitelity v1.0 listavailratecenters is deprecated. Returns empty array. */
    availableRateCenters: adminProcedure.input(z.object({
      state: z.string().length(2),
    })).query(async ({ input }) => {
      return [] as string[];
    }),

    /** Search available DIDs for purchase using v2.0 tnMask pattern */
    searchAvailableDIDs: adminProcedure.input(z.object({
      tnMask: z.string().min(3).max(15),
      quantity: z.number().min(1).max(100).default(20),
      page: z.number().min(1).default(1),
    })).query(async ({ input }) => {
      const { searchAvailableDIDs } = await import("./services/vitelity");
      return searchAvailableDIDs(input.tnMask, input.quantity, input.page);
    }),

    /** Purchase a DID from Vitelity */
    purchaseDID: adminProcedure.input(z.object({
      did: z.string().min(10).max(11),
      routeSip: z.string().optional(),
      label: z.string().optional(),
      createInboundRoute: z.boolean().default(false),
      destination: z.string().optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { purchaseDID, routeDID } = await import("./services/vitelity");

      // Step 1: Purchase the DID
      const purchaseResult = await purchaseDID(input.did);
      if (!purchaseResult.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: purchaseResult.message });
      }

      // Step 2: Route to SIP if specified
      let routeResult = null;
      if (input.routeSip) {
        routeResult = await routeDID(input.did, input.routeSip);
      }

      // Step 3: Add to our database
      const phoneNumber = input.did.startsWith("1") ? input.did : `1${input.did}`;
      const callerIdResult = await db.bulkCreateCallerIds([
        { phoneNumber, label: input.label || "", userId: ctx.user.id }
      ]);

      // Step 4: Create FreePBX inbound route if requested
      let inboundRouteResult = null;
      if (input.createInboundRoute && input.destination && input.destination !== "none") {
        try {
          const { createInboundRoutes } = await import("./services/freepbx-routes");
          const routeResults = await createInboundRoutes([{
            did: phoneNumber,
            destination: input.destination,
            description: input.description || `Purchased DID ${phoneNumber}`,
            cidPrefix: "",
          }]);
          inboundRouteResult = routeResults;
        } catch (err: any) {
          console.warn(`[PurchaseDID] FreePBX route creation failed for ${phoneNumber}:`, err.message);
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.purchaseDID",
        resource: "callerId",
        details: {
          did: input.did,
          label: input.label,
          routed: !!routeResult?.success,
          inboundRoute: !!inboundRouteResult,
        },
      });

      // Log cost transaction for DID purchase
      try {
        const database = await db.getDb();
        if (database) {
          const { didCostTransactions: dctTable } = await import("../drizzle/schema");
          await database.insert(dctTable).values({
            userId: ctx.user.id,
            phoneNumber,
            type: "purchase",
            amount: "1.00", // Default purchase cost
            description: `Purchased DID ${phoneNumber} from Vitelity`,
            transactionDate: Date.now(),
          });
        }
      } catch {}

      return {
        purchase: purchaseResult,
        route: routeResult,
        callerId: callerIdResult,
        inboundRoute: inboundRouteResult,
      };
    }),

    /** Bulk purchase multiple DIDs */
    bulkPurchaseDIDs: adminProcedure.input(z.object({
      dids: z.array(z.object({
        did: z.string().min(10).max(11),
        rateCenter: z.string().optional(),
        state: z.string().optional(),
      })).min(1).max(50),
      routeSip: z.string().optional(),
      label: z.string().optional(),
      createInboundRoute: z.boolean().default(false),
      destination: z.string().optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { purchaseDID, routeDID } = await import("./services/vitelity");

      const results: Array<{ did: string; purchased: boolean; routed: boolean; error?: string }> = [];

      for (const { did } of input.dids) {
        try {
          const purchaseResult = await purchaseDID(did);
          if (!purchaseResult.success) {
            results.push({ did, purchased: false, routed: false, error: purchaseResult.message });
            continue;
          }

          let routed = false;
          if (input.routeSip) {
            const routeResult = await routeDID(did, input.routeSip);
            routed = routeResult.success;
          }

          results.push({ did, purchased: true, routed });
        } catch (err: any) {
          results.push({ did, purchased: false, routed: false, error: err.message });
        }
      }

      // Add successfully purchased DIDs to our database
      const purchasedDids = results.filter(r => r.purchased);
      let callerIdResult = null;
      if (purchasedDids.length > 0) {
        const entries = purchasedDids.map(r => ({
          phoneNumber: r.did.startsWith("1") ? r.did : `1${r.did}`,
          label: input.label || "",
          userId: ctx.user.id,
        }));
        callerIdResult = await db.bulkCreateCallerIds(entries);
      }

      // Create FreePBX inbound routes if requested
      let inboundRouteResult = null;
      if (input.createInboundRoute && input.destination && input.destination !== "none" && purchasedDids.length > 0) {
        try {
          const { createInboundRoutes } = await import("./services/freepbx-routes");
          const routeEntries = purchasedDids.map(r => ({
            did: r.did.startsWith("1") ? r.did : `1${r.did}`,
            destination: input.destination!,
            description: input.description || `Purchased DID`,
            cidPrefix: "",
          }));
          const routeResults = await createInboundRoutes(routeEntries);
          inboundRouteResult = routeResults;
        } catch (err: any) {
          console.warn(`[BulkPurchase] FreePBX route creation failed:`, err.message);
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkPurchaseDIDs",
        resource: "callerId",
        details: {
          total: input.dids.length,
          purchased: purchasedDids.length,
          failed: results.filter(r => !r.purchased).length,
          label: input.label,
        },
      });

      // Log cost transactions for purchased DIDs
      if (purchasedDids.length > 0) {
        try {
          const database = await db.getDb();
          if (database) {
            const { didCostTransactions: dctTable } = await import("../drizzle/schema");
            const costEntries = purchasedDids.map(r => ({
              userId: ctx.user.id,
              phoneNumber: r.did.startsWith("1") ? r.did : `1${r.did}`,
              type: "purchase" as const,
              amount: "1.00",
              description: `Purchased DID from Vitelity (bulk)`,
              transactionDate: Date.now(),
            }));
            await database.insert(dctTable).values(costEntries);
          }
        } catch {}
      }

      // Log to DID import history
      try {
        const routesCreated = inboundRouteResult?.filter((r: any) => r.success && !r.alreadyExists).length || 0;
        const routesFailed = inboundRouteResult?.filter((r: any) => !r.success).length || 0;
        await db.createDidImportHistoryEntry({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          source: "purchase",
          totalCount: input.dids.length,
          importedCount: purchasedDids.length,
          duplicatesSkipped: callerIdResult?.duplicatesOmitted || 0,
          routesCreated,
          routesFailed,
          defaultDescription: input.description || null,
          defaultDestination: input.destination || null,
          cidPrefix: null,
          dids: purchasedDids.map(r => r.did),
          errors: results.filter(r => !r.purchased).map(r => `${r.did}: ${r.error}`) || null,
        });
      } catch (e) {
        console.error("[bulkPurchaseDIDs] Failed to log import history:", e);
      }

      return { results, callerIds: callerIdResult, inboundRoutes: inboundRouteResult };
    }),

    /** Get Vitelity account balance */
    vitelityBalance: adminProcedure.query(async () => {
      const { getVitelityBalance } = await import("./services/vitelity");
      return getVitelityBalance();
    }),

    /** CNAM lookup for a phone number (charged per lookup) */
    cnamLookup: adminProcedure.input(z.object({
      did: z.string().min(10).max(11),
      callerIdId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { cnamLookup } = await import("./services/vitelity");
      const result = await cnamLookup(input.did);

      // Save CNAM result to database if callerIdId provided
      if (input.callerIdId && result.success) {
        await db.updateCallerId(input.callerIdId, {
          cnamName: result.name || null,
          cnamLookedUpAt: Date.now(),
        });
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.cnamLookup",
        resource: "callerId",
        details: { did: input.did, name: result.name, success: result.success },
      });

      // Log cost transaction for CNAM lookup ($0.01 per lookup)
      if (result.success) {
        try {
          const database = await db.getDb();
          if (database) {
            const { didCostTransactions: dctTable } = await import("../drizzle/schema");
            await database.insert(dctTable).values({
              userId: ctx.user.id,
              callerIdId: input.callerIdId || null,
              phoneNumber: input.did,
              type: "cnam_lookup",
              amount: "0.01",
              description: `CNAM lookup: ${result.name || "N/A"}`,
              transactionDate: Date.now(),
            });
          }
        } catch {}
      }

      return result;
    }),

    /** Bulk CNAM lookup for multiple DIDs */
    bulkCnamLookup: adminProcedure.input(z.object({
      dids: z.array(z.object({
        did: z.string().min(10).max(11),
        callerIdId: z.number().optional(),
      })).min(1).max(100),
    })).mutation(async ({ ctx, input }) => {
      const { cnamLookup } = await import("./services/vitelity");
      const results = [];
      for (const { did, callerIdId } of input.dids) {
        try {
          const result = await cnamLookup(did);
          // Save CNAM result to database
          if (callerIdId && result.success) {
            await db.updateCallerId(callerIdId, {
              cnamName: result.name || null,
              cnamLookedUpAt: Date.now(),
            });
          }
          results.push(result);
        } catch (err: any) {
          results.push({ did, name: "", success: false, error: err.message });
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkCnamLookup",
        resource: "callerId",
        details: { count: input.dids.length, successful: results.filter(r => r.success).length },
      });

      // Log cost transactions for successful CNAM lookups ($0.01 each)
      const successfulLookups = results.filter(r => r.success);
      if (successfulLookups.length > 0) {
        try {
          const database = await db.getDb();
          if (database) {
            const { didCostTransactions: dctTable } = await import("../drizzle/schema");
            const costEntries = successfulLookups.map((r, i) => ({
              userId: ctx.user.id,
              callerIdId: input.dids[i]?.callerIdId || null,
              phoneNumber: r.did,
              type: "cnam_lookup" as const,
              amount: "0.01",
              description: `CNAM lookup: ${r.name || "N/A"}`,
              transactionDate: Date.now(),
            }));
            await database.insert(dctTable).values(costEntries);
          }
        } catch {}
      }

      return results;
    }),

    /** Set LIDB (outbound CNAM) for a DID */
    setLidb: adminProcedure.input(z.object({
      did: z.string().min(10).max(11),
      name: z.string().min(1).max(15),
    })).mutation(async ({ ctx, input }) => {
      const { setLidb } = await import("./services/vitelity");
      const result = await setLidb(input.did, input.name);

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.setLidb",
        resource: "callerId",
        details: { did: input.did, name: input.name, success: result.success },
      });

      return result;
    }),

    // ─── Toll-Free DID Purchasing ─────────────────────────────────

    searchTollFreeDIDs: adminProcedure.input(z.object({
      tnMask: z.string().min(3).max(15).default("8XXXXXXXXX"),
      quantity: z.number().min(1).max(100).default(20),
    })).query(async ({ input }) => {
      const { searchAvailableTollFreeDIDs } = await import("./services/vitelity");
      return searchAvailableTollFreeDIDs(input.tnMask, input.quantity);
    }),

    purchaseTollFreeDID: adminProcedure.input(z.object({
      did: z.string().min(10),
      routeSip: z.string().optional(),
      label: z.string().optional(),
      createInboundRoute: z.boolean().default(false),
      destination: z.string().optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { purchaseTollFreeDID, routeDID } = await import("./services/vitelity");

      const purchaseResult = await purchaseTollFreeDID(input.did);
      if (!purchaseResult.success) {
        return { purchased: false, routed: false, routeCreated: false, error: purchaseResult.message };
      }

      let routed = false;
      if (input.routeSip) {
        const routeResult = await routeDID(input.did, input.routeSip);
        routed = routeResult.success;
      }

      // Add to caller IDs table
      const phoneNumber = input.did.length === 10 ? `1${input.did}` : input.did;
      await db.bulkCreateCallerIds([{
        userId: ctx.user.id,
        phoneNumber,
        label: input.label || "Toll-Free",
        isActive: 1,
      }]);

      // Create inbound route on FreePBX if requested
      let routeCreated = false;
      if (input.createInboundRoute && input.destination && input.destination !== "none") {
        try {
          const { createInboundRoutes } = await import("./services/freepbx-routes");
          const routeResults = await createInboundRoutes([{
            did: phoneNumber,
            destination: input.destination,
            description: input.description || `TF-${phoneNumber}`,
            cidPrefix: "",
          }]);
          routeCreated = routeResults.filter(r => r.success).length > 0;
        } catch (err) {
          console.warn("[purchaseTollFreeDID] FreePBX route creation failed:", err);
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.purchaseTollFreeDID",
        resource: "callerId",
        details: { did: input.did, routed, routeCreated, label: input.label },
      });

      // Log cost transaction for toll-free DID purchase
      try {
        const database = await db.getDb();
        if (database) {
          const { didCostTransactions: dctTable } = await import("../drizzle/schema");
          await database.insert(dctTable).values({
            userId: ctx.user.id,
            phoneNumber,
            type: "purchase",
            amount: "2.00", // Toll-free typically costs more
            description: `Purchased toll-free DID ${phoneNumber} from Vitelity`,
            transactionDate: Date.now(),
          });
        }
      } catch {}

      return { purchased: true, routed, routeCreated };
    }),

    bulkPurchaseTollFreeDIDs: adminProcedure.input(z.object({
      dids: z.array(z.object({ did: z.string().min(10) })),
      routeSip: z.string().optional(),
      label: z.string().optional(),
      createInboundRoute: z.boolean().default(false),
      destination: z.string().optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { purchaseTollFreeDID, routeDID } = await import("./services/vitelity");

      const results = [];

      for (const { did } of input.dids) {
        try {
          const purchaseResult = await purchaseTollFreeDID(did);
          if (!purchaseResult.success) {
            results.push({ did, purchased: false, routed: false, error: purchaseResult.message });
            continue;
          }

          let routed = false;
          if (input.routeSip) {
            const routeResult = await routeDID(did, input.routeSip);
            routed = routeResult.success;
          }

          results.push({ did, purchased: true, routed });
        } catch (err: any) {
          results.push({ did, purchased: false, routed: false, error: err.message });
        }
      }

      // Bulk add purchased DIDs to caller IDs
      const purchasedDIDs = results.filter(r => r.purchased);
      if (purchasedDIDs.length > 0) {
        await db.bulkCreateCallerIds(
          purchasedDIDs.map(r => ({
            userId: ctx.user.id,
            phoneNumber: r.did.length === 10 ? `1${r.did}` : r.did,
            label: input.label || "Toll-Free",
            isActive: 1,
          }))
        );

        if (input.createInboundRoute && input.destination && input.destination !== "none") {
          try {
            const { createInboundRoutes } = await import("./services/freepbx-routes");
            await createInboundRoutes(
              purchasedDIDs.map(r => ({
                did: r.did.length === 10 ? `1${r.did}` : r.did,
                destination: input.destination!,
                description: input.description || `TF-${r.did}`,
                cidPrefix: "",
              }))
            );
          } catch (err) {
            console.warn("[bulkPurchaseTollFreeDIDs] FreePBX route creation failed:", err);
          }
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkPurchaseTollFreeDIDs",
        resource: "callerId",
        details: {
          total: input.dids.length,
          purchased: purchasedDIDs.length,
          failed: results.filter(r => !r.purchased).length,
          label: input.label,
        },
      });

      // Log cost transactions for purchased toll-free DIDs
      if (purchasedDIDs.length > 0) {
        try {
          const database = await db.getDb();
          if (database) {
            const { didCostTransactions: dctTable } = await import("../drizzle/schema");
            const costEntries = purchasedDIDs.map(r => ({
              userId: ctx.user.id,
              phoneNumber: r.did.length === 10 ? `1${r.did}` : r.did,
              type: "purchase" as const,
              amount: "2.00",
              description: `Purchased toll-free DID from Vitelity (bulk)`,
              transactionDate: Date.now(),
            }));
            await database.insert(dctTable).values(costEntries);
          }
        } catch {}
      }

      return { results, purchased: purchasedDIDs.length, failed: results.filter(r => !r.purchased).length };
    }),

    // ─── Vitelity DID Sync ───────────────────────────────────────

    syncVitelityDIDs: adminProcedure.mutation(async ({ ctx }) => {
      const { listVitelityDIDs, compareInventory } = await import("./services/vitelity");

      // Fetch Vitelity inventory
      const vitelityDIDs = await listVitelityDIDs();

      // Fetch local caller IDs
      const localCallerIds = await db.getCallerIds();
      const localPhoneNumbers = localCallerIds.map(c => c.phoneNumber);

      // Compare
      const syncResult = compareInventory(vitelityDIDs, localPhoneNumbers);

      // Auto-add new DIDs found on Vitelity
      if (syncResult.added.length > 0) {
        const vitelityMap = new Map(vitelityDIDs.map(d => [d.did.slice(-10), d]));
        await db.bulkCreateCallerIds(
          syncResult.added.map(did => {
            const vDid = vitelityMap.get(did);
            return {
              userId: ctx.user.id,
              phoneNumber: did.length === 10 ? `1${did}` : did,
              label: vDid ? `Vitelity-${vDid.state}` : "Vitelity-Sync",
              isActive: 1,
            };
          })
        );
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.syncVitelityDIDs",
        resource: "callerId",
        details: {
          added: syncResult.added.length,
          removed: syncResult.removed.length,
          matched: syncResult.matched,
          totalVitelity: syncResult.totalVitelity,
          totalLocal: syncResult.totalLocal,
        },
      });

      return syncResult;
    }),

    // ─── DID Pool Count ──────────────────────────────────────────

    countByLabel: protectedProcedure.input(z.object({
      label: z.string().optional(),
    })).query(async ({ input }) => {
      const allCallerIds = await db.getCallerIds();
      const active = allCallerIds.filter(c => c.isActive === 1);
      if (!input.label) return { count: active.length, label: "All" };
      const filtered = active.filter(c => c.label === input.label);
      return { count: filtered.length, label: input.label };
    }),

    labelCounts: protectedProcedure.query(async () => {
      const allCallerIds = await db.getCallerIds();
      const active = allCallerIds.filter(c => c.isActive === 1);
      const counts = new Map();
      counts.set("__all__", active.length);
      for (const c of active) {
        const label = c.label || "__unlabeled__";
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      const result = [];
      for (const [label, count] of Array.from(counts.entries())) {
        result.push({ label, count });
      }
      return result;
    }),

    // ── Vitelity Sync Settings ──
    getSyncSettings: adminProcedure.query(async () => {
      const { getSyncStatus } = await import("./services/vitelity-sync");
      return getSyncStatus();
    }),

    updateSyncSettings: adminProcedure.input(z.object({
      enabled: z.boolean(),
      intervalMinutes: z.number().min(5).max(1440),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertAppSetting("vitelity_sync_enabled", input.enabled ? "1" : "0", "Enable Vitelity auto-sync", 0, ctx.user.id);
      await db.upsertAppSetting("vitelity_sync_interval_minutes", String(input.intervalMinutes), "Vitelity sync interval in minutes", 0, ctx.user.id);

      if (input.enabled) {
        const { startSyncScheduler } = await import("./services/vitelity-sync");
        await startSyncScheduler(ctx.user.id);
      } else {
        const { stopSyncScheduler } = await import("./services/vitelity-sync");
        stopSyncScheduler();
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "vitelity.sync_settings_updated",
        resource: "settings",
        details: { enabled: input.enabled, intervalMinutes: input.intervalMinutes },
      });

      return { success: true };
    }),

    runSyncNow: adminProcedure.mutation(async ({ ctx }) => {
      const { performSync } = await import("./services/vitelity-sync");
      return performSync(ctx.user.id);
    }),

    // ── DID Cost Transactions ──
    getCostSummary: protectedProcedure.input(z.object({
      days: z.number().min(1).max(365).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const days = input?.days || 30;
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const database = await db.getDb();
      if (!database) return { transactions: [], totals: {} };
      const { didCostTransactions } = await import("../drizzle/schema");
      const { gte } = await import("drizzle-orm");
      const txns = await database
        .select()
        .from(didCostTransactions)
        .where(gte(didCostTransactions.transactionDate, since));
      // Aggregate by type
      const totals: Record<string, number> = {};
      for (const t of txns) {
        const amt = parseFloat(t.amount) || 0;
        totals[t.type] = (totals[t.type] || 0) + amt;
      }
      // Aggregate by DID
      const byDid: Record<string, { phoneNumber: string; total: number; breakdown: Record<string, number> }> = {};
      for (const t of txns) {
        const amt = parseFloat(t.amount) || 0;
        if (!byDid[t.phoneNumber]) {
          byDid[t.phoneNumber] = { phoneNumber: t.phoneNumber, total: 0, breakdown: {} };
        }
        byDid[t.phoneNumber].total += amt;
        byDid[t.phoneNumber].breakdown[t.type] = (byDid[t.phoneNumber].breakdown[t.type] || 0) + amt;
      }
      return {
        transactions: txns,
        totals,
        byDid: Object.values(byDid).sort((a, b) => b.total - a.total),
        grandTotal: Object.values(totals).reduce((s, v) => s + v, 0),
      };
    }),

    // ── Bulk Release DIDs to Vitelity ──
    bulkReleaseDIDs: adminProcedure.input(z.object({
      ids: z.array(z.number()).min(1),
      releaseFromVitelity: z.boolean().default(true),
      deleteFromFreepbx: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const callerIdsList = await db.getCallerIds();
      const toRelease = callerIdsList.filter(c => input.ids.includes(c.id));
      if (toRelease.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No matching caller IDs" });

      const results: Array<{ phoneNumber: string; vitelityReleased: boolean; freepbxDeleted: boolean; dbDeleted: boolean; error?: string }> = [];

      for (const did of toRelease) {
        const result: { phoneNumber: string; vitelityReleased: boolean; freepbxDeleted: boolean; dbDeleted: boolean; error?: string } = {
          phoneNumber: did.phoneNumber,
          vitelityReleased: false,
          freepbxDeleted: false,
          dbDeleted: false,
        };

        // Release from Vitelity
        if (input.releaseFromVitelity) {
          try {
            const { removeDID } = await import("./services/vitelity");
            await removeDID(did.phoneNumber);
            result.vitelityReleased = true;
          } catch (err: unknown) {
            result.error = `Vitelity release failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        // Delete from FreePBX
        if (input.deleteFromFreepbx) {
          try {
            const { deleteInboundRoutes } = await import("./services/freepbx-routes");
            await deleteInboundRoutes([did.phoneNumber]);
            result.freepbxDeleted = true;
          } catch (err: unknown) {
            result.error = (result.error ? result.error + "; " : "") + `FreePBX delete failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        // Delete from DB
        try {
          await db.deleteCallerId(did.id);
          result.dbDeleted = true;
        } catch (err: unknown) {
          result.error = (result.error ? result.error + "; " : "") + `DB delete failed: ${err instanceof Error ? err.message : String(err)}`;
        }

        // Log cost transaction (credit)
        try {
          const database = await db.getDb();
          if (database) {
            const { didCostTransactions: dctTable } = await import("../drizzle/schema");
            await database.insert(dctTable).values({
              userId: ctx.user.id,
              callerIdId: did.id,
              phoneNumber: did.phoneNumber,
              type: "release",
              amount: "0.00",
              description: `Released DID${input.releaseFromVitelity ? " from Vitelity" : ""}${input.deleteFromFreepbx ? " and FreePBX" : ""}`,
              transactionDate: Date.now(),
            });
          }
        } catch {}

        results.push(result);
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.bulkRelease",
        resource: "callerIds",
        details: {
          count: toRelease.length,
          released: results.filter(r => r.vitelityReleased).length,
          freepbxDeleted: results.filter(r => r.freepbxDeleted).length,
          dbDeleted: results.filter(r => r.dbDeleted).length,
        },
      });

      return { results };
    }),

    // ─── Auto-Rotate Underperforming DIDs ─────────────────────────────────

    /** Get auto-rotate settings */
    getAutoRotateSettings: protectedProcedure.query(async () => {
      return db.getAutoRotateSettings();
    }),

    /** Update auto-rotate settings */
    updateAutoRotateSettings: adminProcedure.input(z.object({
      enabled: z.boolean().optional(),
      threshold: z.number().min(1).max(100).optional(),
      minCalls: z.number().min(10).max(10000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.updateAutoRotateSettings(input, ctx.user.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "callerId.updateAutoRotateSettings",
        resource: "callerId",
        details: input,
      });
      return result;
    }),

    /** Manually trigger auto-rotate evaluation */
    evaluateAutoRotate: adminProcedure.mutation(async ({ ctx }) => {
      const disabled = await db.evaluateAutoRotate();
      if (disabled.length > 0) {
        await db.createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          action: "callerId.autoRotateEvaluation",
          resource: "callerId",
          details: {
            disabledCount: disabled.length,
            dids: disabled.map(d => ({ phone: d.phoneNumber, answerRate: d.answerRate, calls: d.totalCalls })),
          },
        });
      }
      return { disabled, count: disabled.length };
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
      maxConcurrentCalls: z.number().min(1).max(200).optional(),
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
      maxConcurrentCalls: z.number().min(1).max(200).optional(),
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
    // Best Time to Call — analyze historical answer rates by hour and area code
    bestTimeToCall: protectedProcedure.input(z.object({
      days: z.number().min(7).max(90).default(30),
    }).optional()).query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const dbInst = await (await import("./db")).getDb();
      if (!dbInst) return { byHour: [], byAreaCode: [], recommendations: [] };
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      // Answer rate by hour of day (local server time)
      const byHour = await dbInst.select({
        hour: sql<number>`HOUR(FROM_UNIXTIME(${callLogs.startedAt} / 1000))`,
        total: count(),
        answered: sql<number>`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${callLogs.duration} > 0 THEN ${callLogs.duration} END), 0)`,
      }).from(callLogs)
        .where(sql`${callLogs.startedAt} >= ${cutoff}`)
        .groupBy(sql`HOUR(FROM_UNIXTIME(${callLogs.startedAt} / 1000))`)
        .orderBy(sql`HOUR(FROM_UNIXTIME(${callLogs.startedAt} / 1000))`);
      const hourData = byHour.map(r => ({
        hour: Number(r.hour),
        total: Number(r.total),
        answered: Number(r.answered),
        answerRate: r.total ? Math.round((Number(r.answered) / Number(r.total)) * 100) : 0,
        avgDuration: Math.round(Number(r.avgDuration)),
      }));
      // Answer rate by area code (first 3 digits of phone)
      const byAreaCode = await dbInst.select({
        areaCode: sql<string>`SUBSTRING(${callLogs.phoneNumber}, 1, 3)`,
        total: count(),
        answered: sql<number>`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${callLogs.duration} > 0 THEN ${callLogs.duration} END), 0)`,
      }).from(callLogs)
        .where(sql`${callLogs.startedAt} >= ${cutoff}`)
        .groupBy(sql`SUBSTRING(${callLogs.phoneNumber}, 1, 3)`)
        .having(sql`COUNT(*) >= 5`)
        .orderBy(sql`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END) / COUNT(*) DESC`)
        .limit(20);
      const areaCodeData = byAreaCode.map(r => ({
        areaCode: r.areaCode,
        total: Number(r.total),
        answered: Number(r.answered),
        answerRate: r.total ? Math.round((Number(r.answered) / Number(r.total)) * 100) : 0,
        avgDuration: Math.round(Number(r.avgDuration)),
      }));
      // Best time by area code (top 3 area codes x best hour)
      const bestByAreaHour = await dbInst.select({
        areaCode: sql<string>`SUBSTRING(${callLogs.phoneNumber}, 1, 3)`,
        hour: sql<number>`HOUR(FROM_UNIXTIME(${callLogs.startedAt} / 1000))`,
        total: count(),
        answered: sql<number>`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END)`,
      }).from(callLogs)
        .where(sql`${callLogs.startedAt} >= ${cutoff}`)
        .groupBy(sql`SUBSTRING(${callLogs.phoneNumber}, 1, 3)`, sql`HOUR(FROM_UNIXTIME(${callLogs.startedAt} / 1000))`)
        .having(sql`COUNT(*) >= 3`)
        .orderBy(sql`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END) / COUNT(*) DESC`)
        .limit(30);
      // Generate recommendations
      const recommendations: { areaCode: string; bestHour: number; answerRate: number; sampleSize: number }[] = [];
      const seenAreas = new Set<string>();
      for (const r of bestByAreaHour) {
        if (seenAreas.has(r.areaCode)) continue;
        seenAreas.add(r.areaCode);
        const rate = Number(r.total) > 0 ? Math.round((Number(r.answered) / Number(r.total)) * 100) : 0;
        if (rate > 0) {
          recommendations.push({ areaCode: r.areaCode, bestHour: Number(r.hour), answerRate: rate, sampleSize: Number(r.total) });
        }
        if (recommendations.length >= 15) break;
      }
      // Overall best hours (top 3)
      const topHours = [...hourData].sort((a, b) => b.answerRate - a.answerRate).slice(0, 3);
      return { byHour: hourData, byAreaCode: areaCodeData, recommendations, topHours };
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

      // Pre-validate audio URL is accessible before enqueuing
      try {
        const headResp = await fetch(audioFile.s3Url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
        if (!headResp.ok) {
          console.error(`[QuickTest] Audio URL validation failed: ${headResp.status} ${headResp.statusText} for ${audioFile.s3Url.substring(0, 80)}`);
          throw new TRPCError({ code: "BAD_REQUEST", message: `Audio file URL is not accessible (HTTP ${headResp.status}). The file may have been deleted or the storage service is temporarily unavailable. Try re-generating the audio.` });
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error(`[QuickTest] Audio URL pre-check failed:`, err.message);
        // Don't block on network errors — the PBX agent will retry
        console.warn(`[QuickTest] Proceeding despite pre-check failure (PBX agent has retry logic)`);
      }

      // Queue-based approach: enqueue the call for the PBX agent to pick up
      // The PBX agent polls /api/pbx/poll, originates via local AMI, and reports back
      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      const channel = await db.buildPjsipChannel(phoneNumber);
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
          if (details.error) {
            failureReason = details.error;
            // Add actionable guidance for common errors
            if (details.error.includes("Audio preparation failed")) {
              failureReason += ". This usually means the PBX server could not download the audio file. Check network connectivity and DNS on the PBX server.";
            }
          } else if (details.reason) {
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
          // Real-time granular state from PBX agent status updates
          currentState: (details.currentState as string) || null,
          stateUpdatedAt: (details.stateUpdatedAt as number) || null,
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
      const clientIp = ctx.req.ip || ctx.req.socket.remoteAddress || "unknown";
      const authRecord = await db.getLocalAuthByEmail(input.email);
      if (!authRecord) {
        db.createSecurityEvent({ eventType: "login_failed", ipAddress: clientIp, email: input.email, details: { reason: "unknown_email" } }).catch(() => {});
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(input.password, authRecord.passwordHash);
      if (!valid) {
        db.createSecurityEvent({ eventType: "login_failed", ipAddress: clientIp, email: input.email, details: { reason: "wrong_password" } }).catch(() => {});
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
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
      db.createSecurityEvent({ eventType: "login_success", ipAddress: clientIp, email: input.email, userId: user.id, details: { method: "email" } }).catch(() => {});
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
        { key: "audio.edit", label: "Edit Audio Files", category: "Audio" },
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
      callbackNumber: z.string().max(20).nullable().optional(),
      segments: z.array(z.object({
        id: z.string().optional().default("seg-0"),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
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
      // Auto pre-generate static TTS segments (fire-and-forget)
      const { preGenerateStaticSegments } = await import("./services/script-audio");
      preGenerateStaticSegments({ segments: input.segments as ScriptSegment[] }).then(async (preGenResult) => {
        if (preGenResult.generated > 0) {
          // Update segments with pre-generated URLs
          const MERGE_FIELD_REGEX = /\{\{[^}]+\}\}/;
          const updatedSegments = [...(input.segments as ScriptSegment[])];
          for (let i = 0; i < updatedSegments.length; i++) {
            const seg = updatedSegments[i];
            if (seg.type !== "tts" || !seg.text) continue;
            if (MERGE_FIELD_REGEX.test(seg.text)) {
              updatedSegments[i] = { ...seg, isDynamic: true };
            } else {
              updatedSegments[i] = { ...seg, isDynamic: false };
            }
          }
          // Re-run preGenerate to get URLs stored on the script
          const script = await db.getCallScript(result.id);
          if (script) {
            const segs = script.segments as ScriptSegment[];
            const finalSegments = [...segs];
            for (let i = 0; i < finalSegments.length; i++) {
              const seg = finalSegments[i];
              if (seg.type !== "tts" || !seg.text) continue;
              if (MERGE_FIELD_REGEX.test(seg.text)) {
                finalSegments[i] = { ...seg, isDynamic: true };
              } else {
                finalSegments[i] = { ...seg, isDynamic: false };
              }
            }
            await db.updateCallScript(result.id, { segments: finalSegments as any });
          }
          console.log(`[Script AutoPreGen] Script ${result.id}: ${preGenResult.generated} segments pre-generated`);
        }
      }).catch(err => console.error(`[Script AutoPreGen] Failed for script ${result.id}:`, err));
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
      callbackNumber: z.string().max(20).nullable().optional(),
      segments: z.array(z.object({
        id: z.string().optional().default("seg-0"),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
        audioFileId: z.number().optional(),
        audioName: z.string().optional(),
        audioUrl: z.string().optional(),
      })).min(1).max(20).optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Normalize empty callback number to null
      if (data.callbackNumber !== undefined) {
        data.callbackNumber = data.callbackNumber?.trim() || null;
      }
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
      // Auto pre-generate static TTS segments on update (fire-and-forget)
      if (data.segments) {
        const { preGenerateStaticSegments } = await import("./services/script-audio");
        const MERGE_FIELD_REGEX = /\{\{[^}]+\}\}/;
        preGenerateStaticSegments({ segments: data.segments as ScriptSegment[] }).then(async (preGenResult) => {
          if (preGenResult.generated > 0) {
            const script = await db.getCallScript(id);
            if (script) {
              const segs = script.segments as ScriptSegment[];
              const finalSegments = [...segs];
              for (let i = 0; i < finalSegments.length; i++) {
                const seg = finalSegments[i];
                if (seg.type !== "tts" || !seg.text) continue;
                finalSegments[i] = { ...seg, isDynamic: MERGE_FIELD_REGEX.test(seg.text) };
              }
              await db.updateCallScript(id, { segments: finalSegments as any });
            }
            console.log(`[Script AutoPreGen] Script ${id} updated: ${preGenResult.generated} segments pre-generated`);
          }
        }).catch(err => console.error(`[Script AutoPreGen] Failed for script ${id}:`, err));
      }
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
        id: z.string().optional().default("seg-0"),
        type: z.enum(["tts", "recorded"]),
        position: z.number(),
        text: z.string().optional(),
        voice: z.string().optional(),
        provider: z.enum(["openai", "google"]).optional(),
        speed: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
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

      // DEFINITIVE FIX: Return audio as base64 data URIs.
      // This eliminates ALL network dependencies for preview playback.
      // The browser plays data:audio/mpeg;base64,... directly — no fetch needed.
      const { storageFetchBytes, extractStorageKey } = await import("./storage");
      const { toBrowserAudioUrls } = await import("./services/audio-proxy");
      const { resolveStorageUrl } = await import("./storage");

      /**
       * Convert a storage URL to base64 data URI.
       * Uses multiple strategies to fetch the actual bytes:
       * 1. Extract storage key and use S3 SDK directly (most reliable)
       * 2. Fetch from the URL directly (works if URL is reachable from server)
       * 3. Fall back to proxy URL (last resort)
       */
      async function urlToBase64(url: string): Promise<string> {
        let buffer: Buffer | null = null;

        // Strategy 1: Extract storage key from URL and fetch bytes via S3 SDK
        const key = extractStorageKey(url);
        if (key) {
          buffer = await storageFetchBytes(key);
          if (buffer && buffer.length > 0) {
            console.log(`[Preview] Base64 via SDK for key: ${key} (${buffer.length} bytes)`);
          }
        }

        // Strategy 2: Direct HTTP fetch (works for local mode or if URL is reachable)
        if (!buffer) {
          try {
            const fetchUrl = resolveStorageUrl(url);
            const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
            if (resp.ok) {
              const fetchedBuf = Buffer.from(await resp.arrayBuffer());
              // Validate it's actually audio, not HTML (SPA fallback)
              const header = fetchedBuf.slice(0, 15).toString('utf-8').toLowerCase();
              if (header.includes('<!doctype') || header.includes('<html')) {
                console.error(`[Preview] HTTP fetch returned HTML instead of audio for: ${url.substring(0, 80)}`);
              } else {
                buffer = fetchedBuf;
                console.log(`[Preview] Base64 via HTTP fetch: ${url.substring(0, 80)} (${buffer.length} bytes)`);
              }
            } else {
              console.error(`[Preview] HTTP fetch returned ${resp.status} for: ${url.substring(0, 80)}`);
            }
          } catch (fetchErr: any) {
            console.error(`[Preview] HTTP fetch failed for: ${url.substring(0, 80)} — ${fetchErr.message}`);
          }
        }

        // Success: return base64 data URI
        if (buffer && buffer.length > 0) {
          // Detect mime type from content or URL
          const mime = url.includes(".wav") ? "audio/wav" 
            : url.includes(".webm") ? "audio/webm" 
            : url.includes(".ogg") ? "audio/ogg"
            : url.includes(".m4a") ? "audio/mp4"
            : "audio/mpeg";
          return `data:${mime};base64,${buffer.toString("base64")}`;
        }

        // Last resort: return the proxy URL (might work on some setups)
        console.error(`[Preview] ALL strategies failed for: ${url.substring(0, 100)}`);
        const proxyUrls = toBrowserAudioUrls([url]);
        return proxyUrls[0];
      }

      const dataUris: string[] = [];
      for (const url of result.audioUrls) {
        try {
          dataUris.push(await urlToBase64(url));
        } catch (err: any) {
          console.error(`[Preview] Failed to convert audio to base64: ${err.message}`);
          const proxyUrls = toBrowserAudioUrls([url]);
          dataUris.push(proxyUrls[0]);
        }
      }

      // Also convert the combined URL to base64 if available
      let combinedDataUri: string | null = null;
      if (result.combinedUrl) {
        try {
          combinedDataUri = await urlToBase64(result.combinedUrl);
          // If it fell back to a proxy URL (not data:), set to null
          if (combinedDataUri && !combinedDataUri.startsWith("data:")) {
            combinedDataUri = null;
          }
        } catch (err: any) {
          console.error(`[Preview] Failed to convert combined audio: ${err.message}`);
        }
      }

      return {
        ...result,
        audioUrls: dataUris,
        combinedUrl: combinedDataUri,
      };
    }),
    // Voice Test — generates a short sample and returns base64 for instant playback
    voiceTest: protectedProcedure.input(z.object({
      voice: z.string(),
      provider: z.enum(["openai", "google"]).optional(),
      speed: z.number().min(0.25).max(4.0).optional().default(1.0),
    })).mutation(async ({ input }) => {
      const inferredProvider = input.voice.startsWith("en-") ? "google" : "openai";
      const provider = input.provider || inferredProvider;
      const result = provider === "google"
        ? await generateGoogleVoiceSample(input.voice as GoogleTTSVoice, input.speed)
        : await generateVoiceSample(input.voice as any, input.speed);

      // Fetch the generated audio bytes and return as base64 data URI
      const { storageFetchBytes, extractStorageKey } = await import("./storage");
      const key = extractStorageKey(result.url);
      let buffer: Buffer | null = null;
      if (key) {
        buffer = await storageFetchBytes(key);
      }
      if (!buffer) {
        // Fallback: fetch from URL directly
        try {
          const resp = await fetch(result.url, { signal: AbortSignal.timeout(10000) });
          if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
        } catch (e) { /* ignore */ }
      }
      if (buffer && buffer.length > 0) {
        return { audioDataUri: `data:audio/mpeg;base64,${buffer.toString("base64")}` };
      }
      // Last resort: return the URL (may not work on all setups)
      return { audioDataUri: result.url };
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
          id: z.string().optional().default("seg-0"),
          type: z.enum(["tts", "recorded"]),
          position: z.number(),
          text: z.string().optional(),
          voice: z.string().optional(),
          provider: z.enum(["openai", "google"]).optional(),
          speed: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
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
    // Pre-generate static TTS segments (segments without merge fields)
    preGenerate: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const script = await db.getCallScript(input.id);
      if (!script) throw new TRPCError({ code: "NOT_FOUND" });
      const segments = script.segments as ScriptSegment[];
      const MERGE_FIELD_REGEX = /\{\{[^}]+\}\}/;
      let generated = 0;
      let skipped = 0;
      const updatedSegments = [...segments];
      for (let i = 0; i < updatedSegments.length; i++) {
        const seg = updatedSegments[i];
        if (seg.type !== "tts" || !seg.text) { skipped++; continue; }
        const hasMergeFields = MERGE_FIELD_REGEX.test(seg.text);
        if (hasMergeFields) {
          // Mark as dynamic - needs real-time TTS at dial time
          updatedSegments[i] = { ...seg, isDynamic: true, preGeneratedUrl: undefined, preGeneratedKey: undefined };
          skipped++;
          continue;
        }
        // Static segment - pre-generate TTS audio
        try {
          const provider = seg.provider || (GOOGLE_VOICES.includes(seg.voice as any) ? "google" : "openai");
          const speed = seg.speed ? parseFloat(seg.speed) : 1.0;
          const result = provider === "google"
            ? await generateGoogleTTS({ text: seg.text, voice: seg.voice as GoogleTTSVoice, name: `script-${script.id}-seg-${seg.id}`, speed })
            : await generateTTS({ text: seg.text, voice: seg.voice as any, name: `script-${script.id}-seg-${seg.id}`, speed });
          updatedSegments[i] = { ...seg, isDynamic: false, preGeneratedUrl: result.s3Url, preGeneratedKey: result.s3Key };
          generated++;
        } catch (err) {
          console.error(`[Script PreGen] Failed segment ${seg.id}:`, err);
          skipped++;
        }
      }
      await db.updateCallScript(input.id, { segments: updatedSegments as any });
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.preGenerate", resource: "callScript", resourceId: input.id, details: { generated, skipped } });
      return { success: true, generated, skipped, total: segments.length };
    }),
    // ─── Script Library / Templates ──────────────────────────────────────
    libraryTemplates: publicProcedure.query(async () => {
      return [
        {
          id: "collections-past-due",
          name: "Past Due Account Reminder",
          industry: "collections",
          description: "Polite reminder about a past-due balance with callback option.",
          tone: "professional",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is an important message regarding your account.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Our records show a balance that requires your attention. We would like to help you resolve this matter.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "Please call us back at {{callback_number}} at your earliest convenience. Thank you and have a good day.", voice: "nova", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "collections-payment-plan",
          name: "Payment Plan Offer",
          industry: "collections",
          description: "Offer flexible payment arrangements for outstanding balances.",
          tone: "empathetic",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is a courtesy call about your account.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "We understand that circumstances can be challenging. We are reaching out to offer flexible payment options that may work for your situation.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To discuss your options, please call us at {{callback_number}}. We are here to help.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "healthcare-appointment",
          name: "Appointment Reminder",
          industry: "healthcare",
          description: "Remind patients about upcoming appointments with rescheduling option.",
          tone: "friendly",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is a friendly reminder from your healthcare provider.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "You have an upcoming appointment scheduled. Please remember to arrive 15 minutes early and bring your insurance card.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "If you need to reschedule, please call us at {{callback_number}}. We look forward to seeing you.", voice: "nova", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "healthcare-followup",
          name: "Post-Visit Follow-Up",
          industry: "healthcare",
          description: "Check in with patients after their visit and remind about prescriptions.",
          tone: "empathetic",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is a follow-up call from your healthcare provider.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "We hope you are feeling well after your recent visit. Please remember to take any prescribed medications as directed.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "If you have any questions or concerns, please do not hesitate to call us at {{callback_number}}. Take care.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "political-gotv",
          name: "Get Out The Vote",
          industry: "political",
          description: "Encourage voters to get to the polls on election day.",
          tone: "urgent",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is an important message about the upcoming election.", voice: "onyx", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Election day is approaching and your vote matters. Make sure you know your polling location and have a plan to vote.", voice: "onyx", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "For information about your polling place or to request a ride to the polls, call {{callback_number}}. Every vote counts.", voice: "onyx", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "political-survey",
          name: "Voter Opinion Survey",
          industry: "political",
          description: "Brief survey to gauge voter sentiment on key issues.",
          tone: "professional",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, we are conducting a brief community survey and would value your opinion.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Your feedback helps shape the priorities for our community. This will only take a moment of your time.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To participate in this short survey, please call us back at {{callback_number}}. Thank you for your time.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "real-estate-listing",
          name: "New Listing Announcement",
          industry: "real_estate",
          description: "Notify potential buyers about a new property listing.",
          tone: "friendly",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is an exciting update from your real estate agent.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "A new property has just been listed that matches your preferences. This home won't last long in today's market.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To schedule a private showing or learn more details, call me at {{callback_number}}. I look forward to hearing from you.", voice: "nova", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "insurance-renewal",
          name: "Policy Renewal Reminder",
          industry: "insurance",
          description: "Remind policyholders about upcoming renewal and potential savings.",
          tone: "professional",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is an important notice about your insurance policy.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Your policy is coming up for renewal. We may have new options that could save you money while maintaining your coverage.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To review your renewal options, please call us at {{callback_number}} before your policy expires. Thank you.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "nonprofit-donation",
          name: "Donation Drive Appeal",
          industry: "nonprofit",
          description: "Appeal for donations during a fundraising campaign.",
          tone: "empathetic",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, thank you for being a valued supporter of our organization.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Your past generosity has made a real difference. Right now, we have an opportunity to double our impact with a matching gift campaign.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To make a contribution or learn more, please call {{callback_number}}. Every dollar counts. Thank you.", voice: "shimmer", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "education-enrollment",
          name: "Enrollment Deadline Reminder",
          industry: "education",
          description: "Remind prospective students about enrollment deadlines.",
          tone: "friendly",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is a reminder from the admissions office.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "The enrollment deadline is approaching. Don't miss your chance to secure your spot for the upcoming semester.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "If you have questions about the enrollment process or need assistance, call us at {{callback_number}}. We are here to help.", voice: "nova", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "automotive-service",
          name: "Service Appointment Reminder",
          industry: "automotive",
          description: "Remind customers about scheduled vehicle service appointments.",
          tone: "professional",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, this is a reminder from your auto service center.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Your vehicle is due for scheduled maintenance. Regular service helps keep your car running safely and efficiently.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To schedule your appointment or ask about current service specials, call us at {{callback_number}}. Thank you.", voice: "alloy", provider: "openai" as const, speed: "1.0" },
          ],
        },
        {
          id: "general-event",
          name: "Event Invitation",
          industry: "general",
          description: "Invite contacts to an upcoming event or webinar.",
          tone: "friendly",
          segments: [
            { id: "1", type: "tts" as const, position: 0, text: "Hello {{first_name}}, you are invited to a special upcoming event.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "2", type: "tts" as const, position: 1, text: "Join us for an exclusive gathering where you will learn about exciting new opportunities. Space is limited so act fast.", voice: "nova", provider: "openai" as const, speed: "1.0" },
            { id: "3", type: "tts" as const, position: 2, text: "To reserve your spot or get more details, call {{callback_number}} today. We hope to see you there.", voice: "nova", provider: "openai" as const, speed: "1.0" },
          ],
        },
      ];
    }),
    // ─── AI Script Writer ──────────────────────────────────────────────
    aiGenerate: protectedProcedure.input(z.object({
      prompt: z.string().min(5).max(1000),
      industry: z.enum(["general", "collections", "healthcare", "political", "real_estate", "insurance", "automotive", "telecom", "nonprofit", "education", "legal", "retail"]).default("general"),
      tone: z.enum(["professional", "friendly", "urgent", "empathetic", "authoritative", "casual"]).default("professional"),
      segmentCount: z.number().min(1).max(10).default(3),
      includeCallbackNumber: z.boolean().default(false),
      includePersonalization: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const systemPrompt = `You are an expert call script writer for outbound voice broadcast campaigns. Generate call scripts that sound natural when read by text-to-speech.

Rules:
- Write conversational, natural-sounding text optimized for TTS playback
- Keep each segment concise (1-3 sentences, under 200 characters each)
- Use short sentences and simple words for clarity over the phone
- Avoid abbreviations, special characters, or complex punctuation
- ${input.includePersonalization ? 'Include merge fields like {{first_name}}, {{last_name}}, {{company_name}}, {{callback_number}} where appropriate' : 'Do NOT use any merge fields or personalization variables'}
- ${input.includeCallbackNumber ? 'Include a segment that mentions the callback number using {{callback_number}}' : 'Do not reference a callback number'}
- Industry context: ${input.industry}
- Tone: ${input.tone}
- Generate exactly ${input.segmentCount} segments

Respond with a JSON object matching this exact schema.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a call script for: ${input.prompt}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "call_script",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "A short descriptive name for the script" },
                description: { type: "string", description: "Brief description of the script purpose" },
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "The TTS text for this segment" },
                      voice_suggestion: { type: "string", description: "Suggested voice: alloy, echo, fable, onyx, nova, or shimmer" },
                    },
                    required: ["text", "voice_suggestion"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["name", "description", "segments"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI generation failed - no response" });

      try {
        const parsed = JSON.parse(content);
        // Convert to ScriptSegment format
        const segments = (parsed.segments || []).map((seg: any, i: number) => ({
          id: crypto.randomUUID(),
          type: "tts" as const,
          position: i,
          text: seg.text,
          voice: seg.voice_suggestion || "alloy",
          provider: "openai" as const,
          speed: "1.0",
        }));

        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "script.aiGenerate", resource: "callScript", details: { prompt: input.prompt, industry: input.industry, tone: input.tone, segmentCount: segments.length } });

        return {
          name: parsed.name || "AI Generated Script",
          description: parsed.description || input.prompt,
          segments,
        };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse AI response" });
      }
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
        maxCalls: z.number().int().min(1).max(200).default(5),
        cpsLimit: z.number().int().min(1).max(20).default(1),
        cpsPacingMs: z.number().int().min(100).max(3000).default(1000),
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
        maxCalls: z.number().int().min(1).max(200),
      }))
      .mutation(async ({ input }) => {
        await db.updatePbxAgentMaxCalls(input.agentId, input.maxCalls);
        return { success: true };
      }),

    updateAgentCps: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        cpsLimit: z.number().int().min(1).max(20),
      }))
      .mutation(async ({ input }) => {
        await db.updatePbxAgentCps(input.agentId, input.cpsLimit);
        return { success: true };
      }),

    updateAgentCpsPacing: protectedProcedure
      .input(z.object({
        agentId: z.string(),
        cpsPacingMs: z.number().int().min(100).max(3000),
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
      const openaiKey = await db.getAppSetting("openai_api_key");
      const googleKey = await db.getAppSetting("google_tts_api_key");
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
  inboundFilter: inboundFilterRouter,
  updater: updaterRouter,
  voicemailCreator: voicemailCreatorRouter,
  debtCollection: debtCollectionRouter,

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

      // Step 5: API Keys configured (at least OpenAI or Google TTS) — check database only
      const hasOpenAI = !!(await db.getAppSetting("openai_api_key"));
      const hasGoogleTTS = !!(await db.getAppSetting("google_tts_api_key"));
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
      // Use the web app's origin (from the request) for the installer URL, NOT the FreePBX host
      const reqOrigin = ctx.req.headers.origin || ctx.req.headers.referer?.replace(/\/+$/, "") || `https://${ctx.req.headers.host}`;
      const appOrigin = reqOrigin.replace(/\/+$/, "");
      // Get the PBX agent's API key for the installer endpoint authentication
      const { pbxAgents } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const dbInst = await db.getDb();
      let agentApiKey = "";
      if (dbInst) {
        const agents = await dbInst.select().from(pbxAgents).orderBy(desc(pbxAgents.lastHeartbeat)).limit(1);
        agentApiKey = agents[0]?.apiKey || "";
      }
      if (!agentApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No PBX agent found. Please set up a PBX agent first." });
      }
      return new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => { conn.end(); resolve({ success: false, error: "SSH timeout (60s)" }); }, 60000);
        conn.on("ready", () => {
          // Stop the agent, download installer from the web app's /api/pbx/install endpoint with API key, then run it
          const installerUrl = `${appOrigin}/api/pbx/install?key=${encodeURIComponent(agentApiKey)}`;
          const cmd = `cd /opt/pbx-agent && systemctl stop pbx-agent 2>/dev/null; curl -sL "${installerUrl}" -o /tmp/pbx-update.sh 2>/dev/null; bash /tmp/pbx-update.sh 2>&1 || (systemctl restart pbx-agent 2>&1); echo "UPDATE_DONE"`;
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

  // ─── Database Backups ──────────────────────────────────────────────────
  backups: router({
    list: adminProcedure.query(async () => {
      return db.getDatabaseBackups();
    }),

    create: adminProcedure.mutation(async ({ ctx }) => {
      // Create a backup record
      const backup = await db.createDatabaseBackup({
        fileName: `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
        fileKey: "",
        startedAt: Date.now(),
        type: "manual",
        createdBy: ctx.user.id,
      });
      if (!backup) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create backup record" });

      // Run the backup in the background
      (async () => {
        try {
          const dbUrl = process.env.DATABASE_URL || "";
          // Parse DATABASE_URL to get connection details
          const url = new URL(dbUrl);
          const host = url.hostname;
          const port = url.port || "3306";
          const user = url.username;
          const password = url.password;
          const database = url.pathname.slice(1).split("?")[0];

          // Use mysqldump to create backup
          const { execSync } = await import("child_process");
          const dumpFile = `/tmp/backup-${backup.id}.sql`;
          const cmd = `mysqldump --ssl-mode=REQUIRED -h ${host} -P ${port} -u ${user} -p'${password}' ${database} --single-transaction --routines --triggers > ${dumpFile} 2>/dev/null`;
          execSync(cmd, { timeout: 120000 });

          // Read the dump file and upload to S3
          const fs = await import("fs");
          const fileBuffer = fs.readFileSync(dumpFile);
          const fileSize = fileBuffer.length;

          // Count tables and rows from dump
          const dumpContent = fileBuffer.toString("utf-8").substring(0, 50000);
          const tableMatches = dumpContent.match(/CREATE TABLE/g);
          const tablesIncluded = tableMatches ? tableMatches.length : 0;

          // Upload to S3
          const { storagePut } = await import("./storage");
          const fileKey = `backups/db-backup-${backup.id}-${Date.now()}.sql`;
          const { url: fileUrl } = await storagePut(fileKey, fileBuffer, "application/sql");

          // Clean up temp file
          fs.unlinkSync(dumpFile);

          // Update backup record
          await db.updateDatabaseBackup(backup.id, {
            status: "completed",
            fileKey,
            fileUrl,
            fileSizeBytes: fileSize,
            tablesIncluded,
            completedAt: Date.now(),
          });

          await db.createAuditLog({
            userId: ctx.user.id,
            userName: ctx.user.name || undefined,
            action: "backup.create",
            resource: "system",
            details: { backupId: backup.id, fileSize, tablesIncluded },
          });
        } catch (err: any) {
          console.error("[Backup] Failed:", err.message);
          await db.updateDatabaseBackup(backup.id, {
            status: "failed",
            errorMessage: err.message,
            completedAt: Date.now(),
          });
        }
      })();

      return { id: backup.id, status: "running" };
    }),

    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const backup = await db.getDatabaseBackup(input.id);
      if (!backup) throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
      await db.deleteDatabaseBackup(input.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "backup.delete",
        resource: "system",
        details: { backupId: input.id, fileName: backup.fileName },
      });
      return { success: true };
    }),

    download: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const backup = await db.getDatabaseBackup(input.id);
      if (!backup) throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found" });
      if (!backup.fileUrl) throw new TRPCError({ code: "NOT_FOUND", message: "Backup file not available" });
      return { url: backup.fileUrl, fileName: backup.fileName };
    }),
  }),

  // ─── License Keys ────────────────────────────────────────────────────────
  licenses: router({
    list: adminProcedure.query(async () => {
      return db.getLicenseKeys();
    }),

    create: adminProcedure.input(z.object({
      clientName: z.string().min(1).max(255),
      clientEmail: z.string().email().optional(),
      maxDids: z.number().min(1).max(1000).default(10),
      maxConcurrentCalls: z.number().min(1).max(500).default(5),
      maxAgents: z.number().min(1).max(100).default(3),
      features: z.array(z.string()).optional(),
      expiresAt: z.number().optional(), // UTC timestamp ms
      deploymentId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Generate a unique license key
      const crypto = await import("crypto");
      const keyParts = [
        crypto.randomBytes(4).toString("hex").toUpperCase(),
        crypto.randomBytes(4).toString("hex").toUpperCase(),
        crypto.randomBytes(4).toString("hex").toUpperCase(),
        crypto.randomBytes(4).toString("hex").toUpperCase(),
      ];
      const licenseKey = keyParts.join("-");

      const result = await db.createLicenseKey({
        licenseKey,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        maxDids: input.maxDids,
        maxConcurrentCalls: input.maxConcurrentCalls,
        maxAgents: input.maxAgents,
        features: input.features || ["broadcast", "tts", "ivr"],
        expiresAt: input.expiresAt,
        deploymentId: input.deploymentId,
        notes: input.notes,
        createdBy: ctx.user.id,
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "license.create",
        resource: "system",
        details: { clientName: input.clientName, licenseKey },
      });

      return { id: result?.id, licenseKey };
    }),

    update: adminProcedure.input(z.object({
      id: z.number(),
      clientName: z.string().min(1).max(255).optional(),
      clientEmail: z.string().email().optional(),
      maxDids: z.number().min(1).max(1000).optional(),
      maxConcurrentCalls: z.number().min(1).max(500).optional(),
      maxAgents: z.number().min(1).max(100).optional(),
      features: z.array(z.string()).optional(),
      status: z.enum(["active", "suspended", "expired", "revoked"]).optional(),
      expiresAt: z.number().optional(),
      deploymentId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateLicenseKey(id, data);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "license.update",
        resource: "system",
        details: { licenseId: id, changes: Object.keys(data) },
      });
      return { success: true };
    }),

    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const key = await db.getLicenseKey(input.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND", message: "License key not found" });
      await db.deleteLicenseKey(input.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "license.delete",
        resource: "system",
        details: { licenseId: input.id, clientName: key.clientName },
      });
      return { success: true };
    }),

    /** Public endpoint for license validation (called by client installations) */
    validate: publicProcedure.input(z.object({
      licenseKey: z.string(),
    })).mutation(async ({ input }) => {
      const key = await db.getLicenseKeyByKey(input.licenseKey);
      if (!key) return { valid: false, error: "Invalid license key" };
      if (key.status === "revoked") return { valid: false, error: "License has been revoked" };
      if (key.status === "suspended") return { valid: false, error: "License is suspended" };
      if (key.status === "expired" || (key.expiresAt && key.expiresAt < Date.now())) {
        return { valid: false, error: "License has expired" };
      }
      // Update last validated timestamp
      await db.updateLicenseKey(key.id, { lastValidatedAt: Date.now(), activatedAt: key.activatedAt || Date.now() });
      return {
        valid: true,
        clientName: key.clientName,
        maxDids: key.maxDids,
        maxConcurrentCalls: key.maxConcurrentCalls,
        maxAgents: key.maxAgents,
        features: key.features,
        expiresAt: key.expiresAt,
      };
    }),
  }),

  // ─── Operator Panel ────────────────────────────────────────────────────────
  operatorPanel: router({
    /** Get real-time status of all PBX agents, active calls, and system metrics */
    liveStatus: protectedProcedure.query(async () => {
      const dbInst = await db.getDb();
      if (!dbInst) return { agents: [], activeCalls: [], metrics: { totalAgents: 0, onlineAgents: 0, totalActiveCalls: 0, callsLastMinute: 0, callsLastHour: 0 } };
      const { pbxAgents, callQueue } = await import("../drizzle/schema");
      const { eq, count, gte, and, desc, inArray } = await import("drizzle-orm");
      const now = Date.now();
      const HEARTBEAT_THRESHOLD = 60000;

      // Get all agents
      const agents = await dbInst.select().from(pbxAgents).orderBy(desc(pbxAgents.lastHeartbeat));

      // Get active calls (in_progress, dialing, claimed)
      const activeCalls = await dbInst.select().from(callQueue)
        .where(inArray(callQueue.status, ["in_progress", "dialing", "claimed", "pending"]))
        .orderBy(desc(callQueue.createdAt))
        .limit(200);

      // Metrics
      const oneMinAgo = now - 60000;
      const oneHourAgo = now - 3600000;
      const [minuteResult, hourResult] = await Promise.all([
        dbInst.select({ count: count() }).from(callQueue).where(gte(callQueue.createdAt, new Date(oneMinAgo))),
        dbInst.select({ count: count() }).from(callQueue).where(gte(callQueue.createdAt, new Date(oneHourAgo))),
      ]);

      const onlineAgents = agents.filter((a: any) => {
        if (!a.lastHeartbeat) return false;
        return now - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD;
      });

      const agentData = agents.map((a: any) => {
        const isOnline = a.lastHeartbeat ? (now - new Date(a.lastHeartbeat).getTime() < HEARTBEAT_THRESHOLD) : false;
        const caps = a.capabilities || {};
        const agentCalls = activeCalls.filter((c: any) => c.claimedBy === a.agentId);
        return {
          id: a.id,
          agentId: a.agentId,
          name: a.name || a.agentId,
          status: isOnline ? "online" : "offline",
          activeCalls: agentCalls.length,
          maxCalls: a.effectiveMaxCalls ?? a.maxCalls ?? 5,
          cpsLimit: a.cpsLimit ?? 3,
          cpsPacingMs: a.cpsPacingMs ?? 1000,
          ipAddress: a.ipAddress || null,
          lastHeartbeat: a.lastHeartbeat,
          voiceAiBridge: caps.voiceAiBridge ?? false,
          ariConnected: caps.ariConnected ?? false,
          agentVersion: caps.agentVersion || null,
          throttled: !!a.effectiveMaxCalls && a.effectiveMaxCalls < (a.maxCalls ?? 5),
          throttleReason: a.throttleReason || null,
          calls: agentCalls.map((c: any) => ({
            id: c.id,
            phoneNumber: c.phoneNumber,
            channel: c.channel,
            status: c.status,
            callerIdStr: c.callerIdStr,
            audioName: c.audioName,
            campaignId: c.campaignId,
            claimedAt: c.claimedAt,
            result: c.result,
          })),
        };
      });

      return {
        agents: agentData,
        activeCalls: activeCalls.map((c: any) => ({
          id: c.id,
          phoneNumber: c.phoneNumber,
          channel: c.channel,
          status: c.status,
          callerIdStr: c.callerIdStr,
          audioName: c.audioName,
          campaignId: c.campaignId,
          claimedBy: c.claimedBy,
          claimedAt: c.claimedAt,
          result: c.result,
          priority: c.priority,
        })),
        metrics: {
          totalAgents: agents.length,
          onlineAgents: onlineAgents.length,
          totalActiveCalls: activeCalls.filter((c: any) => ["in_progress", "dialing"].includes(c.status)).length,
          callsLastMinute: minuteResult[0]?.count ?? 0,
          callsLastHour: hourResult[0]?.count ?? 0,
        },
      };
    }),
    /** Hangup an active call remotely */
    hangupCall: adminProcedure.input(z.object({
      queueId: z.number(),
      channel: z.string().optional(),
      phoneNumber: z.string().optional(),
      targetAgentId: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { enqueueCommand } = await import("./services/call-control");
      const cmd = enqueueCommand({
        type: "hangup",
        queueId: input.queueId,
        channel: input.channel,
        phoneNumber: input.phoneNumber,
        targetAgentId: input.targetAgentId,
        issuedBy: ctx.user.name || ctx.user.openId,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        action: "call_hangup",
        resource: "call",
        resourceId: input.queueId,
        details: { phoneNumber: input.phoneNumber, channel: input.channel, commandId: cmd.id },
      });
      return { success: true, commandId: cmd.id };
    }),

    /** Transfer an active call to another extension */
    transferCall: adminProcedure.input(z.object({
      queueId: z.number(),
      channel: z.string().optional(),
      phoneNumber: z.string().optional(),
      transferExtension: z.string().min(1),
      targetAgentId: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { enqueueCommand } = await import("./services/call-control");
      const cmd = enqueueCommand({
        type: "transfer",
        queueId: input.queueId,
        channel: input.channel,
        phoneNumber: input.phoneNumber,
        transferExtension: input.transferExtension,
        targetAgentId: input.targetAgentId,
        issuedBy: ctx.user.name || ctx.user.openId,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        action: "call_transfer",
        resource: "call",
        resourceId: input.queueId,
        details: { phoneNumber: input.phoneNumber, transferExtension: input.transferExtension, commandId: cmd.id },
      });
      return { success: true, commandId: cmd.id };
    }),

    /** Park an active call */
    parkCall: adminProcedure.input(z.object({
      queueId: z.number(),
      channel: z.string().optional(),
      phoneNumber: z.string().optional(),
      parkSlot: z.string().optional(),
      targetAgentId: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { enqueueCommand } = await import("./services/call-control");
      const cmd = enqueueCommand({
        type: "park",
        queueId: input.queueId,
        channel: input.channel,
        phoneNumber: input.phoneNumber,
        parkSlot: input.parkSlot,
        targetAgentId: input.targetAgentId,
        issuedBy: ctx.user.name || ctx.user.openId,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        action: "call_park",
        resource: "call",
        resourceId: input.queueId,
        details: { phoneNumber: input.phoneNumber, parkSlot: input.parkSlot, commandId: cmd.id },
      });
      return { success: true, commandId: cmd.id };
    }),

    /** Get recent command history */
    commandHistory: protectedProcedure.query(async () => {
      const { getCommandHistory } = await import("./services/call-control");
      return getCommandHistory(50);
    }),

    /** Get SIP extension status from all PBX agents */
    extensionStatus: protectedProcedure.query(async () => {
      const { getExtensionStatus: getExtStatus } = await import("./services/pbx-api") as any;
      const agentData = getExtStatus();
      // Merge extensions from all agents (in case of multi-agent setups)
      const extensionMap = new Map<string, any>();
      for (const agent of agentData) {
        for (const ext of agent.extensions) {
          const existing = extensionMap.get(ext.ext);
          // If extension already seen from another agent, prefer the one with more info
          if (!existing || (ext.status !== "offline" && existing.status === "offline")) {
            extensionMap.set(ext.ext, { ...ext, agentId: agent.agentId, updatedAt: agent.updatedAt });
          }
        }
      }
      return {
        extensions: Array.from(extensionMap.values()).sort((a: any, b: any) => {
          const numA = parseInt(a.ext) || 0;
          const numB = parseInt(b.ext) || 0;
          return numA - numB;
        }),
        lastUpdate: agentData.length > 0 ? Math.max(...agentData.map((a: any) => a.updatedAt)) : null,
      };
    }),
  }),

  // ─── vTiger CRM Integration ──────────────────────────────────────────────
  vtiger: router({
    /** Check if vTiger is configured */
    status: protectedProcedure.query(async () => {
      const { isVtigerConfigured } = await import("./services/vtiger");
      const configured = isVtigerConfigured();
      return {
        configured,
        url: process.env.VTIGER_URL || "",
      };
    }),

    /** Lookup a contact/lead/account by phone number */
    lookupByPhone: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(1),
    })).query(async ({ input }) => {
      const { lookupByPhone, isVtigerConfigured } = await import("./services/vtiger");
      if (!isVtigerConfigured()) {
        return { configured: false, results: [], searchUrl: "" };
      }
      try {
        const results = await lookupByPhone(input.phoneNumber);
        return { configured: true, results, searchUrl: "" };
      } catch (err: any) {
        console.error("[vTiger] Lookup error:", err.message);
        return { configured: true, results: [], error: err.message, searchUrl: "" };
      }
    }),

    /** Get a direct URL to open vTiger search for a phone number (no API needed) */
    getSearchUrl: protectedProcedure.input(z.object({
      phoneNumber: z.string().min(1),
    })).query(async ({ input }) => {
      const { buildVtigerSearchUrl } = await import("./services/vtiger");
      return { url: buildVtigerSearchUrl(input.phoneNumber) };
    }),
  }),

  // ─── Setup Wizard ─────────────────────────────────────────────────────────
  setupWizard: router({
    /** Check if first-run setup is needed (no admin user or setup_complete flag not set) */
    isSetupNeeded: publicProcedure.query(async () => {
      const setupComplete = await db.getAppSetting("setup_wizard_complete");
      if (setupComplete === "true") return { needed: false, reason: "already_complete" };
      // Check if any admin user exists
      const dbInst = await db.getDb();
      if (!dbInst) return { needed: true, reason: "no_db" };
      const { users } = await import("../drizzle/schema");
      const { eq, count } = await import("drizzle-orm");
      const [result] = await dbInst.select({ count: count() }).from(users);
      if ((result?.count ?? 0) === 0) return { needed: true, reason: "no_users" };
      return { needed: true, reason: "not_completed" };
    }),

    /** Get current setup wizard progress */
    getProgress: protectedProcedure.query(async () => {
      const [brandingDone, freepbxDone, apiKeysDone, smtpDone, agentDone] = await Promise.all([
        db.getAppSetting("setup_wizard_branding_done"),
        db.getAppSetting("setup_wizard_freepbx_done"),
        db.getAppSetting("setup_wizard_apikeys_done"),
        db.getAppSetting("setup_wizard_smtp_done"),
        db.getAppSetting("setup_wizard_agent_done"),
      ]);
      return {
        branding: brandingDone === "true",
        freepbx: freepbxDone === "true",
        apiKeys: apiKeysDone === "true",
        smtp: smtpDone === "true",
        agent: agentDone === "true",
      };
    }),

    /** Save branding settings from wizard */
    saveBranding: adminProcedure.input(z.object({
      appName: z.string().min(1).max(100),
      tagline: z.string().max(200).optional(),
      primaryColor: z.string().max(20).optional(),
      accentColor: z.string().max(20).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertAppSetting("branding_app_name", input.appName, "Application name");
      if (input.tagline !== undefined) await db.upsertAppSetting("branding_tagline", input.tagline, "Application tagline");
      if (input.primaryColor) await db.upsertAppSetting("branding_primary_color", input.primaryColor, "Primary brand color");
      if (input.accentColor) await db.upsertAppSetting("branding_accent_color", input.accentColor, "Accent brand color");
      await db.upsertAppSetting("setup_wizard_branding_done", "true", "Setup wizard branding step completed");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.branding", resource: "appSettings", details: { appName: input.appName } });
      return { success: true };
    }),

    /** Save FreePBX settings from wizard */
    saveFreepbx: adminProcedure.input(z.object({
      host: z.string().min(1),
      amiUser: z.string().min(1),
      amiPassword: z.string().min(1),
      amiPort: z.coerce.number().int().min(1).max(65535).default(5038),
      sshUser: z.string().min(1),
      sshPassword: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertAppSetting("freepbx_host", input.host, "FreePBX server IP/hostname");
      await db.upsertAppSetting("freepbx_ami_user", input.amiUser, "FreePBX AMI username", 1);
      await db.upsertAppSetting("freepbx_ami_password", input.amiPassword, "FreePBX AMI password", 1);
      await db.upsertAppSetting("freepbx_ami_port", String(input.amiPort), "FreePBX AMI port");
      await db.upsertAppSetting("freepbx_ssh_user", input.sshUser, "FreePBX SSH username", 1);
      await db.upsertAppSetting("freepbx_ssh_password", input.sshPassword, "FreePBX SSH password", 1);
      await db.upsertAppSetting("setup_wizard_freepbx_done", "true", "Setup wizard FreePBX step completed");
      // Auto-reconnect AMI
      try {
        const { reconnectAMI } = await import("./services/ami");
        await reconnectAMI();
      } catch (e) { /* ignore */ }
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.freepbx", resource: "freepbx", details: { host: input.host } });
      return { success: true };
    }),

    /** Save API keys from wizard */
    saveApiKeys: adminProcedure.input(z.object({
      openaiKey: z.string().optional(),
      googleTtsKey: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (input.openaiKey) await db.upsertAppSetting("openai_api_key", input.openaiKey, "OpenAI API Key", 1);
      if (input.googleTtsKey) await db.upsertAppSetting("google_tts_api_key", input.googleTtsKey, "Google TTS API Key", 1);
      await db.upsertAppSetting("setup_wizard_apikeys_done", "true", "Setup wizard API keys step completed");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.apiKeys", resource: "appSettings", details: { hasOpenAI: !!input.openaiKey, hasGoogle: !!input.googleTtsKey } });
      return { success: true };
    }),

    /** Save SMTP settings from wizard */
    saveSmtp: adminProcedure.input(z.object({
      host: z.string().min(1),
      port: z.coerce.number().int().min(1).max(65535).default(587),
      secure: z.boolean().default(false),
      user: z.string().min(1),
      pass: z.string().min(1),
      fromEmail: z.string().email(),
      fromName: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await db.upsertAppSetting("smtp_host", input.host, "SMTP server host");
      await db.upsertAppSetting("smtp_port", String(input.port), "SMTP server port");
      await db.upsertAppSetting("smtp_secure", input.secure ? "true" : "false", "SMTP use TLS");
      await db.upsertAppSetting("smtp_user", input.user, "SMTP username", 1);
      await db.upsertAppSetting("smtp_pass", input.pass, "SMTP password", 1);
      await db.upsertAppSetting("smtp_from_email", input.fromEmail, "SMTP from email");
      await db.upsertAppSetting("smtp_from_name", input.fromName, "SMTP from name");
      await db.upsertAppSetting("setup_wizard_smtp_done", "true", "Setup wizard SMTP step completed");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.smtp", resource: "appSettings", details: { host: input.host } });
      return { success: true };
    }),

    /** Mark PBX agent step as done */
    markAgentDone: adminProcedure.mutation(async ({ ctx }) => {
      await db.upsertAppSetting("setup_wizard_agent_done", "true", "Setup wizard PBX agent step completed");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.agentDone", resource: "appSettings", details: {} });
      return { success: true };
    }),

    /** Mark entire wizard as complete */
    complete: adminProcedure.mutation(async ({ ctx }) => {
      await db.upsertAppSetting("setup_wizard_complete", "true", "Setup wizard completed");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.complete", resource: "appSettings", details: {} });
      return { success: true };
    }),

    /** Skip the entire wizard */
    skip: adminProcedure.mutation(async ({ ctx }) => {
      await db.upsertAppSetting("setup_wizard_complete", "true", "Setup wizard skipped");
      await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.skip", resource: "appSettings", details: {} });
      return { success: true };
    }),

    /** Remote install PBX agent via SSH */
    remoteInstallAgent: adminProcedure.input(z.object({
      agentId: z.string(),
      origin: z.string().url(),
    })).mutation(async ({ ctx, input }) => {
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      if (!host || !sshUser || !sshPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SSH credentials not configured. Complete the FreePBX step first." });
      }
      const agent = await db.getPbxAgentByAgentId(input.agentId);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });

      const { Client: SSHClient } = await import("ssh2");
      const installUrl = `${input.origin}/api/pbx/install?key=${encodeURIComponent(agent.apiKey)}`;
      const installCmd = `curl -sSL "${installUrl}" | bash`;

      return new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => { conn.end(); resolve({ success: false, output: "", error: "SSH connection timed out after 90 seconds" }); }, 90000);

        conn.on("ready", () => {
          conn.exec(installCmd, (err, stream) => {
            if (err) { clearTimeout(timeout); conn.end(); resolve({ success: false, output: "", error: err.message }); return; }
            let output = "";
            stream.on("data", (data: Buffer) => { output += data.toString(); });
            stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
            stream.on("close", (code: number) => {
              clearTimeout(timeout);
              conn.end();
              const isSuccess = code === 0 || code === null || output.includes("PBX Agent installed") || output.includes("active (running)");
              resolve({ success: isSuccess, output: output.trim().slice(0, 5000), error: !isSuccess ? `Install exited with code ${code}` : undefined });
            });
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          let errorMsg = err.message;
          if (errorMsg.includes("Authentication")) errorMsg = "SSH authentication failed — check username/password";
          else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "SSH connection refused — check host and port";
          else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "SSH connection timed out — check host is reachable";
          resolve({ success: false, output: "", error: errorMsg });
        });

        conn.connect({ host, port: 22, username: sshUser, password: sshPassword, readyTimeout: 15000 });
      }).then(async (result) => {
        if (result.success) {
          await db.upsertAppSetting("setup_wizard_agent_done", "true", "Setup wizard PBX agent step completed");
        }
        await db.createAuditLog({ userId: ctx.user.id, userName: ctx.user.name || undefined, action: "setupWizard.remoteInstallAgent", resource: "pbx-agent", details: { success: result.success, agentId: input.agentId, host, error: result.error } });
        return result;
      });
    }),

    /** Run health check across all services */
    healthCheck: protectedProcedure.query(async () => {
      const checks: Array<{ name: string; status: "ok" | "warning" | "error" | "unconfigured"; message: string; fixUrl?: string }> = [];

      // 1. Database
      try {
        const dbInst = await db.getDb();
        if (dbInst) {
          checks.push({ name: "Database", status: "ok", message: "MySQL connected" });
        } else {
          checks.push({ name: "Database", status: "error", message: "Database not connected" });
        }
      } catch (e: any) {
        checks.push({ name: "Database", status: "error", message: e.message });
      }

      // 2. PBX Agent
      const agents = await db.getPbxAgents();
      if (agents.length === 0) {
        checks.push({ name: "PBX Agent", status: "unconfigured", message: "No PBX agent registered", fixUrl: "/freepbx" });
      } else {
        const online = agents.some((a: any) => a.lastHeartbeat && Date.now() - new Date(a.lastHeartbeat).getTime() < 60000);
        if (online) {
          checks.push({ name: "PBX Agent", status: "ok", message: `${agents.length} agent(s) registered, online` });
        } else {
          checks.push({ name: "PBX Agent", status: "warning", message: `${agents.length} agent(s) registered but offline`, fixUrl: "/freepbx" });
        }
      }

      // 3. FreePBX AMI
      const freepbxHost = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      if (!freepbxHost) {
        checks.push({ name: "FreePBX AMI", status: "unconfigured", message: "FreePBX host not configured", fixUrl: "/settings" });
      } else {
        try {
          const { getAMIStatus } = await import("./services/ami");
          const amiStatus = getAMIStatus();
          if (amiStatus.connected) {
            checks.push({ name: "FreePBX AMI", status: "ok", message: `Connected to ${freepbxHost}` });
          } else {
            checks.push({ name: "FreePBX AMI", status: "warning", message: `Not connected to ${freepbxHost}`, fixUrl: "/settings" });
          }
        } catch {
          checks.push({ name: "FreePBX AMI", status: "warning", message: "AMI service not available" });
        }
      }

      // 4. OpenAI API Key (database only)
      const openaiKey = await db.getAppSetting("openai_api_key");
      if (!openaiKey) {
        checks.push({ name: "OpenAI API", status: "unconfigured", message: "API key not set", fixUrl: "/settings" });
      } else {
        checks.push({ name: "OpenAI API", status: "ok", message: "API key configured" });
      }

      // 5. Google TTS API Key (database only)
      const googleKey = await db.getAppSetting("google_tts_api_key");
      if (!googleKey) {
        checks.push({ name: "Google TTS", status: "unconfigured", message: "API key not set (optional)", fixUrl: "/settings" });
      } else {
        checks.push({ name: "Google TTS", status: "ok", message: "API key configured" });
      }

      // 6. SMTP
      const smtpHost = await db.getAppSetting("smtp_host") || process.env.SMTP_HOST;
      if (!smtpHost) {
        checks.push({ name: "Email (SMTP)", status: "unconfigured", message: "Not configured (optional)", fixUrl: "/settings" });
      } else {
        checks.push({ name: "Email (SMTP)", status: "ok", message: `SMTP configured: ${smtpHost}` });
      }

      // 7. Caller IDs
      const callerIds = await db.getCallerIds();
      if (callerIds.length === 0) {
        checks.push({ name: "Caller IDs", status: "unconfigured", message: "No caller IDs imported", fixUrl: "/caller-ids" });
      } else {
        const active = callerIds.filter((c: any) => c.isActive).length;
        checks.push({ name: "Caller IDs", status: active > 0 ? "ok" : "warning", message: `${callerIds.length} DID(s), ${active} active`, fixUrl: "/caller-ids" });
      }

      const okCount = checks.filter(c => c.status === "ok").length;
      const errorCount = checks.filter(c => c.status === "error").length;
      const warningCount = checks.filter(c => c.status === "warning").length;

      return { checks, summary: { ok: okCount, error: errorCount, warning: warningCount, unconfigured: checks.filter(c => c.status === "unconfigured").length, total: checks.length } };
    }),

    /** Helper: run a command on the Docker host via SSH */
    // The app runs inside Docker, so host-level commands (ufw, fail2ban, systemctl)
    // must be executed via SSH to the host machine.
    // Uses the HOST_SSH_* settings (falls back to localhost with root).

    /** Server security status — checks UFW, fail2ban, SSH auth, SSL, auto-updates */
    securityStatus: adminProcedure.input(z.object({ origin: z.string().optional() }).optional()).query(async ({ input }) => {
      // Auto-detect domain from frontend origin if not explicitly configured
      const getEffectiveDomain = async () => {
        const explicit = process.env.DOMAIN || await db.getAppSetting("domain");
        if (explicit) return explicit;
        // Derive from frontend origin (e.g., "https://app26.407hosted.com" → "app26.407hosted.com")
        if (input?.origin) {
          try { return new URL(input.origin).hostname; } catch { /* ignore */ }
        }
        return null;
      };
      const hostIp = await db.getAppSetting("host_ssh_ip") || "172.17.0.1"; // Docker bridge gateway = host
      const hostUser = await db.getAppSetting("host_ssh_user") || "root";
      const hostPassword = await db.getAppSetting("host_ssh_password");

      const checks: Array<{
        name: string;
        status: "ok" | "warning" | "error" | "unconfigured";
        message: string;
        detail?: string;
      }> = [];

      // If no host SSH password is configured, we can't check host-level security
      if (!hostPassword) {
        // Return all checks as unconfigured with a helpful message
        const names = ["Firewall (UFW)", "Fail2Ban (SSH)", "SSH Auth Method", "Auto Security Updates", ".env File Security"];
        for (const name of names) {
          checks.push({
            name,
            status: "unconfigured",
            message: "Host SSH not configured",
            detail: "Host SSH not configured — use the configuration card above to enter your host server's SSH credentials. The app runs inside Docker and needs SSH access to check and fix host-level security.",
          });
        }
        // SSL check doesn't need SSH — probe HTTPS if domain is set
        const domain = await getEffectiveDomain();
        const appProtocol = process.env.APP_PROTOCOL || await db.getAppSetting("app_protocol");
        if (domain && appProtocol === "https") {
          checks.push({ name: "SSL/HTTPS", status: "ok", message: `HTTPS enabled for ${domain}`, detail: "Caddy auto-renews Let's Encrypt certificates" });
        } else if (domain) {
          // app_protocol not explicitly set — probe the domain to detect Caddy SSL
          try {
            const probeRes = await fetch(`https://${domain}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
            if (probeRes.ok || probeRes.status === 301 || probeRes.status === 302) {
              checks.push({ name: "SSL/HTTPS", status: "ok", message: `HTTPS active for ${domain}`, detail: "Caddy reverse proxy detected with valid SSL certificate" });
              // Persist so future checks skip the probe
              await db.upsertAppSetting("app_protocol", "https", "Auto-detected HTTPS via Caddy reverse proxy");
            } else {
              checks.push({ name: "SSL/HTTPS", status: "warning", message: `Domain ${domain} configured but HTTPS returned status ${probeRes.status}`, detail: "Ensure Caddy is running with ports 80/443 open" });
            }
          } catch {
            checks.push({ name: "SSL/HTTPS", status: "warning", message: `Domain ${domain} configured but HTTPS may not be active`, detail: "Ensure Caddy is running with ports 80/443 open and DNS points to this server" });
          }
        } else {
          checks.push({ name: "SSL/HTTPS", status: "unconfigured", message: "No domain configured — using HTTP only", detail: "Add a domain in setup to enable automatic HTTPS" });
        }

        const okCount = checks.filter(c => c.status === "ok").length;
        const warningCount = checks.filter(c => c.status === "warning").length;
        const errorCount = checks.filter(c => c.status === "error").length;
        const unconfiguredCount = checks.filter(c => c.status === "unconfigured").length;
        let grade: "A" | "B" | "C" | "D" | "F" = "F";
        return { checks, summary: { ok: okCount, warning: warningCount, error: errorCount, unconfigured: unconfiguredCount, total: checks.length, grade } };
      }

      // SSH helper to run a command on the host
      const { Client: SSHClient } = await import("ssh2");
      const runOnHost = (cmd: string, timeoutMs = 10000): Promise<{ stdout: string; error?: string }> => {
        return new Promise((resolve) => {
          const conn = new SSHClient();
          const timer = setTimeout(() => { conn.end(); resolve({ stdout: "", error: "SSH timeout" }); }, timeoutMs);
          conn.on("ready", () => {
            conn.exec(cmd, (err, stream) => {
              if (err) { clearTimeout(timer); conn.end(); resolve({ stdout: "", error: err.message }); return; }
              let stdout = "";
              let stderr = "";
              stream.on("data", (d: Buffer) => { stdout += d.toString(); });
              stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
              stream.on("close", () => { clearTimeout(timer); conn.end(); resolve({ stdout: stdout || stderr }); });
            });
          });
          conn.on("error", (err) => { clearTimeout(timer); resolve({ stdout: "", error: err.message }); });
          conn.connect({ host: hostIp, port: 22, username: hostUser, password: hostPassword, readyTimeout: 8000 });
        });
      };

      // 1. UFW Firewall
      try {
        const { stdout, error } = await runOnHost("ufw status 2>/dev/null || echo 'not_installed'");
        if (error) {
          checks.push({ name: "Firewall (UFW)", status: "unconfigured", message: `SSH error: ${error}` });
        } else if (stdout.includes("not_installed") || stdout.includes("command not found")) {
          checks.push({ name: "Firewall (UFW)", status: "error", message: "Not installed", detail: "Run: sudo apt install ufw && sudo ufw enable" });
        } else if (stdout.includes("Status: active")) {
          const ruleLines = stdout.split("\n").filter(l => l.match(/^\d|ALLOW|DENY|REJECT/));
          checks.push({ name: "Firewall (UFW)", status: "ok", message: `Active with ${ruleLines.length} rule(s)`, detail: stdout.trim() });
        } else {
          checks.push({ name: "Firewall (UFW)", status: "warning", message: "Installed but inactive", detail: "Run: sudo ufw enable" });
        }
      } catch {
        checks.push({ name: "Firewall (UFW)", status: "unconfigured", message: "Unable to check" });
      }

      // 2. Fail2Ban
      try {
        const { stdout, error } = await runOnHost("fail2ban-client status sshd 2>/dev/null || echo 'not_installed'");
        if (error) {
          checks.push({ name: "Fail2Ban (SSH)", status: "unconfigured", message: `SSH error: ${error}` });
        } else if (stdout.includes("not_installed") || stdout.includes("command not found") || stdout.includes("does not exist")) {
          checks.push({ name: "Fail2Ban (SSH)", status: "error", message: "Not installed or SSH jail not configured", detail: "Run: sudo apt install fail2ban" });
        } else {
          const bannedMatch = stdout.match(/Currently banned:\s*(\d+)/);
          const totalMatch = stdout.match(/Total banned:\s*(\d+)/);
          const banned = bannedMatch ? parseInt(bannedMatch[1]) : 0;
          const totalBanned = totalMatch ? parseInt(totalMatch[1]) : 0;
          checks.push({
            name: "Fail2Ban (SSH)",
            status: "ok",
            message: `Active — ${banned} currently banned, ${totalBanned} total blocked`,
            detail: stdout.trim(),
          });
        }
      } catch {
        checks.push({ name: "Fail2Ban (SSH)", status: "unconfigured", message: "Unable to check" });
      }

      // 3. SSH Password Authentication
      try {
        const { stdout, error } = await runOnHost("grep -E '^\\s*PasswordAuthentication' /etc/ssh/sshd_config 2>/dev/null || echo 'not_found'");
        if (error) {
          checks.push({ name: "SSH Auth Method", status: "unconfigured", message: `SSH error: ${error}` });
        } else if (stdout.includes("not_found")) {
          checks.push({ name: "SSH Auth Method", status: "warning", message: "Password auth enabled (default)", detail: "Consider switching to SSH key authentication for better security" });
        } else if (stdout.toLowerCase().includes("no")) {
          checks.push({ name: "SSH Auth Method", status: "ok", message: "Key-based authentication only", detail: "Password login is disabled — most secure configuration" });
        } else {
          checks.push({ name: "SSH Auth Method", status: "warning", message: "Password authentication enabled", detail: "Consider disabling password auth and using SSH keys instead" });
        }
      } catch {
        checks.push({ name: "SSH Auth Method", status: "unconfigured", message: "Unable to check SSH configuration" });
      }

      // 4. SSL/HTTPS (no SSH needed — probes HTTPS if domain is set)
      const domain = await getEffectiveDomain();
      const appProtocol = process.env.APP_PROTOCOL || await db.getAppSetting("app_protocol");
      if (domain && appProtocol === "https") {
        checks.push({ name: "SSL/HTTPS", status: "ok", message: `HTTPS enabled for ${domain}`, detail: "Caddy auto-renews Let's Encrypt certificates" });
      } else if (domain) {
        // app_protocol not explicitly set — probe the domain to detect Caddy SSL
        try {
          const probeRes = await fetch(`https://${domain}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          if (probeRes.ok || probeRes.status === 301 || probeRes.status === 302) {
            checks.push({ name: "SSL/HTTPS", status: "ok", message: `HTTPS active for ${domain}`, detail: "Caddy reverse proxy detected with valid SSL certificate" });
            // Persist so future checks skip the probe
            await db.upsertAppSetting("app_protocol", "https", "Auto-detected HTTPS via Caddy reverse proxy");
          } else {
            checks.push({ name: "SSL/HTTPS", status: "warning", message: `Domain ${domain} configured but HTTPS returned status ${probeRes.status}`, detail: "Ensure Caddy is running with ports 80/443 open" });
          }
        } catch {
          checks.push({ name: "SSL/HTTPS", status: "warning", message: `Domain ${domain} configured but HTTPS may not be active`, detail: "Ensure Caddy is running with ports 80/443 open and DNS points to this server" });
        }
      } else {
        checks.push({ name: "SSL/HTTPS", status: "unconfigured", message: "No domain configured — using HTTP only", detail: "Add a domain in setup to enable automatic HTTPS" });
      }

      // 5. Automatic Security Updates
      try {
        const { stdout, error } = await runOnHost("systemctl is-active unattended-upgrades 2>/dev/null || echo 'not_installed'");
        if (error) {
          checks.push({ name: "Auto Security Updates", status: "unconfigured", message: `SSH error: ${error}` });
        } else if (stdout.trim() === "active") {
          checks.push({ name: "Auto Security Updates", status: "ok", message: "Unattended-upgrades is active", detail: "OS security patches are applied automatically" });
        } else if (stdout.includes("not_installed") || stdout.includes("not-found")) {
          checks.push({ name: "Auto Security Updates", status: "error", message: "Not installed", detail: "Run: sudo apt install unattended-upgrades" });
        } else {
          checks.push({ name: "Auto Security Updates", status: "warning", message: `Service status: ${stdout.trim()}`, detail: "Run: sudo systemctl enable --now unattended-upgrades" });
        }
      } catch {
        checks.push({ name: "Auto Security Updates", status: "unconfigured", message: "Unable to check" });
      }

      // 6. .env File Permissions
      try {
        const { stdout, error } = await runOnHost("stat -c '%a' /opt/tts-dialer/.env 2>/dev/null || echo 'not_found'");
        if (error) {
          checks.push({ name: ".env File Security", status: "unconfigured", message: `SSH error: ${error}` });
        } else if (stdout.includes("not_found")) {
          checks.push({ name: ".env File Security", status: "unconfigured", message: "No .env file found at /opt/tts-dialer/.env" });
        } else {
          const perms = stdout.trim();
          if (perms === "600" || perms === "400") {
            checks.push({ name: ".env File Security", status: "ok", message: `Permissions: ${perms} (restricted)`, detail: "Only root can read the credentials file" });
          } else {
            checks.push({ name: ".env File Security", status: "warning", message: `Permissions: ${perms} (too open)`, detail: "Run: sudo chmod 600 /opt/tts-dialer/.env" });
          }
        }
      } catch {
        checks.push({ name: ".env File Security", status: "unconfigured", message: "Unable to check .env permissions" });
      }

      const okCount = checks.filter(c => c.status === "ok").length;
      const warningCount = checks.filter(c => c.status === "warning").length;
      const errorCount = checks.filter(c => c.status === "error").length;
      const unconfiguredCount = checks.filter(c => c.status === "unconfigured").length;

      let grade: "A" | "B" | "C" | "D" | "F";
      if (errorCount === 0 && warningCount === 0 && unconfiguredCount === 0) grade = "A";
      else if (errorCount === 0 && warningCount <= 2) grade = "B";
      else if (errorCount <= 1) grade = "C";
      else if (errorCount <= 2) grade = "D";
      else grade = "F";

      return {
        checks,
        summary: { ok: okCount, warning: warningCount, error: errorCount, unconfigured: unconfiguredCount, total: checks.length, grade },
      };
    }),

    /** Run a security fix command on the host server via SSH */
    runSecurityFix: adminProcedure
      .input(z.object({
        checkName: z.string(),
      }))
      .mutation(async ({ input }) => {
        const hostIp = await db.getAppSetting("host_ssh_ip") || "172.17.0.1";
        const hostUser = await db.getAppSetting("host_ssh_user") || "root";
        const hostPassword = await db.getAppSetting("host_ssh_password");

        if (!hostPassword) {
          return {
            success: false,
            output: "Host SSH credentials not configured. Go to Settings > Security and set the Host SSH password so the app can execute commands on the server.",
            description: "Host SSH access is required to run security fixes. The app runs inside Docker and needs SSH access to the host machine.",
          };
        }

        // Map check names to fix commands (no sudo needed — SSH connects as root)
        const fixCommands: Record<string, { cmd: string; description: string }> = {
          "Firewall (UFW)": {
            cmd: "ufw --force enable && ufw default deny incoming && ufw default allow outgoing && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 3000/tcp && echo 'UFW enabled and configured'",
            description: "Enable UFW firewall with default deny policy and allow SSH, HTTP, HTTPS, and app ports",
          },
          "Fail2Ban (SSH)": {
            cmd: "apt-get install -y fail2ban && systemctl enable fail2ban && systemctl start fail2ban && echo 'Fail2Ban installed and started'",
            description: "Install and start Fail2Ban SSH brute-force protection",
          },
          "SSH Auth Method": {
            cmd: "echo 'SSH key-only auth must be configured manually. Generate an SSH key pair, add the public key to ~/.ssh/authorized_keys, then set PasswordAuthentication no in /etc/ssh/sshd_config and restart sshd.'",
            description: "Disable SSH password authentication (requires manual SSH key setup first)",
          },
          "SSL/HTTPS": {
            cmd: "echo 'SSL is managed by Caddy reverse proxy. Ensure your domain DNS points to this server and Caddy will auto-provision a certificate.'",
            description: "SSL is auto-managed by Caddy — ensure DNS is pointed to this server",
          },
          "Auto Security Updates": {
            cmd: "apt-get install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades && systemctl enable unattended-upgrades && systemctl start unattended-upgrades && echo 'Unattended-upgrades installed and enabled'",
            description: "Install and enable automatic security updates",
          },
          ".env File Security": {
            cmd: "chmod 600 /opt/tts-dialer/.env 2>/dev/null && echo '.env permissions set to 600' || echo '.env file not found at /opt/tts-dialer/.env'",
            description: "Restrict .env file permissions to owner-only (600)",
          },
        };

        const fix = fixCommands[input.checkName];
        if (!fix) {
          return { success: false, output: `No fix available for check: ${input.checkName}`, description: "" };
        }

        // Execute via SSH on the host
        const { Client: SSHClient } = await import("ssh2");
        return new Promise<{ success: boolean; output: string; description: string }>((resolve) => {
          const conn = new SSHClient();
          const timer = setTimeout(() => {
            conn.end();
            resolve({ success: false, output: "SSH connection timed out after 60 seconds", description: fix.description });
          }, 60000);

          conn.on("ready", () => {
            conn.exec(fix.cmd, (err, stream) => {
              if (err) {
                clearTimeout(timer);
                conn.end();
                resolve({ success: false, output: `SSH exec error: ${err.message}`, description: fix.description });
                return;
              }
              let stdout = "";
              let stderr = "";
              stream.on("data", (d: Buffer) => { stdout += d.toString(); });
              stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
              stream.on("close", (code: number) => {
                clearTimeout(timer);
                conn.end();
                const output = (stdout + (stderr ? "\n" + stderr : "")).trim();
                resolve({ success: code === 0 || code === null, output, description: fix.description });
              });
            });
          });

          conn.on("error", (err) => {
            clearTimeout(timer);
            resolve({ success: false, output: `SSH connection failed: ${err.message}`, description: fix.description });
          });

          conn.connect({
            host: hostIp,
            port: 22,
            username: hostUser,
            password: hostPassword,
            readyTimeout: 10000,
          });
        });
      }),

    /** Get security grade history for charting */
    gradeHistory: adminProcedure
      .input(z.object({
        limit: z.number().min(1).max(500).default(100),
      }).optional())
      .query(async ({ input }) => {
        const limit = input?.limit ?? 100;
        const history = await db.getSecurityGradeHistory(limit);
        return {
          entries: history.map(h => ({
            id: h.id,
            grade: h.grade,
            okCount: h.okCount,
            warningCount: h.warningCount,
            errorCount: h.errorCount,
            unconfiguredCount: h.unconfiguredCount,
            totalChecks: h.totalChecks,
            details: h.details,
            checkedAt: h.checkedAt,
          })),
        };
      }),
  }),

  // ─── Queue Monitoring ──────────────────────────────────────────────
  queueMonitor: router({
    stats: protectedProcedure.query(async () => {
      return db.getCallQueueStats();
    }),
    throughput: protectedProcedure.query(async () => {
      return db.getQueueThroughput();
    }),
    depthHistory: protectedProcedure.input(z.object({ hours: z.number().min(1).max(168).optional() })).query(async ({ input }) => {
      return db.getQueueDepthHistory(input.hours || 24);
    }),
    deadLetter: protectedProcedure.input(z.object({ limit: z.number().min(1).max(500).optional() })).query(async ({ input }) => {
      return db.getDeadLetterQueue(input.limit || 100);
    }),
    requeueDeadLetter: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ ctx, input }) => {
      const count = await db.requeueDeadLetterItems(input.ids);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "queue.requeueDeadLetter",
        resource: "callQueue",
        details: { count, ids: input.ids },
      });
      return { requeued: count };
    }),
  }),

  // ─── External API Key Management ──────────────────────────────────────────────
  apiKeys: router({
    list: protectedProcedure.query(async () => {
      return db.getApiKeys();
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      permissions: z.object({
        campaigns: z.object({ read: z.boolean(), write: z.boolean(), launch: z.boolean() }),
        contacts: z.object({ read: z.boolean(), write: z.boolean(), import: z.boolean() }),
        callLogs: z.object({ read: z.boolean() }),
        reports: z.object({ read: z.boolean() }),
        dnc: z.object({ read: z.boolean(), write: z.boolean() }),
      }),
      rateLimit: z.number().min(1).max(1000).optional(),
      expiresInDays: z.number().min(1).max(365).optional(),
    })).mutation(async ({ ctx, input }) => {
      const expiresAt = input.expiresInDays ? Date.now() + input.expiresInDays * 86400000 : null;
      const result = await db.createApiKey({
        name: input.name,
        permissions: input.permissions,
        rateLimit: input.rateLimit,
        expiresAt,
        createdBy: ctx.user.id,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "apiKey.create",
        resource: "apiKeys",
        details: { name: input.name, keyPrefix: result.prefix },
      });
      return result;
    }),
    revoke: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.revokeApiKey(input.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "apiKey.revoke",
        resource: "apiKeys",
        details: { keyId: input.id },
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteApiKey(input.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "apiKey.delete",
        resource: "apiKeys",
        details: { keyId: input.id },
      });
      return { success: true };
    }),
    logs: protectedProcedure.input(z.object({ apiKeyId: z.number().optional(), limit: z.number().min(1).max(500).optional() })).query(async ({ input }) => {
      return db.getApiRequestLogs(input.apiKeyId, input.limit || 100);
    }),
    analytics: adminProcedure.input(z.object({
      days: z.number().min(1).max(90).optional(),
      apiKeyId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      const days = input?.days || 30;
      const apiKeyId = input?.apiKeyId;
      const database = await (await import("./db")).getDb();
      if (!database) return { overview: { totalRequests: 0, successCount: 0, errorCount: 0, errorRate: 0, avgResponseTime: 0, uniqueEndpoints: 0 }, hourlyVolume: [], dailyVolume: [], endpointBreakdown: [], statusCodeBreakdown: [], perKeyUsage: [], recentErrors: [] };

      const cutoff = new Date(Date.now() - days * 86400000);
      const baseWhere = apiKeyId
        ? and(gte(apiRequestLogs.createdAt, cutoff), eq(apiRequestLogs.apiKeyId, apiKeyId))
        : gte(apiRequestLogs.createdAt, cutoff);

      // All logs in the window
      const allLogs = await database.select().from(apiRequestLogs).where(baseWhere).orderBy(desc(apiRequestLogs.createdAt));

      // Overview metrics
      const totalRequests = allLogs.length;
      const successCount = allLogs.filter(l => l.statusCode >= 200 && l.statusCode < 400).length;
      const errorCount = allLogs.filter(l => l.statusCode >= 400).length;
      const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0;
      const avgResponseTime = totalRequests > 0 ? Math.round(allLogs.reduce((sum, l) => sum + (l.responseTimeMs || 0), 0) / totalRequests) : 0;
      const uniqueEndpoints = new Set(allLogs.map(l => l.endpoint)).size;

      // Hourly volume (last 48 hours)
      const hourlyVolume: Array<{ hour: string; requests: number; errors: number }> = [];
      const now = Date.now();
      for (let i = 47; i >= 0; i--) {
        const hourStart = new Date(now - (i + 1) * 3600000);
        const hourEnd = new Date(now - i * 3600000);
        const hourLogs = allLogs.filter(l => {
          const t = new Date(l.createdAt).getTime();
          return t >= hourStart.getTime() && t < hourEnd.getTime();
        });
        hourlyVolume.push({
          hour: hourEnd.toISOString().slice(0, 13) + ":00",
          requests: hourLogs.length,
          errors: hourLogs.filter(l => l.statusCode >= 400).length,
        });
      }

      // Daily volume
      const dailyVolume: Array<{ date: string; requests: number; errors: number; avgResponseTime: number }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(now - (i + 1) * 86400000);
        const dayEnd = new Date(now - i * 86400000);
        const dayLogs = allLogs.filter(l => {
          const t = new Date(l.createdAt).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        });
        dailyVolume.push({
          date: dayEnd.toISOString().split("T")[0],
          requests: dayLogs.length,
          errors: dayLogs.filter(l => l.statusCode >= 400).length,
          avgResponseTime: dayLogs.length > 0 ? Math.round(dayLogs.reduce((s, l) => s + (l.responseTimeMs || 0), 0) / dayLogs.length) : 0,
        });
      }

      // Endpoint breakdown
      const endpointMap = new Map<string, { count: number; errors: number; avgMs: number; totalMs: number }>();
      for (const l of allLogs) {
        const key = `${l.method} ${l.endpoint}`;
        const existing = endpointMap.get(key) || { count: 0, errors: 0, avgMs: 0, totalMs: 0 };
        existing.count++;
        if (l.statusCode >= 400) existing.errors++;
        existing.totalMs += l.responseTimeMs || 0;
        endpointMap.set(key, existing);
      }
      const endpointBreakdown = Array.from(endpointMap.entries())
        .map(([endpoint, stats]) => ({
          endpoint,
          requests: stats.count,
          errors: stats.errors,
          errorRate: Math.round((stats.errors / stats.count) * 10000) / 100,
          avgResponseTime: Math.round(stats.totalMs / stats.count),
        }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 20);

      // Status code breakdown
      const statusMap = new Map<number, number>();
      for (const l of allLogs) {
        statusMap.set(l.statusCode, (statusMap.get(l.statusCode) || 0) + 1);
      }
      const statusCodeBreakdown = Array.from(statusMap.entries())
        .map(([code, count]) => ({ statusCode: code, count, percentage: Math.round((count / totalRequests) * 10000) / 100 }))
        .sort((a, b) => b.count - a.count);

      // Per-key usage
      const keyMap = new Map<number, { count: number; errors: number; lastUsed: Date }>();
      for (const l of allLogs) {
        const existing = keyMap.get(l.apiKeyId) || { count: 0, errors: 0, lastUsed: new Date(0) };
        existing.count++;
        if (l.statusCode >= 400) existing.errors++;
        const logDate = new Date(l.createdAt);
        if (logDate > existing.lastUsed) existing.lastUsed = logDate;
        keyMap.set(l.apiKeyId, existing);
      }
      const apiKeysList = await db.getApiKeys();
      const perKeyUsage = Array.from(keyMap.entries())
        .map(([keyId, stats]) => {
          const keyInfo = apiKeysList.find((k: any) => k.id === keyId);
          return {
            apiKeyId: keyId,
            keyName: keyInfo?.name || `Key #${keyId}`,
            keyPrefix: keyInfo?.keyPrefix || "unknown",
            requests: stats.count,
            errors: stats.errors,
            errorRate: Math.round((stats.errors / stats.count) * 10000) / 100,
            lastUsed: stats.lastUsed.getTime(),
          };
        })
        .sort((a, b) => b.requests - a.requests);

      // Recent errors
      const recentErrors = allLogs
        .filter(l => l.statusCode >= 400)
        .slice(0, 50)
        .map(l => ({
          id: l.id,
          method: l.method,
          endpoint: l.endpoint,
          statusCode: l.statusCode,
          responseTimeMs: l.responseTimeMs,
          ipAddress: l.ipAddress,
          createdAt: new Date(l.createdAt).getTime(),
        }));

      return {
        overview: { totalRequests, successCount, errorCount, errorRate, avgResponseTime, uniqueEndpoints },
        hourlyVolume,
        dailyVolume,
        endpointBreakdown,
        statusCodeBreakdown,
        perKeyUsage,
        recentErrors,
      };
    }),
  }),

  carrierHealth: router({
    failureRate: protectedProcedure.input(z.object({ windowMinutes: z.number().min(1).max(60).optional() }).optional()).query(async ({ input }) => {
      return db.getCarrierFailureRate(input?.windowMinutes || 5);
    }),
    failureTrend: protectedProcedure.input(z.object({ hours: z.number().min(1).max(168).optional() }).optional()).query(async ({ input }) => {
      return db.getCarrierFailureTrend(input?.hours || 24);
    }),
    dropRate: protectedProcedure.input(z.object({ windowMinutes: z.number().min(1).max(1440).optional() }).optional()).query(async ({ input }) => {
      return db.getDropRateStats(input?.windowMinutes || 60);
    }),
    errorLog: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
      campaignId: z.number().optional(),
      status: z.string().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return db.getCarrierErrorLog(input || {});
    }),
    failureByCampaign: protectedProcedure.input(z.object({ windowMinutes: z.number().min(1).max(1440).optional() }).optional()).query(async ({ input }) => {
      return db.getCarrierFailureByCampaign(input?.windowMinutes || 60);
    }),
    getRules: protectedProcedure.query(async () => {
      return db.getCarrierAutoRules();
    }),
    updateRules: protectedProcedure.input(z.object({
      autoPauseEnabled: z.boolean().optional(),
      autoPauseThreshold: z.number().min(10).max(100).optional(),
      autoPauseWindowMinutes: z.number().min(1).max(30).optional(),
      autoThrottleEnabled: z.boolean().optional(),
      autoThrottleThreshold: z.number().min(10).max(100).optional(),
      quarantineEnabled: z.boolean().optional(),
      quarantineThreshold: z.number().min(1).max(20).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.updateCarrierAutoRules(input);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "carrierHealth.updateRules",
        resource: "carrierHealth",
        details: input,
      });
      return { success: true };
    }),
    evaluate: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await db.evaluateCarrierHealth();
      if (result.quarantineCandidates.length > 0) {
        for (const phone of result.quarantineCandidates) {
          await db.quarantineNumber(phone, `Consecutive failures >= threshold in 24h`, ctx.user.id);
        }
      }
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "carrierHealth.evaluate",
        resource: "carrierHealth",
        details: { ...result, quarantined: result.quarantineCandidates.length },
      });
      return result;
    }),
    quarantined: protectedProcedure.input(z.object({ limit: z.number().min(1).max(500).optional(), offset: z.number().min(0).optional() }).optional()).query(async ({ input }) => {
      return db.getQuarantinedNumbers(input || {});
    }),
    unquarantine: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ ctx, input }) => {
      const count = await db.unquarantineNumbers(input.ids);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "carrierHealth.unquarantine",
        resource: "carrierHealth",
        details: { ids: input.ids, count },
      });
      return { released: count };
    }),
  }),

  // ─── Usage & Storage Analytics ─────────────────────────────────────────
  usage: router({
    /** Get storage usage breakdown from MinIO/S3 */
    storage: protectedProcedure.query(async () => {
      const { getStorageStats } = await import("./storage");
      return getStorageStats();
    }),

    /** Get TTS generation stats from the cache table */
    ttsStats: protectedProcedure.input(z.object({
      days: z.number().min(1).max(365).default(30),
    }).optional()).query(async ({ input }) => {
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return db.getTtsUsageStats(since);
    }),

    /** Get call volume stats over time */
    callVolume: protectedProcedure.input(z.object({
      days: z.number().min(1).max(365).default(30),
      groupBy: z.enum(["day", "week", "month"]).default("day"),
    }).optional()).query(async ({ input }) => {
      const days = input?.days ?? 30;
      const groupBy = input?.groupBy ?? "day";
      return db.getCallVolumeStats(days, groupBy);
    }),

    /** Get combined usage summary */
    summary: protectedProcedure.query(async () => {
      const { getStorageStats } = await import("./storage");
      const [storage, tts, calls] = await Promise.all([
        getStorageStats(),
        db.getTtsUsageStats(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        db.getCallVolumeStats(30, "day"),
      ]);
      return { storage, tts, calls };
    }),
  }),

  // ─── Security Logs ──────────────────────────────────────────────────────
  security: router({
    events: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      eventType: z.string().optional(),
      ipAddress: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })).query(async ({ input }) => {
      return db.getSecurityEvents({
        ...input,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
    }),

    stats: protectedProcedure.input(z.object({
      days: z.number().min(1).max(365).default(30),
    })).query(async ({ input }) => {
      return db.getSecurityEventStats(input.days);
    }),

    timeline: protectedProcedure.input(z.object({
      days: z.number().min(1).max(30).default(7),
    })).query(async ({ input }) => {
      return db.getSecurityTimeline(input.days);
    }),

    blocklist: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      activeOnly: z.boolean().default(true),
    })).query(async ({ input }) => {
      return db.getBlocklist(input);
    }),

    banIp: protectedProcedure.input(z.object({
      ipAddress: z.string().min(1),
      reason: z.string().min(1).default("Manual ban"),
      duration: z.number().optional(), // hours, undefined = permanent
    })).mutation(async ({ ctx, input }) => {
      const expiresAt = input.duration ? new Date(Date.now() + input.duration * 60 * 60 * 1000) : undefined;
      await db.addToBlocklist({
        ipAddress: input.ipAddress,
        reason: input.reason,
        source: "manual",
        failedAttempts: 0,
        expiresAt,
      });
      await db.createSecurityEvent({
        eventType: "ip_banned",
        ipAddress: input.ipAddress,
        details: { reason: input.reason, duration: input.duration, bannedBy: ctx.user.name },
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "security.banIp",
        resource: "security",
        details: { ipAddress: input.ipAddress, reason: input.reason },
      });
      return { success: true };
    }),

    unbanIp: protectedProcedure.input(z.object({
      ipAddress: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await db.removeFromBlocklist(input.ipAddress);
      await db.createSecurityEvent({
        eventType: "ip_unbanned",
        ipAddress: input.ipAddress,
        details: { unbannedBy: ctx.user.name },
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "security.unbanIp",
        resource: "security",
        details: { ipAddress: input.ipAddress },
      });
      return { success: true };
    }),

    /** Fetch live fail2ban status from the app server via SSH */
    fail2banStatus: protectedProcedure.query(async () => {
      // Return cached fail2ban data from the last sync
      // This avoids SSH on every request — sync happens via a scheduled job
      const events = await db.getSecurityEvents({ limit: 1, eventType: "ip_banned" });
      const blocklist = await db.getBlocklist({ activeOnly: true, limit: 100 });
      const stats = await db.getSecurityEventStats(30);
      return {
        activeBans: blocklist.total,
        recentBans: stats.blockedIps,
        failedLogins: stats.failedLogins,
        topOffenders: stats.topOffenders,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
