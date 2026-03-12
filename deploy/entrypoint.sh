#!/bin/bash
set -e

echo "============================================"
echo "  TTS Broadcast Dialer — Starting Up"
echo "============================================"
echo "  Environment: ${NODE_ENV:-production}"
echo "  Timezone:    ${TZ:-UTC}"
echo "============================================"

# Wait for MySQL to be ready (if DATABASE_URL is set)
if [ -n "$DATABASE_URL" ]; then
  echo "[startup] Waiting for database to be ready..."
  MAX_RETRIES=30
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if node -e "
      const mysql = require('mysql2/promise');
      const url = process.env.DATABASE_URL;
      mysql.createConnection(url).then(c => { c.end(); process.exit(0); }).catch(() => process.exit(1));
    " 2>/dev/null; then
      echo "[startup] Database is ready!"
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "[startup] Database not ready yet... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
  done

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "[startup] WARNING: Could not connect to database after $MAX_RETRIES attempts."
    echo "[startup] Proceeding anyway — the app will retry on its own."
  fi

  # Run database migrations
  if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
    echo "[startup] Running database migrations..."
    npx drizzle-kit migrate 2>&1 || echo "[startup] WARNING: Migration failed — check DATABASE_URL"
  else
    echo "[startup] Skipping migrations (SKIP_MIGRATIONS=true)"
  fi
fi

echo "[startup] Starting application..."
exec "$@"
