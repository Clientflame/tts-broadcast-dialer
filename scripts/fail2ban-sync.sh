#!/bin/bash
# fail2ban-sync.sh — Sync fail2ban ban events to the TTS Dialer security logs
# This script is designed to run as a cron job on the app server (149.28.98.47)
# It reads fail2ban's ban log and pushes new bans to the app's API
#
# Usage: ./fail2ban-sync.sh
# Cron: */5 * * * * /opt/tts-dialer/scripts/fail2ban-sync.sh >> /var/log/fail2ban-sync.log 2>&1

APP_URL="${APP_URL:-http://localhost:3000}"
SYNC_STATE_FILE="/var/lib/fail2ban/sync-state.txt"

# Get the last synced timestamp
LAST_SYNC=$(cat "$SYNC_STATE_FILE" 2>/dev/null || echo "0")

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting fail2ban sync (last sync: $LAST_SYNC)"

# Get currently banned IPs from all jails
JAILS=$(fail2ban-client status 2>/dev/null | grep "Jail list:" | sed 's/.*Jail list:\s*//' | tr ',' ' ')

TOTAL_BANS=0
for JAIL in $JAILS; do
  BANNED_IPS=$(fail2ban-client status "$JAIL" 2>/dev/null | grep "Banned IP list:" | sed 's/.*Banned IP list:\s*//')
  
  for IP in $BANNED_IPS; do
    if [ -n "$IP" ]; then
      # Post to the app's internal security event API
      curl -s -X POST "${APP_URL}/api/internal/security-event" \
        -H "Content-Type: application/json" \
        -d "{\"eventType\":\"ip_banned\",\"ipAddress\":\"${IP}\",\"details\":{\"jail\":\"${JAIL}\",\"source\":\"fail2ban\"}}" \
        > /dev/null 2>&1
      TOTAL_BANS=$((TOTAL_BANS + 1))
    fi
  done
done

# Save current timestamp
date +%s > "$SYNC_STATE_FILE"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Synced $TOTAL_BANS active bans from $JAILS"
