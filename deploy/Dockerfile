# ============================================================
# TTS Broadcast Dialer — Multi-stage Docker Build
# ============================================================
# Stage 1: Install dependencies & build
# Stage 2: Production runtime (minimal image)
# ============================================================

# --- Stage 1: Build ---
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy dependency manifests first (better layer caching)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Initialize git for version detection (git describe reads tags)
# The .git directory is copied from the build context
# If no .git, the build script falls back to package.json version
RUN git config --global --add safe.directory /app 2>/dev/null || true

# Build frontend (Vite → dist/public) + backend (esbuild → dist/index.js)
# Version is auto-detected from git tags via scripts/build-server.mjs
RUN pnpm build

# --- Stage 2: Production Runtime ---
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install drizzle-kit separately for database migrations on startup
RUN pnpm add drizzle-kit

# Copy built artifacts from builder
# - dist/index.js = compiled server (esbuild)
# - dist/public/  = compiled frontend (Vite)
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations (needed for db:push on startup)
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

# Copy PBX agent and Voice AI bridge scripts (served by installer endpoints)
COPY pbx-agent/ ./pbx-agent/
COPY voice-ai-bridge/ ./voice-ai-bridge/

# Copy the entrypoint script
COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Default environment
ENV NODE_ENV=production
ENV TZ=America/New_York

# The app reads PORT from env, default 3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/trpc/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
