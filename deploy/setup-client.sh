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

check_port() {
  local port=$1
  # Match :PORT at end of address field (handles 0.0.0.0:3306, :::80, 127.0.0.1:3306, *:80)
  if command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]" && return 0
  fi
  if command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]" && return 0
  fi
  # Fallback: try to bind the port
  if command -v python3 &> /dev/null; then
    python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.bind(('0.0.0.0',${port})); s.close()" 2>/dev/null
    if [ $? -ne 0 ]; then
      return 0  # port in use
    fi
  fi
  return 1
}

get_port_process() {
  local port=$1
  local result=""
  if command -v ss &> /dev/null; then
    result=$(ss -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1 | grep -oP 'users:\(\("\K[^"]+' 2>/dev/null)
  fi
  if [ -z "$result" ] && command -v netstat &> /dev/null; then
    result=$(netstat -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | awk '{print $NF}' | sed 's|.*/||' | head -1)
  fi
  if [ -z "$result" ]; then
    result="unknown process"
  fi
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

# --- Pre-flight: detect port conflicts ---
MYSQL_HOST_PORT="3306"
PORT_80_CONFLICT=""
PORT_443_CONFLICT=""

if check_port 3306; then
  PORT_3306_PROC=$(get_port_process 3306)
  echo -e "  ${YELLOW}⚠${NC} Port 3306 in use by ${BOLD}${PORT_3306_PROC:-unknown}${NC} — Docker MySQL will use ${BOLD}3307${NC} instead"
  MYSQL_HOST_PORT="3307"
fi

if check_port 80; then
  PORT_80_CONFLICT=$(get_port_process 80)
  echo -e "  ${YELLOW}⚠${NC} Port 80 in use by ${BOLD}${PORT_80_CONFLICT:-unknown}${NC}"
fi

if check_port 443; then
  PORT_443_CONFLICT=$(get_port_process 443)
  echo -e "  ${YELLOW}⚠${NC} Port 443 in use by ${BOLD}${PORT_443_CONFLICT:-unknown}${NC}"
fi

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

# TTS API keys are no longer collected during setup.
# Users configure them in the admin Settings page after installation.
OPENAI_KEY=""
GOOGLE_KEY=""

# ============================================================
# Step 3: Email / SMTP (for password resets & notifications)
# ============================================================
print_header "3/7  Email / SMTP"

echo -e "  ${DIM}SMTP is needed for password reset emails and notifications.${NC}"
echo -e "  ${DIM}You can skip this now and configure it later in Settings.${NC}"
echo ""
echo -e "  Common SMTP providers:"
echo -e "    • Gmail:     smtp.gmail.com, port 587, TLS (use App Password)"
echo -e "    • Outlook:   smtp.office365.com, port 587, TLS"
echo -e "    • SendGrid:  smtp.sendgrid.net, port 587, TLS"
echo -e "    • Mailgun:   smtp.mailgun.org, port 587, TLS"
echo ""
read -p "  Configure SMTP now? (y/N): " SETUP_SMTP
SETUP_SMTP=${SETUP_SMTP:-N}

SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM_EMAIL=""
SMTP_FROM_NAME=""

if [[ "$SETUP_SMTP" =~ ^[Yy]$ ]]; then
  prompt SMTP_HOST "SMTP host" "smtp.gmail.com" ""
  prompt SMTP_PORT "SMTP port" "587" ""
  echo ""
  echo -e "  ${DIM}Use TLS? (port 587 = TLS/STARTTLS, port 465 = SSL)${NC}"
  if [ "$SMTP_PORT" = "465" ]; then
    SMTP_SECURE="true"
    echo -e "  ${GREEN}✓${NC} Auto-detected: SSL (port 465)"
  else
    SMTP_SECURE="false"
    echo -e "  ${GREEN}✓${NC} Auto-detected: STARTTLS (port ${SMTP_PORT})"
  fi
  prompt SMTP_USER "SMTP username (usually your email)" "" ""
  prompt SMTP_PASS "SMTP password" "" "secret"
  prompt SMTP_FROM_EMAIL "From email address" "$SMTP_USER" ""
  prompt SMTP_FROM_NAME "From display name" "$APP_TITLE" ""
  echo -e "  ${GREEN}✓${NC} SMTP: ${BOLD}${SMTP_HOST}:${SMTP_PORT}${NC} as ${SMTP_FROM_EMAIL}"
else
  echo -e "  ${DIM}SMTP skipped — configure later in Settings > SMTP${NC}"
fi

# ============================================================
# Step 4: Server Settings
# ============================================================
print_header "4/7  Server Settings"

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
# Step 5: Domain & SSL
# ============================================================
print_header "5/7  Domain & SSL (Optional)"

ENABLE_SSL="false"

# Check for port conflicts before offering SSL
if [ -n "$PORT_80_CONFLICT" ] || [ -n "$PORT_443_CONFLICT" ]; then
  echo -e "  ${YELLOW}⚠ Port conflict detected:${NC}"
  [ -n "$PORT_80_CONFLICT" ] && echo -e "    Port 80 is used by ${BOLD}${PORT_80_CONFLICT}${NC}"
  [ -n "$PORT_443_CONFLICT" ] && echo -e "    Port 443 is used by ${BOLD}${PORT_443_CONFLICT}${NC}"
  echo ""
  echo -e "  ${DIM}This is common on FreePBX servers (Apache uses ports 80/443).${NC}"
  echo -e "  ${DIM}SSL via Caddy requires ports 80 and 443 to be free.${NC}"
  echo ""
  echo -e "  Options:"
  echo -e "    ${BOLD}1${NC}) Skip SSL — access via http://IP:${APP_PORT} (recommended for now)"
  echo -e "    ${BOLD}2${NC}) Free ports 80/443 — move Apache to port 8080, then enable SSL"
  echo ""
  read -p "  Choose (1-2, default: 1): " SSL_CONFLICT_CHOICE
  SSL_CONFLICT_CHOICE=${SSL_CONFLICT_CHOICE:-1}

  if [ "$SSL_CONFLICT_CHOICE" = "2" ]; then
    echo ""
    echo -e "  ${CYAN}▸ Reconfiguring Apache to port 8080...${NC}"
    if [ -f /etc/apache2/ports.conf ]; then
      sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf
      sed -i 's/Listen 443/Listen 8443/' /etc/apache2/ports.conf 2>/dev/null
      find /etc/apache2/sites-enabled/ -name "*.conf" -exec sed -i 's/:80/:8080/g' {} \; 2>/dev/null
      find /etc/apache2/sites-enabled/ -name "*.conf" -exec sed -i 's/:443/:8443/g' {} \; 2>/dev/null
      systemctl restart apache2 2>/dev/null
      echo -e "  ${GREEN}✓${NC} Apache moved to port 8080 (FreePBX admin: http://IP:8080)"
      PORT_80_CONFLICT=""
      PORT_443_CONFLICT=""
    elif [ -f /etc/httpd/conf/httpd.conf ]; then
      sed -i 's/Listen 80/Listen 8080/' /etc/httpd/conf/httpd.conf
      systemctl restart httpd 2>/dev/null
      echo -e "  ${GREEN}✓${NC} Apache moved to port 8080"
      PORT_80_CONFLICT=""
      PORT_443_CONFLICT=""
    else
      echo -e "  ${RED}✗ Could not find Apache config. Please move it manually.${NC}"
    fi
  fi
fi

# Only offer domain setup if ports are free
if [ -z "$PORT_80_CONFLICT" ] && [ -z "$PORT_443_CONFLICT" ]; then
  echo -e "  ${DIM}If you have a domain name pointed at this server, enter it below${NC}"
  echo -e "  ${DIM}to enable automatic HTTPS with Let's Encrypt (free SSL).${NC}"
  echo ""
  echo -e "  ${DIM}Before entering a domain, make sure:${NC}"
  echo -e "    ${DIM}1. You own the domain (e.g., dialer.yourcompany.com)${NC}"
  echo -e "    ${DIM}2. The DNS A record points to this server's IP: ${BOLD}$(hostname -I | awk '{print $1}')${NC}"
  echo -e "    ${DIM}3. Ports 80 and 443 are available (they are!)${NC}"
  echo ""
  echo -e "  ${DIM}Leave blank to skip SSL and access via http://IP:${APP_PORT} instead.${NC}"
  echo ""

  prompt APP_DOMAIN "Domain name (e.g., dialer.yourcompany.com)" "" ""

  if [ -n "$APP_DOMAIN" ]; then
    ENABLE_SSL="true"
    echo -e "  ${GREEN}✓${NC} SSL enabled for ${BOLD}${APP_DOMAIN}${NC} (auto Let's Encrypt)"
  else
    echo -e "  ${DIM}No domain — SSL skipped. You can add one later.${NC}"
  fi
else
  APP_DOMAIN=""
  echo -e "  ${DIM}SSL skipped due to port conflict. You can set it up later.${NC}"
  echo -e "  ${DIM}See: https://github.com/Clientflame/tts-broadcast-dialer/blob/main/deploy/DEPLOYMENT-GUIDE.md#ssl${NC}"
fi

# ============================================================
# Step 6: Docker Image
# ============================================================
print_header "6/7  Docker Image"

prompt DOCKER_IMAGE "Docker image" "$DEFAULT_IMAGE" ""

echo ""
echo -e "  ${DIM}Checking image accessibility...${NC}"

# Install Docker first if needed (we need it to test pull)
DOCKER_JUST_INSTALLED="false"
if ! command -v docker &> /dev/null; then
  echo -e "  ${DIM}Docker not found — will install it next.${NC}"
  NEED_GHCR_LOGIN="unknown"
else
  # Try pulling without auth first
  if docker pull "$DOCKER_IMAGE" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Image accessible (public or already authenticated)"
    NEED_GHCR_LOGIN="no"
  else
    NEED_GHCR_LOGIN="yes"
  fi
fi

if [ "$NEED_GHCR_LOGIN" = "yes" ]; then
  echo -e "  ${YELLOW}The image requires authentication. Log in to GHCR:${NC}"
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
elif [ "$NEED_GHCR_LOGIN" = "unknown" ]; then
  echo -e "  ${DIM}Will attempt to pull after Docker is installed.${NC}"
fi

# ============================================================
# Review before proceeding
# ============================================================
print_header "7/7  Review"

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
echo -e "  ${BOLD}SMTP${NC}"
if [ -n "$SMTP_HOST" ]; then
  echo -e "    Host:       ${SMTP_HOST}:${SMTP_PORT}"
  echo -e "    From:       ${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>"
else
  echo -e "    ${DIM}(not configured — add later in Settings > SMTP)${NC}"
fi
echo ""
echo -e "  ${BOLD}TTS${NC}"
echo -e "    ${DIM}Configure API keys in admin Settings page after install${NC}"
echo ""
echo -e "  ${BOLD}Server${NC}"
echo -e "    Port:       ${APP_PORT}"
echo -e "    Timezone:   ${APP_TZ}"
echo -e "    Image:      ${DOCKER_IMAGE}"
echo -e "    MySQL Port: ${MYSQL_HOST_PORT} (host-side)"
if [ -n "$APP_DOMAIN" ]; then
  echo -e "    Domain:     ${APP_DOMAIN}"
  echo -e "    SSL:        ${GREEN}✓ Let's Encrypt (automatic)${NC}"
else
  echo -e "    SSL:        ${DIM}disabled (no domain)${NC}"
fi
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
  DOCKER_JUST_INSTALLED="true"
  echo -e "  ${GREEN}✓${NC} Docker installed"
fi

# Ensure Docker config directory exists properly
mkdir -p /root/.docker
if [ -d "/root/.docker/config.json" ]; then
  rm -rf /root/.docker/config.json
fi
if [ ! -f "/root/.docker/config.json" ]; then
  echo '{}' > /root/.docker/config.json
fi

# If Docker was just installed and we need GHCR login, try pulling now
if [ "$DOCKER_JUST_INSTALLED" = "true" ] && [ "$NEED_GHCR_LOGIN" = "unknown" ]; then
  if ! docker pull "$DOCKER_IMAGE" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}Image requires authentication. Log in to GHCR:${NC}"
    prompt GHCR_USER "GitHub username" "" ""
    prompt GHCR_TOKEN "GitHub Personal Access Token (with read:packages)" "" "secret"
    if [ -n "$GHCR_USER" ] && [ -n "$GHCR_TOKEN" ]; then
      echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin 2>/dev/null
    fi
  else
    echo -e "  ${GREEN}✓${NC} Image accessible"
  fi
fi

# ============================================================
# Configure Firewall
# ============================================================
print_step "Configuring firewall..."

if command -v ufw &> /dev/null; then
  ufw allow 22/tcp > /dev/null 2>&1
  ufw allow $APP_PORT/tcp > /dev/null 2>&1
  if [ "$ENABLE_SSL" = "true" ]; then
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    echo -e "  ${GREEN}✓${NC} UFW: ports 22, 80, 443, ${APP_PORT} opened"
  else
    echo -e "  ${GREEN}✓${NC} UFW: ports 22, ${APP_PORT} opened"
  fi
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=22/tcp > /dev/null 2>&1
  firewall-cmd --permanent --add-port=$APP_PORT/tcp > /dev/null 2>&1
  if [ "$ENABLE_SSL" = "true" ]; then
    firewall-cmd --permanent --add-port=80/tcp > /dev/null 2>&1
    firewall-cmd --permanent --add-port=443/tcp > /dev/null 2>&1
  fi
  firewall-cmd --reload > /dev/null 2>&1
  if [ "$ENABLE_SSL" = "true" ]; then
    echo -e "  ${GREEN}✓${NC} Firewalld: ports 22, 80, 443, ${APP_PORT} opened"
  else
    echo -e "  ${GREEN}✓${NC} Firewalld: ports 22, ${APP_PORT} opened"
  fi
else
  echo -e "  ${DIM}No firewall manager detected. Ensure port ${APP_PORT} is open.${NC}"
fi

# ============================================================
# Create deployment directory and config
# ============================================================
print_step "Creating deployment files..."

mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# --- Write docker-compose.yml ---
# Build it dynamically based on options
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

# Add Caddy if SSL enabled
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

# Add Watchtower (pinned version, no config.json mount)
cat >> docker-compose.yml << 'COMPOSE_WT'

  watchtower:
    image: containrrr/watchtower:1.7.1
    container_name: watchtower
    restart: unless-stopped
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=${UPDATE_CHECK_INTERVAL:-86400}
      - TZ=${TZ:-America/New_York}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
COMPOSE_WT

# Add volumes section
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

# Write Caddyfile if SSL is enabled
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
  echo -e "  ${GREEN}✓${NC} Caddyfile created for ${APP_DOMAIN}"
fi

# Write .env file
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

# --- Domain & SSL ---
DOMAIN=${APP_DOMAIN}
APP_DOMAIN=${APP_DOMAIN:+${APP_DOMAIN}}
APP_PROTOCOL=${ENABLE_SSL:+https}

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

# --- SMTP (for password resets & notifications) ---
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM_EMAIL=${SMTP_FROM_EMAIL}
SMTP_FROM_NAME=${SMTP_FROM_NAME}

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
docker compose up -d 2>&1

echo ""
echo -e "  ${GREEN}✓${NC} Services starting..."
echo ""

# Wait for containers to stabilize
echo -e "  ${DIM}Waiting for services to start...${NC}"
sleep 15

# ============================================================
# Health Check
# ============================================================
print_step "Checking service health..."

ALL_HEALTHY=true

# Check DB
if docker compose ps db 2>/dev/null | grep -q "healthy"; then
  echo -e "  ${GREEN}✓${NC} Database: healthy"
else
  echo -e "  ${YELLOW}⚠${NC} Database: starting (may take up to 30s)"
  ALL_HEALTHY=false
fi

# Check Dialer
if docker compose ps dialer 2>/dev/null | grep -q "Up"; then
  echo -e "  ${GREEN}✓${NC} Dialer: running"
else
  echo -e "  ${RED}✗${NC} Dialer: not running"
  echo -e "    ${DIM}Check logs: docker compose logs dialer${NC}"
  ALL_HEALTHY=false
fi

# Check Caddy
if [ "$ENABLE_SSL" = "true" ]; then
  if docker compose ps caddy 2>/dev/null | grep -q "Up"; then
    echo -e "  ${GREEN}✓${NC} Caddy (SSL): running"
  else
    echo -e "  ${RED}✗${NC} Caddy (SSL): not running"
    echo -e "    ${DIM}Check logs: docker compose logs caddy${NC}"
    ALL_HEALTHY=false
  fi
fi

# Check Watchtower
if docker compose ps watchtower 2>/dev/null | grep -q "Up"; then
  echo -e "  ${GREEN}✓${NC} Watchtower: running"
else
  echo -e "  ${YELLOW}⚠${NC} Watchtower: not running (auto-updates disabled)"
  echo -e "    ${DIM}Not critical — you can update manually with ./update.sh${NC}"
fi

# ============================================================
# Final Summary
# ============================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✓ Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Open your dialer:${NC}"
if [ -n "$APP_DOMAIN" ]; then
  echo -e "  ${CYAN}➜  https://${APP_DOMAIN}${NC}"
  echo -e "  ${DIM}Also available at: http://$(hostname -I | awk '{print $1}'):${APP_PORT}${NC}"
else
  echo -e "  ${CYAN}➜  http://$(hostname -I | awk '{print $1}'):${APP_PORT}${NC}"
fi
echo ""
echo -e "  ${BOLD}First time?${NC} Create your admin account on the setup page,"
echo -e "  then the onboarding wizard will guide you through the rest."
echo ""
echo -e "  ${YELLOW}Important:${NC} Go to ${BOLD}Settings${NC} (gear icon in sidebar) to add your"
echo -e "  OpenAI and/or Google TTS API keys before creating campaigns."
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
echo -e "    MySQL Host Port: ${MYSQL_HOST_PORT}"
echo ""

# Set up daily backup cron
(crontab -l 2>/dev/null; echo "0 3 * * * cd ${DEPLOY_DIR} && ./backup.sh >> /var/log/tts-dialer-backup.log 2>&1") | crontab -
echo -e "  ${GREEN}✓${NC} Daily backup scheduled at 3:00 AM"
echo ""

docker compose ps
echo ""
