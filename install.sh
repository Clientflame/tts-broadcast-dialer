#!/bin/bash
# ============================================================================
# AI TTS Broadcast Dialer — Self-Hosted Installer
# Automated deployment script for Ubuntu 22.04 VPS (Hostinger KVM / Vultr)
# Version: 1.0.0
# ============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
info()  { echo -e "${BLUE}[i]${NC} $1"; }
header(){ echo -e "\n${CYAN}═══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════${NC}\n"; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "This script must be run as root. Use: sudo bash install.sh"
  exit 1
fi

if ! grep -q "Ubuntu 22" /etc/os-release 2>/dev/null; then
  warn "This script is designed for Ubuntu 22.04. Detected a different OS."
  read -p "Continue anyway? (y/N): " -r
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

header "AI TTS Broadcast Dialer — Self-Hosted Installer"
echo "This script will install and configure:"
echo "  • Node.js 22 LTS + pnpm"
echo "  • MySQL 8.0"
echo "  • MinIO (S3-compatible storage)"
echo "  • Nginx reverse proxy + SSL (Certbot)"
echo "  • PM2 process manager"
echo "  • UFW firewall"
echo ""

# ─── Gather Configuration ───────────────────────────────────────────────────
header "Step 1: Configuration"

read -p "Domain name (e.g., app.407hosted.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  err "Domain is required."
  exit 1
fi

read -p "Admin email (for SSL certs & notifications): " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
  err "Admin email is required."
  exit 1
fi

read -p "GitHub repo URL (HTTPS clone URL): " GITHUB_REPO
if [ -z "$GITHUB_REPO" ]; then
  err "GitHub repo URL is required."
  exit 1
fi

read -p "GitHub branch [self-hosted]: " GITHUB_BRANCH
GITHUB_BRANCH=${GITHUB_BRANCH:-self-hosted}

# MySQL
read -p "MySQL root password [auto-generate]: " MYSQL_ROOT_PASS
if [ -z "$MYSQL_ROOT_PASS" ]; then
  MYSQL_ROOT_PASS=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
  info "Generated MySQL root password: $MYSQL_ROOT_PASS"
fi

MYSQL_DB="tts_dialer"
MYSQL_USER="dialer"
read -p "MySQL app password [auto-generate]: " MYSQL_APP_PASS
if [ -z "$MYSQL_APP_PASS" ]; then
  MYSQL_APP_PASS=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
  info "Generated MySQL app password: $MYSQL_APP_PASS"
fi

# MinIO
MINIO_USER="minioadmin"
read -p "MinIO admin password [auto-generate]: " MINIO_PASS
if [ -z "$MINIO_PASS" ]; then
  MINIO_PASS=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
  info "Generated MinIO password: $MINIO_PASS"
fi

# JWT
JWT_SECRET=$(openssl rand -hex 32)
info "Generated JWT secret"

# API Keys (can be set later via admin page)
info "API keys (OpenAI, Google TTS) can be configured later via the admin Settings page."
read -p "OpenAI API Key (or press Enter to skip): " OPENAI_KEY
read -p "Google TTS API Key (or press Enter to skip): " GOOGLE_TTS_KEY

# FreePBX
read -p "FreePBX host IP (or press Enter to skip): " FREEPBX_HOST
read -p "FreePBX SSH user [root]: " FREEPBX_SSH_USER
FREEPBX_SSH_USER=${FREEPBX_SSH_USER:-root}
read -p "FreePBX SSH password (or press Enter to skip): " FREEPBX_SSH_PASS
read -p "FreePBX AMI user [admin]: " FREEPBX_AMI_USER
FREEPBX_AMI_USER=${FREEPBX_AMI_USER:-admin}
read -p "FreePBX AMI password (or press Enter to skip): " FREEPBX_AMI_PASS
read -p "FreePBX AMI port [5038]: " FREEPBX_AMI_PORT
FREEPBX_AMI_PORT=${FREEPBX_AMI_PORT:-5038}

# ─── Save credentials ───────────────────────────────────────────────────────
CREDS_FILE="/root/.dialer-credentials"
cat > "$CREDS_FILE" <<EOF
# AI TTS Broadcast Dialer — Credentials
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Domain: $DOMAIN

MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASS
MYSQL_APP_USER=$MYSQL_USER
MYSQL_APP_PASSWORD=$MYSQL_APP_PASS
MYSQL_DATABASE=$MYSQL_DB
MINIO_ROOT_USER=$MINIO_USER
MINIO_ROOT_PASSWORD=$MINIO_PASS
JWT_SECRET=$JWT_SECRET
ADMIN_EMAIL=$ADMIN_EMAIL
EOF
chmod 600 "$CREDS_FILE"
log "Credentials saved to $CREDS_FILE"

# ─── System Updates ─────────────────────────────────────────────────────────
header "Step 2: System Updates"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git build-essential software-properties-common \
  apt-transport-https ca-certificates gnupg lsb-release unzip jq
log "System packages updated"

# ─── Node.js 22 ─────────────────────────────────────────────────────────────
header "Step 3: Node.js 22 + pnpm"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "Node.js $(node -v) installed"

npm install -g pnpm@latest pm2@latest
log "pnpm $(pnpm -v) installed"
log "PM2 $(pm2 -v) installed"

# ─── MySQL 8.0 ──────────────────────────────────────────────────────────────
header "Step 4: MySQL 8.0"
if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
fi
systemctl enable mysql
systemctl start mysql

# Configure MySQL
mysql -u root <<EOSQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_APP_PASS}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_USER}'@'localhost';
FLUSH PRIVILEGES;
EOSQL
log "MySQL configured (database: $MYSQL_DB, user: $MYSQL_USER)"

# ─── MinIO ───────────────────────────────────────────────────────────────────
header "Step 5: MinIO (S3-Compatible Storage)"
if ! command -v minio &>/dev/null; then
  wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
fi

# MinIO data directory
mkdir -p /data/minio

# Create MinIO systemd service
cat > /etc/systemd/system/minio.service <<EOF
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
Type=simple
User=root
Environment="MINIO_ROOT_USER=${MINIO_USER}"
Environment="MINIO_ROOT_PASSWORD=${MINIO_PASS}"
ExecStart=/usr/local/bin/minio server /data/minio --console-address ":9001" --address ":9000"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable minio
systemctl start minio
sleep 3

# Install mc (MinIO client) and configure bucket
if ! command -v mc &>/dev/null; then
  wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

mc alias set local http://localhost:9000 "$MINIO_USER" "$MINIO_PASS" 2>/dev/null || true
mc mb local/dialer-audio --ignore-existing 2>/dev/null || true
mc anonymous set download local/dialer-audio 2>/dev/null || true
log "MinIO configured (bucket: dialer-audio, public-read)"

# ─── Clone & Build Application ──────────────────────────────────────────────
header "Step 6: Clone & Build Application"
APP_DIR="/opt/tts-broadcast-dialer"

if [ -d "$APP_DIR" ]; then
  warn "App directory exists. Pulling latest changes..."
  cd "$APP_DIR"
  git fetch origin
  git checkout "$GITHUB_BRANCH"
  git pull origin "$GITHUB_BRANCH"
else
  git clone -b "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
  cd "$APP_DIR"
fi
log "Repository cloned to $APP_DIR"

# ─── Environment Variables ───────────────────────────────────────────────────
header "Step 7: Environment Configuration"

SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

cat > "$APP_DIR/.env" <<EOF
# ═══════════════════════════════════════════════════
# AI TTS Broadcast Dialer — Self-Hosted Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Server: $SERVER_IP | Domain: $DOMAIN
# ═══════════════════════════════════════════════════

# ─── Core ────────────────────────────────────────
NODE_ENV=production
PORT=3000
JWT_SECRET=${JWT_SECRET}

# ─── Database (Local MySQL) ──────────────────────
DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_APP_PASS}@localhost:3306/${MYSQL_DB}

# ─── Storage (Local MinIO) ───────────────────────
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=${MINIO_USER}
S3_SECRET_KEY=${MINIO_PASS}
S3_BUCKET=dialer-audio
S3_REGION=us-east-1
S3_PUBLIC_URL=https://${DOMAIN}/storage

# ─── AI / TTS ───────────────────────────────────
OPENAI_API_KEY=${OPENAI_KEY:-}
GOOGLE_TTS_API_KEY=${GOOGLE_TTS_KEY:-}

# ─── FreePBX ────────────────────────────────────
FREEPBX_HOST=${FREEPBX_HOST:-}
FREEPBX_SSH_USER=${FREEPBX_SSH_USER}
FREEPBX_SSH_PASSWORD=${FREEPBX_SSH_PASS:-}
FREEPBX_AMI_USER=${FREEPBX_AMI_USER}
FREEPBX_AMI_PASSWORD=${FREEPBX_AMI_PASS:-}
FREEPBX_AMI_PORT=${FREEPBX_AMI_PORT}

# ─── Notifications (SMTP) ───────────────────────
ADMIN_EMAIL=${ADMIN_EMAIL}
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASS=re_xxxx
# SMTP_FROM=noreply@${DOMAIN}

# ─── Auth (Standalone Mode) ─────────────────────
# No OAUTH_SERVER_URL = standalone email/password auth
OWNER_NAME=Admin
OWNER_OPEN_ID=admin

# ─── Frontend ───────────────────────────────────
VITE_APP_TITLE=AI TTS Broadcast Dialer
VITE_APP_ID=self-hosted
EOF

chmod 600 "$APP_DIR/.env"
log "Environment file created at $APP_DIR/.env"

# ─── Install Dependencies & Build ────────────────────────────────────────────
header "Step 8: Install Dependencies & Build"
cd "$APP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
log "Dependencies installed"

pnpm db:push
log "Database schema pushed"

pnpm build
log "Application built"

# ─── PM2 Process Manager ────────────────────────────────────────────────────
header "Step 9: PM2 Process Manager"

cat > "$APP_DIR/ecosystem.config.cjs" <<'EOF'
module.exports = {
  apps: [{
    name: "tts-dialer",
    script: "dist/server/index.js",
    cwd: "/opt/tts-broadcast-dialer",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
    },
    env_file: ".env",
    max_memory_restart: "1G",
    error_file: "/var/log/tts-dialer/error.log",
    out_file: "/var/log/tts-dialer/out.log",
    merge_logs: true,
    time: true,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: "10s",
  }]
};
EOF

mkdir -p /var/log/tts-dialer

# Load env and start
set -a; source "$APP_DIR/.env"; set +a
cd "$APP_DIR"
pm2 delete tts-dialer 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log "PM2 configured and app started"

# ─── Nginx ───────────────────────────────────────────────────────────────────
header "Step 10: Nginx Reverse Proxy"
apt-get install -y nginx

cat > /etc/nginx/sites-available/tts-dialer <<EOF
# AI TTS Broadcast Dialer — Nginx Configuration

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/s;

server {
    listen 80;
    server_name ${DOMAIN};

    # Redirect to HTTPS (will be configured by Certbot)
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL will be configured by Certbot
    # ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # MinIO storage proxy (public bucket)
    location /storage/ {
        proxy_pass http://localhost:9000/dialer-audio/;
        proxy_set_header Host \$host;
        proxy_hide_header x-amz-request-id;
        proxy_hide_header x-amz-id-2;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API routes with rate limiting
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Frontend (served by Node.js in production)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Max upload size (for audio files)
    client_max_body_size 50M;
}
EOF

ln -sf /etc/nginx/sites-available/tts-dialer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx
log "Nginx configured for $DOMAIN"

# ─── SSL Certificate ────────────────────────────────────────────────────────
header "Step 11: SSL Certificate (Let's Encrypt)"
apt-get install -y certbot python3-certbot-nginx

info "Requesting SSL certificate for $DOMAIN..."
info "Make sure your DNS A record points to this server's IP ($SERVER_IP)"
echo ""
read -p "DNS is configured and propagated? (y/N): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect || {
    warn "Certbot failed. You can run it manually later:"
    warn "  certbot --nginx -d $DOMAIN --agree-tos -m $ADMIN_EMAIL"
  }
  # Auto-renewal
  systemctl enable certbot.timer
  log "SSL certificate installed and auto-renewal enabled"
else
  warn "Skipping SSL. Run manually when DNS is ready:"
  warn "  certbot --nginx -d $DOMAIN --agree-tos -m $ADMIN_EMAIL"
fi

# ─── UFW Firewall ────────────────────────────────────────────────────────────
header "Step 12: Firewall (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment "SSH"
ufw allow 80/tcp    comment "HTTP"
ufw allow 443/tcp   comment "HTTPS"
# Do NOT expose 3000 (Node), 9000/9001 (MinIO), 3306 (MySQL) publicly
ufw --force enable
log "Firewall configured (SSH, HTTP, HTTPS only)"

# ─── Backup Script ───────────────────────────────────────────────────────────
header "Step 13: Automated Backups"

mkdir -p /opt/backups

cat > /opt/backups/backup.sh <<'BACKUP'
#!/bin/bash
# Daily backup script for AI TTS Broadcast Dialer
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"
RETENTION_DAYS=14

# MySQL dump
source /root/.dialer-credentials 2>/dev/null
mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" tts_dialer | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# MinIO data (optional — can be large)
# tar -czf "$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz" /data/minio

# App .env backup
cp /opt/tts-broadcast-dialer/.env "$BACKUP_DIR/env_${TIMESTAMP}.bak"

# Cleanup old backups
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "env_*.bak" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: db_${TIMESTAMP}.sql.gz"
BACKUP
chmod +x /opt/backups/backup.sh

# Schedule daily backup at 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backups/backup.sh >> /var/log/dialer-backup.log 2>&1") | sort -u | crontab -
log "Daily backup scheduled at 3:00 AM"

# ─── Update Script ───────────────────────────────────────────────────────────
header "Step 14: Update Script"

cat > /opt/tts-broadcast-dialer/update.sh <<'UPDATE'
#!/bin/bash
# Update AI TTS Broadcast Dialer to latest version
set -euo pipefail

APP_DIR="/opt/tts-broadcast-dialer"
cd "$APP_DIR"

echo "═══ Pulling latest changes ═══"
git pull origin self-hosted

echo "═══ Installing dependencies ═══"
pnpm install

echo "═══ Pushing database migrations ═══"
set -a; source .env; set +a
pnpm db:push

echo "═══ Building application ═══"
pnpm build

echo "═══ Restarting application ═══"
pm2 restart tts-dialer

echo "═══ Update complete! ═══"
pm2 status
UPDATE
chmod +x /opt/tts-broadcast-dialer/update.sh
log "Update script created at $APP_DIR/update.sh"

# ─── Summary ─────────────────────────────────────────────────────────────────
header "Installation Complete!"

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  AI TTS Broadcast Dialer — Successfully Installed!       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Domain:${NC}      https://$DOMAIN"
echo -e "  ${CYAN}Server IP:${NC}   $SERVER_IP"
echo -e "  ${CYAN}App Dir:${NC}     $APP_DIR"
echo -e "  ${CYAN}Credentials:${NC} $CREDS_FILE"
echo ""
echo -e "  ${CYAN}Services:${NC}"
echo -e "    Node.js app  → pm2 status"
echo -e "    MySQL        → systemctl status mysql"
echo -e "    MinIO        → systemctl status minio (console: http://localhost:9001)"
echo -e "    Nginx        → systemctl status nginx"
echo ""
echo -e "  ${CYAN}Management:${NC}"
echo -e "    Update app   → bash $APP_DIR/update.sh"
echo -e "    View logs    → pm2 logs tts-dialer"
echo -e "    Restart app  → pm2 restart tts-dialer"
echo -e "    Backup now   → bash /opt/backups/backup.sh"
echo ""
echo -e "  ${CYAN}Next Steps:${NC}"
echo -e "    1. Open https://$DOMAIN in your browser"
echo -e "    2. Create your admin account (first user = admin)"
echo -e "    3. Go to Settings → configure API keys (OpenAI, Google TTS)"
echo -e "    4. Go to FreePBX Integration → connect your PBX server"
echo -e "    5. Whitelist this server's IP ($SERVER_IP) in FreePBX firewall"
echo ""
log "Installation finished at $(date)"
