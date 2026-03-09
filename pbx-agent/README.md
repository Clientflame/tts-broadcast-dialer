# PBX Agent for AI TTS Broadcast Dialer

A lightweight Python agent that runs on your FreePBX server. It polls the web app for pending calls and originates them via local AMI — no inbound connections or firewall changes needed.

## Architecture

```
Web App (Manus)  <──HTTPS──>  PBX Agent (FreePBX)  ──AMI──>  Asterisk
                                                     ──curl──>  S3 (audio)
```

- **All connections are outbound** from FreePBX — no firewall rules needed
- The agent polls `/api/pbx/poll` every 3 seconds for pending calls
- Calls are originated via local AMI (127.0.0.1:5038)
- Audio files are downloaded from S3 and converted locally
- Call results are reported back to `/api/pbx/report`

## Requirements

- Python 3.6+
- ffmpeg (for audio conversion)
- curl (for audio download)
- Local AMI access (default on FreePBX)

## Quick Install

1. Copy this directory to your FreePBX server
2. Run the install script:

```bash
cd pbx-agent
chmod +x install.sh
sudo ./install.sh
```

3. Enter your app URL and API key when prompted

## Manual Install

```bash
# Copy agent script
sudo mkdir -p /opt/pbx-agent
sudo cp pbx_agent.py /opt/pbx-agent/

# Edit the service file with your API URL and key
sudo cp pbx-agent.service /etc/systemd/system/

# Start the service
sudo systemctl daemon-reload
sudo systemctl enable pbx-agent
sudo systemctl start pbx-agent
```

## Configuration

Environment variables (set in the systemd service file):

| Variable | Default | Description |
|----------|---------|-------------|
| PBX_AGENT_API_URL | (required) | Full URL to the PBX API endpoint |
| PBX_AGENT_API_KEY | (required) | API key for authentication |
| AMI_HOST | 127.0.0.1 | Asterisk AMI host |
| AMI_PORT | 5038 | Asterisk AMI port |
| AMI_USER | broadcast_dialer | AMI username |
| AMI_SECRET | Br0adcast!D1aler2024 | AMI password |
| POLL_INTERVAL | 3 | Seconds between polls |
| MAX_CONCURRENT | 5 | Maximum concurrent calls |

## Monitoring

```bash
# Service status
systemctl status pbx-agent

# Live logs
journalctl -u pbx-agent -f

# Log file
tail -f /var/log/pbx-agent.log
```

## Troubleshooting

**Agent not connecting to API:**
- Check the API URL is correct and accessible from the FreePBX server
- Verify the API key matches what's configured in the web app

**Calls not originating:**
- Check AMI credentials: `asterisk -rx "manager show connected"`
- Verify the trunk name matches your outbound route
- Check audio directory permissions: `ls -la /var/lib/asterisk/sounds/custom/broadcast/`

**Audio not playing:**
- Ensure ffmpeg is installed: `which ffmpeg`
- Check audio file format: `file /var/lib/asterisk/sounds/custom/broadcast/*.wav`
- Verify Asterisk can find the file: `asterisk -rx "core show file formats"`
