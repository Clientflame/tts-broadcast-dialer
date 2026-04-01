#!/bin/bash
# ============================================================
# TTS Broadcast Dialer — Quick Install Script
# ============================================================
# Works on: Debian 12, Ubuntu 22.04/24.04, Rocky Linux 9
# Tested on: Vultr, Hostinger VPS, DigitalOcean, Linode
#
# Usage (one command):
#   curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh | bash
#
# Or download first:
#   curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh -o setup.sh && bash setup.sh
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

DEPLOY_DIR="/opt/tts-dialer"
DOCKER_IMAGE="ghcr.io/clientflame/tts-broadcast-dialer:latest"
SERVER_IP=$(hostname -I | awk '{print $1}')

# --- Helper functions ---
print_step() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

progress() {
  echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
}

prompt() {
  local var_name=$1
  local prompt_text=$2
  local default_val=$3
  if [ -n "$default_val" ]; then
    prompt_text="${prompt_text} ${DIM}[${default_val}]${NC}"
  fi
  read -p "  $(echo -e "$prompt_text"): " value
  value=${value:-$default_val}
  eval "$var_name='$value'"
}

check_port() {
  local port=$1
  if command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]" && return 0
  fi
  if command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]" && return 0
  fi
  return 1
}

get_port_process() {
  local port=$1
  local result=""
  if command -v ss &> /dev/null; then
    result=$(ss -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1 | grep -oP 'users:\(\("\K[^"]+' 2>/dev/null)
  fi
  [ -z "$result" ] && result="unknown"
  echo "$result"
}

# ============================================================
# Banner
# ============================================================
clear
echo -e "${BLUE}"
cat << 'BANNER'

  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║    TTS Broadcast Dialer                  ║
  ║    Quick Install                         ║
  ║                                          ║
  ╚══════════════════════════════════════════╝

BANNER
echo -e "${NC}"
echo -e "  This will install the TTS Broadcast Dialer on this server."
echo -e "  Everything else is configured in the ${BOLD}web dashboard${NC} after install."
echo -e "  Takes about ${BOLD}2 minutes${NC}."
echo ""

# --- Check root ---
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash setup.sh"
  exit 1
fi

# --- Detect OS ---
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
else
  fail "Cannot detect OS. Supported: Debian 12, Ubuntu 22/24, Rocky 9"
  exit 1
fi
progress "Detected: ${BOLD}$PRETTY_NAME${NC}"

# --- Auto-generate all secrets ---
DB_PASSWORD=$(openssl rand -hex 16)
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

# ============================================================
# Step 1 of 3: Domain (optional)
# ============================================================
print_step "Step 1 of 3 — Domain & SSL"

ENABLE_SSL="false"
APP_DOMAIN=""
APP_PORT="3000"
MYSQL_HOST_PORT="3306"

# Check port conflicts
if check_port 3306; then
  MYSQL_HOST_PORT="3307"
  warn "Port 3306 in use — MySQL will use ${BOLD}3307${NC} on host"
fi

PORT_80_FREE=true
PORT_443_FREE=true

if check_port 80; then
  PORT_80_FREE=false
  PORT_80_PROC=$(get_port_process 80)
fi
if check_port 443; then
  PORT_443_FREE=false
  PORT_443_PROC=$(get_port_process 443)
fi

if [ "$PORT_80_FREE" = true ] && [ "$PORT_443_FREE" = true ]; then
  echo ""
  echo -e "  ${DIM}If you have a domain pointed at this server (${BOLD}${SERVER_IP}${NC}${DIM}),${NC}"
  echo -e "  ${DIM}enter it below for automatic HTTPS. Leave blank to skip.${NC}"
  echo ""
  prompt APP_DOMAIN "Domain (e.g. dialer.yourcompany.com)" ""

  if [ -n "$APP_DOMAIN" ]; then
    ENABLE_SSL="true"
    progress "SSL enabled for ${BOLD}${APP_DOMAIN}${NC} (auto Let's Encrypt)"
  else
    echo -e "  ${DIM}No domain — access via http://${SERVER_IP}:${APP_PORT}${NC}"
  fi
else
  echo ""
  if [ "$PORT_80_FREE" = false ]; then
    warn "Port 80 in use by ${BOLD}${PORT_80_PROC}${NC}"
  fi
  if [ "$PORT_443_FREE" = false ]; then
    warn "Port 443 in use by ${BOLD}${PORT_443_PROC}${NC}"
  fi
  echo ""
  echo -e "  ${DIM}SSL requires ports 80 and 443. Common on FreePBX servers (Apache).${NC}"
  echo -e "  ${DIM}Options:${NC}"
  echo -e "    ${BOLD}1${NC}) Skip SSL — access via http://${SERVER_IP}:${APP_PORT}"
  echo -e "    ${BOLD}2${NC}) Move Apache to port 8080, then enable SSL"
  echo ""
  read -p "  Choose (1-2) [1]: " SSL_CHOICE
  SSL_CHOICE=${SSL_CHOICE:-1}

  if [ "$SSL_CHOICE" = "2" ]; then
    echo -e "  ${CYAN}▸ Moving Apache to port 8080...${NC}"
    if [ -f /etc/apache2/ports.conf ]; then
      sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf
      sed -i 's/Listen 443/Listen 8443/' /etc/apache2/ports.conf 2>/dev/null
      find /etc/apache2/sites-enabled/ -name "*.conf" -exec sed -i 's/:80/:8080/g' {} \; 2>/dev/null
      find /etc/apache2/sites-enabled/ -name "*.conf" -exec sed -i 's/:443/:8443/g' {} \; 2>/dev/null
      systemctl restart apache2 2>/dev/null
      progress "Apache moved to port 8080 (FreePBX admin: http://${SERVER_IP}:8080)"
    elif [ -f /etc/httpd/conf/httpd.conf ]; then
      sed -i 's/Listen 80/Listen 8080/' /etc/httpd/conf/httpd.conf
      systemctl restart httpd 2>/dev/null
      progress "Apache moved to port 8080"
    else
      fail "Could not find Apache config. Please move it manually."
    fi

    prompt APP_DOMAIN "Domain (e.g. dialer.yourcompany.com)" ""
    if [ -n "$APP_DOMAIN" ]; then
      ENABLE_SSL="true"
      progress "SSL enabled for ${BOLD}${APP_DOMAIN}${NC}"
    fi
  else
    echo -e "  ${DIM}SSL skipped. You can add it later.${NC}"
  fi
fi

# ============================================================
# Step 2 of 3: Timezone
# ============================================================
print_step "Step 2 of 3 — Timezone"

echo ""
echo -e "    ${BOLD}1${NC}) America/New_York (Eastern)"
echo -e "    ${BOLD}2${NC}) America/Chicago (Central)"
echo -e "    ${BOLD}3${NC}) America/Denver (Mountain)"
echo -e "    ${BOLD}4${NC}) America/Los_Angeles (Pacific)"
echo -e "    ${BOLD}5${NC}) Custom"
echo ""
read -p "  Choose (1-5) [1]: " TZ_CHOICE
TZ_CHOICE=${TZ_CHOICE:-1}

case $TZ_CHOICE in
  1) APP_TZ="America/New_York" ;;
  2) APP_TZ="America/Chicago" ;;
  3) APP_TZ="America/Denver" ;;
  4) APP_TZ="America/Los_Angeles" ;;
  5) prompt APP_TZ "Timezone" "America/New_York" ;;
  *) APP_TZ="America/New_York" ;;
esac

progress "Timezone: ${BOLD}${APP_TZ}${NC}"

# ============================================================
# Step 3 of 3: Confirm & Install
# ============================================================
print_step "Step 3 of 3 — Review & Install"

echo ""
echo -e "  ${BOLD}Server:${NC}      ${SERVER_IP}"
if [ -n "$APP_DOMAIN" ]; then
  echo -e "  ${BOLD}Domain:${NC}      ${APP_DOMAIN} (HTTPS)"
else
  echo -e "  ${BOLD}Access:${NC}      http://${SERVER_IP}:${APP_PORT}"
fi
echo -e "  ${BOLD}Timezone:${NC}    ${APP_TZ}"
echo -e "  ${BOLD}Image:${NC}       ${DOCKER_IMAGE}"
echo ""
echo -e "  ${DIM}FreePBX, branding, API keys, and SMTP are configured${NC}"
echo -e "  ${DIM}in the web dashboard after installation.${NC}"
echo ""

read -p "  Install now? (Y/n): " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo -e "  ${YELLOW}Cancelled.${NC}"
  exit 0
fi

# ============================================================
# Install Docker
# ============================================================
echo ""
echo -e "  ${CYAN}▸ Installing Docker...${NC}"

if command -v docker &> /dev/null; then
  progress "Docker already installed: $(docker --version | head -1)"
else
  case $OS in
    ubuntu|debian)
      apt-get update -y -qq > /dev/null 2>&1
      apt-get install -y -qq ca-certificates curl gnupg > /dev/null 2>&1
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -y -qq > /dev/null 2>&1
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null 2>&1
      ;;
    rocky|almalinux|centos)
      dnf install -y -q dnf-plugins-core > /dev/null 2>&1
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo > /dev/null 2>&1
      dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null 2>&1
      systemctl start docker
      systemctl enable docker
      ;;
    *)
      fail "Unsupported OS: $OS. Please install Docker manually."
      exit 1
      ;;
  esac
  progress "Docker installed"
fi

# Ensure Docker config directory
mkdir -p /root/.docker
if [ -d "/root/.docker/config.json" ]; then
  rm -rf /root/.docker/config.json
fi
if [ ! -f "/root/.docker/config.json" ]; then
  echo '{}' > /root/.docker/config.json
fi

# ============================================================
# Security Hardening: Firewall + Fail2Ban + Auto-Updates
# ============================================================
echo -e "  ${CYAN}▸ Securing server...${NC}"

# --- Firewall (UFW or firewalld) ---
FIREWALL_ENABLED=false

if command -v ufw &> /dev/null; then
  # Set default policies
  ufw default deny incoming > /dev/null 2>&1
  ufw default allow outgoing > /dev/null 2>&1
  # Allow SSH (always)
  ufw allow 22/tcp > /dev/null 2>&1
  # Allow the dialer app port
  ufw allow $APP_PORT/tcp > /dev/null 2>&1
  if [ "$ENABLE_SSL" = "true" ]; then
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
  fi
  # Enable the firewall (--force skips the confirmation prompt)
  ufw --force enable > /dev/null 2>&1
  FIREWALL_ENABLED=true
  progress "Firewall enabled (UFW) — only SSH, ${APP_PORT}${ENABLE_SSL:+, 80, 443} open"
elif command -v firewall-cmd &> /dev/null; then
  # Rocky/CentOS: firewalld
  systemctl start firewalld > /dev/null 2>&1
  systemctl enable firewalld > /dev/null 2>&1
  firewall-cmd --permanent --add-port=22/tcp > /dev/null 2>&1
  firewall-cmd --permanent --add-port=$APP_PORT/tcp > /dev/null 2>&1
  if [ "$ENABLE_SSL" = "true" ]; then
    firewall-cmd --permanent --add-port=80/tcp > /dev/null 2>&1
    firewall-cmd --permanent --add-port=443/tcp > /dev/null 2>&1
  fi
  firewall-cmd --reload > /dev/null 2>&1
  FIREWALL_ENABLED=true
  progress "Firewall enabled (firewalld) — only SSH, ${APP_PORT}${ENABLE_SSL:+, 80, 443} open"
else
  warn "No firewall manager found — installing UFW..."
  case $OS in
    ubuntu|debian)
      apt-get install -y -qq ufw > /dev/null 2>&1
      ;;
  esac
  if command -v ufw &> /dev/null; then
    ufw default deny incoming > /dev/null 2>&1
    ufw default allow outgoing > /dev/null 2>&1
    ufw allow 22/tcp > /dev/null 2>&1
    ufw allow $APP_PORT/tcp > /dev/null 2>&1
    if [ "$ENABLE_SSL" = "true" ]; then
      ufw allow 80/tcp > /dev/null 2>&1
      ufw allow 443/tcp > /dev/null 2>&1
    fi
    ufw --force enable > /dev/null 2>&1
    FIREWALL_ENABLED=true
    progress "Firewall installed and enabled (UFW)"
  else
    fail "Could not install firewall — please configure manually"
  fi
fi

# --- Fail2Ban (SSH brute-force protection) ---
echo -e "  ${CYAN}▸ Installing fail2ban (SSH protection)...${NC}"

if command -v fail2ban-client &> /dev/null; then
  progress "Fail2ban already installed"
else
  case $OS in
    ubuntu|debian)
      apt-get install -y -qq fail2ban > /dev/null 2>&1
      ;;
    rocky|almalinux|centos)
      dnf install -y -q epel-release > /dev/null 2>&1
      dnf install -y -q fail2ban > /dev/null 2>&1
      ;;
  esac
fi

if command -v fail2ban-client &> /dev/null; then
  # Configure fail2ban for SSH
  cat > /etc/fail2ban/jail.local << 'F2B_EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
banaction = %(banaction_allports)s

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
maxretry = 5
bantime = 3600
findtime = 600
F2B_EOF

  systemctl enable fail2ban > /dev/null 2>&1
  systemctl restart fail2ban > /dev/null 2>&1
  progress "Fail2ban active — bans IP after 5 failed SSH attempts (1 hour ban)"
else
  warn "Could not install fail2ban — SSH brute-force protection not active"
fi

# --- Automatic Security Updates ---
echo -e "  ${CYAN}▸ Enabling automatic security updates...${NC}"

case $OS in
  ubuntu|debian)
    apt-get install -y -qq unattended-upgrades > /dev/null 2>&1
    # Enable automatic security updates
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOUPDATE_EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOUPDATE_EOF
    systemctl enable unattended-upgrades > /dev/null 2>&1
    progress "Automatic security updates enabled (unattended-upgrades)"
    ;;
  rocky|almalinux|centos)
    dnf install -y -q dnf-automatic > /dev/null 2>&1
    if [ -f /etc/dnf/automatic.conf ]; then
      sed -i 's/apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf 2>/dev/null
      systemctl enable --now dnf-automatic.timer > /dev/null 2>&1
      progress "Automatic security updates enabled (dnf-automatic)"
    fi
    ;;
esac

# --- SSH Hardening Recommendations ---
# Check if password authentication is enabled and warn
SSH_PASS_AUTH=$(grep -E "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
if [ "$SSH_PASS_AUTH" != "no" ]; then
  echo ""
  warn "SSH password authentication is enabled."
  echo -e "  ${DIM}For stronger security, consider switching to SSH key authentication:${NC}"
  echo -e "  ${DIM}  1. On your local machine: ssh-copy-id root@${SERVER_IP}${NC}"
  echo -e "  ${DIM}  2. Then disable passwords: edit /etc/ssh/sshd_config${NC}"
  echo -e "  ${DIM}     Set: PasswordAuthentication no${NC}"
  echo -e "  ${DIM}  3. Restart SSH: systemctl restart sshd${NC}"
  echo ""
fi

# ============================================================
# Create deployment files
# ============================================================
echo -e "  ${CYAN}▸ Creating deployment files...${NC}"

mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# --- docker-compose.yml ---
cat > docker-compose.yml << COMPOSE_EOF
services:
  dialer:
    image: \${DOCKER_IMAGE:-ghcr.io/clientflame/tts-broadcast-dialer:latest}
    container_name: tts-dialer
    restart: unless-stopped
    ports:
      - "\${APP_PORT:-3000}:3000"
    env_file:
      - .env
    volumes:
      - dialer-storage:/app/data/storage
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=mysql://\${MYSQL_USER:-dialer}:\${MYSQL_PASSWORD}@db:3306/\${MYSQL_DATABASE:-tts_dialer}
      - TZ=\${TZ:-America/New_York}
      - APP_DOMAIN=\${APP_DOMAIN:-}
      - APP_PROTOCOL=\${APP_PROTOCOL:-http}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - dialer-net
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  db:
    image: mysql:8.0
    container_name: tts-dialer-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: \${MYSQL_DATABASE:-tts_dialer}
      MYSQL_USER: \${MYSQL_USER:-dialer}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql
    ports:
      - "127.0.0.1:${MYSQL_HOST_PORT}:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p\${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dialer-net
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
COMPOSE_EOF

# Add Caddy if SSL
if [ "$ENABLE_SSL" = "true" ]; then
  cat >> docker-compose.yml << 'COMPOSE_CADDY'

  caddy:
    image: caddy:2-alpine
    container_name: tts-dialer-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - dialer
    networks:
      - dialer-net
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
COMPOSE_CADDY
fi

# Add Watchtower (auto-updates)
cat >> docker-compose.yml << 'COMPOSE_WT'

  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: unless-stopped
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=${UPDATE_CHECK_INTERVAL:-86400}
      - DOCKER_API_VERSION=1.40
      - TZ=${TZ:-America/New_York}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
COMPOSE_WT

# Volumes
if [ "$ENABLE_SSL" = "true" ]; then
  cat >> docker-compose.yml << 'COMPOSE_VOLS'

volumes:
  mysql-data:
  dialer-storage:
  caddy-data:
  caddy-config:

networks:
  dialer-net:
COMPOSE_VOLS
else
  cat >> docker-compose.yml << 'COMPOSE_VOLS_NOSSL'

volumes:
  mysql-data:
  dialer-storage:

networks:
  dialer-net:
COMPOSE_VOLS_NOSSL
fi

# Caddyfile
if [ "$ENABLE_SSL" = "true" ]; then
  cat > Caddyfile << CADDY_EOF
${APP_DOMAIN} {
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
CADDY_EOF
fi

# --- .env ---
APP_PROTOCOL="http"
[ "$ENABLE_SSL" = "true" ] && APP_PROTOCOL="https"

cat > .env << ENV_EOF
# ============================================================
# TTS Broadcast Dialer
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ============================================================
# Most settings are configured in the web dashboard.
# Only edit this file for Docker/database changes.
# Then restart: cd ${DEPLOY_DIR} && docker compose up -d
# ============================================================

# --- Server ---
APP_PORT=${APP_PORT}
DOCKER_IMAGE=${DOCKER_IMAGE}
TZ=${APP_TZ}

# --- Domain & SSL ---
APP_DOMAIN=${APP_DOMAIN}
APP_PROTOCOL=${APP_PROTOCOL}

# --- Database (auto-generated) ---
MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
MYSQL_DATABASE=tts_dialer
MYSQL_USER=dialer
MYSQL_PASSWORD=${DB_PASSWORD}

# --- Auth (auto-generated) ---
JWT_SECRET=${JWT_SECRET}

# --- Branding (configure in web dashboard > Settings) ---
VITE_APP_TITLE=AI TTS Broadcast Dialer
VITE_APP_LOGO=
VITE_PRIMARY_COLOR=#2563eb
VITE_ACCENT_COLOR=#3b82f6

# --- FreePBX (configure in web dashboard > Settings) ---
FREEPBX_HOST=
FREEPBX_AMI_USER=
FREEPBX_AMI_PASSWORD=
FREEPBX_AMI_PORT=5038
FREEPBX_SSH_USER=
FREEPBX_SSH_PASSWORD=

# --- TTS API Keys (configure in web dashboard > Settings) ---
OPENAI_API_KEY=
GOOGLE_TTS_API_KEY=

# --- SMTP (configure in web dashboard > Settings) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=

# --- Manus Platform (leave blank for standalone) ---
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=

# --- Optional Integrations (configure in web dashboard > Settings) ---
# VITELITY_API_LOGIN=
# VITELITY_API_PASS=
# VTIGER_URL=
# VTIGER_USERNAME=
# VTIGER_ACCESS_KEY=
# OPENAI_API_BASE_URL=

# --- Auto-Update ---
UPDATE_CHECK_INTERVAL=86400
ENV_EOF

chmod 600 .env

# --- Management scripts ---
cat > update.sh << 'UPDATE_EOF'
#!/bin/bash
echo "Pulling latest image..."
cd /opt/tts-dialer
docker compose pull dialer
echo "Restarting..."
docker compose up -d --force-recreate dialer
docker image prune -f
echo "Done!"
docker exec tts-dialer node -e "console.log('Version: ' + require('./package.json').version)" 2>/dev/null
UPDATE_EOF
chmod +x update.sh

cat > backup.sh << 'BACKUP_EOF'
#!/bin/bash
BACKUP_DIR="/opt/tts-dialer/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
echo "Backing up database..."
source .env
docker exec tts-dialer-db mysqldump -u root -p${MYSQL_ROOT_PASSWORD} tts_dialer > "$BACKUP_DIR/db_${TIMESTAMP}.sql"
cp .env "$BACKUP_DIR/env_${TIMESTAMP}.bak"
echo "Backup saved to $BACKUP_DIR/"
ls -la "$BACKUP_DIR/"
cd $BACKUP_DIR && ls -t db_*.sql | tail -n +8 | xargs -r rm
cd $BACKUP_DIR && ls -t env_*.bak | tail -n +8 | xargs -r rm
BACKUP_EOF
chmod +x backup.sh

cat > status.sh << 'STATUS_EOF'
#!/bin/bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TTS Dialer — Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd /opt/tts-dialer
echo ""
docker compose ps
echo ""
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null
echo ""
docker exec tts-dialer node -e "console.log('Version: ' + require('./package.json').version)" 2>/dev/null
STATUS_EOF
chmod +x status.sh

cat > logs.sh << 'LOGS_EOF'
#!/bin/bash
cd /opt/tts-dialer && docker compose logs -f --tail 100 dialer
LOGS_EOF
chmod +x logs.sh

cat > restart.sh << 'RESTART_EOF'
#!/bin/bash
cd /opt/tts-dialer && docker compose restart dialer && docker compose ps
RESTART_EOF
chmod +x restart.sh

progress "Deployment files created"

# ============================================================
# Pull and start
# ============================================================
echo -e "  ${CYAN}▸ Pulling Docker images (this may take a minute)...${NC}"

docker compose pull 2>&1 | tail -5
docker compose up -d 2>&1

progress "Services starting..."

# Wait for health
echo -e "  ${CYAN}▸ Waiting for services to start...${NC}"
sleep 15

# Health check
ALL_HEALTHY=true

if docker compose ps db 2>/dev/null | grep -q "healthy"; then
  progress "Database: healthy"
else
  warn "Database: starting (may take up to 30s)"
  ALL_HEALTHY=false
fi

if docker compose ps dialer 2>/dev/null | grep -q "Up"; then
  progress "Dialer: running"
else
  fail "Dialer: not running — check: docker compose logs dialer"
  ALL_HEALTHY=false
fi

if [ "$ENABLE_SSL" = "true" ]; then
  if docker compose ps caddy 2>/dev/null | grep -q "Up"; then
    progress "Caddy (SSL): running"
  else
    fail "Caddy: not running — check: docker compose logs caddy"
    ALL_HEALTHY=false
  fi
fi

if docker compose ps watchtower 2>/dev/null | grep -q "Up"; then
  progress "Watchtower: running (auto-updates every 24h)"
else
  warn "Watchtower: not running (auto-updates disabled)"
fi

# Daily backup cron
(crontab -l 2>/dev/null; echo "0 3 * * * cd ${DEPLOY_DIR} && ./backup.sh >> /var/log/tts-dialer-backup.log 2>&1") | crontab -

# ============================================================
# Done!
# ============================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✓ Installation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Open your dialer:${NC}"
if [ -n "$APP_DOMAIN" ]; then
  echo -e "    ${CYAN}➜  https://${APP_DOMAIN}${NC}"
else
  echo -e "    ${CYAN}➜  http://${SERVER_IP}:${APP_PORT}${NC}"
fi
echo ""
echo -e "  ${BOLD}What happens next:${NC}"
echo -e "    1. Open the URL above in your browser"
echo -e "    2. Create your admin account"
echo -e "    3. The ${BOLD}Setup Wizard${NC} will guide you through:"
echo -e "       • Branding (company name, logo, colors)"
echo -e "       • FreePBX connection (AMI + SSH)"
echo -e "       • PBX Agent install (one-click from the browser)"
echo -e "       • API keys (OpenAI, Google TTS)"
echo -e "       • SMTP for email notifications"
echo ""
echo -e "  ${BOLD}Server management:${NC}"
echo -e "    cd ${DEPLOY_DIR}"
echo -e "    ./status.sh      Check status & version"
echo -e "    ./update.sh      Pull latest version"
echo -e "    ./logs.sh        View live logs"
echo -e "    ./restart.sh     Restart the app"
echo -e "    ./backup.sh      Backup database"
echo ""
echo -e "  ${BOLD}Database credentials${NC} ${DIM}(saved in .env)${NC}:"
echo -e "    Root Password:   ${DB_ROOT_PASSWORD}"
echo -e "    App Password:    ${DB_PASSWORD}"
echo ""
echo -e "  ${BOLD}Security:${NC}"
if [ "$FIREWALL_ENABLED" = "true" ]; then
  echo -e "    ${GREEN}✓${NC} Firewall enabled (only required ports open)"
else
  echo -e "    ${YELLOW}⚠${NC} Firewall not configured — run: ufw --force enable"
fi
if command -v fail2ban-client &> /dev/null; then
  echo -e "    ${GREEN}✓${NC} Fail2ban active (SSH brute-force protection)"
else
  echo -e "    ${YELLOW}⚠${NC} Fail2ban not installed — run: apt install fail2ban"
fi
if [ "$SSH_PASS_AUTH" = "no" ]; then
  echo -e "    ${GREEN}✓${NC} SSH key authentication only"
else
  echo -e "    ${YELLOW}⚠${NC} SSH password auth enabled — consider switching to key auth"
fi
echo -e "    ${GREEN}✓${NC} Automatic security updates enabled"
echo ""
echo -e "  ${DIM}Auto-updates enabled via Watchtower (checks every 24h)${NC}"
echo -e "  ${DIM}Daily database backups at 3:00 AM${NC}"
echo ""
