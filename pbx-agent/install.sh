#!/bin/bash
# PBX Agent Installer for FreePBX
# Run this on your FreePBX server as root

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
chown asterisk:asterisk /var/lib/asterisk/sounds/custom/broadcast

# Install systemd service
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
Environment=AMI_USER=broadcast_dialer
Environment=AMI_SECRET=Br0adcast!D1aler2024
Environment=POLL_INTERVAL=3
Environment=MAX_CONCURRENT=5

[Install]
WantedBy=multi-user.target
EOF

# Ensure the dialplan is set up
echo "Checking Asterisk dialplan..."
if ! grep -q "tts-broadcast" /etc/asterisk/extensions_custom.conf 2>/dev/null; then
    echo "Adding tts-broadcast dialplan..."
    cat >> /etc/asterisk/extensions_custom.conf << 'DIALPLAN'

[tts-broadcast]
exten => s,1,Answer()
 same => n,Wait(0.5)
 same => n,Set(AUDIODIR=/var/lib/asterisk/sounds/custom/broadcast)
 same => n,GotoIf($["${AUDIOFILE}" != ""]?playfile)
 same => n,GotoIf($["${AUDIO_URL}" = ""]?noaudio)
 same => n,GotoIf($["${AUDIO_NAME}" = ""]?noaudio)
 same => n,System(mkdir -p ${AUDIODIR})
 same => n,System(curl -sL -o ${AUDIODIR}/${AUDIO_NAME}_tmp.mp3 "${AUDIO_URL}")
 same => n,System(ffmpeg -y -i ${AUDIODIR}/${AUDIO_NAME}_tmp.mp3 -ar 8000 -ac 1 -sample_fmt s16 ${AUDIODIR}/${AUDIO_NAME}.wav 2>/dev/null)
 same => n,System(chown asterisk:asterisk ${AUDIODIR}/${AUDIO_NAME}.wav 2>/dev/null)
 same => n,System(rm -f ${AUDIODIR}/${AUDIO_NAME}_tmp.mp3)
 same => n,Set(AUDIOFILE=custom/broadcast/${AUDIO_NAME})
 same => n(playfile),GotoIf($[${EXISTS(${AUDIOFILE})}]?doplay:noaudio)
 same => n(doplay),Playback(${AUDIOFILE})
 same => n,Wait(0.5)
 same => n,Hangup()
 same => n(noaudio),Playback(tt-weasels)
 same => n,Hangup()
DIALPLAN
    asterisk -rx "dialplan reload" 2>/dev/null || true
    echo "Dialplan added and reloaded"
else
    echo "Dialplan already exists"
fi

# Reload and start
echo "Starting PBX Agent..."
systemctl daemon-reload
systemctl enable pbx-agent.service
systemctl start pbx-agent.service

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Check status:  systemctl status pbx-agent"
echo "View logs:     journalctl -u pbx-agent -f"
echo "Log file:      /var/log/pbx-agent.log"
echo ""
echo "The agent is now polling ${PBX_AGENT_API_URL} for calls."
