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
import { generateVoiceAiInstaller } from "../services/voice-ai-installer";

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
    return db.getVoiceAiPrompts();
  }),

  getPrompt: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const prompt = await db.getVoiceAiPrompt(input.id);
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
      await db.updateVoiceAiPrompt(id, data);
      return { success: true };
    }),

  deletePrompt: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteVoiceAiPrompt(input.id);
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
      return db.getVoiceAiConversations(input);
    }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const conv = await db.getVoiceAiConversation(input.id);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      return conv;
    }),

  // ─── Delete Conversation ───────────────────────────────────────────
  deleteConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteVoiceAiConversation(input.id);
      return { success: true };
    }),

  bulkDeleteConversations: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await db.bulkDeleteVoiceAiConversations(input.ids);
      return { success: true, deleted };
    }),

  // ─── Analytics ──────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async ({ ctx }) => {
    return db.getVoiceAiStats();
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

  /** Install Voice AI Bridge on FreePBX server via SSH — generates script server-side and pipes through SSH */
  installBridgeViaSSH: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Validate prerequisites
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      if (!host || !sshUser || !sshPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SSH credentials not configured. Go to Settings > FreePBX to configure SSH access." });
      }

      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OpenAI API key not configured. Go to Settings to add your API key." });
      }

      const agents = await db.getPbxAgents();
      const activeAgent = agents.find((a: any) => a.lastHeartbeat) || agents[0];
      if (!activeAgent) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No PBX agent registered. Register a PBX agent first on the FreePBX Integration page." });
      }

      // 2. Generate the installer script server-side (no curl round-trip needed)
      const path = await import("path");
      const fs = await import("fs");
      let bridgeScript: string;
      let dialplanConf: string;
      try {
        const bridgeDir = path.resolve(process.cwd(), "voice-ai-bridge");
        bridgeScript = fs.readFileSync(path.join(bridgeDir, "voice_ai_bridge.py"), "utf-8");
        dialplanConf = fs.readFileSync(path.join(bridgeDir, "extensions_voice_ai.conf"), "utf-8");
      } catch {
        try {
          const bridgeDir = path.resolve(__dirname, "..", "..", "voice-ai-bridge");
          bridgeScript = fs.readFileSync(path.join(bridgeDir, "voice_ai_bridge.py"), "utf-8");
          dialplanConf = fs.readFileSync(path.join(bridgeDir, "extensions_voice_ai.conf"), "utf-8");
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not read Voice AI Bridge files on server" });
        }
      }

      const dashboardUrl = input.origin;
      const dashboardApiUrl = `${dashboardUrl}/api/voice-ai`;
      const ariUser = "voice-ai";
      const ariPassword = "voice-ai-secret";
      const bridgePort = 8090;
      const openaiModel = "gpt-4o-realtime-preview";

      const envContent = [
        `OPENAI_API_KEY=${openaiKey}`,
        `DASHBOARD_API_URL=${dashboardApiUrl}`,
        `DASHBOARD_API_KEY=${activeAgent.apiKey}`,
        `ARI_URL=http://localhost:8088`,
        `ARI_USER=${ariUser}`,
        `ARI_PASSWORD=${ariPassword}`,
        `ARI_APP=voice-ai-bridge`,
        `BRIDGE_PORT=${bridgePort}`,
        `OPENAI_MODEL=${openaiModel}`,
        `LOG_LEVEL=INFO`,
      ].join("\n");

      const installerScript = generateVoiceAiInstaller(
        bridgeScript, dialplanConf, envContent, ariUser, ariPassword, dashboardUrl,
      );

      // 3. SSH into FreePBX and pipe the installer script directly via stdin (no curl needed)
      const { Client: SSHClient } = await import("ssh2");
      const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => {
          conn.end();
          resolve({ success: false, output: "", error: "SSH connection timed out after 120 seconds" });
        }, 120000);

        conn.on("ready", () => {
          // Pipe the script directly through bash via stdin — no network round-trip
          conn.exec("bash -s", (err, stream) => {
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
              const isSuccess = code === 0 || code === null || output.includes("Installation Complete");
              resolve({
                success: isSuccess,
                output: output.trim().slice(-3000),
                error: !isSuccess ? `Exit code: ${code}` : undefined,
              });
            });
            // Write the installer script to stdin and close
            stream.write(installerScript);
            stream.end();
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          let errorMsg = err.message;
          if (errorMsg.includes("Authentication")) errorMsg = "SSH authentication failed — check SSH credentials in Settings";
          else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "SSH connection refused — is SSH running on the FreePBX server?";
          else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "SSH connection timed out — check FreePBX host address";
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

      // 4. Audit log
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "voiceai.installBridge",
        resource: "voice-ai-bridge",
        details: { success: result.success, host, agentName: activeAgent.name, error: result.error },
      });

      // 5. Log bridge event
      try {
        await db.createBridgeEvent({
          agentId: activeAgent.agentId,
          agentName: activeAgent.name || activeAgent.agentId,
          eventType: result.success ? "installed" : "install_failed",
          details: result.success
            ? `Bridge installed/updated via SSH by ${ctx.user.name || "admin"}. Output: ${result.output.slice(-500)}`
            : `Install failed: ${result.error || "Unknown error"}. Output: ${result.output.slice(-500)}`,
        });
      } catch (e) {
        console.warn("[VoiceAI] Failed to log bridge event:", e);
      }

      return result;
    }),

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
      // ─── Pre-flight checks ─────────────────────────────────────────
      // 1. Check PBX agent is online
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

      // 2. Check Voice AI bridge capability (warn but don't block — bridge may be running but not reporting yet)
      const capabilities = (onlineAgent as any).capabilities;
      const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;
      if (!hasBridge) {
        console.warn(`[VoiceAI TestCall] PBX agent "${onlineAgent.name}" does not report Voice AI bridge capability. Call may fail if bridge is not installed.`);
      }

      // Queue a test call with voice_ai routing
      const prompt = await db.getVoiceAiPrompt(input.promptId);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });

      // Resolve caller ID — use selected DID or pick a random active one
      const phoneNumber = input.phoneNumber.replace(/[^0-9+]/g, "");
      let callerIdStr: string | undefined;
      const callerIdList = await db.getCallerIds();
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
          VOICE_AI_PROMPT_ID: String(input.promptId),
          CONTACT_NAME: "Test Call",
          CONTACT_PHONE: phoneNumber,
          CAMPAIGN_NAME: "test",
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

      const bridgeWarning = !hasBridge ? " Warning: Voice AI bridge not detected on PBX agent. If the call fails, install the bridge first." : "";
      return {
        success: true,
        message: `Test call queued to ${phoneNumber} using prompt "${prompt.name}" (Caller ID: ${callerIdStr}, Agent: ${onlineAgent.name}).${bridgeWarning}`,
        queueId: result?.id,
        agentName: onlineAgent.name,
        hasBridge: !!hasBridge,
      };
    }),

  // ─── Bridge Event History ─────────────────────────────────────────────

  /** Get bridge event history (uptime/downtime log) */
  getBridgeEvents: protectedProcedure
    .input(z.object({
      agentId: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const events = await db.getBridgeEvents({
        agentId: input?.agentId,
        limit: input?.limit ?? 100,
        offset: input?.offset ?? 0,
      });
      return events;
    }),

  /** Get bridge event stats (summary) */
  getBridgeEventStats: protectedProcedure.query(async () => {
    return db.getBridgeEventStats();
  }),

  /** Poll call queue status — used by UI to show real-time call result after queuing */
  getCallStatus: protectedProcedure
    .input(z.object({ queueId: z.number() }))
    .query(async ({ input }) => {
      const item = await db.getCallQueueItem(input.queueId);
      if (!item) {
        return { status: "not_found" as const, message: "Call not found in queue" };
      }
      const result = item.result as string | null;
      const details = (item.resultDetails || {}) as Record<string, any>;
      const status = item.status as string;

      // Build a human-readable failure reason
      let failureReason = "";
      if (status === "failed" || result === "failed") {
        if (details.error) {
          failureReason = details.error;
        } else if (details.reason) {
          const reasonMap: Record<string, string> = {
            "0": "Call could not be originated — check SIP trunk configuration and dialplan on the PBX server",
            "1": "Unallocated number",
            "16": "Normal call clearing",
            "17": "User busy",
            "18": "No user responding",
            "19": "No answer from user",
            "20": "Subscriber absent",
            "21": "Call rejected",
            "27": "Destination out of order",
            "28": "Invalid number format",
            "31": "Normal, unspecified",
            "34": "No circuit/channel available",
            "38": "Network out of order",
            "41": "Temporary failure",
            "42": "Switching equipment congestion",
            "44": "Requested channel not available",
            "47": "Resource unavailable",
            "50": "Facility not subscribed",
            "52": "Outgoing calls barred",
            "54": "Incoming calls barred",
            "57": "Bearer capability not authorized",
            "58": "Bearer capability not available",
            "63": "Service or option not available",
            "65": "Bearer capability not implemented",
            "79": "Service not implemented",
            "88": "Incompatible destination",
            "102": "Recovery on timer expiry",
            "111": "Protocol error",
            "127": "Interworking, unspecified",
          };
          failureReason = reasonMap[String(details.reason)] || `Hangup cause: ${details.reason}`;
        } else {
          failureReason = "Call failed — no specific reason reported by PBX agent";
        }
      }

      return {
        status: status as "pending" | "claimed" | "dialing" | "completed" | "failed",
        result: result || null,
        duration: details.duration || 0,
        failureReason,
        claimedBy: (item as any).claimedBy || null,
        createdAt: (item as any).createdAt ? Number((item as any).createdAt) : null,
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
      const agent = await db.getLiveAgent(input.agentId);
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
      const agent = await db.getLiveAgent(input.agentId);
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
      const agent = await db.getLiveAgent(input.agentId);
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
      return db.getRecentSupervisorActions(input?.limit);
    }),
});
