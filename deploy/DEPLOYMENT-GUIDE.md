# TTS Broadcast Dialer — Deployment Guide

This guide covers everything you need to go from a blank server to a fully working TTS Broadcast Dialer, including FreePBX setup, Docker deployment, client management, and updates. It supports both an all-in-one setup (FreePBX and dialer on the same server) and a two-server setup (separate machines).

---

## Table of Contents

1. [Choose Your Deployment Path](#choose-your-deployment-path)
2. [Server Requirements](#server-requirements)
3. [Option A: All-in-One Server](#option-a-all-in-one-server)
4. [Option B: Separate Servers](#option-b-separate-servers)
5. [FreePBX Setup for the Dialer](#freepbx-setup-for-the-dialer)
6. [Deploy the TTS Dialer](#deploy-the-tts-dialer)
7. [SSL/HTTPS with Custom Domain](#sslhttps-with-custom-domain)
8. [SIP Trunk and Outbound Routes](#sip-trunk-and-outbound-routes)
9. [Managing Client Servers](#managing-client-servers)
10. [Release Workflow](#release-workflow)
11. [Staged Rollout Strategy](#staged-rollout-strategy)
12. [Database Migrations](#database-migrations)
13. [Backups](#backups)
14. [Monitoring](#monitoring)
15. [Security Hardening](#security-hardening)
16. [Troubleshooting](#troubleshooting)
17. [Environment Variables Reference](#environment-variables-reference)

---

## Choose Your Deployment Path

There are two ways to deploy the dialer for a client. The right choice depends on the client's scale and existing infrastructure.

| | Option A: All-in-One | Option B: Separate Servers |
|---|---|---|
| **What** | FreePBX + Dialer on the same VPS | FreePBX on one VPS, Dialer on another |
| **Cost** | ~$12-24/month (one server) | ~$18-30/month (two servers) |
| **Best for** | Most clients, up to 10 concurrent calls | Larger clients, 10+ concurrent calls |
| **Setup time** | ~30 minutes | ~45 minutes |
| **Pros** | Cheaper, simpler, no network config between services | Better isolation, independent scaling, higher reliability |
| **Cons** | Shared resources, single point of failure | More expensive, requires firewall/network config |

**Recommendation:** For most small-to-mid clients, **Option A (All-in-One)** is the best starting point. A single $20/month VPS handles both services comfortably. You can always migrate to separate servers later if the client grows.

---

## Server Requirements

### Option A: All-in-One Server

| Spec | Minimum | Recommended |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 80 GB SSD |
| OS | Debian 12 | Debian 12 |
| Monthly cost | ~$12 | ~$24 |

FreePBX requires approximately 1-2 GB of RAM on its own, and the dialer app (Node.js + MySQL in Docker) uses another 500-700 MB. The 4 GB minimum leaves enough headroom for 5-10 concurrent calls.

### Option B: Separate Servers

**FreePBX Server:**

| Spec | Minimum | Recommended |
|---|---|---|
| vCPU | 1 | 2 |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB SSD | 40 GB SSD |
| OS | Debian 12 | Debian 12 |

**Dialer Server:**

| Spec | Minimum | Recommended |
|---|---|---|
| vCPU | 1 | 2 |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB SSD | 40 GB SSD |
| OS | Debian 12, Ubuntu 22/24, or Rocky 9 | Debian 12 or Ubuntu 24.04 |

These specs work well for campaigns with up to 10,000 contacts and 10 concurrent calls. For larger operations (20+ concurrent calls, 100k+ contacts), increase the RAM to 8 GB on the FreePBX server and 4-8 GB on the dialer server.

### Tested VPS Providers

The setup has been tested on Vultr, Hostinger VPS, DigitalOcean, and Linode. Any provider offering Debian 12 images will work.

---

## Option A: All-in-One Server

This path installs FreePBX first (it takes over the OS), then adds Docker and the dialer on top.

### Step 1: Provision a Debian 12 VPS

Order a VPS with at least 2 vCPU and 4 GB RAM running **Debian 12**. Most providers (Vultr, Hostinger, DigitalOcean) offer Debian 12 as a built-in image. SSH into the server as root.

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Install FreePBX 17

FreePBX 17 installs directly on Debian 12 using the official install script. This takes about 15-20 minutes.

```bash
# Update the system
apt update && apt upgrade -y

# Download and run the FreePBX install script
wget https://github.com/FreePBX/sng_freepbx_debian_install/raw/master/sng_freepbx_debian_install.sh -O /tmp/install-freepbx.sh
chmod +x /tmp/install-freepbx.sh
/tmp/install-freepbx.sh
```

The script installs Asterisk, FreePBX, Apache, MariaDB, and all dependencies. When it finishes, open `http://YOUR_SERVER_IP` in a browser to access the FreePBX admin panel and create your admin account.

> **Note:** The FreePBX install script may prompt you to choose options during installation. Accept the defaults unless you have specific requirements.

### Step 3: Install Docker

FreePBX's install script does not include Docker, so install it separately.

```bash
# Install Docker
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify Docker is running
docker --version
```

### Step 4: Configure FreePBX for the Dialer

Follow the [FreePBX Setup for the Dialer](#freepbx-setup-for-the-dialer) section below to create the AMI user, configure the firewall, and set up a SIP trunk.

Since both services are on the same machine, use `127.0.0.1` as the FreePBX host when running the dialer setup script.

### Step 5: Deploy the Dialer

Run the interactive setup script. When prompted for the FreePBX host, enter `127.0.0.1`.

```bash
curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```

The dialer will be available at `http://YOUR_SERVER_IP:3000`.

> **Port conflict note:** FreePBX uses port 80 (Apache) and the dialer uses port 3000 by default. These do not conflict. If you want the dialer on port 80 instead, you can set up a reverse proxy (see the Troubleshooting section) or change the FreePBX Apache port.

---

## Option B: Separate Servers

This path uses two VPS instances: one for FreePBX and one for the dialer.

### Server 1: FreePBX

Follow Steps 1-2 from Option A to install FreePBX on the first server. Then follow the [FreePBX Setup for the Dialer](#freepbx-setup-for-the-dialer) section to create the AMI user.

**Additional network configuration:** Since the dialer is on a different server, you need to allow remote AMI access. In the AMI user's "Permit" field, enter the dialer server's IP address. Also ensure port 5038 (AMI) and port 22 (SSH) are open in the FreePBX firewall for the dialer server's IP.

```bash
# On the FreePBX server, allow the dialer server's IP through the firewall
fwconsole firewall trust DIALER_SERVER_IP
fwconsole firewall reload
```

### Server 2: Dialer

Provision a second VPS (Debian 12, Ubuntu 22/24, or Rocky 9) and run the setup script. When prompted for the FreePBX host, enter the **FreePBX server's IP address**.

```bash
ssh root@DIALER_SERVER_IP
curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```

### Firewall Rules Between Servers

Ensure these ports are open between the two servers:

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 5038 | TCP | Dialer → FreePBX | AMI (Asterisk Manager Interface) |
| 22 | TCP | Dialer → FreePBX | SSH (audio file sync) |
| 3000 | TCP | Users → Dialer | Web dashboard |
| 80/443 | TCP | Users → FreePBX | FreePBX admin panel |
| 5060 | UDP | SIP Provider → FreePBX | SIP signaling |
| 10000-20000 | UDP | SIP Provider → FreePBX | RTP media (voice) |

---

## FreePBX Setup for the Dialer

After installing FreePBX, you need to configure three things for the dialer to work: an AMI user, the AMI bind address (for remote access), and firewall rules.

### 1. Create an AMI User

The dialer connects to FreePBX through the Asterisk Manager Interface (AMI). You need to create a dedicated AMI user for it.

**Method A: FreePBX Web GUI (Recommended)**

1. Log into the FreePBX admin panel at `http://FREEPBX_IP`
2. Navigate to **Settings → Asterisk Manager Users**
3. Click **Add Manager**
4. Fill in the fields:

| Field | Value | Notes |
|---|---|---|
| Manager Name | `dialer` | No spaces, this is the AMI username |
| Manager Secret | `your-secure-password` | Use a strong password |
| Deny | `0.0.0.0/0.0.0.0` | Deny all by default |
| Permit | `127.0.0.1/255.255.255.255` | For all-in-one setup. For separate servers, use the dialer server's IP |
| Write Timeout | `5000` | Default is fine |

5. Click the **Permissions** tab and enable these read/write permissions:
   - `system` — System information
   - `call` — Call control
   - `originate` — Originate calls (required for the dialer)
   - `command` — CLI commands
   - `agent` — Agent/queue control
   - `reporting` — CDR and call reporting
   - `cdr` — Call detail records
   - `dialplan` — Dialplan execution

6. Click **Submit**, then click **Apply Config** (red bar at the top)

**Method B: Command Line**

If you prefer the CLI, SSH into the FreePBX server and edit the manager configuration directly:

```bash
# Create a custom AMI config (survives FreePBX module reloads)
cat > /etc/asterisk/manager_custom.conf << 'EOF'
[dialer]
secret = your-secure-password
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.255
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
writetimeout = 5000
EOF

# Reload the manager module
asterisk -rx "manager reload"
```

> **For separate servers:** Replace `127.0.0.1/255.255.255.255` with `DIALER_IP/255.255.255.255` in the permit field.

### 2. Enable Remote AMI Access (Separate Servers Only)

By default, FreePBX 16+ binds the AMI to `127.0.0.1` (localhost only). If the dialer is on a separate server, you need to change this to `0.0.0.0` so it listens on all interfaces.

```bash
# Edit the manager configuration
nano /etc/asterisk/manager.conf

# Find the [general] section and change:
#   bindaddr = 127.0.0.1
# To:
#   bindaddr = 0.0.0.0

# Save and reload
asterisk -rx "manager reload"
```

> **Skip this step for all-in-one setups.** When both services are on the same server, `127.0.0.1` works perfectly and is more secure.

### 3. Configure the FreePBX Firewall

If the FreePBX Firewall module is enabled (it is by default), you need to allow the dialer server's IP.

**For all-in-one setups**, localhost is already trusted. No changes needed.

**For separate servers:**

```bash
# Trust the dialer server's IP
fwconsole firewall trust DIALER_SERVER_IP

# Or add it as a trusted network in the GUI:
# Admin → System Admin → Firewall → Networks → Add Network
# Enter the dialer server's IP with /32 mask and set zone to "Trusted"

fwconsole firewall reload
```

### 4. Test the AMI Connection

You can verify the AMI connection works by using telnet from the dialer server (or localhost for all-in-one):

```bash
# From the dialer server (or localhost)
telnet FREEPBX_IP 5038

# You should see:
# Asterisk Call Manager/x.x.x

# Type to test login:
Action: Login
Username: dialer
Secret: your-secure-password

# You should see:
# Response: Success
# Message: Authentication accepted

# Type to disconnect:
Action: Logoff
```

If the connection times out, check the firewall rules and the `bindaddr` setting in `manager.conf`.

---

## Deploy the TTS Dialer

Once FreePBX is configured, deploy the dialer using the interactive setup script.

### Step 1: Log in to GHCR

Since the Docker image is in a private GitHub Container Registry, you need to authenticate first. Create a GitHub Personal Access Token with `read:packages` scope at https://github.com/settings/tokens/new.

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Step 2: Run the Setup Script

```bash
curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```

The script walks you through 5 steps:

1. **Branding** — Company name, app title, logo URL, and color theme (7 presets or custom hex)
2. **FreePBX Connection** — Host IP, AMI credentials, SSH credentials
3. **TTS API Keys** — OpenAI and/or Google TTS keys
4. **Server Settings** — Port and timezone
5. **Docker Image** — Image tag and GHCR authentication

After confirming the review summary, it installs Docker (if needed), configures the firewall, creates the deployment files, and starts the stack.

### Step 3: Verify

Open `http://YOUR_SERVER_IP:3000` in a browser. Create your admin account on the setup page, then the onboarding wizard will guide you through connecting to FreePBX, importing DIDs, uploading contacts, and creating your first campaign.

---

## SSL/HTTPS with Custom Domain

The setup wizard includes a built-in option to enable HTTPS using Caddy as a reverse proxy with automatic Let's Encrypt certificate provisioning. This section covers how it works and how to set it up manually if needed.

### How It Works

When you enter a domain name during the setup wizard (Step 5), the script automatically:

1. Adds a **Caddy** container to the Docker Compose stack
2. Generates a **Caddyfile** configured for your domain
3. Opens ports **80** and **443** in the firewall
4. Caddy automatically obtains and renews Let's Encrypt SSL certificates

The result is that your dialer is accessible at `https://your-domain.com` with a valid SSL certificate, while also remaining accessible at `http://IP:3000` for direct access.

### Prerequisites

Before enabling SSL, make sure:

| Requirement | Details |
|---|---|
| Domain name | You own a domain or subdomain (e.g., `dialer.yourcompany.com`) |
| DNS A record | The domain's A record points to your server's public IP |
| Ports 80 and 443 | Both ports are open and not in use by another service |
| No other web server | Apache/Nginx must not be bound to ports 80/443 (or be reconfigured) |

### Option 1: During Setup (Recommended)

When running `setup-client.sh`, Step 5 prompts for a domain:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5/6  Domain & SSL (Optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  If you have a domain name pointed at this server, enter it below
  to enable automatic HTTPS with Let's Encrypt (free SSL).

  Domain name (e.g., dialer.yourcompany.com): dialer.acme.com

  ✓ SSL enabled for dialer.acme.com (auto Let's Encrypt)
```

That's it. The script handles everything else. After setup completes, your dialer is live at `https://dialer.acme.com`.

### Option 2: Add SSL After Initial Setup

If you skipped the domain during setup and want to add SSL later:

```bash
cd /opt/tts-dialer

# 1. Add the domain to .env
echo 'DOMAIN=dialer.yourcompany.com' >> .env

# 2. Create the Caddyfile
cat > Caddyfile << 'EOF'
dialer.yourcompany.com {
    reverse_proxy dialer:3000

    encode gzip zstd

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        -Server
    }

    log {
        output stdout
        format console
    }
}
EOF

# 3. Add the Caddy service to docker-compose.yml
# Add this under the 'services:' section:
#
#   caddy:
#     image: caddy:2-alpine
#     container_name: tts-dialer-caddy
#     restart: unless-stopped
#     ports:
#       - "80:80"
#       - "443:443"
#       - "443:443/udp"
#     volumes:
#       - ./Caddyfile:/etc/caddy/Caddyfile:ro
#       - caddy-data:/data
#       - caddy-config:/config
#     depends_on:
#       - dialer
#     networks:
#       - dialer-net
#
# And add to 'volumes:':
#   caddy-data:
#   caddy-config:

# 4. Open firewall ports
ufw allow 80/tcp
ufw allow 443/tcp

# 5. Restart the stack
docker compose up -d
```

Caddy will automatically obtain the SSL certificate on first startup (takes about 10-30 seconds).

### Verifying SSL

After starting the stack with SSL enabled:

```bash
# Check Caddy is running
docker compose ps caddy

# Check Caddy logs for certificate provisioning
docker compose logs caddy

# Test HTTPS
curl -I https://dialer.yourcompany.com
```

You should see `HTTP/2 200` with `Strict-Transport-Security` in the response headers.

### Certificate Renewal

Caddy automatically renews certificates before they expire (Let's Encrypt certificates are valid for 90 days, and Caddy renews them at 30 days remaining). No cron jobs or manual intervention needed.

### Removing SSL

To disable SSL and go back to direct port access:

```bash
cd /opt/tts-dialer

# Remove the domain from .env
sed -i '/^DOMAIN=/d' .env

# Stop and remove the Caddy container
docker compose stop caddy
docker compose rm -f caddy

# Access via http://IP:3000 again
```

---

## SIP Trunk and Outbound Routes

The dialer originates calls through FreePBX, which means FreePBX needs a SIP trunk connected to a VoIP provider (like Telnyx, Twilio, Bandwidth, VoIP.ms, or Flowroute) to make outbound calls.

### Set Up a SIP Trunk

1. Log into the FreePBX admin panel
2. Navigate to **Connectivity → Trunks**
3. Click **Add Trunk → Add SIP (chan_pjsip) Trunk**
4. Enter your VoIP provider's details:
   - **Trunk Name:** e.g., `telnyx-trunk`
   - **Outbound CallerID:** Your main DID number
   - Under the **pjsip Settings** tab, enter the provider's host, username, and password
5. Click **Submit**, then **Apply Config**

### Set Up an Outbound Route

1. Navigate to **Connectivity → Outbound Routes**
2. Click **Add Outbound Route**
3. Configure:
   - **Route Name:** e.g., `outbound-all`
   - **Trunk Sequence:** Select the trunk you just created
   - **Dial Patterns:** Add patterns for the numbers you want to dial (e.g., `1NXXNXXXXXX` for US numbers, or `NXXNXXXXXX` for 10-digit dialing)
4. Click **Submit**, then **Apply Config**

### Verify Outbound Calling

From the FreePBX CLI, test an outbound call:

```bash
asterisk -rx "channel originate PJSIP/15551234567@telnyx-trunk application Playback hello-world"
```

If the call connects and you hear "Hello World," the trunk and outbound route are working.

---

## Managing Client Servers

### Per-Server Management Scripts

Each client server has these scripts in `/opt/tts-dialer/`:

| Script | Purpose | Command |
|---|---|---|
| `status.sh` | Check container health, resource usage, disk space | `./status.sh` |
| `update.sh` | Pull latest Docker image and restart | `./update.sh` |
| `backup.sh` | Backup database and config | `./backup.sh` |
| `logs.sh` | View live application logs | `./logs.sh` |
| `restart.sh` | Restart the dialer app | `./restart.sh` |

### Edit Configuration

To change any settings after deployment:

```bash
cd /opt/tts-dialer
nano .env                    # Edit configuration
docker compose up -d         # Restart with new settings
```

### Centralized Management with Ansible

For managing 10+ servers from your laptop, use the Ansible playbooks in `deploy/ansible/`.

**Install Ansible** (on your local machine):

```bash
# macOS
brew install ansible

# Ubuntu/Debian
sudo apt install ansible

# pip
pip install ansible
```

**Configure your client inventory** by editing `deploy/ansible/inventory.yml`:

```yaml
dialer_clients:
  hosts:
    abc_marketing:
      ansible_host: 149.28.xxx.xxx
      client_name: "ABC Marketing"
    xyz_agency:
      ansible_host: 207.148.xxx.xxx
      client_name: "XYZ Agency"
```

**Common commands:**

```bash
cd deploy/ansible

# Check status of ALL clients
ansible-playbook -i inventory.yml playbook-status.yml

# Update ALL clients to latest version
ansible-playbook -i inventory.yml playbook-update.yml

# Update ONE specific client
ansible-playbook -i inventory.yml playbook-update.yml --limit abc_marketing

# Rollback a client to a previous version
ansible-playbook -i inventory.yml playbook-rollback.yml --limit abc_marketing -e "version=v1.2.0"
```

---

## Release Workflow

The recommended workflow for pushing updates to clients:

### Step 1: Develop and Test

Make your changes in the Manus editor or locally. Test thoroughly.

### Step 2: Tag a Release

```bash
git tag v1.3.0
git push origin v1.3.0
```

### Step 3: GitHub Actions Builds the Docker Image

The workflow at `.github/workflows/docker-build.yml` automatically builds and pushes a Docker image to GitHub Container Registry (GHCR) when you push a version tag.

**One-time setup:** Go to your GitHub repo → Settings → Actions → General, and set "Workflow permissions" to "Read and write permissions."

### Step 4: Deploy to Clients

**Option A — Watchtower (automatic):** If Watchtower is running on client servers (enabled by default), it will automatically detect the new image and update within 24 hours (configurable via `UPDATE_CHECK_INTERVAL` in `.env`).

**Option B — Ansible (bulk update):**

```bash
ansible-playbook -i inventory.yml playbook-update.yml
```

**Option C — Manual per-server:**

```bash
ssh root@client-server "cd /opt/tts-dialer && ./update.sh"
```

---

## Staged Rollout Strategy

For production clients, roll out updates in waves to catch issues early:

| Stage | Targets | Timing |
|---|---|---|
| Canary | Your test server | Immediately after build |
| Early Access | 1-2 friendly clients | After 24 hours if stable |
| General Availability | All remaining clients | After 48-72 hours |

Use Ansible's `--limit` flag to target specific servers:

```bash
# Stage 1: Canary
ansible-playbook -i inventory.yml playbook-update.yml --limit test_server

# Stage 2: Early access
ansible-playbook -i inventory.yml playbook-update.yml --limit abc_marketing,xyz_agency

# Stage 3: Everyone
ansible-playbook -i inventory.yml playbook-update.yml
```

---

## Database Migrations

The entrypoint script automatically runs `drizzle-kit migrate` on container startup. This handles additive schema changes (new tables, new columns) safely.

**For destructive changes** (dropping columns, renaming tables), set `SKIP_MIGRATIONS=true` in the client's `.env` file, apply the migration manually, then remove the flag:

```bash
cd /opt/tts-dialer
echo "SKIP_MIGRATIONS=true" >> .env
docker compose exec dialer npx drizzle-kit migrate
# Verify the migration succeeded, then:
sed -i '/SKIP_MIGRATIONS/d' .env
```

**Best practice:** Keep all schema changes backward-compatible (only add, never remove) so old and new code can run against the same database during rolling updates.

---

## Backups

Each client server runs automatic daily backups at 3:00 AM (configured during setup). Backups include the MySQL database dump and the `.env` configuration file, stored in `/opt/tts-dialer/backups/`. The last 7 backups are retained.

**Manual backup:**

```bash
cd /opt/tts-dialer && ./backup.sh
```

**Restore from backup:**

```bash
cd /opt/tts-dialer
docker exec -i tts-dialer-db mysql -u root -p<ROOT_PASSWORD> tts_dialer < backups/db_20260312_030000.sql
```

---

## Monitoring

For monitoring all client servers from a single dashboard, consider installing [Uptime Kuma](https://github.com/louislam/uptime-kuma) on a separate small VPS ($5/mo). Add each client's health endpoint:

```
http://client-ip:3000/api/trpc/health
```

Uptime Kuma will alert you via email, Slack, or Discord when a client server goes down.

---

## Security Hardening

The install script (`setup-client.sh`) automatically configures server security during deployment. This section documents what is set up and how to verify or customize it.

### What the Install Script Does Automatically

Every new deployment receives the following security baseline without any manual configuration.

| Component | What It Does | Details |
|---|---|---|
| **UFW Firewall** | Blocks all incoming traffic except required ports | Allows SSH (22), app port (3000), and optionally HTTP/HTTPS (80/443) |
| **Fail2Ban** | Bans IPs after failed SSH login attempts | 5 failed attempts within 10 minutes triggers a 1-hour ban |
| **Unattended Upgrades** | Installs OS security patches automatically | Runs daily, cleans old packages weekly |
| **Password Hashing** | bcrypt with 12 rounds for all user passwords | Industry-standard, resistant to brute-force |
| **Rate Limiting** | Limits login attempts to 10 per 15 minutes per IP | Prevents credential stuffing attacks |
| **Session Cookies** | httpOnly, sameSite, secure (when SSL enabled) | Prevents XSS-based session theft |
| **Database Isolation** | MySQL bound to localhost only | Not accessible from the internet even without a firewall |
| **Security Headers** | HSTS, X-Frame-Options, X-Content-Type-Options (with SSL) | Caddy adds these automatically when a domain is configured |
| **Auto-generated Secrets** | MySQL passwords and JWT secret are randomly generated | 32-character cryptographically random strings |
| **File Permissions** | `.env` file set to `chmod 600` | Only root can read the credentials file |

### Verifying Security After Installation

After running the install script, verify each component is active.

```bash
# Check firewall status
sudo ufw status
# Expected: Status: active, with rules for 22, 3000, 80, 443

# Check fail2ban status
sudo fail2ban-client status sshd
# Expected: Shows jail status with Currently banned IPs (if any)

# Check automatic updates
systemctl status unattended-upgrades
# Expected: Active (running)

# Check SSH authentication method
grep PasswordAuthentication /etc/ssh/sshd_config
# If "yes" — consider switching to key-based auth (see below)
```

### Recommended: Switch to SSH Key Authentication

The install script warns if SSH password authentication is enabled. Key-based authentication is significantly more secure because it eliminates the possibility of password brute-force attacks entirely.

```bash
# Step 1: On your LOCAL machine, generate a key pair (if you don't have one)
ssh-keygen -t ed25519 -C "admin@company"

# Step 2: Copy your public key to the server
ssh-copy-id root@YOUR_SERVER_IP

# Step 3: Test that key login works (should not ask for password)
ssh root@YOUR_SERVER_IP

# Step 4: On the SERVER, disable password authentication
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

After this change, only someone with your private key file can SSH into the server.

### Opening Additional Ports

If you need to open additional ports (for example, for a custom integration), use UFW.

```bash
# Allow a specific port
sudo ufw allow 8080/tcp

# Allow a port range
sudo ufw allow 10000:20000/udp

# Allow from a specific IP only
sudo ufw allow from 203.0.113.50 to any port 5038

# Check current rules
sudo ufw status numbered

# Remove a rule by number
sudo ufw delete 5
```

### Checking Fail2Ban Bans

To see which IPs have been banned and manage the ban list:

```bash
# View banned IPs
sudo fail2ban-client status sshd

# Unban a specific IP (if you accidentally locked yourself out)
sudo fail2ban-client set sshd unbanip 203.0.113.50

# View the fail2ban log
sudo tail -50 /var/log/fail2ban.log
```

### Do You Need a VPN?

For most deployments, a VPN is **not required**. The application has strong built-in authentication (bcrypt passwords, rate limiting, JWT sessions), and the firewall blocks all unnecessary ports. A VPN would only be beneficial if compliance requirements (HIPAA, PCI-DSS) mandate network-level access controls, or if you want to completely hide the admin panel from the public internet.

---

## Troubleshooting

| Issue | Diagnosis | Fix |
|---|---|---|
| Container won't start | `docker compose logs dialer` | Check DATABASE_URL and env vars |
| Database connection timeout | `docker compose logs db` | Wait for MySQL to initialize (first run takes ~30s) |
| Health check failing | `docker inspect tts-dialer` | Check if port 3000 is accessible |
| AMI connection refused | `telnet FREEPBX_IP 5038` | Check bindaddr in manager.conf, firewall rules, and AMI user permit field |
| AMI auth failed | Check AMI username/password | Verify in FreePBX → Settings → Asterisk Manager Users |
| SSH connection to FreePBX fails | `ssh PBX_USER@FREEPBX_IP` | Check SSH credentials and firewall port 22 |
| SIP calls not connecting | Check FreePBX trunk status | Verify SIP trunk registration in Connectivity → Trunks |
| No audio on calls | Check TTS API keys | Verify OPENAI_API_KEY or GOOGLE_TTS_API_KEY in .env |
| Image pull fails | `docker login ghcr.io` | Authenticate with GitHub token (needs `read:packages` scope) |
| Disk full | `docker system prune -a` | Remove old images and volumes |
| Port 3000 conflict (all-in-one) | `netstat -tlnp \| grep 3000` | Change APP_PORT in .env to another port |
| FreePBX web panel not loading | `fwconsole restart` | Restart FreePBX services |
| SSL certificate not provisioning | `docker compose logs caddy` | Ensure DNS A record points to server IP, ports 80/443 open |
| Caddy port 80 conflict (all-in-one) | `netstat -tlnp \| grep :80` | Stop Apache (`systemctl stop apache2`) or change its port |

### Setting Up a Reverse Proxy (All-in-One with FreePBX on Port 80)

On an all-in-one server where FreePBX already uses port 80 (Apache), you have two options for adding HTTPS to the dialer:

**Option 1: Use the built-in Caddy container (recommended).** If you entered a domain during `setup-client.sh`, Caddy is already running in Docker on ports 80/443. You may need to stop FreePBX's Apache first or change its port:

```bash
# Option: Change FreePBX Apache to port 8080
sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf
systemctl restart apache2

# Then restart the dialer stack so Caddy can claim port 80
cd /opt/tts-dialer && docker compose restart caddy
```

**Option 2: Use FreePBX's Apache as the reverse proxy.** Keep Apache on port 80 and proxy the dialer subdomain through it:

```bash
# Enable required Apache modules
a2enmod proxy proxy_http ssl

# Create a virtual host for the dialer
cat > /etc/apache2/sites-available/dialer.conf << EOF
<VirtualHost *:80>
    ServerName dialer.example.com
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
EOF

a2ensite dialer.conf
systemctl reload apache2

# Then use Certbot for SSL
apt install certbot python3-certbot-apache
certbot --apache -d dialer.example.com
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_TITLE` | No | Custom app title for branding |
| `VITE_APP_LOGO` | No | URL to custom logo image |
| `VITE_PRIMARY_COLOR` | No | Primary brand color (hex, e.g., #2563eb) |
| `VITE_ACCENT_COLOR` | No | Accent brand color (hex, e.g., #3b82f6) |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL root password (auto-generated) |
| `MYSQL_PASSWORD` | Yes | MySQL app user password (auto-generated) |
| `FREEPBX_HOST` | Yes | FreePBX server IP (use 127.0.0.1 for all-in-one) |
| `FREEPBX_AMI_USER` | Yes | FreePBX AMI username |
| `FREEPBX_AMI_PASSWORD` | Yes | FreePBX AMI password |
| `FREEPBX_AMI_PORT` | No | AMI port (default: 5038) |
| `FREEPBX_SSH_USER` | Yes | SSH user for FreePBX server |
| `FREEPBX_SSH_PASSWORD` | Yes | SSH password for FreePBX server |
| `GOOGLE_TTS_API_KEY` | Recommended | Google Cloud TTS API key |
| `OPENAI_API_KEY` | Optional | OpenAI API key for TTS |
| `JWT_SECRET` | Yes | Session signing secret (auto-generated) |
| `TZ` | No | Timezone (default: America/New_York) |
| `APP_PORT` | No | App port (default: 3000) |
| `DOMAIN` | No | Domain name for HTTPS via Caddy (e.g., dialer.yourcompany.com). Leave empty to skip SSL |
| `UPDATE_CHECK_INTERVAL` | No | Watchtower check interval in seconds (default: 86400) |
| `SKIP_MIGRATIONS` | No | Set to "true" to skip auto-migrations on startup |
| `DOCKER_IMAGE` | No | Docker image to use (default: ghcr.io/clientflame/tts-broadcast-dialer:latest) |
| `SMTP_HOST` | No | SMTP server hostname (e.g., smtp.gmail.com) |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_SECURE` | No | Use SSL (true for port 465, false for STARTTLS on 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM_EMAIL` | No | From email address for notifications |
| `SMTP_FROM_NAME` | No | From display name for notifications |
| `APP_DOMAIN` | No | App domain for email links (same as DOMAIN) |
| `APP_PROTOCOL` | No | http or https (auto-set by setup wizard) |
| `OPENAI_API_BASE_URL` | No | Custom OpenAI-compatible API endpoint |
| `VITELITY_API_LOGIN` | No | Vitelity API login for caller ID provisioning |
| `VITELITY_API_PASS` | No | Vitelity API password |
| `VTIGER_URL` | No | vTiger CRM instance URL |
| `VTIGER_USERNAME` | No | vTiger CRM username |
| `VTIGER_ACCESS_KEY` | No | vTiger CRM access key |
