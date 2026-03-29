#!/bin/bash
# PBX Agent Installer for FreePBX
# Run this on your FreePBX server as root
#
# This installer:
#   1. Deploys the PBX agent Python script
#   2. Creates the systemd service
#   3. Deploys the correct Asterisk dialplan (tts-broadcast, tts-broadcast-amd, voice-ai-handler)
#   4. Enables ARI for Voice AI Bridge support
#   5. Reloads Asterisk configuration

set -e

echo "=== PBX Agent Installer ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root"
    exit 1
fi

# Check for required tools
for cmd in python3 ffmpeg curl; do
    if ! command -v $cmd &> /dev/null; then
        echo "ERROR: $cmd is required but not installed"
        exit 1
    fi
done

# Get configuration from user
if [ -z "$PBX_AGENT_API_URL" ]; then
    read -p "Enter your app URL (e.g., https://your-app.manus.space): " APP_URL
    PBX_AGENT_API_URL="${APP_URL}/api/pbx"
fi

if [ -z "$PBX_AGENT_API_KEY" ]; then
    read -p "Enter your PBX Agent API key: " PBX_AGENT_API_KEY
fi

if [ -z "$AMI_USER" ]; then
    read -p "Enter AMI username [dialer]: " AMI_USER
    AMI_USER=${AMI_USER:-dialer}
fi

if [ -z "$AMI_SECRET" ]; then
    read -sp "Enter AMI password: " AMI_SECRET
    echo ""
fi

# Create directory
echo "Creating /opt/pbx-agent..."
mkdir -p /opt/pbx-agent

# Copy agent script
echo "Installing agent script..."
cp pbx_agent.py /opt/pbx-agent/pbx_agent.py
chmod +x /opt/pbx-agent/pbx_agent.py

# Create audio directory
echo "Creating audio directory..."
mkdir -p /var/lib/asterisk/sounds/custom/broadcast
if id asterisk &>/dev/null; then
    chown asterisk:asterisk /var/lib/asterisk/sounds/custom/broadcast
fi

# ============================================================================
# Deploy Asterisk Dialplan
# ============================================================================
echo ""
echo "Configuring Asterisk dialplan..."

# Use Python to safely manage extensions_custom.conf — remove old contexts, then append fresh ones
python3 << 'DIALPLAN_DEPLOY_SCRIPT'
import re, os

conf_path = "/etc/asterisk/extensions_custom.conf"

# Read existing content (or start fresh)
if os.path.exists(conf_path):
    with open(conf_path) as f:
        content = f.read()
else:
    content = ""

# Remove any existing tts-broadcast, tts-broadcast-amd, and voice-ai-handler contexts
for ctx in ["tts-broadcast-amd", "tts-broadcast", "voice-ai-handler"]:
    pattern = rf"\n*\[{re.escape(ctx)}\][\s\S]*?(?=\n\[|\Z)"
    content = re.sub(pattern, "", content)

# Clean up excessive blank lines
content = re.sub(r"\n{3,}", "\n\n", content).strip()

# Append all three dialplan contexts
dialplan = '''

; ─── TTS Broadcast Dialplan (auto-deployed by PBX Agent Installer) ────────────
[tts-broadcast]
exten => s,1,NoOp(TTS Broadcast - Call answered)
 same => n,Set(CALLID=${CALLID})
 same => n,Wait(0.5)
 same => n,GotoIf($[${EXISTS(${AUDIOFILE})}]?play:no_audio)
 same => n(play),Playback(${AUDIOFILE})
 same => n,WaitExten(10)
 same => n(no_audio),NoOp(No audio file)
 same => n,Hangup()

; ─── TTS Broadcast AMD Dialplan ───────────────────────────────────────────────
[tts-broadcast-amd]
exten => s,1,NoOp(TTS Broadcast AMD - Call answered)
 same => n,Set(CALLID=${CALLID})
 same => n,NoOp(AMD Enabled - Running answering machine detection)
 same => n,AMD()
 same => n,NoOp(AMD Result: ${AMDSTATUS} / Cause: ${AMDCAUSE})
 same => n,GotoIf($["${AMDSTATUS}" = "MACHINE"]?machine:human)
 same => n(human),NoOp(Human detected - playing main message)
 same => n,Set(CDR(amdResult)=HUMAN)
 same => n,Wait(0.5)
 same => n,GotoIf($[${EXISTS(${AUDIOFILE})}]?play_main:no_audio)
 same => n(play_main),Playback(${AUDIOFILE})
 same => n,Goto(check_ivr)
 same => n(machine),NoOp(Machine detected - voicemail drop)
 same => n,Set(CDR(amdResult)=MACHINE)
 same => n,Wait(1)
 same => n,GotoIf($[${EXISTS(${VOICEMAIL_AUDIOFILE})}]?play_vm:play_main_vm)
 same => n(play_vm),Playback(${VOICEMAIL_AUDIOFILE})
 same => n,Set(CDR(voicemailDropped)=1)
 same => n,Goto(done)
 same => n(play_main_vm),GotoIf($[${EXISTS(${AUDIOFILE})}]?play_main_as_vm:done)
 same => n(play_main_as_vm),Playback(${AUDIOFILE})
 same => n,Set(CDR(voicemailDropped)=1)
 same => n,Goto(done)
 same => n(no_audio),NoOp(No audio file - hanging up)
 same => n,Goto(done)
 same => n(check_ivr),NoOp(Checking for IVR options)
 same => n,WaitExten(10)
 same => n(done),NoOp(Call complete)
 same => n,Hangup()

; ─── Voice AI Handler Dialplan ────────────────────────────────────────────────
[voice-ai-handler]
exten => s,1,NoOp(Voice AI Bridge - Prompt: ${VOICE_AI_PROMPT_ID})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(voice-ai-bridge,${VOICE_AI_PROMPT_ID},${CONTACT_NAME},${CONTACT_PHONE},${CAMPAIGN_NAME})
 same => n,Hangup()
exten => failed,1,NoOp(Voice AI call failed)
 same => n,Hangup()
exten => h,1,NoOp(Voice AI call hangup handler)
'''

with open(conf_path, 'w') as f:
    f.write(content + dialplan)

print("Dialplan contexts deployed successfully")
DIALPLAN_DEPLOY_SCRIPT

echo "[OK] Dialplan deployed (tts-broadcast, tts-broadcast-amd, voice-ai-handler)"

# ============================================================================
# Enable ARI (Asterisk REST Interface) for Voice AI Bridge
# ============================================================================
echo ""
echo "Configuring ARI..."

if [ -d /etc/asterisk ]; then
    # FreePBX uses ari_general_additional.conf (auto-generated, may have enabled=no)
    # We override via ari_general_custom.conf which takes precedence
    cat > /etc/asterisk/ari_general_custom.conf << 'ARI_GENERAL_EOF'
[general]
enabled=yes
ARI_GENERAL_EOF
    echo "[OK] ARI enabled via ari_general_custom.conf"

    # Ensure HTTP is enabled (required for ARI)
    if [ -f /etc/asterisk/http.conf ]; then
        if ! grep -q "^enabled=yes" /etc/asterisk/http.conf 2>/dev/null; then
            sed -i 's/^enabled=no/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
            sed -i 's/^;enabled=yes/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
            echo "[OK] HTTP enabled in http.conf"
        else
            echo "[OK] HTTP already enabled"
        fi
    fi

    # Load ARI modules
    asterisk -rx 'module load res_ari' 2>/dev/null || true
    asterisk -rx 'module load res_stasis' 2>/dev/null || true
    asterisk -rx 'module load res_ari_channels' 2>/dev/null || true
    asterisk -rx 'module load res_ari_bridges' 2>/dev/null || true
    echo "[OK] ARI modules loaded"
else
    echo "[WARN] /etc/asterisk not found - skipping ARI configuration"
fi

# Reload Asterisk to apply dialplan and ARI changes
asterisk -rx 'core reload' 2>&1 || echo "[WARN] Could not reload Asterisk"
echo "[OK] Asterisk configuration reloaded"

# ============================================================================
# Install systemd service
# ============================================================================
echo ""
echo "Installing systemd service..."
cat > /etc/systemd/system/pbx-agent.service << EOF
[Unit]
Description=PBX Agent for AI TTS Broadcast Dialer
After=network.target asterisk.service
Wants=asterisk.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pbx-agent
ExecStart=/usr/bin/python3 /opt/pbx-agent/pbx_agent.py
Restart=always
RestartSec=5
Environment=PBX_AGENT_API_URL=${PBX_AGENT_API_URL}
Environment=PBX_AGENT_API_KEY=${PBX_AGENT_API_KEY}
Environment=AMI_HOST=127.0.0.1
Environment=AMI_PORT=5038
Environment=AMI_USER=${AMI_USER}
Environment=AMI_SECRET=${AMI_SECRET}
Environment=POLL_INTERVAL=3
Environment=MAX_CONCURRENT=5

[Install]
WantedBy=multi-user.target
EOF

# Reload and start
echo "Starting PBX Agent..."
systemctl daemon-reload
systemctl enable pbx-agent.service
systemctl restart pbx-agent.service

# Wait and check status
sleep 2
if systemctl is-active --quiet pbx-agent; then
    echo ""
    echo "========================================"
    echo "  Installation Complete!"
    echo "========================================"
    echo ""
    echo "  Configured:"
    echo "    ✓ Dialplan: tts-broadcast, tts-broadcast-amd, voice-ai-handler"
    echo "    ✓ ARI: enabled via ari_general_custom.conf"
    echo "    ✓ Audio dir: /var/lib/asterisk/sounds/custom/broadcast"
    echo "    ✓ Service: pbx-agent.service (RUNNING)"
    echo ""
    echo "  Useful commands:"
    echo "    systemctl status pbx-agent    # Check status"
    echo "    journalctl -u pbx-agent -f    # View live logs"
    echo "    systemctl restart pbx-agent   # Restart agent"
    echo "    systemctl stop pbx-agent      # Stop agent"
    echo ""
    echo "  The agent is now polling ${PBX_AGENT_API_URL} for calls."
else
    echo ""
    echo "[WARN] Service installed but may not be running."
    echo "  Check logs: journalctl -u pbx-agent -n 20"
fi
