/**
 * Voice AI Bridge Installer
 * 
 * Serves a bash installer script at /api/voice-ai/install?key=<api_key>
 * Same pattern as the PBX Agent installer — run on FreePBX via:
 *   curl -s 'https://your-domain/api/voice-ai/install?key=YOUR_KEY' | bash
 */
import { Router, Request, Response } from "express";
import * as db from "../db";

export function createVoiceAiInstallerRouter(): Router {
  const router = Router();

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
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const dashboardUrl = `${protocol}://${host}`;
    const dashboardApiUrl = `${dashboardUrl}/api/pbx`;

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
    const bridgePort = 8089;
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
    ].join("\\n");

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

function generateVoiceAiInstaller(
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
pip3 install aiohttp websockets 2>&1 | tail -1 || pip install aiohttp websockets 2>&1 | tail -1 || true
echo "[OK] Python dependencies installed"

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

# Deploy Voice AI dialplan
cat > /etc/asterisk/extensions_voice_ai.conf << 'DIALPLAN_EOF'`);

  parts.push(dialplanConf);

  parts.push(`DIALPLAN_EOF

# Include dialplan in extensions_custom.conf
if [ -f /etc/asterisk/extensions_custom.conf ]; then
  if ! grep -q "#include extensions_voice_ai.conf" /etc/asterisk/extensions_custom.conf 2>/dev/null; then
    echo '#include extensions_voice_ai.conf' >> /etc/asterisk/extensions_custom.conf
    echo "[OK] Voice AI dialplan included in extensions_custom.conf"
  else
    echo "[OK] Voice AI dialplan already included"
  fi
fi

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
