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

  // ─── One-Click Deploy ──────────────────────────────────────────────

  /** Check if Voice AI Bridge can be deployed (SSH creds configured) */
  getDeployStatus: protectedProcedure.query(async () => {
    const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
    const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
    const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
    const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;
    return {
      sshConfigured: !!(host && sshUser && sshPassword),
      openaiConfigured: !!openaiKey,
      host: host || null,
      sshUser: sshUser || null,
      canDeploy: !!(host && sshUser && sshPassword && openaiKey),
    };
  }),

  /** Deploy Voice AI Bridge to FreePBX via SSH (one-click) */
  deploy: protectedProcedure
    .input(z.object({
      ariUser: z.string().default("voice-ai"),
      ariPassword: z.string().default("voice-ai-secret"),
      bridgePort: z.number().default(8089),
      openaiModel: z.string().default("gpt-4o-realtime-preview"),
      dashboardOrigin: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;

      if (!host || !sshUser || !sshPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SSH credentials not configured. Go to Settings to configure FreePBX connection." });
      }
      if (!openaiKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "OpenAI API key not configured. Go to Settings to add your API key." });
      }

      // Read the bridge Python script and config files
      const path = await import("path");
      const fs = await import("fs");
      let bridgeScript: string;
      let dialplanConf: string;
      let requirementsTxt: string;
      let serviceFile: string;

      try {
        const bridgeDir = path.resolve(process.cwd(), "voice-ai-bridge");
        bridgeScript = fs.readFileSync(path.join(bridgeDir, "voice_ai_bridge.py"), "utf-8");
        dialplanConf = fs.readFileSync(path.join(bridgeDir, "extensions_voice_ai.conf"), "utf-8");
        requirementsTxt = fs.readFileSync(path.join(bridgeDir, "requirements.txt"), "utf-8");
        serviceFile = fs.readFileSync(path.join(bridgeDir, "voice-ai-bridge.service"), "utf-8");
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not read Voice AI Bridge files" });
      }

      // Build the .env file
      const dashboardApiUrl = `${input.dashboardOrigin}/api/pbx`;
      // Get PBX agent API key for dashboard auth
      const agents = await db.getPbxAgents();
      const activeAgent = agents.find((a: any) => a.status === "online" || a.lastHeartbeat);
      const dashboardApiKey = activeAgent?.apiKey || "";

      const envContent = [
        `OPENAI_API_KEY=${openaiKey}`,
        `DASHBOARD_API_URL=${dashboardApiUrl}`,
        `DASHBOARD_API_KEY=${dashboardApiKey}`,
        `ARI_URL=http://localhost:8088`,
        `ARI_USER=${input.ariUser}`,
        `ARI_PASSWORD=${input.ariPassword}`,
        `ARI_APP=voice-ai-bridge`,
        `BRIDGE_PORT=${input.bridgePort}`,
        `OPENAI_MODEL=${input.openaiModel}`,
        `LOG_LEVEL=INFO`,
      ].join("\n");

      const { Client: SSHClient } = await import("ssh2");
      const logs: string[] = [];
      const log = (msg: string) => { logs.push(`[${new Date().toISOString()}] ${msg}`); };

      return new Promise<{ success: boolean; logs: string[]; error?: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => {
          conn.end();
          log("ERROR: Connection timeout (120s)");
          resolve({ success: false, logs, error: "Connection timeout" });
        }, 120000);

        conn.on("ready", () => {
          log("SSH connected to " + host);

          // Chain of SSH commands for deployment
          const commands = [
            // Step 1: Create directory
            { label: "Creating /opt/voice-ai-bridge directory", cmd: "mkdir -p /opt/voice-ai-bridge" },
            // Step 2: Install Python dependencies
            { label: "Installing Python dependencies", cmd: "pip3 install aiohttp websockets 2>&1 || pip install aiohttp websockets 2>&1" },
            // Step 3: Write the bridge script
            { label: "Deploying voice_ai_bridge.py", cmd: `cat > /opt/voice-ai-bridge/voice_ai_bridge.py << 'BRIDGE_SCRIPT_EOF'\n${bridgeScript}\nBRIDGE_SCRIPT_EOF` },
            // Step 4: Write requirements.txt
            { label: "Writing requirements.txt", cmd: `cat > /opt/voice-ai-bridge/requirements.txt << 'REQ_EOF'\n${requirementsTxt}\nREQ_EOF` },
            // Step 5: Write .env file
            { label: "Configuring environment", cmd: `cat > /opt/voice-ai-bridge/.env << 'ENV_EOF'\n${envContent}\nENV_EOF` },
            // Step 6: Write systemd service
            { label: "Creating systemd service", cmd: `cat > /etc/systemd/system/voice-ai-bridge.service << 'SVC_EOF'\n${serviceFile}\nSVC_EOF` },
            // Step 7: Configure Asterisk ARI
            { label: "Configuring Asterisk ARI user", cmd: `grep -q "\\[${input.ariUser}\\]" /etc/asterisk/ari.conf 2>/dev/null || cat >> /etc/asterisk/ari.conf << 'ARI_EOF'\n\n[${input.ariUser}]\ntype=user\nread_only=no\npassword=${input.ariPassword}\nARI_EOF` },
            // Step 8: Enable ARI in Asterisk HTTP
            { label: "Enabling ARI HTTP", cmd: `grep -q "^enabled=yes" /etc/asterisk/http.conf 2>/dev/null || (sed -i 's/^enabled=no/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null; sed -i 's/^;enabled=yes/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null)` },
            // Step 9: Deploy dialplan
            { label: "Deploying Voice AI dialplan", cmd: `cat > /etc/asterisk/extensions_voice_ai.conf << 'DIAL_EOF'\n${dialplanConf}\nDIAL_EOF\ngrep -q "#include extensions_voice_ai.conf" /etc/asterisk/extensions_custom.conf 2>/dev/null || echo '#include extensions_voice_ai.conf' >> /etc/asterisk/extensions_custom.conf` },
            // Step 10: Reload Asterisk
            { label: "Reloading Asterisk configuration", cmd: "asterisk -rx 'core reload' 2>&1 || true" },
            // Step 11: Start the service
            { label: "Starting Voice AI Bridge service", cmd: "systemctl daemon-reload && systemctl enable voice-ai-bridge && systemctl restart voice-ai-bridge" },
            // Step 12: Verify
            { label: "Verifying deployment", cmd: "sleep 2 && systemctl is-active voice-ai-bridge && echo 'SERVICE_RUNNING' || echo 'SERVICE_FAILED'" },
          ];

          let cmdIndex = 0;
          const runNext = () => {
            if (cmdIndex >= commands.length) {
              clearTimeout(timeout);
              conn.end();
              log("Deployment complete!");
              resolve({ success: true, logs });
              return;
            }
            const { label, cmd } = commands[cmdIndex];
            log(`Step ${cmdIndex + 1}/${commands.length}: ${label}...`);
            conn.exec(cmd, (err, stream) => {
              if (err) {
                log(`ERROR: ${err.message}`);
                cmdIndex++;
                runNext();
                return;
              }
              let output = "";
              stream.on("data", (data: Buffer) => { output += data.toString(); });
              stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
              stream.on("close", (code: number) => {
                if (output.trim()) {
                  // Truncate long outputs
                  const trimmed = output.trim().slice(0, 500);
                  log(`  Output: ${trimmed}`);
                }
                if (code !== 0 && code !== null) {
                  log(`  Warning: exit code ${code}`);
                }
                cmdIndex++;
                runNext();
              });
            });
          };
          runNext();
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          let errorMsg = err.message;
          if (errorMsg.includes("Authentication")) errorMsg = "Authentication failed — check SSH credentials in Settings";
          else if (errorMsg.includes("ECONNREFUSED")) errorMsg = "Connection refused — SSH not running on FreePBX";
          else if (errorMsg.includes("ETIMEDOUT")) errorMsg = "Connection timed out — check FreePBX host";
          log(`ERROR: ${errorMsg}`);
          resolve({ success: false, logs, error: errorMsg });
        });

        conn.connect({
          host,
          port: 22,
          username: sshUser,
          password: sshPassword,
          readyTimeout: 15000,
        });
      }).then(async (result) => {
        await db.createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          action: "voiceai.deploy",
          resource: "voice-ai-bridge",
          details: { success: result.success, error: result.error, steps: result.logs.length },
        });
        return result;
      });
    }),

  /** Check bridge health on the FreePBX server via SSH */
  checkBridgeHealth: protectedProcedure.mutation(async ({ ctx }) => {
    const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
    const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
    const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;

    if (!host || !sshUser || !sshPassword) {
      return { status: "error" as const, message: "SSH not configured" };
    }

    const { Client: SSHClient } = await import("ssh2");
    return new Promise<{ status: string; message: string; details?: any }>((resolve) => {
      const conn = new SSHClient();
      const timeout = setTimeout(() => {
        conn.end();
        resolve({ status: "error", message: "SSH timeout" });
      }, 15000);

      conn.on("ready", () => {
        // Check systemd service status + try health endpoint
        const cmd = `systemctl is-active voice-ai-bridge 2>/dev/null && echo 'ACTIVE' || echo 'INACTIVE'; curl -s http://localhost:8089/health 2>/dev/null || echo '{"status":"unreachable"}'`;
        conn.exec(cmd, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve({ status: "error", message: err.message });
            return;
          }
          let output = "";
          stream.on("data", (data: Buffer) => { output += data.toString(); });
          stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
          stream.on("close", () => {
            clearTimeout(timeout);
            conn.end();
            const lines = output.trim().split("\n");
            const serviceActive = lines[0]?.includes("ACTIVE");
            let healthData: any = null;
            try {
              const jsonLine = lines.slice(1).join("\n");
              healthData = JSON.parse(jsonLine);
            } catch {}

            if (serviceActive && healthData?.status === "running") {
              resolve({
                status: "running",
                message: "Voice AI Bridge is running",
                details: healthData,
              });
            } else if (serviceActive) {
              resolve({
                status: "starting",
                message: "Service is active but health endpoint not responding yet",
              });
            } else {
              resolve({
                status: "stopped",
                message: "Voice AI Bridge service is not running",
              });
            }
          });
        });
      });

      conn.on("error", (err: Error) => {
        clearTimeout(timeout);
        resolve({ status: "error", message: err.message });
      });

      conn.connect({
        host,
        port: 22,
        username: sshUser,
        password: sshPassword,
        readyTimeout: 10000,
      });
    });
  }),

  /** Redeploy / update the bridge (overwrites existing files) */
  redeploy: protectedProcedure
    .input(z.object({ dashboardOrigin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // Reuse the deploy logic - it overwrites files
      // This is a convenience wrapper
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
      const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY;

      if (!host || !sshUser || !sshPassword || !openaiKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Missing SSH or OpenAI credentials" });
      }

      const { Client: SSHClient } = await import("ssh2");
      const path = await import("path");
      const fs = await import("fs");

      let bridgeScript: string;
      try {
        bridgeScript = fs.readFileSync(path.resolve(process.cwd(), "voice-ai-bridge", "voice_ai_bridge.py"), "utf-8");
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not read bridge script" });
      }

      return new Promise<{ success: boolean; message: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => {
          conn.end();
          resolve({ success: false, message: "SSH timeout" });
        }, 60000);

        conn.on("ready", () => {
          const cmd = `cat > /opt/voice-ai-bridge/voice_ai_bridge.py << 'BRIDGE_SCRIPT_EOF'\n${bridgeScript}\nBRIDGE_SCRIPT_EOF\nsystemctl restart voice-ai-bridge 2>&1`;
          conn.exec(cmd, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              conn.end();
              resolve({ success: false, message: err.message });
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
                message: code === 0 || code === null ? "Bridge updated and restarted" : `Update failed: ${output.trim().slice(0, 200)}`,
              });
            });
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          resolve({ success: false, message: err.message });
        });

        conn.connect({ host, port: 22, username: sshUser, password: sshPassword, readyTimeout: 10000 });
      }).then(async (result) => {
        await db.createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || undefined,
          action: "voiceai.redeploy",
          resource: "voice-ai-bridge",
          details: { success: result.success },
        });
        return result;
      });
    }),

  /** Get bridge service logs from FreePBX */
  getBridgeLogs: protectedProcedure
    .input(z.object({ lines: z.number().min(10).max(500).default(50) }).optional())
    .mutation(async ({ ctx, input }) => {
      const host = await db.getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
      const sshUser = await db.getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
      const sshPassword = await db.getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;

      if (!host || !sshUser || !sshPassword) {
        return { success: false, logs: "SSH not configured" };
      }

      const { Client: SSHClient } = await import("ssh2");
      const numLines = input?.lines ?? 50;

      return new Promise<{ success: boolean; logs: string }>((resolve) => {
        const conn = new SSHClient();
        const timeout = setTimeout(() => {
          conn.end();
          resolve({ success: false, logs: "SSH timeout" });
        }, 15000);

        conn.on("ready", () => {
          conn.exec(`journalctl -u voice-ai-bridge -n ${numLines} --no-pager 2>&1`, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              conn.end();
              resolve({ success: false, logs: err.message });
              return;
            }
            let output = "";
            stream.on("data", (data: Buffer) => { output += data.toString(); });
            stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
            stream.on("close", () => {
              clearTimeout(timeout);
              conn.end();
              resolve({ success: true, logs: output.trim() });
            });
          });
        });

        conn.on("error", (err: Error) => {
          clearTimeout(timeout);
          resolve({ success: false, logs: err.message });
        });

        conn.connect({ host, port: 22, username: sshUser, password: sshPassword, readyTimeout: 10000 });
      });
    }),

  /** Test call with Voice AI - originates a test call to a phone number */
  testCall: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10).max(15),
      promptId: z.number(),
      callerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Queue a test call with voice_ai routing
      const prompt = await db.getVoiceAiPrompt(input.promptId, ctx.user.id);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });

      // Use the call queue system to originate the test call
      const callerId = input.callerId || "0000000000";
      const result = await db.enqueueCall({
        userId: ctx.user.id,
        campaignId: 0, // test call
        phoneNumber: input.phoneNumber,
        channel: `SIP/${input.phoneNumber}`,
        context: "voice-ai-handler",
        callerIdStr: callerId,
        audioUrl: "", // Voice AI doesn't use pre-recorded audio
        priority: 1,
        variables: {
          routingMode: "voice_ai",
          voiceAiPromptId: String(input.promptId),
          contactName: "Test Call",
        },
      });

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        action: "voiceai.testCall",
        resource: "voice-ai-bridge",
        details: { phoneNumber: input.phoneNumber, promptId: input.promptId },
      });

      return {
        success: true,
        message: `Test call queued to ${input.phoneNumber} using prompt "${prompt.name}"`,
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
