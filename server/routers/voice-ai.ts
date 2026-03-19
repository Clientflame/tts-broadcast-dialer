/**
 * Voice AI Router
 * 
 * Manages Voice AI prompts, conversations, analytics, and supervisor controls.
 * The actual voice bridge (Asterisk ARI + OpenAI Realtime) runs as a Python service
 * on the FreePBX server. This router handles the web dashboard side.
 */
import { router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";

// ─── Voice AI Prompts ─────────────────────────────────────────────────────────

const voiceAiPromptInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  openingMessage: z.string().optional(),
  voice: z.string().default("coral"),
  language: z.string().default("en"),
  temperature: z.string().default("0.7"),
  maxTurnDuration: z.number().min(10).max(600).default(120),
  maxConversationDuration: z.number().min(30).max(1800).default(300),
  silenceTimeout: z.number().min(3).max(60).default(10),
  requireAiDisclosure: z.number().min(0).max(1).default(1),
  requireMiniMiranda: z.number().min(0).max(1).default(0),
  miniMirandaText: z.string().optional(),
  escalateOnDtmf: z.string().default("#"),
  escalateKeywords: z.array(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  isDefault: z.number().min(0).max(1).default(0),
});

export const voiceAiRouter = router({
  // ─── Prompts CRUD ───────────────────────────────────────────────────
  listPrompts: protectedProcedure.query(async ({ ctx }) => {
    return db.getVoiceAiPrompts(ctx.user.id);
  }),

  getPrompt: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const prompt = await db.getVoiceAiPrompt(input.id, ctx.user.id);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
      return prompt;
    }),

  createPrompt: protectedProcedure
    .input(voiceAiPromptInput)
    .mutation(async ({ ctx, input }) => {
      const result = await db.createVoiceAiPrompt({
        userId: ctx.user.id,
        ...input,
      });
      return result;
    }),

  updatePrompt: protectedProcedure
    .input(z.object({ id: z.number() }).merge(voiceAiPromptInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateVoiceAiPrompt(id, ctx.user.id, data);
      return { success: true };
    }),

  deletePrompt: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteVoiceAiPrompt(input.id, ctx.user.id);
      return { success: true };
    }),

  // ─── Available Voices ───────────────────────────────────────────────
  getVoices: protectedProcedure.query(async () => {
    return [
      { id: "alloy", name: "Alloy", gender: "neutral", description: "Warm, professional tone" },
      { id: "ash", name: "Ash", gender: "male", description: "Confident, clear voice" },
      { id: "ballad", name: "Ballad", gender: "male", description: "Smooth, melodic voice" },
      { id: "coral", name: "Coral", gender: "female", description: "Friendly, conversational" },
      { id: "echo", name: "Echo", gender: "male", description: "Clear, articulate voice" },
      { id: "sage", name: "Sage", gender: "female", description: "Calm, authoritative" },
      { id: "shimmer", name: "Shimmer", gender: "female", description: "Bright, energetic voice" },
      { id: "verse", name: "Verse", gender: "male", description: "Expressive, dynamic" },
      { id: "marin", name: "Marin", gender: "female", description: "Natural, empathetic tone" },
      { id: "cedar", name: "Cedar", gender: "male", description: "Deep, reassuring voice" },
    ];
  }),

  // ─── Available Function Tools ───────────────────────────────────────
  getAvailableTools: protectedProcedure.query(async () => {
    return [
      {
        id: "account_lookup",
        name: "Account Lookup",
        description: "Look up debtor account information (balance, payment history, account status)",
        icon: "Search",
        category: "data",
      },
      {
        id: "schedule_callback",
        name: "Schedule Callback",
        description: "Schedule a callback at a specific date/time with the same or different agent",
        icon: "Calendar",
        category: "action",
      },
      {
        id: "process_payment",
        name: "Process Payment",
        description: "Transfer to IVR payment system or record a payment promise",
        icon: "CreditCard",
        category: "action",
      },
      {
        id: "flag_dispute",
        name: "Flag Dispute",
        description: "Mark the account as disputed and stop collection activity",
        icon: "AlertTriangle",
        category: "compliance",
      },
      {
        id: "transfer_to_agent",
        name: "Transfer to Live Agent",
        description: "Transfer the call to an available live agent with full context",
        icon: "Headset",
        category: "escalation",
      },
      {
        id: "send_sms",
        name: "Send SMS",
        description: "Send a follow-up SMS with payment link or confirmation",
        icon: "MessageSquare",
        category: "action",
      },
      {
        id: "update_contact_info",
        name: "Update Contact Info",
        description: "Update the debtor's phone number, email, or address",
        icon: "UserCog",
        category: "data",
      },
      {
        id: "cease_and_desist",
        name: "Cease & Desist",
        description: "Record a cease and desist request and immediately stop all contact",
        icon: "Ban",
        category: "compliance",
      },
    ];
  }),

  // ─── Conversations ──────────────────────────────────────────────────
  listConversations: protectedProcedure
    .input(z.object({
      campaignId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.getVoiceAiConversations(ctx.user.id, input);
    }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const conv = await db.getVoiceAiConversation(input.id, ctx.user.id);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      return conv;
    }),

  // ─── Analytics ──────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async ({ ctx }) => {
    return db.getVoiceAiStats(ctx.user.id);
  }),

  // ─── Voice AI Bridge Status ─────────────────────────────────────────
  getBridgeStatus: protectedProcedure.query(async ({ ctx }) => {
    // Check if the Voice AI bridge service is running on the FreePBX server
    // This is done via the PBX agent's heartbeat which reports bridge status
    try {
      const agents = await db.getPbxAgents();
      const onlineAgent = agents.find((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - new Date(a.lastHeartbeat).getTime() < 60000;
      });
      if (!onlineAgent) {
        return { status: "offline" as const, message: "PBX agent not connected" };
      }
      // The PBX agent reports voice_ai_bridge status in its capabilities
      const capabilities = (onlineAgent as any).capabilities;
      if (capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge) {
        return { status: "online" as const, message: "Voice AI bridge is running", agentName: onlineAgent.name };
      }
      return { status: "not_installed" as const, message: "Voice AI bridge not installed on PBX agent" };
    } catch {
      return { status: "unknown" as const, message: "Could not check bridge status" };
    }
  }),

  // ─── Default Prompt Templates ───────────────────────────────────────
  getTemplates: protectedProcedure.query(async () => {
    return [
      {
        id: "debt_collection",
        name: "Debt Collection Agent",
        description: "Professional debt collection agent with compliance guardrails",
        systemPrompt: `You are a professional debt collection agent calling on behalf of the creditor. Your goal is to collect payment or arrange a payment plan.

COMPLIANCE REQUIREMENTS (MUST follow):
- Identify yourself as an AI assistant at the start of every call
- Deliver the Mini-Miranda disclosure before discussing the debt
- Never threaten, harass, or use abusive language
- If the debtor says "stop calling", "cease and desist", or "do not contact me", immediately acknowledge and end the call
- If asked to speak to a human, transfer immediately
- Never discuss the debt with anyone other than the debtor
- Calls may only be made between 8am-9pm in the debtor's local time

CONVERSATION FLOW:
1. Greet the debtor by name and identify yourself as an AI assistant
2. Deliver Mini-Miranda: "This is an attempt to collect a debt. Any information obtained will be used for that purpose."
3. Verify you are speaking with the right person
4. State the balance owed and the creditor name
5. Ask if they would like to make a payment or set up a payment plan
6. If they agree, use the process_payment tool
7. If they want to call back, use the schedule_callback tool
8. If they dispute the debt, use the flag_dispute tool
9. Thank them and end the call professionally

TONE: Professional, empathetic, patient. Never aggressive or threatening.`,
        openingMessage: "Hello, this is an AI assistant calling regarding an important account matter. May I speak with {{contact_name}}?",
        voice: "coral",
        enabledTools: ["account_lookup", "process_payment", "schedule_callback", "flag_dispute", "transfer_to_agent", "cease_and_desist"],
      },
      {
        id: "appointment_reminder",
        name: "Appointment Reminder",
        description: "Friendly reminder calls for upcoming appointments",
        systemPrompt: `You are a friendly AI assistant making appointment reminder calls. Your goal is to confirm, reschedule, or cancel appointments.

GUIDELINES:
- Be warm and professional
- Identify yourself as an AI assistant
- Confirm the appointment details (date, time, location)
- If they need to reschedule, use the schedule_callback tool
- Keep calls brief and efficient

CONVERSATION FLOW:
1. Greet by name and identify as AI assistant
2. Mention the upcoming appointment with date/time
3. Ask to confirm, reschedule, or cancel
4. Process their choice
5. Thank them and end the call`,
        openingMessage: "Hi {{contact_name}}, this is an AI assistant calling to remind you about your upcoming appointment. Do you have a moment?",
        voice: "marin",
        enabledTools: ["schedule_callback", "transfer_to_agent"],
      },
      {
        id: "survey",
        name: "Customer Survey",
        description: "Automated customer satisfaction survey",
        systemPrompt: `You are a friendly AI assistant conducting a brief customer satisfaction survey. Keep it short and conversational.

GUIDELINES:
- Identify yourself as an AI assistant
- Ask no more than 5 questions
- Accept ratings on a 1-5 scale
- Thank them for their time
- If they want to speak to someone, transfer immediately

QUESTIONS:
1. Overall satisfaction (1-5)
2. Would they recommend us? (yes/no)
3. What could we improve?
4. Any additional comments?`,
        openingMessage: "Hello {{contact_name}}, this is an AI assistant calling on behalf of our team. We'd love to get your feedback with a quick 2-minute survey. Would you be willing to participate?",
        voice: "alloy",
        enabledTools: ["transfer_to_agent"],
      },
    ];
  }),

  // ─── Installer-Based Deploy ──────────────────────────────────────────

  /** Check deployment prerequisites */
  getDeployStatus: protectedProcedure.query(async () => {
    const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
    const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
    // Check if any PBX agent is registered (needed for API key)
    const agents = await db.getPbxAgents();
    const hasAgent = agents.length > 0;
    return {
      freepbxConfigured: !!host,
      openaiConfigured: !!openaiKey,
      pbxAgentRegistered: hasAgent,
      host: host || null,
      canDeploy: !!(host && openaiKey && hasAgent),
    };
  }),

  /** Generate the install command URL for the Voice AI Bridge */
  getInstallCommand: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(async ({ input }) => {
      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
      const agents = await db.getPbxAgents();
      const activeAgent = agents.find((a: any) => a.lastHeartbeat) || agents[0];
      if (!activeAgent) {
        return { command: null, error: "No PBX agent registered. Register a PBX agent first on the FreePBX Integration page." };
      }
      if (!openaiKey) {
        return { command: null, error: "OpenAI API key not configured. Go to Settings to add your API key." };
      }
      const installUrl = `${input.origin}/api/voice-ai/install?key=${activeAgent.apiKey}`;
      return {
        command: `curl -s '${installUrl}' | bash`,
        error: null,
      };
    }),

  /** Test call with Voice AI - originates a test call to a phone number */
  testCall: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10).max(15),
      promptId: z.number(),
      callerIdId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Queue a test call with voice_ai routing
      const prompt = await db.getVoiceAiPrompt(input.promptId, ctx.user.id);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });

      // Resolve caller ID — use selected DID or pick a random active one
      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      let callerIdStr: string | undefined;
      const callerIdList = await db.getCallerIds(ctx.user.id);
      if (input.callerIdId) {
        const selectedCid = callerIdList.find(c => c.id === input.callerIdId);
        if (selectedCid) callerIdStr = selectedCid.phoneNumber;
      }
      // If no caller ID selected, pick a random active DID to avoid trunk default
      if (!callerIdStr) {
        const activeDids = callerIdList.filter(c => c.isActive && !c.autoDisabled);
        if (activeDids.length > 0) {
          const randomDid = activeDids[Math.floor(Math.random() * activeDids.length)];
          callerIdStr = randomDid.phoneNumber;
          console.log(`[VoiceAI TestCall] No caller ID selected, using random DID: ${callerIdStr}`);
        }
      }
      if (!callerIdStr) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active caller IDs available. Add a caller ID first." });
      }

      const channel = `PJSIP/${phoneNumber}@vitel-outbound`;
      const result = await db.enqueueCall({
        userId: ctx.user.id,
        campaignId: 0, // test call
        phoneNumber,
        channel,
        context: "voice-ai-handler",
        callerIdStr,
        audioUrl: "", // Voice AI doesn't use pre-recorded audio
        priority: 0, // highest priority for test calls
        variables: {
          routingMode: "voice_ai",
          voiceAiPromptId: String(input.promptId),
          contactName: "Test Call",
          ...(callerIdStr ? { CALLER_ID: callerIdStr } : {}),
        },
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "voiceai.testCall",
        resource: "voice-ai-bridge",
        details: { phoneNumber, promptId: input.promptId, callerId: callerIdStr },
      });

      return {
        success: true,
        message: `Test call queued to ${phoneNumber} using prompt "${prompt.name}" (Caller ID: ${callerIdStr})`,
        queueId: result?.id,
      };
    }),
});

// ─── Supervisor Router ────────────────────────────────────────────────────────

export const supervisorRouter = router({
  // Start monitoring an agent's call (silent listen)
  monitor: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      callLogId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the agent's current call channel from the live agent tracker
      const agent = await db.getLiveAgent(input.agentId, ctx.user.id);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      if (agent.status !== "on_call") throw new TRPCError({ code: "BAD_REQUEST", message: "Agent is not on a call" });

      // Create supervisor action record
      const action = await db.createSupervisorAction({
        userId: ctx.user.id,
        agentId: input.agentId,
        callLogId: input.callLogId ?? agent.currentCallId,
        actionType: "monitor",
        channel: agent.sipExtension,
        startedAt: Date.now(),
      });

      // The actual ChanSpy command is executed by the PBX agent
      // We send the instruction via the call queue / PBX API
      return {
        success: true,
        actionId: action?.id,
        message: `Silent monitoring started for ${agent.name} (Ext ${agent.sipExtension})`,
        instruction: {
          type: "chanspy",
          extension: agent.sipExtension,
          mode: "silent", // ChanSpy with no flags = silent listen
          options: "qES", // q=quiet, E=exit on hangup, S=spy on extension
        },
      };
    }),

  // Start whispering to an agent (supervisor can talk to agent, caller can't hear)
  whisper: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      callLogId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agent = await db.getLiveAgent(input.agentId, ctx.user.id);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      if (agent.status !== "on_call") throw new TRPCError({ code: "BAD_REQUEST", message: "Agent is not on a call" });

      const action = await db.createSupervisorAction({
        userId: ctx.user.id,
        agentId: input.agentId,
        callLogId: input.callLogId ?? agent.currentCallId,
        actionType: "whisper",
        channel: agent.sipExtension,
        startedAt: Date.now(),
      });

      return {
        success: true,
        actionId: action?.id,
        message: `Whisper mode started for ${agent.name} (Ext ${agent.sipExtension})`,
        instruction: {
          type: "chanspy",
          extension: agent.sipExtension,
          mode: "whisper", // ChanSpy with w flag = whisper to agent only
          options: "qESw", // w=whisper mode
        },
      };
    }),

  // Barge into an agent's call (3-way conference)
  barge: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      callLogId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agent = await db.getLiveAgent(input.agentId, ctx.user.id);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      if (agent.status !== "on_call") throw new TRPCError({ code: "BAD_REQUEST", message: "Agent is not on a call" });

      const action = await db.createSupervisorAction({
        userId: ctx.user.id,
        agentId: input.agentId,
        callLogId: input.callLogId ?? agent.currentCallId,
        actionType: "barge",
        channel: agent.sipExtension,
        startedAt: Date.now(),
      });

      return {
        success: true,
        actionId: action?.id,
        message: `Barge-in started for ${agent.name} (Ext ${agent.sipExtension})`,
        instruction: {
          type: "chanspy",
          extension: agent.sipExtension,
          mode: "barge", // ChanSpy with B flag = barge (3-way)
          options: "qESB", // B=barge mode (both parties hear supervisor)
        },
      };
    }),

  // Stop supervising
  stop: protectedProcedure
    .input(z.object({ actionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.updateSupervisorAction(input.actionId, {
        endedAt: Date.now(),
      });
      return { success: true, message: "Supervision ended" };
    }),

  // Get recent supervisor actions
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getRecentSupervisorActions(ctx.user.id, input?.limit);
    }),
});
