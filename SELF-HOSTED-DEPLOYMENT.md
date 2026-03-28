# AI TTS Broadcast Dialer — Self-Hosted Deployment Guide

**Version:** 1.4.0  
**Target:** Hostinger KVM 4 VPS (4 vCPU, 16GB RAM, 200GB NVMe, Ubuntu 22.04)  
**Domain:** app.407hosted.com  
**Author:** Manus AI  
**Date:** March 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Manus-to-Self-Hosted Service Replacement Matrix](#2-manus-to-self-hosted-service-replacement-matrix)
3. [Prerequisites](#3-prerequisites)
4. [Server Provisioning](#4-server-provisioning)
5. [Install System Dependencies](#5-install-system-dependencies)
6. [Install and Configure MySQL 8](#6-install-and-configure-mysql-8)
7. [Install and Configure MinIO (S3-Compatible Storage)](#7-install-and-configure-minio-s3-compatible-storage)
8. [Deploy the Application](#8-deploy-the-application)
9. [Code Modifications for Self-Hosted Mode](#9-code-modifications-for-self-hosted-mode)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Configure Nginx Reverse Proxy and SSL](#11-configure-nginx-reverse-proxy-and-ssl)
12. [Configure PM2 Process Manager](#12-configure-pm2-process-manager)
13. [Firewall Configuration](#13-firewall-configuration)
14. [DNS Configuration](#14-dns-configuration)
15. [First-Time Setup and Admin Account](#15-first-time-setup-and-admin-account)
16. [FreePBX Integration](#16-freepbx-integration)
17. [Backup Strategy](#17-backup-strategy)
18. [Monitoring and Maintenance](#18-monitoring-and-maintenance)
19. [Updating the Application](#19-updating-the-application)
20. [Troubleshooting](#20-troubleshooting)
21. [New Client Installation Checklist](#21-new-client-installation-checklist)

---

## 1. Architecture Overview

The self-hosted deployment runs the entire AI TTS Broadcast Dialer stack on a single VPS, eliminating all Manus platform dependencies. The architecture consists of four layers running on the same server.

| Layer | Component | Port | Purpose |
|-------|-----------|------|---------|
| **Reverse Proxy** | Nginx | 80, 443 | SSL termination, static file serving, proxy to Node.js |
| **Application** | Node.js 22 + Express + React | 3000 | Web UI, tRPC API, TTS generation, call queue management |
| **Database** | MySQL 8.0 | 3306 | All application data (users, campaigns, contacts, call logs) |
| **Object Storage** | MinIO | 9000, 9001 | TTS audio files, call recordings, uploaded assets |

The VPS communicates outbound to three external services: the **OpenAI API** for TTS generation and LLM features, the **Google TTS API** for Google voice synthesis, and the **FreePBX server** (via SSH and the PBX Agent's HTTPS polling). The FreePBX server initiates inbound HTTPS connections to the VPS to poll for pending calls and report results.

---

## 2. Manus-to-Self-Hosted Service Replacement Matrix

The following table maps every Manus platform dependency to its self-hosted replacement. Each replacement has been chosen for minimal code changes and maximum reliability.

| Manus Service | Used For | Self-Hosted Replacement | Code Changes Required |
|---------------|----------|------------------------|----------------------|
| **Forge Storage Proxy** | TTS audio upload/download (`storagePut`, `storageGet`) | MinIO (S3-compatible) with `@aws-sdk/client-s3` | Rewrite `server/storage.ts` to use direct S3 SDK |
| **Forge LLM Proxy** | AI message generation, agent assist (`invokeLLM`) | Direct OpenAI API via `OPENAI_API_KEY` | Update `server/_core/llm.ts` API URL and auth header |
| **TiDB (Managed MySQL)** | All application data | Local MySQL 8.0 | Change `DATABASE_URL` connection string only |
| **Manus OAuth** | User authentication | Email/password auth (already built in) | Set `standaloneMode` by omitting `OAUTH_SERVER_URL` |
| **Manus Notification Service** | Owner alerts | Email (SMTP) + SMS (Twilio) — already built in | Disable Manus channel, configure SMTP/Twilio in Settings |
| **Google Maps Proxy** | Map component (unused in core dialer) | Direct Google Maps API key or disable | Optional — not required for dialer functionality |
| **Forge Voice Transcription** | Audio transcription | Direct OpenAI Whisper API | Update `server/_core/voiceTranscription.ts` if used |

---

## 3. Prerequisites

Before starting the deployment, ensure you have the following items ready.

| Item | Details |
|------|---------|
| **VPS Access** | SSH root access to 187.124.94.97 (or your target IP) |
| **Domain** | `app.407hosted.com` (or client domain) with DNS access |
| **OpenAI API Key** | From [platform.openai.com](https://platform.openai.com) — used for TTS and LLM |
| **Google TTS API Key** | From [Google Cloud Console](https://console.cloud.google.com) — optional, for Google voices |
| **FreePBX Server** | IP address, SSH credentials, AMI credentials |
| **SMTP Credentials** | For email notifications (Gmail, SendGrid, or any SMTP provider) |
| **Source Code** | GitHub repository access or ZIP of the project |

---

## 4. Server Provisioning

Connect to your Hostinger KVM 4 VPS via SSH. The first step is to secure the server and create a dedicated application user.

```bash
# Connect as root
ssh root@187.124.94.97

# Update system packages
apt update && apt upgrade -y

# Set timezone to US Eastern (adjust for client)
timedatectl set-timezone America/New_York

# Create application user
adduser --disabled-password --gecos "" appuser
usermod -aG sudo appuser

# Set up SSH key authentication for appuser (optional but recommended)
mkdir -p /home/appuser/.ssh
cp ~/.ssh/authorized_keys /home/appuser/.ssh/
chown -R appuser:appuser /home/appuser/.ssh
chmod 700 /home/appuser/.ssh
chmod 600 /home/appuser/.ssh/authorized_keys

# Allow appuser to run sudo without password (for PM2 startup)
echo "appuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/appuser
```

---

## 5. Install System Dependencies

Install Node.js 22, pnpm, Nginx, and other required packages.

```bash
# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify Node.js version
node --version  # Should show v22.x.x

# Install pnpm globally
npm install -g pnpm@10

# Install PM2 process manager
npm install -g pm2

# Install Nginx
apt install -y nginx

# Install Certbot for SSL
apt install -y certbot python3-certbot-nginx

# Install build tools (needed for native npm modules like bcrypt)
apt install -y build-essential python3

# Install ffmpeg (used by FreePBX agent for audio conversion)
apt install -y ffmpeg

# Install MySQL client tools
apt install -y mysql-client
```

---

## 6. Install and Configure MySQL 8

Install MySQL 8.0 locally on the VPS. This replaces the managed TiDB database.

```bash
# Install MySQL 8.0
apt install -y mysql-server

# Secure the installation
mysql_secure_installation
# Answer: Yes to all prompts, set a strong root password

# Start and enable MySQL
systemctl start mysql
systemctl enable mysql

# Create the application database and user
mysql -u root -p <<'EOF'
CREATE DATABASE tts_dialer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dialer'@'localhost' IDENTIFIED BY 'CHANGE_THIS_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON tts_dialer.* TO 'dialer'@'localhost';
FLUSH PRIVILEGES;
EOF
```

The `DATABASE_URL` for the application will be:
```
mysql://dialer:CHANGE_THIS_STRONG_PASSWORD@localhost:3306/tts_dialer
```

**Performance tuning** — Edit `/etc/mysql/mysql.conf.d/mysqld.cnf` and add these settings under `[mysqld]` for optimal performance on 16GB RAM:

```ini
[mysqld]
innodb_buffer_pool_size = 4G
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
max_connections = 200
sort_buffer_size = 4M
read_buffer_size = 2M
tmp_table_size = 64M
max_heap_table_size = 64M
```

Restart MySQL after changes: `systemctl restart mysql`

---

## 7. Install and Configure MinIO (S3-Compatible Storage)

MinIO provides S3-compatible object storage for TTS audio files, call recordings, and uploaded assets. This replaces the Manus Forge Storage Proxy.

```bash
# Download MinIO binary
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
mv minio /usr/local/bin/

# Create data directory
mkdir -p /data/minio

# Create MinIO system user
useradd -r -s /sbin/nologin minio-user
chown -R minio-user:minio-user /data/minio

# Create MinIO environment file
cat > /etc/default/minio <<'EOF'
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=CHANGE_THIS_MINIO_PASSWORD
MINIO_VOLUMES="/data/minio"
MINIO_SERVER_URL=https://storage.407hosted.com
MINIO_BROWSER_REDIRECT_URL=https://storage.407hosted.com/console
EOF

# Create systemd service
cat > /etc/systemd/system/minio.service <<'EOF'
[Unit]
Description=MinIO Object Storage
After=network-online.target
Wants=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES --address ":9000" --console-address ":9001"
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Start MinIO
systemctl daemon-reload
systemctl start minio
systemctl enable minio
```

After MinIO is running, create the storage bucket and set its policy to public-read (so audio URLs work without signing):

```bash
# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
mv mc /usr/local/bin/

# Configure MinIO client
mc alias set local http://localhost:9000 minioadmin CHANGE_THIS_MINIO_PASSWORD

# Create the audio bucket
mc mb local/dialer-audio

# Set bucket policy to public read (so PBX agent can download audio via URL)
mc anonymous set download local/dialer-audio
```

The MinIO credentials for the application will be:

| Variable | Value |
|----------|-------|
| `S3_ENDPOINT` | `http://localhost:9000` |
| `S3_ACCESS_KEY` | `minioadmin` |
| `S3_SECRET_KEY` | `CHANGE_THIS_MINIO_PASSWORD` |
| `S3_BUCKET` | `dialer-audio` |
| `S3_PUBLIC_URL` | `https://storage.407hosted.com/dialer-audio` |

---

## 8. Deploy the Application

Clone the repository and install dependencies as the `appuser`.

```bash
# Switch to appuser
su - appuser

# Clone the repository (or upload the ZIP)
git clone https://github.com/YOUR_ORG/tts-broadcast-dialer.git /home/appuser/app
cd /home/appuser/app

# Install dependencies
pnpm install

# Build the application
pnpm build
```

If using a ZIP file instead of Git:

```bash
mkdir -p /home/appuser/app
cd /home/appuser/app
unzip /tmp/tts-broadcast-dialer.zip -d .
pnpm install
pnpm build
```

---

## 9. Code Modifications for Self-Hosted Mode

The following files need modification to replace Manus platform dependencies with self-hosted alternatives. These changes should be committed to a `self-hosted` branch in your repository.

### 9.1 Replace Storage Proxy (`server/storage.ts`)

The current `storage.ts` uses the Manus Forge Storage Proxy. Replace it with direct S3 SDK calls to MinIO.

```typescript
// server/storage.ts — Self-Hosted Version (MinIO / S3-Compatible)
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = process.env.S3_BUCKET || "dialer-audio";
const PUBLIC_URL = process.env.S3_PUBLIC_URL || "http://localhost:9000/dialer-audio";

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );

  const url = `${PUBLIC_URL}/${key}`;
  return { key, url };
}

export async function storageGet(
  relKey: string,
  expiresIn = 3600
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // For public bucket, return direct URL
  const url = `${PUBLIC_URL}/${key}`;
  return { key, url };
}
```

### 9.2 Update LLM Proxy (`server/_core/llm.ts`)

Change the `resolveApiUrl` function and auth header to use the OpenAI API directly instead of the Forge proxy. Find and replace these sections:

```typescript
// In server/_core/llm.ts, replace the resolveApiUrl function:
const resolveApiUrl = () =>
  process.env.OPENAI_API_BASE_URL
    ? `${process.env.OPENAI_API_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

// Replace the assertApiKey function:
const assertApiKey = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

// In the fetch headers (around line 319), replace:
//   authorization: `Bearer ${ENV.forgeApiKey}`,
// with:
//   authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
```

### 9.3 Update Voice Transcription (`server/_core/voiceTranscription.ts`)

If voice transcription is used, update it to call the OpenAI Whisper API directly:

```typescript
// Replace the API URL and auth header to use OpenAI directly
// Change: ENV.forgeApiUrl → "https://api.openai.com"
// Change: ENV.forgeApiKey → process.env.OPENAI_API_KEY
```

### 9.4 Update Image Generation (`server/_core/imageGeneration.ts`)

If image generation is used, update it to call the OpenAI Images API directly:

```typescript
// Replace the API URL and auth header to use OpenAI directly
// Change: ENV.forgeApiUrl → "https://api.openai.com"  
// Change: ENV.forgeApiKey → process.env.OPENAI_API_KEY
```

### 9.5 Disable Manus Notification Channel

The notification dispatcher (`server/services/notification-dispatcher.ts`) already supports Email and SMS channels. In the `dispatchNotification` function, the Manus channel will gracefully fail when `BUILT_IN_FORGE_API_URL` is not set. No code change is needed — just configure SMTP and/or Twilio in the app's Settings page after deployment.

### 9.6 Auth — Standalone Mode (No Changes Needed)

The application already detects standalone mode automatically. When `OAUTH_SERVER_URL` is not set in the environment, the login page shows email/password fields instead of the Manus OAuth button. The first user to register becomes the admin. No code changes are required.

---

## 10. Environment Variables Reference

Create the `.env` file at `/home/appuser/app/.env` with all required variables.

```bash
cat > /home/appuser/app/.env <<'EOF'
# ─── Core ────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
TZ=America/New_York

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=mysql://dialer:CHANGE_THIS_STRONG_PASSWORD@localhost:3306/tts_dialer

# ─── Authentication ──────────────────────────────────────────────────────────
JWT_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING_HERE
# OAUTH_SERVER_URL is intentionally omitted — enables standalone email/password auth
# VITE_APP_ID is not needed in standalone mode

# ─── S3 / MinIO Storage ─────────────────────────────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=CHANGE_THIS_MINIO_PASSWORD
S3_BUCKET=dialer-audio
S3_PUBLIC_URL=https://storage.407hosted.com/dialer-audio

# ─── OpenAI (TTS + LLM + Whisper) ───────────────────────────────────────────
OPENAI_API_KEY=sk-your-openai-api-key-here

# ─── Google TTS (Optional) ──────────────────────────────────────────────────
GOOGLE_TTS_API_KEY=your-google-tts-api-key-here

# ─── FreePBX Connection ─────────────────────────────────────────────────────
FREEPBX_HOST=45.77.75.198
FREEPBX_SSH_USER=root
FREEPBX_SSH_PASSWORD=your-freepbx-ssh-password
FREEPBX_AMI_USER=admin
FREEPBX_AMI_PASSWORD=your-ami-password
FREEPBX_AMI_PORT=5038

# ─── SMTP (Email Notifications) ─────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=noreply@407hosted.com
SMTP_FROM_NAME=AI TTS Broadcast Dialer

# ─── Application ─────────────────────────────────────────────────────────────
VITE_APP_TITLE=AI TTS Broadcast Dialer
VITE_APP_URL=https://app.407hosted.com

# ─── Owner Info (for admin seeding) ──────────────────────────────────────────
OWNER_NAME=Jay
OWNER_OPEN_ID=owner-standalone
EOF
```

To generate a secure `JWT_SECRET`:
```bash
openssl rand -hex 32
```

---

## 11. Configure Nginx Reverse Proxy and SSL

Set up Nginx as a reverse proxy with SSL termination for both the application and MinIO storage.

### 11.1 Application Nginx Config

```bash
cat > /etc/nginx/sites-available/app.407hosted.com <<'NGINX'
server {
    listen 80;
    server_name app.407hosted.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50M;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/app.407hosted.com /etc/nginx/sites-enabled/
```

### 11.2 MinIO Storage Nginx Config

```bash
cat > /etc/nginx/sites-available/storage.407hosted.com <<'NGINX'
server {
    listen 80;
    server_name storage.407hosted.com;

    # Public read access to the bucket
    location /dialer-audio/ {
        proxy_pass http://127.0.0.1:9000/dialer-audio/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 100M;
    }

    # MinIO Console (admin only — restrict by IP in production)
    location /console/ {
        proxy_pass http://127.0.0.1:9001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/storage.407hosted.com /etc/nginx/sites-enabled/
```

### 11.3 Enable SSL with Let's Encrypt

```bash
# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

# Obtain SSL certificates (ensure DNS is pointed first — see Section 14)
certbot --nginx -d app.407hosted.com -d storage.407hosted.com --non-interactive --agree-tos -m admin@407hosted.com

# Verify auto-renewal
certbot renew --dry-run
```

Certbot automatically configures Nginx for HTTPS and sets up a cron job for certificate renewal.

---

## 12. Configure PM2 Process Manager

PM2 keeps the Node.js application running, restarts it on crashes, and starts it on server boot.

```bash
# Switch to appuser
su - appuser
cd /home/appuser/app

# Start the application with PM2
pm2 start dist/index.js --name "tts-dialer" --env production

# Save the PM2 process list
pm2 save

# Set PM2 to start on boot
pm2 startup systemd -u appuser --hp /home/appuser
# Run the command PM2 outputs (it will be something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u appuser --hp /home/appuser

# Verify the app is running
pm2 status
pm2 logs tts-dialer --lines 20
```

PM2 ecosystem file for more control — create `/home/appuser/app/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: "tts-dialer",
    script: "dist/index.js",
    cwd: "/home/appuser/app",
    env: {
      NODE_ENV: "production",
    },
    instances: 1,
    max_memory_restart: "2G",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    error_file: "/home/appuser/logs/error.log",
    out_file: "/home/appuser/logs/output.log",
    merge_logs: true,
  }]
};
```

Then start with: `pm2 start ecosystem.config.cjs`

---

## 13. Firewall Configuration

Configure UFW (Uncomplicated Firewall) to allow only necessary traffic.

```bash
# Reset firewall rules
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow MinIO (only from localhost — Nginx proxies external access)
# No rule needed since MinIO binds to all interfaces but Nginx handles external

# Enable firewall
ufw --force enable
ufw status verbose
```

**Important:** The VPS IP (187.124.94.97) must be whitelisted on the FreePBX server's firewall for SSH connections (port 22) used by the Voice AI Bridge installer and health checks.

On the FreePBX server:
```bash
# Add VPS IP to FreePBX trusted zone
echo "sshd: 187.124.94.97" >> /etc/hosts.allow
# Or via FreePBX Firewall admin: Admin → System Admin → Firewall → Networks → Add 187.124.94.97 as Trusted
```

---

## 14. DNS Configuration

Create the following DNS records for `407hosted.com` at your domain registrar or DNS provider.

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **A** | `app` | `187.124.94.97` | 300 |
| **A** | `storage` | `187.124.94.97` | 300 |

After DNS propagation (typically 5-30 minutes), verify:
```bash
dig app.407hosted.com +short
# Should return: 187.124.94.97

dig storage.407hosted.com +short
# Should return: 187.124.94.97
```

---

## 15. First-Time Setup and Admin Account

After the application is deployed and running, complete the initial setup.

**Step 1: Run database migrations.**

```bash
cd /home/appuser/app
pnpm db:push
```

This creates all 16+ database tables (users, campaigns, contacts, call_queue, audio_files, etc.).

**Step 2: Open the application in your browser.**

Navigate to `https://app.407hosted.com`. Since `OAUTH_SERVER_URL` is not set, the app runs in **standalone mode** and shows the email/password login page.

**Step 3: Register the admin account.**

Click "Create Account" and register with your email and password. The first user to register is automatically assigned the **admin** role. All subsequent users are assigned the **user** role (you can promote them to admin from the User Management page).

**Step 4: Configure API keys in Settings.**

After logging in, navigate to **Settings** and enter your OpenAI API key, Google TTS API key, and FreePBX connection details. These are stored in the `app_settings` table and can be updated at any time without redeploying.

**Step 5: Configure notifications.**

Navigate to **Settings > Notifications** and configure SMTP email and/or Twilio SMS channels for campaign completion alerts and agent offline detection.

---

## 16. FreePBX Integration

The PBX Agent on your FreePBX server polls the web application for pending calls. With a static VPS IP, the firewall whitelisting is permanent.

**Step 1: Whitelist the VPS IP on FreePBX.**

```bash
# On the FreePBX server
echo "sshd: 187.124.94.97" >> /etc/hosts.allow
```

Or via FreePBX Admin GUI: **Admin > System Admin > Firewall > Networks** — add `187.124.94.97` as a Trusted network.

**Step 2: Register a PBX Agent in the web app.**

Navigate to **FreePBX Integration** in the sidebar, click **Register New Agent**, and copy the API key.

**Step 3: Install the PBX Agent on FreePBX.**

Use the **Auto-Install** button on the FreePBX Integration page, or manually SSH into FreePBX and run:

```bash
curl -s 'https://app.407hosted.com/api/voice-ai/install?key=YOUR_AGENT_API_KEY' | bash
```

**Step 4: Verify the agent is online.**

The agent should appear as "Online" in the FreePBX Integration page within 30 seconds.

**Step 5: Update the PBX Agent's poll URL.**

If the agent was previously configured to poll the Manus deployment, update its configuration file on the FreePBX server:

```bash
# On FreePBX server
nano /opt/pbx-agent/config.json
# Change "server_url" to "https://app.407hosted.com"
systemctl restart pbx-agent
```

---

## 17. Backup Strategy

Implement automated backups for both the database and MinIO storage.

### 17.1 Database Backup Script

```bash
cat > /home/appuser/backup-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/appuser/backups/mysql"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mysqldump -u dialer -pCHANGE_THIS_STRONG_PASSWORD tts_dialer | gzip > "$BACKUP_DIR/tts_dialer_$TIMESTAMP.sql.gz"
# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "Database backup completed: tts_dialer_$TIMESTAMP.sql.gz"
EOF
chmod +x /home/appuser/backup-db.sh
```

### 17.2 MinIO Backup Script

```bash
cat > /home/appuser/backup-minio.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/appuser/backups/minio"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mc mirror local/dialer-audio "$BACKUP_DIR/dialer-audio_$TIMESTAMP/" --quiet
# Keep only last 7 days of full backups
find "$BACKUP_DIR" -maxdepth 1 -name "dialer-audio_*" -mtime +7 -exec rm -rf {} +
echo "MinIO backup completed: dialer-audio_$TIMESTAMP"
EOF
chmod +x /home/appuser/backup-minio.sh
```

### 17.3 Cron Schedule

```bash
# Edit crontab for appuser
crontab -e

# Add these lines:
# Database backup daily at 2 AM
0 2 * * * /home/appuser/backup-db.sh >> /home/appuser/logs/backup.log 2>&1
# MinIO backup weekly on Sunday at 3 AM
0 3 * * 0 /home/appuser/backup-minio.sh >> /home/appuser/logs/backup.log 2>&1
```

---

## 18. Monitoring and Maintenance

### 18.1 PM2 Monitoring

```bash
# Real-time process monitoring
pm2 monit

# View application logs
pm2 logs tts-dialer --lines 100

# Check memory and CPU usage
pm2 status
```

### 18.2 System Health Checks

```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check MySQL status
systemctl status mysql
mysqladmin -u dialer -p status

# Check MinIO status
systemctl status minio
mc admin info local

# Check Nginx status
systemctl status nginx
nginx -t
```

### 18.3 Log Rotation

Create a logrotate configuration to prevent log files from consuming disk space:

```bash
cat > /etc/logrotate.d/tts-dialer <<'EOF'
/home/appuser/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 appuser appuser
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

---

## 19. Updating the Application

When deploying a new version of the application, follow this procedure:

```bash
# Switch to appuser
su - appuser
cd /home/appuser/app

# Pull latest code
git pull origin main

# Install any new dependencies
pnpm install

# Run database migrations
pnpm db:push

# Build the application
pnpm build

# Restart with zero-downtime reload
pm2 reload tts-dialer
```

For major updates that include storage.ts or llm.ts changes, ensure the self-hosted modifications from Section 9 are preserved. Maintaining a `self-hosted` branch that rebases on `main` is recommended.

---

## 20. Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| App won't start | Missing `.env` variables | Check `pm2 logs tts-dialer` for the specific missing variable |
| "ECONNREFUSED" on database | MySQL not running | `systemctl start mysql` and verify `DATABASE_URL` |
| TTS audio not playing | MinIO bucket not public | Run `mc anonymous set download local/dialer-audio` |
| Audio URLs return 404 | Nginx not proxying MinIO | Check `storage.407hosted.com` Nginx config and SSL |
| PBX Agent shows offline | Firewall blocking HTTPS | Ensure port 443 is open and VPS IP is whitelisted on FreePBX |
| SSL certificate expired | Certbot renewal failed | Run `certbot renew` manually and check cron |
| "Invalid API key" on TTS | OpenAI key expired/invalid | Update `OPENAI_API_KEY` in `.env` and `pm2 reload tts-dialer` |
| Login page shows OAuth button | `OAUTH_SERVER_URL` is set | Remove `OAUTH_SERVER_URL` from `.env` for standalone mode |
| High memory usage | Node.js memory leak | Check with `pm2 monit`, set `max_memory_restart: "2G"` in ecosystem config |
| Slow database queries | Missing indexes or buffer pool | Run `EXPLAIN` on slow queries, increase `innodb_buffer_pool_size` |

---

## 21. New Client Installation Checklist

Use this checklist when deploying for a new client. Each step references the relevant section above.

| Step | Action | Section | Status |
|------|--------|---------|--------|
| 1 | Provision VPS (Hostinger KVM 4 or equivalent) | 4 | [ ] |
| 2 | Point client domain A records to VPS IP | 14 | [ ] |
| 3 | SSH in, update OS, create `appuser` | 4 | [ ] |
| 4 | Install Node.js 22, pnpm, PM2, Nginx, Certbot | 5 | [ ] |
| 5 | Install and configure MySQL 8 | 6 | [ ] |
| 6 | Install and configure MinIO | 7 | [ ] |
| 7 | Clone/upload application code | 8 | [ ] |
| 8 | Apply self-hosted code modifications | 9 | [ ] |
| 9 | Create `.env` file with all variables | 10 | [ ] |
| 10 | Run `pnpm install && pnpm build` | 8 | [ ] |
| 11 | Run `pnpm db:push` to create tables | 15 | [ ] |
| 12 | Configure Nginx reverse proxy | 11 | [ ] |
| 13 | Obtain SSL certificates | 11.3 | [ ] |
| 14 | Start app with PM2 and enable startup | 12 | [ ] |
| 15 | Configure UFW firewall | 13 | [ ] |
| 16 | Register admin account at `https://client-domain.com` | 15 | [ ] |
| 17 | Configure API keys in Settings page | 15 | [ ] |
| 18 | Whitelist VPS IP on client's FreePBX | 16 | [ ] |
| 19 | Install PBX Agent on FreePBX | 16 | [ ] |
| 20 | Verify PBX Agent online and test call | 16 | [ ] |
| 21 | Configure email/SMS notifications | 15 | [ ] |
| 22 | Set up backup cron jobs | 17 | [ ] |
| 23 | Run a test campaign end-to-end | — | [ ] |

---

## References

- [Node.js 22 LTS](https://nodejs.org/en/download/) — Runtime environment
- [PM2 Documentation](https://pm2.keymetrics.io/docs/) — Process manager
- [MinIO Quickstart](https://min.io/docs/minio/linux/index.html) — S3-compatible storage
- [MySQL 8.0 Reference](https://dev.mysql.com/doc/refman/8.0/en/) — Database server
- [Nginx Documentation](https://nginx.org/en/docs/) — Reverse proxy
- [Certbot Instructions](https://certbot.eff.org/) — SSL certificates
- [Drizzle ORM](https://orm.drizzle.team/) — Database ORM
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference) — TTS and LLM
