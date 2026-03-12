#!/bin/bash
# ============================================================
# TTS Broadcast Dialer — Client Server Setup Script
# ============================================================
# Works on: Debian 12, Ubuntu 22.04/24.04, Rocky Linux 9
# Tested on: Vultr, Hostinger VPS, DigitalOcean, Linode
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/Clientflame/tts-broadcast-dialer/main/deploy/setup-client.sh -o setup.sh && chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

DEPLOY_DIR="/opt/tts-dialer"
DEFAULT_IMAGE="ghcr.io/clientflame/tts-broadcast-dialer:latest"

# --- Helper functions ---
print_header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_step() {
  echo ""
  echo -e "${CYAN}▸ $1${NC}"
}

prompt() {
  local var_name=$1
  local prompt_text=$2
  local default_val=$3
  local is_secret=$4

  if [ -n "$default_val" ]; then
    prompt_text="${prompt_text} ${DIM}(default: ${default_val})${NC}"
  fi

  if [ "$is_secret" = "secret" ]; then
    read -sp "  $prompt_text: " value
    echo ""
  else
    read -p "  $(echo -e "$prompt_text"): " value
  fi

  value=${value:-$default_val}
  eval "$var_name='$value'"
}

prompt_choice() {
  local var_name=$1
  local prompt_text=$2
  shift 2
  local options=("$@")

  echo -e "  ${prompt_text}"
  for i in "${!options[@]}"; do
    echo -e "    ${BOLD}$((i+1))${NC}) ${options[$i]}"
  done
  read -p "  Choose (1-${#options[@]}): " choice

  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
    eval "$var_name='$((choice-1))'"
  else
    eval "$var_name='0'"
  fi
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
  ║    Server Setup Wizard                   ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
BANNER
echo -e "${NC}"
echo -e "  This wizard will set up everything you need."
echo -e "  It takes about ${BOLD}2 minutes${NC} to complete."
echo ""

# --- Check root ---
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}  ✗ Please run as root: sudo ./setup-client.sh${NC}"
  exit 1
fi

# --- Detect OS ---
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
else
  echo -e "${RED}  ✗ Cannot detect OS. Supported: Debian 12, Ubuntu 22/24, Rocky 9${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Detected: ${BOLD}$PRETTY_NAME${NC}"

# ============================================================
# Step 1: Branding
# ============================================================
print_header "1/5  Your Brand"

prompt CLIENT_NAME "Company name" "" ""
prompt APP_TITLE "App title (shown in browser tab & sidebar)" "AI TTS Broadcast Dialer" ""
prompt APP_LOGO "Logo URL ${DIM}(paste a URL to your logo image, or leave blank)${NC}" "" ""

echo ""
echo -e "  Pick a color theme for the dashboard:"
echo ""
echo -e "    ${BOLD}1${NC}) 🔵  Blue (Professional)       — #2563eb"
echo -e "    ${BOLD}2${NC}) 🟢  Green (Fresh)             — #16a34a"
echo -e "    ${BOLD}3${NC}) 🟣  Purple (Modern)           — #7c3aed"
echo -e "    ${BOLD}4${NC}) 🔴  Red (Bold)                — #dc2626"
echo -e "    ${BOLD}5${NC}) 🟠  Orange (Energetic)        — #ea580c"
echo -e "    ${BOLD}6${NC}) ⚫  Slate (Minimal)           — #475569"
echo -e "    ${BOLD}7${NC}) 🎨  Custom (enter your own hex color)"
echo ""
read -p "  Choose (1-7, default: 1): " COLOR_CHOICE
COLOR_CHOICE=${COLOR_CHOICE:-1}

case $COLOR_CHOICE in
  1) PRIMARY_COLOR="#2563eb"; ACCENT_COLOR="#3b82f6" ;;
  2) PRIMARY_COLOR="#16a34a"; ACCENT_COLOR="#22c55e" ;;
  3) PRIMARY_COLOR="#7c3aed"; ACCENT_COLOR="#8b5cf6" ;;
  4) PRIMARY_COLOR="#dc2626"; ACCENT_COLOR="#ef4444" ;;
  5) PRIMARY_COLOR="#ea580c"; ACCENT_COLOR="#f97316" ;;
  6) PRIMARY_COLOR="#475569"; ACCENT_COLOR="#64748b" ;;
  7)
    prompt PRIMARY_COLOR "Primary color (hex, e.g. #2563eb)" "#2563eb" ""
    prompt ACCENT_COLOR "Accent color (hex, e.g. #3b82f6)" "#3b82f6" ""
    ;;
  *) PRIMARY_COLOR="#2563eb"; ACCENT_COLOR="#3b82f6" ;;
esac

echo -e "  ${GREEN}✓${NC} Brand: ${BOLD}${APP_TITLE}${NC} — ${PRIMARY_COLOR}"

# ============================================================
# Step 2: FreePBX Connection
# ============================================================
print_header "2/5  FreePBX Connection"

echo -e "  ${DIM}Enter the connection details for your FreePBX/Asterisk server.${NC}"
echo -e "  ${DIM}You can change these later by editing ${DEPLOY_DIR}/.env${NC}"
echo ""
echo -e "  ${YELLOW}Don't have FreePBX yet?${NC}"
echo -e "  ${DIM}See the full setup guide: https://github.com/Clientflame/tts-broadcast-dialer/blob/main/deploy/DEPLOYMENT-GUIDE.md${NC}"
echo -e "  ${DIM}FreePBX can be installed on this same server (all-in-one) or a separate one.${NC}"
echo -e "  ${DIM}If FreePBX is on this server, use ${BOLD}127.0.0.1${NC}${DIM} as the host below.${NC}"
echo ""

prompt PBX_HOST "FreePBX server IP address" "" ""
prompt PBX_AMI_USER "AMI username" "admin" ""
prompt PBX_AMI_PASS "AMI password" "" "secret"
prompt PBX_AMI_PORT "AMI port" "5038" ""
prompt PBX_SSH_USER "SSH username (for audio file sync)" "root" ""
prompt PBX_SSH_PASS "SSH password" "" "secret"

if [ -z "$PBX_HOST" ]; then
  echo -e "  ${YELLOW}⚠ No FreePBX host provided. You can add it later in .env${NC}"
else
  echo -e "  ${GREEN}✓${NC} FreePBX: ${BOLD}${PBX_HOST}${NC} (AMI: ${PBX_AMI_USER}@${PBX_AMI_PORT})"
fi

# ============================================================
# Step 3: TTS API Keys
# ============================================================
print_header "3/5  TTS Voice Provider"

echo -e "  ${DIM}You need at least one API key for text-to-speech.${NC}"
echo -e "  ${DIM}You can add both — the app lets you choose per campaign.${NC}"
echo ""
echo -e "  ${BOLD}OpenAI${NC} — Higher quality voices, ~$15/1M characters"
echo -e "    Get a key: ${CYAN}https://platform.openai.com/api-keys${NC}"
echo ""
echo -e "  ${BOLD}Google TTS${NC} — More voice options, ~$4/1M characters"
echo -e "    Get a key: ${CYAN}https://console.cloud.google.com/apis/credentials${NC}"
echo ""

prompt OPENAI_KEY "OpenAI API Key (starts with sk-)" "" "secret"
prompt GOOGLE_KEY "Google TTS API Key" "" "secret"

if [ -z "$OPENAI_KEY" ] && [ -z "$GOOGLE_KEY" ]; then
  echo -e "  ${YELLOW}⚠ No TTS key provided. You'll need to add one later for TTS to work.${NC}"
else
  [ -n "$OPENAI_KEY" ] && echo -e "  ${GREEN}✓${NC} OpenAI key configured"
  [ -n "$GOOGLE_KEY" ] && echo -e "  ${GREEN}✓${NC} Google TTS key configured"
fi

# ============================================================
# Step 4: Advanced Settings (with sensible defaults)
# ============================================================
print_header "4/5  Server Settings"

prompt APP_PORT "Web app port" "3000" ""

echo ""
echo -e "  ${DIM}Timezone (for scheduling and call logs):${NC}"
echo -e "    ${BOLD}1${NC}) America/New_York (Eastern)"
echo -e "    ${BOLD}2${NC}) America/Chicago (Central)"
echo -e "    ${BOLD}3${NC}) America/Denver (Mountain)"
echo -e "    ${BOLD}4${NC}) America/Los_Angeles (Pacific)"
echo -e "    ${BOLD}5${NC}) Custom"
echo ""
read -p "  Choose (1-5, default: 1): " TZ_CHOICE
TZ_CHOICE=${TZ_CHOICE:-1}

case $TZ_CHOICE in
  1) APP_TZ="America/New_York" ;;
  2) APP_TZ="America/Chicago" ;;
  3) APP_TZ="America/Denver" ;;
  4) APP_TZ="America/Los_Angeles" ;;
  5) prompt APP_TZ "Timezone (e.g. America/New_York)" "America/New_York" "" ;;
  *) APP_TZ="America/New_York" ;;
esac

echo -e "  ${GREEN}✓${NC} Port: ${BOLD}${APP_PORT}${NC} | Timezone: ${BOLD}${APP_TZ}${NC}"

# Auto-generate secrets
DB_PASSWORD=$(openssl rand -hex 16)
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

# ============================================================
# Step 5: Docker Image (GHCR login)
# ============================================================
print_header "5/5  Docker Image"

prompt DOCKER_IMAGE "Docker image" "$DEFAULT_IMAGE" ""

echo ""
if ! docker info &> /dev/null 2>&1; then
  echo -e "  ${DIM}Docker not found — will install it next.${NC}"
elif docker pull "$DOCKER_IMAGE" &> /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Image accessible (already logged in to GHCR)"
else
  echo -e "  ${YELLOW}The image is in a private registry. You need to log in to GHCR.${NC}"
  echo ""
  echo -e "  ${DIM}To create a token: GitHub → Settings → Developer settings → Personal access tokens${NC}"
  echo -e "  ${DIM}Required scope: ${BOLD}read:packages${NC}"
  echo ""
  prompt GHCR_USER "GitHub username" "" ""
  prompt GHCR_TOKEN "GitHub Personal Access Token (with read:packages)" "" "secret"

  if [ -n "$GHCR_USER" ] && [ -n "$GHCR_TOKEN" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin 2>/dev/null
    if [ $? -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} Logged in to GHCR"
    else
      echo -e "  ${RED}✗ Login failed. You can retry later: docker login ghcr.io${NC}"
    fi
  else
    echo -e "  ${YELLOW}⚠ Skipped GHCR login. Run 'docker login ghcr.io' before starting.${NC}"
  fi
fi

# ============================================================
# Review before proceeding
# ============================================================
print_header "Review"

echo ""
echo -e "  ${BOLD}Brand${NC}"
echo -e "    Company:    ${CLIENT_NAME}"
echo -e "    App Title:  ${APP_TITLE}"
echo -e "    Colors:     ${PRIMARY_COLOR} / ${ACCENT_COLOR}"
[ -n "$APP_LOGO" ] && echo -e "    Logo:       ${APP_LOGO}"
echo ""
echo -e "  ${BOLD}FreePBX${NC}"
if [ -n "$PBX_HOST" ]; then
  echo -e "    Host:       ${PBX_HOST}:${PBX_AMI_PORT}"
  echo -e "    AMI User:   ${PBX_AMI_USER}"
  echo -e "    SSH User:   ${PBX_SSH_USER}"
else
  echo -e "    ${DIM}(not configured — add later in .env)${NC}"
fi
echo ""
echo -e "  ${BOLD}TTS${NC}"
[ -n "$OPENAI_KEY" ] && echo -e "    OpenAI:     ✓ configured" || echo -e "    OpenAI:     ${DIM}not set${NC}"
[ -n "$GOOGLE_KEY" ] && echo -e "    Google:     ✓ configured" || echo -e "    Google:     ${DIM}not set${NC}"
echo ""
echo -e "  ${BOLD}Server${NC}"
echo -e "    Port:       ${APP_PORT}"
echo -e "    Timezone:   ${APP_TZ}"
echo -e "    Image:      ${DOCKER_IMAGE}"
echo ""

read -p "  Proceed with installation? (Y/n): " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo -e "  ${YELLOW}Setup cancelled.${NC}"
  exit 0
fi

# ============================================================
# Install Docker
# ============================================================
print_step "Installing Docker..."

if command -v docker &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} Docker already installed: $(docker --version | head -1)"
else
  case $OS in
    ubuntu|debian)
      apt-get update -y -qq
      apt-get install -y -qq ca-certificates curl gnupg > /dev/null 2>&1
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -y -qq
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
      echo -e "  ${RED}✗ Unsupported OS: $OS. Please install Docker manually.${NC}"
      exit 1
      ;;
  esac
  echo -e "  ${GREEN}✓${NC} Docker installed"
fi

# ============================================================
# Configure Firewall
# ============================================================
print_step "Configuring firewall..."

if command -v ufw &> /dev/null; then
  ufw allow 22/tcp > /dev/null 2>&1
  ufw allow $APP_PORT/tcp > /dev/null 2>&1
  echo -e "  ${GREEN}✓${NC} UFW: ports 22, ${APP_PORT} opened"
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=22/tcp > /dev/null 2>&1
  firewall-cmd --permanent --add-port=$APP_PORT/tcp > /dev/null 2>&1
  firewall-cmd --reload > /dev/null 2>&1
  echo -e "  ${GREEN}✓${NC} Firewalld: ports 22, ${APP_PORT} opened"
else
  echo -e "  ${DIM}No firewall manager detected. Ensure port ${APP_PORT} is open.${NC}"
fi

# ============================================================
# Create deployment directory and config
# ============================================================
print_step "Creating deployment files..."

mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# Write docker-compose.yml
cat > docker-compose.yml << 'COMPOSE_EOF'
services:
  dialer:
    image: ${DOCKER_IMAGE:-ghcr.io/clientflame/tts-broadcast-dialer:latest}
    container_name: tts-dialer
    restart: unless-stopped
    ports:
      - "${APP_PORT:-3000}:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=mysql://${MYSQL_USER:-dialer}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE:-tts_dialer}
      - TZ=${TZ:-America/New_York}
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
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-tts_dialer}
      MYSQL_USER: ${MYSQL_USER:-dialer}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql
    ports:
      - "127.0.0.1:3306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
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

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=${UPDATE_CHECK_INTERVAL:-86400}
      - TZ=${TZ:-America/New_York}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker/config.json:/config.json:ro

volumes:
  mysql-data:

networks:
  dialer-net:
COMPOSE_EOF

# Write .env file with all collected values
cat > .env << ENV_EOF
# ============================================================
# ${CLIENT_NAME} — TTS Broadcast Dialer
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ============================================================
# Edit this file anytime: nano ${DEPLOY_DIR}/.env
# Then restart: cd ${DEPLOY_DIR} && docker compose up -d
# ============================================================

# --- App Branding ---
VITE_APP_TITLE=${APP_TITLE}
VITE_APP_LOGO=${APP_LOGO}
VITE_PRIMARY_COLOR=${PRIMARY_COLOR}
VITE_ACCENT_COLOR=${ACCENT_COLOR}

# --- Server ---
APP_PORT=${APP_PORT}
DOCKER_IMAGE=${DOCKER_IMAGE}
TZ=${APP_TZ}

# --- Database (auto-generated, do not change) ---
MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
MYSQL_DATABASE=tts_dialer
MYSQL_USER=dialer
MYSQL_PASSWORD=${DB_PASSWORD}

# --- FreePBX ---
FREEPBX_HOST=${PBX_HOST}
FREEPBX_AMI_USER=${PBX_AMI_USER}
FREEPBX_AMI_PASSWORD=${PBX_AMI_PASS}
FREEPBX_AMI_PORT=${PBX_AMI_PORT}
FREEPBX_SSH_USER=${PBX_SSH_USER}
FREEPBX_SSH_PASSWORD=${PBX_SSH_PASS}

# --- TTS API Keys ---
OPENAI_API_KEY=${OPENAI_KEY}
GOOGLE_TTS_API_KEY=${GOOGLE_KEY}

# --- Auth (auto-generated) ---
JWT_SECRET=${JWT_SECRET}

# --- Manus Platform (leave blank for standalone mode) ---
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=

# --- Auto-Update (seconds between checks, default 24h) ---
UPDATE_CHECK_INTERVAL=86400
ENV_EOF

chmod 600 .env
echo -e "  ${GREEN}✓${NC} Config files created in ${DEPLOY_DIR}/"

# ============================================================
# Create management scripts
# ============================================================
print_step "Creating management scripts..."

# Update script
cat > update.sh << 'UPDATE_EOF'
#!/bin/bash
echo "Pulling latest dialer image..."
docker compose pull dialer
echo "Restarting with new image..."
docker compose up -d dialer
echo "Cleaning up old images..."
docker image prune -f
echo "Update complete!"
docker compose ps
UPDATE_EOF
chmod +x update.sh

# Backup script
cat > backup.sh << 'BACKUP_EOF'
#!/bin/bash
BACKUP_DIR="/opt/tts-dialer/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
echo "Backing up database..."
source .env
docker exec tts-dialer-db mysqldump -u root -p${MYSQL_ROOT_PASSWORD} tts_dialer > "$BACKUP_DIR/db_${TIMESTAMP}.sql"
echo "Backing up .env..."
cp .env "$BACKUP_DIR/env_${TIMESTAMP}.bak"
echo "Backup saved to $BACKUP_DIR/"
ls -la "$BACKUP_DIR/"
# Keep only last 7 backups
cd $BACKUP_DIR && ls -t db_*.sql | tail -n +8 | xargs -r rm
cd $BACKUP_DIR && ls -t env_*.bak | tail -n +8 | xargs -r rm
echo "Cleanup complete (keeping last 7 backups)."
BACKUP_EOF
chmod +x backup.sh

# Status script
cat > status.sh << 'STATUS_EOF'
#!/bin/bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TTS Dialer — Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "--- Containers ---"
docker compose ps
echo ""
echo "--- Resources ---"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
echo ""
echo "--- Disk ---"
df -h / | tail -1
echo ""
echo "--- Recent Logs ---"
docker compose logs --tail 10 dialer
STATUS_EOF
chmod +x status.sh

# Logs script
cat > logs.sh << 'LOGS_EOF'
#!/bin/bash
docker compose logs -f --tail 100 dialer
LOGS_EOF
chmod +x logs.sh

# Restart script
cat > restart.sh << 'RESTART_EOF'
#!/bin/bash
echo "Restarting TTS Dialer..."
docker compose restart dialer
echo "Done!"
docker compose ps
RESTART_EOF
chmod +x restart.sh

echo -e "  ${GREEN}✓${NC} Management scripts created"

# ============================================================
# Start the stack
# ============================================================
print_step "Pulling Docker images and starting services..."

docker compose pull 2>&1 | tail -5
docker compose up -d

echo ""
echo -e "  ${GREEN}✓${NC} Services starting..."
echo ""

# Wait for containers
sleep 10

# ============================================================
# Final Summary
# ============================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✓ Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Open your dialer:${NC}"
echo -e "  ${CYAN}➜  http://$(hostname -I | awk '{print $1}'):${APP_PORT}${NC}"
echo ""
echo -e "  ${BOLD}First time?${NC} Create your admin account on the setup page,"
echo -e "  then the onboarding wizard will guide you through the rest."
echo ""
echo -e "  ${BOLD}Management:${NC}"
echo -e "    cd ${DEPLOY_DIR}"
echo -e "    ./status.sh      Check container status"
echo -e "    ./logs.sh        View live logs"
echo -e "    ./restart.sh     Restart the app"
echo -e "    ./update.sh      Pull latest version"
echo -e "    ./backup.sh      Backup database"
echo -e "    nano .env        Edit configuration"
echo ""
echo -e "  ${BOLD}Database credentials${NC} ${DIM}(save these!)${NC}:"
echo -e "    Root Password:   ${DB_ROOT_PASSWORD}"
echo -e "    App Password:    ${DB_PASSWORD}"
echo ""

# Set up daily backup cron
(crontab -l 2>/dev/null; echo "0 3 * * * cd ${DEPLOY_DIR} && ./backup.sh >> /var/log/tts-dialer-backup.log 2>&1") | crontab -
echo -e "  ${GREEN}✓${NC} Daily backup scheduled at 3:00 AM"
echo ""

docker compose ps
echo ""
