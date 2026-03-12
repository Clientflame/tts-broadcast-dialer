#!/bin/bash
# ============================================================
# TTS Broadcast Dialer — Client Server Setup Script
# ============================================================
# Works on: Debian 12, Ubuntu 22.04/24.04, Rocky Linux 9
# Tested on: Vultr, Hostinger VPS, DigitalOcean, Linode
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/YOUR_ORG/tts-broadcast-dialer/main/deploy/setup-client.sh | bash
#   or:
#   chmod +x setup-client.sh && ./setup-client.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DEPLOY_DIR="/opt/tts-dialer"
DOCKER_IMAGE="ghcr.io/YOUR_ORG/tts-broadcast-dialer:latest"

echo -e "${BLUE}"
echo "============================================"
echo "  TTS Broadcast Dialer — Server Setup"
echo "============================================"
echo -e "${NC}"

# --- Check root ---
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo ./setup-client.sh)${NC}"
  exit 1
fi

# --- Detect OS ---
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
else
  echo -e "${RED}Cannot detect OS. Supported: Debian 12, Ubuntu 22/24, Rocky 9${NC}"
  exit 1
fi
echo -e "${GREEN}Detected OS: $OS $OS_VERSION${NC}"

# ============================================================
# Step 1: Collect client information
# ============================================================
echo ""
echo -e "${BLUE}--- Client Configuration ---${NC}"
echo ""

read -p "Client/Company Name (e.g., ABC Marketing): " CLIENT_NAME
read -p "App Title (default: AI TTS Broadcast Dialer): " APP_TITLE
APP_TITLE=${APP_TITLE:-"AI TTS Broadcast Dialer"}

read -p "App Logo URL (leave empty for default): " APP_LOGO

echo ""
echo -e "${BLUE}--- FreePBX Connection ---${NC}"
read -p "FreePBX Host/IP: " PBX_HOST
read -p "FreePBX AMI User (default: admin): " PBX_AMI_USER
PBX_AMI_USER=${PBX_AMI_USER:-admin}
read -sp "FreePBX AMI Password: " PBX_AMI_PASS
echo ""
read -p "FreePBX AMI Port (default: 5038): " PBX_AMI_PORT
PBX_AMI_PORT=${PBX_AMI_PORT:-5038}
read -p "FreePBX SSH User (default: root): " PBX_SSH_USER
PBX_SSH_USER=${PBX_SSH_USER:-root}
read -sp "FreePBX SSH Password: " PBX_SSH_PASS
echo ""

echo ""
echo -e "${BLUE}--- TTS API Keys ---${NC}"
read -sp "Google TTS API Key (leave empty to skip): " GOOGLE_KEY
echo ""
read -sp "OpenAI API Key (leave empty to skip): " OPENAI_KEY
echo ""

if [ -z "$GOOGLE_KEY" ] && [ -z "$OPENAI_KEY" ]; then
  echo -e "${YELLOW}WARNING: No TTS API key provided. TTS features will not work.${NC}"
fi

echo ""
echo -e "${BLUE}--- Database ---${NC}"
DB_PASSWORD=$(openssl rand -hex 16)
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
echo -e "${GREEN}Auto-generated secure database passwords.${NC}"

echo ""
echo -e "${BLUE}--- App Port ---${NC}"
read -p "App Port (default: 3000): " APP_PORT
APP_PORT=${APP_PORT:-3000}

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# ============================================================
# Step 2: Install Docker
# ============================================================
echo ""
echo -e "${BLUE}--- Installing Docker ---${NC}"

if command -v docker &> /dev/null; then
  echo -e "${GREEN}Docker is already installed: $(docker --version)${NC}"
else
  case $OS in
    ubuntu|debian)
      apt-get update -y
      apt-get install -y ca-certificates curl gnupg
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -y
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    rocky|almalinux|centos)
      dnf install -y dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl start docker
      systemctl enable docker
      ;;
    *)
      echo -e "${RED}Unsupported OS: $OS. Please install Docker manually.${NC}"
      exit 1
      ;;
  esac
  echo -e "${GREEN}Docker installed successfully!${NC}"
fi

# ============================================================
# Step 3: Configure Firewall
# ============================================================
echo ""
echo -e "${BLUE}--- Configuring Firewall ---${NC}"

if command -v ufw &> /dev/null; then
  ufw allow 22/tcp    # SSH
  ufw allow $APP_PORT/tcp  # App
  ufw allow 5060/udp  # SIP (if running PBX on same server)
  ufw allow 10000:20000/udp  # RTP
  echo -e "${GREEN}UFW rules added for ports 22, $APP_PORT, 5060, 10000-20000${NC}"
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=22/tcp
  firewall-cmd --permanent --add-port=$APP_PORT/tcp
  firewall-cmd --permanent --add-port=5060/udp
  firewall-cmd --permanent --add-port=10000-20000/udp
  firewall-cmd --reload
  echo -e "${GREEN}Firewalld rules added${NC}"
else
  echo -e "${YELLOW}No firewall manager detected. Ensure ports $APP_PORT, 5060, 10000-20000 are open.${NC}"
fi

# ============================================================
# Step 4: Create deployment directory and config
# ============================================================
echo ""
echo -e "${BLUE}--- Setting Up Deployment ---${NC}"

mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# Write docker-compose.yml
cat > docker-compose.yml << 'COMPOSE_EOF'
services:
  dialer:
    image: ${DOCKER_IMAGE:-ghcr.io/YOUR_ORG/tts-broadcast-dialer:latest}
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

volumes:
  mysql-data:

networks:
  dialer-net:
COMPOSE_EOF

# Write .env file
cat > .env << ENV_EOF
# ============================================================
# Client: ${CLIENT_NAME}
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ============================================================

# --- App ---
VITE_APP_TITLE="${APP_TITLE}"
VITE_APP_LOGO="${APP_LOGO}"
APP_PORT=${APP_PORT}
DOCKER_IMAGE=${DOCKER_IMAGE}

# --- Database ---
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

# --- TTS ---
GOOGLE_TTS_API_KEY=${GOOGLE_KEY}
OPENAI_API_KEY=${OPENAI_KEY}

# --- Auth ---
JWT_SECRET=${JWT_SECRET}

# --- Manus Platform (standalone mode) ---
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=

# --- Timezone ---
TZ=America/New_York

# --- Auto-Update ---
UPDATE_CHECK_INTERVAL=86400
ENV_EOF

chmod 600 .env

# ============================================================
# Step 5: Create management scripts
# ============================================================

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
echo "============================================"
echo "  TTS Dialer — Server Status"
echo "============================================"
echo ""
echo "--- Containers ---"
docker compose ps
echo ""
echo "--- Resource Usage ---"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
echo ""
echo "--- Disk Usage ---"
df -h / | tail -1
echo ""
echo "--- Recent Logs (last 20 lines) ---"
docker compose logs --tail 20 dialer
STATUS_EOF
chmod +x status.sh

# Logs script
cat > logs.sh << 'LOGS_EOF'
#!/bin/bash
docker compose logs -f --tail 100 dialer
LOGS_EOF
chmod +x logs.sh

# ============================================================
# Step 6: Start the stack
# ============================================================
echo ""
echo -e "${BLUE}--- Starting TTS Dialer ---${NC}"

docker compose pull
docker compose up -d

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  Client:    ${YELLOW}${CLIENT_NAME}${NC}"
echo -e "  URL:       ${YELLOW}http://$(hostname -I | awk '{print $1}'):${APP_PORT}${NC}"
echo -e "  Deploy:    ${YELLOW}${DEPLOY_DIR}${NC}"
echo ""
echo -e "  Management commands:"
echo -e "    ${BLUE}cd ${DEPLOY_DIR}${NC}"
echo -e "    ${BLUE}./status.sh${NC}     — Check server status"
echo -e "    ${BLUE}./update.sh${NC}     — Pull latest version"
echo -e "    ${BLUE}./backup.sh${NC}     — Backup database"
echo -e "    ${BLUE}./logs.sh${NC}       — View live logs"
echo ""
echo -e "  ${YELLOW}IMPORTANT: Save these database credentials:${NC}"
echo -e "    Root Password: ${DB_ROOT_PASSWORD}"
echo -e "    App Password:  ${DB_PASSWORD}"
echo ""

# Set up daily backup cron
(crontab -l 2>/dev/null; echo "0 3 * * * cd ${DEPLOY_DIR} && ./backup.sh >> /var/log/tts-dialer-backup.log 2>&1") | crontab -
echo -e "${GREEN}Daily backup scheduled at 3:00 AM${NC}"

echo ""
echo -e "${GREEN}Waiting for containers to start...${NC}"
sleep 10
docker compose ps
