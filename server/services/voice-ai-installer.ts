/**
 * Voice AI Bridge Installer & API
 * 
 * Serves:
 * - GET  /api/voice-ai/install?key=<api_key>     — Bash installer script
 * - GET  /api/voice-ai/prompt/:id?key=<api_key>  — Fetch prompt config (for bridge)
 * - POST /api/voice-ai/conversation?key=<api_key> — Report conversation results (from bridge)
 * 
 * Same pattern as the PBX Agent installer — run on FreePBX via:
 *   curl -s 'https://your-domain/api/voice-ai/install?key=YOUR_KEY' | bash
 */
import { Router, Request, Response } from "express";
import * as db from "../db";

export function createVoiceAiInstallerRouter(): Router {
  const router = Router();

  // ─── Middleware: validate API key ──────────────────────────────────────────
  async function validateApiKey(req: Request, res: Response): Promise<boolean> {
    const apiKey = (req.query.key || req.headers["x-api-key"] || req.headers.authorization?.replace("Bearer ", "")) as string;
    if (!apiKey) {
      res.status(401).json({ error: "Missing API key" });
      return false;
    }
    const agent = await db.getPbxAgentByApiKey(apiKey);
    if (!agent) {
      res.status(403).json({ error: "Invalid API key" });
      return false;
    }
    return true;
  }

  // ─── GET /prompt/:id — Fetch prompt config for the bridge ─────────────────
  router.get("/prompt/:id", async (req: Request, res: Response) => {
    try {
      if (!(await validateApiKey(req, res))) return;

      const promptId = parseInt(req.params.id, 10);
      if (isNaN(promptId)) {
        res.status(400).json({ error: "Invalid prompt ID" });
        return;
      }

      // Get the prompt — bridge needs it regardless of user ownership
      // since the bridge runs on the PBX server and serves all users
      const prompt = await db.getVoiceAiPromptById(promptId);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }

      // Parse enabledTools (stored as JSON string array of tool names)
      let enabledTools: string[] = [];
      try {
        if (prompt.enabledTools) {
          enabledTools = typeof prompt.enabledTools === "string" ? JSON.parse(prompt.enabledTools) : prompt.enabledTools;
        }
      } catch {
        enabledTools = [];
      }

      res.json({
        id: prompt.id,
        name: prompt.name,
        systemPrompt: prompt.systemPrompt,
        openingMessage: prompt.openingMessage || "",
        voice: prompt.voice || "alloy",
        language: prompt.language || "en",
        temperature: prompt.temperature || "0.7",
        maxTurnDuration: prompt.maxTurnDuration || 120,
        maxConversationDuration: prompt.maxConversationDuration || 300,
        silenceTimeout: prompt.silenceTimeout || 10,
        requireAiDisclosure: prompt.requireAiDisclosure,
        requireMiniMiranda: prompt.requireMiniMiranda,
        miniMirandaText: prompt.miniMirandaText || "",
        escalateOnDtmf: prompt.escalateOnDtmf || "#",
        escalateKeywords: prompt.escalateKeywords || [],
        enabledTools,
      });
    } catch (e: any) {
      console.error("[VoiceAI API] Error fetching prompt:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── POST /conversation — Report conversation results from bridge ─────────
  router.post("/conversation", async (req: Request, res: Response) => {
    try {
      if (!(await validateApiKey(req, res))) return;

      const {
        channelId,
        promptId,
        contactName,
        contactPhone,
        campaignName,
        duration,
        transcript,
        disposition,
        sentiment,
        endReason,
      } = req.body;

      console.log(`[VoiceAI API] Conversation report: ${channelId} | Prompt: ${promptId} | Duration: ${duration}s | Disposition: ${disposition}`);

      // Parse transcript into the expected typed array format
      let parsedTranscript: Array<{ role: string; content: string; timestamp: number; functionCall?: { name: string; args: string; result?: string } }> = [];
      try {
        if (typeof transcript === "string") {
          parsedTranscript = JSON.parse(transcript);
        } else if (Array.isArray(transcript)) {
          parsedTranscript = transcript;
        }
      } catch {
        parsedTranscript = [];
      }

      // Look up the prompt to get the userId (required field)
      let userId = 0;
      const pId = parseInt(promptId, 10);
      if (pId) {
        const prompt = await db.getVoiceAiPromptById(pId);
        if (prompt) userId = prompt.userId;
      }

      // Store conversation in the database
      try {
        await db.createVoiceAiConversation({
          userId,
          promptId: pId || undefined,
          phoneNumber: contactPhone || "unknown",
          contactName: contactName || "Unknown",
          transcript: parsedTranscript,
          duration: parseInt(duration, 10) || 0,
          disposition: disposition || "completed",
          sentiment: sentiment || "neutral",
          status: "completed",
          startedAt: Date.now() - ((parseInt(duration, 10) || 0) * 1000),
          endedAt: Date.now(),
        });
      } catch (dbErr: any) {
        // Log but don't fail — conversation table might not exist yet
        console.warn("[VoiceAI API] Could not store conversation:", dbErr.message);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("[VoiceAI API] Error reporting conversation:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── GET /filter-check — Check if inbound call should be filtered ──────────
  // Called by the Voice AI Bridge before processing an inbound call.
  // Returns { allowed: true/false, rejectMessage?: string, reason?: string }
  router.get("/filter-check", async (req: Request, res: Response) => {
    try {
      if (!(await validateApiKey(req, res))) return;

      const callerNumber = (req.query.caller as string) || "";
      const didNumber = (req.query.did as string) || "";

      if (!callerNumber || !didNumber) {
        // If we can't identify caller or DID, allow by default
        res.json({ allowed: true, reason: "missing_params" });
        return;
      }

      // Use the comprehensive checkInboundCaller function from db.ts
      const result = await db.checkInboundCaller(didNumber, callerNumber);

      // If the result says "needs CRM check", do it here (requires async API calls)
      if (result.reason === "not_found_needs_crm_check") {
        try {
          const crmResult = await checkExternalCrmLookup(callerNumber);
          if (crmResult.found) {
            // Log the allowed call
            await db.logInboundFilter({ didNumber, callerNumber, action: "allowed", reason: "crm_contact", matchSource: "external_crm", filterRuleId: result.filterRuleId });
            res.json({ allowed: true, reason: "crm_contact", contactName: crmResult.name });
            return;
          }
        } catch (crmErr) {
          console.warn("[InboundFilter] CRM check failed:", crmErr);
          // Fail open on CRM error
          await db.logInboundFilter({ didNumber, callerNumber, action: "allowed", reason: "crm_error_failopen", filterRuleId: result.filterRuleId });
          res.json({ allowed: true, reason: "crm_error_failopen" });
          return;
        }
        // CRM didn't find them either — reject
        const rule = result.filterRuleId ? await db.getInboundFilterRule(result.filterRuleId) : null;
        let rejectionMsg = { text: "We're sorry, this number is not currently accepting calls. Goodbye.", voice: "en-US-Wavenet-F" };
        if (rule) {
          const ruleData = rule as any;
          if (ruleData.rejectionMessageId) {
            const msg = await db.getInboundFilterMessage(ruleData.rejectionMessageId);
            if (msg) rejectionMsg = { text: msg.messageText, voice: msg.voice ?? "en-US-Wavenet-F" };
          }
        }
        await db.logInboundFilter({ didNumber, callerNumber, action: "rejected", reason: "not_in_whitelist_or_crm", matchSource: "none", filterRuleId: result.filterRuleId });
        res.json({ allowed: false, reason: "not_in_whitelist", rejectMessage: rejectionMsg.text, rejectVoice: rejectionMsg.voice });
        return;
      }

      // Log the filter event
      await db.logInboundFilter({ didNumber, callerNumber, action: result.action, reason: result.reason, matchSource: result.matchSource, filterRuleId: result.filterRuleId });

      if (result.action === "rejected") {
        res.json({
          allowed: false,
          reason: result.reason,
          rejectMessage: result.rejectionMessage?.text || "We're sorry, this number is not currently accepting calls. Goodbye.",
          rejectVoice: result.rejectionMessage?.voice || "en-US-Wavenet-F",
        });
      } else {
        res.json({ allowed: true, reason: result.reason });
      }

    } catch (e: any) {
      console.error("[InboundFilter] Error checking filter:", e);
      // Fail open on error — don't block calls due to system errors
      res.json({ allowed: true, reason: "error_failopen" });
    }
  });

  // ─── External CRM Lookup Helper ──────────────────────────────────────────────
  async function checkExternalCrmLookup(phoneNumber: string): Promise<{ found: boolean; name?: string }> {
    // Get CRM settings from app_settings
    const crmType = await db.getAppSetting("crm_type") || "vtiger";
    const crmUrl = await db.getAppSetting("crm_api_url") || "";
    const crmToken = await db.getAppSetting("crm_api_token") || "";
    const crmUsername = await db.getAppSetting("crm_username") || "";

    if (!crmUrl || !crmToken) {
      console.warn("[InboundFilter] CRM not configured (missing url or token)");
      return { found: false };
    }

    if (crmType === "vtiger") {
      return await vtigerLookup(crmUrl, crmUsername, crmToken, phoneNumber);
    }

    // Add more CRM integrations here in the future
    console.warn(`[InboundFilter] Unknown CRM type: ${crmType}`);
    return { found: false };
  }

  async function vtigerLookup(baseUrl: string, username: string, accessKey: string, phone: string): Promise<{ found: boolean; name?: string }> {
    try {
      // Vtiger Cloud REST API - search contacts by phone
      const normalizedPhone = phone.replace(/\D/g, "");
      const query = encodeURIComponent(`SELECT firstname,lastname FROM Contacts WHERE phone='${normalizedPhone}' OR mobile='${normalizedPhone}';`);
      const url = `${baseUrl}/webservice.php?operation=query&sessionName=${accessKey}&query=${query}`;

      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();

      if (data.success && data.result && data.result.length > 0) {
        const contact = data.result[0];
        return { found: true, name: `${contact.firstname || ""} ${contact.lastname || ""}`.trim() };
      }

      // Also check Leads
      const leadQuery = encodeURIComponent(`SELECT firstname,lastname FROM Leads WHERE phone='${normalizedPhone}' OR mobile='${normalizedPhone}';`);
      const leadUrl = `${baseUrl}/webservice.php?operation=query&sessionName=${accessKey}&query=${leadQuery}`;
      const leadResponse = await fetch(leadUrl, { signal: AbortSignal.timeout(5000) });
      const leadData = await leadResponse.json();

      if (leadData.success && leadData.result && leadData.result.length > 0) {
        const lead = leadData.result[0];
        return { found: true, name: `${lead.firstname || ""} ${lead.lastname || ""}`.trim() };
      }

      return { found: false };
    } catch (err) {
      console.error("[InboundFilter] Vtiger lookup error:", err);
      throw err;
    }
  }

  // ─── GET /install — Bash installer script ─────────────────────────────────
  router.get("/install", async (req: Request, res: Response) => {
    const apiKey = req.query.key as string;
    if (!apiKey) {
      res.status(400).setHeader("Content-Type", "text/plain").send("#!/bin/bash\necho 'ERROR: Missing API key parameter'\necho 'Usage: curl -s \"https://your-domain/api/voice-ai/install?key=YOUR_KEY\" | bash'\nexit 1\n");
      return;
    }

    // Validate the API key belongs to a registered PBX agent
    const agent = await db.getPbxAgentByApiKey(apiKey);
    if (!agent) {
      res.status(403).setHeader("Content-Type", "text/plain").send("#!/bin/bash\necho 'ERROR: Invalid API key'\nexit 1\n");
      return;
    }

    // Build the API URL from the request
    // Default to "http" for self-hosted deployments without reverse proxy
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const dashboardUrl = `${protocol}://${host}`;
    // Point the bridge at the voice-ai API endpoints (not /api/pbx)
    const dashboardApiUrl = `${dashboardUrl}/api/voice-ai`;

    // Get OpenAI key
    const openaiKey = await db.getAppSetting("openai_api_key") || process.env.OPENAI_API_KEY || "";

    // Read the bridge Python script and config files
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
        res.status(500).setHeader("Content-Type", "text/plain").send("#!/bin/bash\necho 'ERROR: Could not read Voice AI Bridge files on server'\nexit 1\n");
        return;
      }
    }

    // ARI defaults
    const ariUser = "voice-ai";
    const ariPassword = "voice-ai-secret";
    const bridgePort = 8090;
    const openaiModel = "gpt-4o-realtime-preview";

    // Build the .env content
    const envContent = [
      `OPENAI_API_KEY=${openaiKey}`,
      `DASHBOARD_API_URL=${dashboardApiUrl}`,
      `DASHBOARD_API_KEY=${apiKey}`,
      `ARI_URL=http://localhost:8088`,
      `ARI_USER=${ariUser}`,
      `ARI_PASSWORD=${ariPassword}`,
      `ARI_APP=voice-ai-bridge`,
      `BRIDGE_PORT=${bridgePort}`,
      `OPENAI_MODEL=${openaiModel}`,
      `LOG_LEVEL=INFO`,
    ].join("\n");

    // Generate the installer script
    const script = generateVoiceAiInstaller(
      bridgeScript,
      dialplanConf,
      envContent,
      ariUser,
      ariPassword,
      dashboardUrl,
    );

    res.setHeader("Content-Type", "text/plain");
    res.send(script);
  });

  return router;
}

export function generateVoiceAiInstaller(
  bridgeScript: string,
  dialplanConf: string,
  envContent: string,
  ariUser: string,
  ariPassword: string,
  dashboardUrl: string,
): string {
  const parts: string[] = [];

  parts.push(`#!/bin/bash
# ============================================================================
# Voice AI Bridge Installer for AI TTS Broadcast Dialer
# Auto-generated installer - run on your FreePBX/Asterisk server
# ============================================================================
set -e

echo ""
echo "========================================"
echo "  Voice AI Bridge Installer"
echo "  Asterisk ARI + OpenAI Realtime API"
echo "========================================"
echo ""

# Check if running as root
if [ "\$(id -u)" -ne 0 ]; then
  echo "ERROR: This installer must be run as root"
  echo "  Try: sudo bash or run as root user"
  exit 1
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
  echo "ERROR: Python 3 is required but not installed"
  echo "  Install it with: yum install python3  (CentOS/RHEL)"
  echo "                   apt install python3  (Debian/Ubuntu)"
  exit 1
fi

PYTHON_VERSION=\$(python3 --version 2>&1)
echo "[OK] Found \$PYTHON_VERSION"

# Check for Asterisk
if command -v asterisk &> /dev/null; then
  echo "[OK] Asterisk found"
else
  echo "[WARN] Asterisk not detected - ARI connection may fail"
fi

# Check for pip3
if ! command -v pip3 &> /dev/null; then
  echo "Installing pip3..."
  if command -v yum &> /dev/null; then
    yum install -y python3-pip 2>/dev/null || true
  elif command -v apt-get &> /dev/null; then
    apt-get install -y python3-pip 2>/dev/null || true
  fi
fi

# Stop existing service if running
if systemctl is-active --quiet voice-ai-bridge 2>/dev/null; then
  echo "Stopping existing Voice AI Bridge..."
  systemctl stop voice-ai-bridge
fi

# Create installation directory
INSTALL_DIR="/opt/voice-ai-bridge"
mkdir -p "\$INSTALL_DIR"
echo ""
echo "Installing to \$INSTALL_DIR ..."

# Install Python dependencies
echo "Installing Python dependencies..."

# Try multiple pip install methods (FreePBX/CentOS can have quirky Python setups)
if command -v pip3 &> /dev/null; then
  pip3 install --break-system-packages aiohttp websockets 2>/dev/null || pip3 install aiohttp websockets 2>&1 || true
elif command -v pip &> /dev/null; then
  pip install --break-system-packages aiohttp websockets 2>/dev/null || pip install aiohttp websockets 2>&1 || true
else
  python3 -m ensurepip --default-pip 2>/dev/null || true
  python3 -m pip install --break-system-packages aiohttp websockets 2>/dev/null || python3 -m pip install aiohttp websockets 2>&1 || true
fi

# Verify critical modules are importable
if ! python3 -c "import websockets" 2>/dev/null; then
  echo "[WARN] websockets module not found, trying alternative install..."
  python3 -m pip install --user websockets aiohttp 2>&1 || true
  # Also try installing to system site-packages directly
  SITE_PACKAGES=\$(python3 -c "import site; print(site.getsitepackages()[0])" 2>/dev/null || echo "/usr/lib/python3/dist-packages")
  pip3 install --target="\$SITE_PACKAGES" websockets aiohttp 2>/dev/null || true
fi

if ! python3 -c "import aiohttp" 2>/dev/null; then
  echo "[WARN] aiohttp module not found, trying alternative install..."
  SITE_PACKAGES=\$(python3 -c "import site; print(site.getsitepackages()[0])" 2>/dev/null || echo "/usr/lib/python3/dist-packages")
  pip3 install --target="\$SITE_PACKAGES" aiohttp 2>/dev/null || true
fi

# Final verification
if python3 -c "import websockets, aiohttp" 2>/dev/null; then
  echo "[OK] Python dependencies installed and verified"
else
  echo "[ERROR] Could not install Python dependencies. Install manually:"
  echo "  pip3 install aiohttp websockets"
  echo "  Then restart: systemctl restart voice-ai-bridge"
fi

# Write the Voice AI Bridge script
cat > "\$INSTALL_DIR/voice_ai_bridge.py" << 'BRIDGE_SCRIPT_EOF'`);

  parts.push(bridgeScript);

  parts.push(`BRIDGE_SCRIPT_EOF

chmod +x "\$INSTALL_DIR/voice_ai_bridge.py"
echo "[OK] Voice AI Bridge script installed"

# Write the .env configuration
cat > "\$INSTALL_DIR/.env" << ENV_EOF
${envContent}
ENV_EOF

echo "[OK] Environment configuration written"

# Create systemd service
cat > /etc/systemd/system/voice-ai-bridge.service << 'SERVICE_EOF'
[Unit]
Description=Voice AI Bridge - Asterisk ARI to OpenAI Realtime
After=network.target asterisk.service
Wants=asterisk.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/voice-ai-bridge
EnvironmentFile=/opt/voice-ai-bridge/.env
ExecStart=/usr/bin/python3 /opt/voice-ai-bridge/voice_ai_bridge.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

echo "[OK] Systemd service created"

# Configure Asterisk ARI user
if [ -f /etc/asterisk/ari.conf ]; then
  if ! grep -q "\\[${ariUser}\\]" /etc/asterisk/ari.conf 2>/dev/null; then
    cat >> /etc/asterisk/ari.conf << ARI_EOF

[${ariUser}]
type=user
read_only=no
password=${ariPassword}
ARI_EOF
    echo "[OK] ARI user '${ariUser}' added to ari.conf"
  else
    echo "[OK] ARI user '${ariUser}' already configured"
  fi
else
  echo "[WARN] /etc/asterisk/ari.conf not found - create it manually"
fi

# Enable ARI in Asterisk HTTP config
if [ -f /etc/asterisk/http.conf ]; then
  if ! grep -q "^enabled=yes" /etc/asterisk/http.conf 2>/dev/null; then
    sed -i 's/^enabled=no/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
    sed -i 's/^;enabled=yes/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
    echo "[OK] ARI HTTP enabled in http.conf"
  else
    echo "[OK] ARI HTTP already enabled"
  fi
fi

# Ensure required Asterisk modules are loaded for ExternalMedia/ARI
asterisk -rx 'module load res_ari' 2>/dev/null || true
asterisk -rx 'module load res_stasis' 2>/dev/null || true
asterisk -rx 'module load res_ari_channels' 2>/dev/null || true
asterisk -rx 'module load res_ari_bridges' 2>/dev/null || true
echo "[OK] ARI modules loaded"

# Deploy Voice AI dialplan - write inline into extensions_custom.conf
# (Avoids #include which can fail if Asterisk runs out of file descriptors)
cat > /etc/asterisk/extensions_voice_ai.conf << 'DIALPLAN_EOF'`);

  parts.push(dialplanConf);

  parts.push(`DIALPLAN_EOF

# Remove old #include reference if present
if [ -f /etc/asterisk/extensions_custom.conf ]; then
  sed -i '/^#include extensions_voice_ai.conf$/d' /etc/asterisk/extensions_custom.conf
fi

# Remove any previously inlined voice-ai-handler context
if [ -f /etc/asterisk/extensions_custom.conf ]; then
  python3 -c "
import re
with open('/etc/asterisk/extensions_custom.conf') as f:
    content = f.read()
# Remove the voice-ai-handler block (from context header to end of its extensions)
cleaned = re.sub(r'\\n*\\[voice-ai-handler\\][\\s\\S]*?(?=\\n\\[|\\Z)', '', content)
with open('/etc/asterisk/extensions_custom.conf', 'w') as f:
    f.write(cleaned.rstrip() + '\\n')
" 2>/dev/null || true
fi

# Append the voice-ai-handler context inline
cat >> /etc/asterisk/extensions_custom.conf << 'INLINE_DIALPLAN_EOF'

[voice-ai-handler]
exten => s,1,NoOp(Voice AI Bridge - Prompt: \${VOICE_AI_PROMPT_ID})
same => n,Answer()
same => n,Wait(0.5)
same => n,Stasis(voice-ai-bridge,\${VOICE_AI_PROMPT_ID},\${CONTACT_NAME},\${CONTACT_PHONE},\${CAMPAIGN_NAME})
same => n,Hangup()

exten => failed,1,NoOp(Voice AI call failed)
same => n,Hangup()

exten => h,1,NoOp(Voice AI call hangup handler)
INLINE_DIALPLAN_EOF

echo "[OK] Voice AI dialplan deployed"

# Reload Asterisk
asterisk -rx 'core reload' 2>&1 || echo "[WARN] Could not reload Asterisk"
echo "[OK] Asterisk configuration reloaded"

# Enable and start the service
systemctl daemon-reload
systemctl enable voice-ai-bridge
systemctl restart voice-ai-bridge

# Wait and check status
sleep 3
if systemctl is-active --quiet voice-ai-bridge; then
  echo ""
  echo "========================================"
  echo "  Installation Complete!"
  echo "========================================"
  echo ""
  echo "  Install Dir:   \$INSTALL_DIR"
  echo "  Service:       voice-ai-bridge.service"
  echo "  Status:        RUNNING"
  echo "  Dashboard:     ${dashboardUrl}"
  echo ""
  echo "  Useful commands:"
  echo "    systemctl status voice-ai-bridge     # Check status"
  echo "    journalctl -u voice-ai-bridge -f     # View live logs"
  echo "    systemctl restart voice-ai-bridge    # Restart bridge"
  echo "    systemctl stop voice-ai-bridge       # Stop bridge"
  echo ""
  echo "  The bridge should appear online in your dashboard within 10 seconds."
  echo ""
  echo "  To update later, just re-run the same curl command."
else
  echo ""
  echo "[WARN] Service installed but may not be running."
  echo "  Check logs: journalctl -u voice-ai-bridge -n 20"
  echo ""
fi`);

  return parts.join("\n");
}
