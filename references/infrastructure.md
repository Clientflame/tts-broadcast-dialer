# Production Infrastructure

## Servers

| Server | Hostname | IP | Role |
|--------|----------|-----|------|
| Production App | app26.407hosted.com | 149.28.98.47 | Runs the TTS Broadcast Dialer web app (Docker: tts-dialer, tts-dialer-db, tts-dialer-minio, tts-dialer-caddy) |
| Production PBX | pbx26.407hosted.com | 45.77.75.198 | Runs FreePBX + Asterisk + PBX Agent (systemd: pbx-agent) |

These two servers always work together as a pair.

## Access Credentials

- **App Server (app26):** SSH as `root` on port 22
- **PBX Server (pbx26):** SSH as `root` on port 22 (credentials in FREEPBX_SSH_USER / FREEPBX_SSH_PASSWORD env vars)
- **AMI (Asterisk Manager Interface):** Port 5038 on pbx26 (credentials in FREEPBX_AMI_USER / FREEPBX_AMI_PASSWORD env vars)

## Architecture

```
User → vai26.407hosted.com (Caddy reverse proxy on app26)
         ↓
       tts-dialer container (Node.js app)
         ↓ (HTTP API calls)
       pbx-agent (Python, systemd service on pbx26)
         ↓ (AMI protocol)
       Asterisk/FreePBX (on pbx26)
         ↓ (SIP trunks)
       PSTN calls
```

## PBX Agent

- Location: `/opt/pbx-agent/pbx_agent.py`
- Service: `systemctl status pbx-agent`
- Logs: `journalctl -u pbx-agent -f`
- Update method: Download latest from GitHub and restart service

## Key Ports

- 3000: Web app (internal, proxied by Caddy)
- 443: HTTPS (Caddy on app26)
- 5038: AMI (pbx26)
- 9000: MinIO (app26, internal)
