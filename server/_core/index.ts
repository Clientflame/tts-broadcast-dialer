import "dotenv/config";
// Set server timezone to Eastern Time (Florida)
process.env.TZ = "America/New_York";

import express from "express";
import { createServer } from "http";
import net from "net";
import { rateLimit } from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { pbxRouter, installerRouter } from "../services/pbx-api";
import { createVoiceAiInstallerRouter } from "../services/voice-ai-installer";
import { mountLocalStorageRoute } from "../storage";

// Rate limiter for auth endpoints — 10 attempts per 15 minutes per IP
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { json: { message: "Too many login attempts. Please try again in 15 minutes.", code: -32001, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } } } },
  // Only apply to login and registration mutations
  skip: (req) => {
    const path = req.path;
    const isAuthPath = path.includes("localAuth.login") || path.includes("localAuth.register") || path.includes("admin.setupInitialAdmin");
    return !isAuthPath;
  },
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // Trust proxy headers (required for Docker, Caddy, Nginx reverse proxies)
  // Ensures req.protocol reads X-Forwarded-Proto correctly for secure cookie handling
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // PBX Agent installer (no auth - uses API key in query param)
  app.use("/api/pbx", installerRouter);
  // Voice AI Bridge installer (no auth - uses API key in query param)
  app.use("/api/voice-ai", createVoiceAiInstallerRouter());
  // Local filesystem storage route (self-hosted only, no-op when Forge is configured)
  mountLocalStorageRoute(app);
  // PBX Agent API (authenticated endpoints with API key auth)
  app.use("/api/pbx", pbxRouter);
  // Plain health check endpoint for Docker healthcheck (no tRPC input required)
  app.get("/api/trpc/health", (_req, res) => {
    res.json({ ok: true });
  });
  // Rate limiting on auth endpoints (before tRPC middleware)
  app.use("/api/trpc", authRateLimiter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Recover campaigns stuck in 'running' state after server restart
    try {
      const { recoverStaleCampaigns } = await import("../services/dialer");
      await recoverStaleCampaigns();
    } catch (err) {
      console.error("[Startup] Campaign recovery failed:", err);
    }

    // Start the health check scheduler
    try {
      const { startHealthCheckScheduler } = await import("../services/health-scheduler");
      startHealthCheckScheduler();
    } catch (err) {
      console.error("[Startup] Health check scheduler failed:", err);
    }

    // Start the campaign auto-launch scheduler
    try {
      const { startCampaignScheduler } = await import("../services/campaign-scheduler");
      startCampaignScheduler();
    } catch (err) {
      console.error("[Startup] Campaign scheduler failed:", err);
    }

    // Start the bridge health check scheduler
    try {
      const { startBridgeHealthScheduler } = await import("../services/bridge-health-scheduler");
      startBridgeHealthScheduler();
    } catch (err) {
      console.error("[Startup] Bridge health scheduler failed:", err);
    }
  });
}

startServer().catch(console.error);
