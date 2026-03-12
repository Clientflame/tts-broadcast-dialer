# TTS Broadcast Dialer — Deployment Guide

This guide covers everything you need to deploy the TTS Broadcast Dialer to independent client servers, manage updates across all of them, and handle rollbacks when needed. The deployment package is designed to work on both Vultr and Hostinger VPS (as well as DigitalOcean, Linode, and other providers).

---

## Architecture Overview

Each client gets a fully independent setup running on their own server:

| Component | Technology | Notes |
|---|---|---|
| Web App | Node.js 22 in Docker | The dialer dashboard and API |
| Database | MySQL 8.0 in Docker | Per-client isolated database |
| FreePBX | Separate server or same box | Handles SIP trunks and calls |
| Auto-Update | Watchtower (optional) | Pulls new images automatically |

All components are containerized with Docker Compose, making deployment and updates consistent across any Linux VPS.

---

## File Structure

```
deploy/
├── Dockerfile                    # Multi-stage build for the dialer app
├── docker-compose.yml            # Full stack: app + MySQL + Watchtower
├── entrypoint.sh                 # Startup script (waits for DB, runs migrations)
├── env-template.txt              # Template .env for new clients
├── setup-client.sh               # Interactive setup script for new servers
├── .dockerignore                 # Keeps Docker image lean
├── github-actions/
│   └── docker-build.yml          # CI/CD: auto-build images on release tags
└── ansible/
    ├── inventory.yml             # Client server registry
    ├── playbook-update.yml       # Update all clients
    ├── playbook-status.yml       # Check status across all clients
    └── playbook-rollback.yml     # Rollback a client to a previous version
```

---

## Quick Start: Deploy to a New Client Server

### Prerequisites

You need a VPS with at least 2 vCPU, 4 GB RAM, and 50 GB SSD running Debian 12, Ubuntu 22/24, or Rocky Linux 9. The setup script handles everything else.

### Step 1: SSH into the new server

```bash
ssh root@your-new-server-ip
```

### Step 2: Run the setup script

```bash
curl -sSL https://raw.githubusercontent.com/YOUR_ORG/tts-broadcast-dialer/main/deploy/setup-client.sh | bash
```

The script will prompt you for the client name, FreePBX credentials, TTS API keys, and other configuration. It then installs Docker, configures the firewall, creates the database, and starts the dialer.

### Step 3: Verify

Open `http://your-server-ip:3000` in a browser. The dialer dashboard should be running.

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

### Centralized Management with Ansible

For managing 10+ servers from your laptop, use the Ansible playbooks.

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

### Step 1: Develop and test

Make your changes in the Manus editor or locally. Test thoroughly.

### Step 2: Export to GitHub

Use the Manus Management UI (Settings > GitHub) to export your code to a GitHub repository.

### Step 3: Tag a release

```bash
git tag v1.3.0
git push origin v1.3.0
```

### Step 4: GitHub Actions builds the Docker image

The workflow at `deploy/github-actions/docker-build.yml` automatically builds and pushes a Docker image to GitHub Container Registry (GHCR) when you push a version tag.

**One-time setup:** Copy the workflow file to the correct location in your GitHub repo:

```bash
mkdir -p .github/workflows
cp deploy/github-actions/docker-build.yml .github/workflows/docker-build.yml
git add .github/workflows/docker-build.yml
git commit -m "Add Docker build CI/CD"
git push
```

Then go to your GitHub repo > Settings > Actions > General, and set "Workflow permissions" to "Read and write permissions."

### Step 5: Deploy to clients

**Option A — Ansible (recommended):**

```bash
ansible-playbook -i inventory.yml playbook-update.yml
```

**Option B — Watchtower (automatic):**

If Watchtower is running on client servers (enabled by default in docker-compose), it will automatically detect the new image and update within 24 hours (configurable via `UPDATE_CHECK_INTERVAL`).

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
# On the client server
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

## Troubleshooting

| Issue | Diagnosis | Fix |
|---|---|---|
| Container won't start | `docker compose logs dialer` | Check DATABASE_URL and env vars |
| Database connection timeout | `docker compose logs db` | Wait for MySQL to initialize (first run takes ~30s) |
| Health check failing | `docker inspect tts-dialer` | Check if port 3000 is accessible |
| SIP calls not connecting | Check FreePBX AMI credentials | Verify FREEPBX_HOST and AMI password |
| Image pull fails | `docker login ghcr.io` | Authenticate with GitHub token |
| Disk full | `docker system prune -a` | Remove old images and volumes |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_TITLE` | No | Custom app title for branding |
| `VITE_APP_LOGO` | No | URL to custom logo image |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL root password (auto-generated) |
| `MYSQL_PASSWORD` | Yes | MySQL app user password (auto-generated) |
| `FREEPBX_HOST` | Yes | FreePBX server IP or hostname |
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
| `UPDATE_CHECK_INTERVAL` | No | Watchtower check interval in seconds (default: 86400) |
| `SKIP_MIGRATIONS` | No | Set to "true" to skip auto-migrations |
