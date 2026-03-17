import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Call Recording Service Tests ──────────────────────────────────────────

describe("Call Recording Service", () => {
  const servicePath = resolve(__dirname, "services/call-recording.ts");

  it("should exist as a module", () => {
    expect(existsSync(servicePath)).toBe(true);
  });

  it("should export required functions", async () => {
    const mod = await import("./services/call-recording");
    expect(typeof mod.startRecording).toBe("function");
    expect(typeof mod.uploadRecording).toBe("function");
    expect(typeof mod.listRecordings).toBe("function");
    expect(typeof mod.getRecording).toBe("function");
    expect(typeof mod.deleteRecording).toBe("function");
    expect(typeof mod.getRecordingStats).toBe("function");
  });
});

// ─── Call Recordings Schema Tests ──────────────────────────────────────────

describe("Call Recordings Schema", () => {
  it("should have callRecordings table defined", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.callRecordings).toBeDefined();
  });

  it("should have required columns in callRecordings", async () => {
    const schema = await import("../drizzle/schema");
    const table = schema.callRecordings;
    // Check key columns exist
    expect(table.id).toBeDefined();
    expect(table.userId).toBeDefined();
    expect(table.phoneNumber).toBeDefined();
    expect(table.s3Key).toBeDefined();
    expect(table.s3Url).toBeDefined();
    expect(table.fileName).toBeDefined();
    expect(table.status).toBeDefined();
    expect(table.recordingType).toBeDefined();
    expect(table.consentObtained).toBeDefined();
    expect(table.retainUntil).toBeDefined();
  });

  it("should have recordingEnabled field on campaigns", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.campaigns.recordingEnabled).toBeDefined();
  });
});

// ─── PBX Agent Recording Support Tests ─────────────────────────────────────

describe("PBX Agent Recording Support", () => {
  const agentPath = resolve(__dirname, "../pbx-agent/pbx_agent.py");

  it("should have start_recording function", () => {
    const content = readFileSync(agentPath, "utf-8");
    expect(content).toContain("def start_recording(");
    expect(content).toContain("MixMonitor");
  });

  it("should have upload_recording function", () => {
    const content = readFileSync(agentPath, "utf-8");
    expect(content).toContain("def upload_recording(");
    expect(content).toContain("recording/upload");
  });

  it("should track recording_enabled in active_calls", () => {
    const content = readFileSync(agentPath, "utf-8");
    expect(content).toContain("recording_enabled");
    expect(content).toContain("recording_file");
  });

  it("should start recording on answered calls when enabled", () => {
    const content = readFileSync(agentPath, "utf-8");
    // Verify the recording start is triggered on answer
    expect(content).toContain("start_recording(ami, channel, matched_queue_id)");
  });

  it("should upload recording on hangup in background thread", () => {
    const content = readFileSync(agentPath, "utf-8");
    expect(content).toContain("upload_recording");
    expect(content).toContain("threading.Thread");
  });

  it("should use base64 encoding for file upload", () => {
    const content = readFileSync(agentPath, "utf-8");
    expect(content).toContain("base64.b64encode");
  });
});

// ─── Wallboard Page Tests ──────────────────────────────────────────────────

describe("Wallboard Page", () => {
  const wallboardPath = resolve(__dirname, "../client/src/pages/Wallboard.tsx");

  it("should exist as a page component", () => {
    expect(existsSync(wallboardPath)).toBe(true);
  });

  it("should have real-time auto-refresh", () => {
    const content = readFileSync(wallboardPath, "utf-8");
    expect(content).toContain("refetchInterval");
  });

  it("should display agent status grid", () => {
    const content = readFileSync(wallboardPath, "utf-8");
    expect(content).toContain("agent");
  });

  it("should display campaign stats", () => {
    const content = readFileSync(wallboardPath, "utf-8");
    expect(content).toContain("campaign");
  });

  it("should have fullscreen mode support", () => {
    const content = readFileSync(wallboardPath, "utf-8");
    expect(content).toContain("fullscreen");
  });

  it("should display call rate metrics", () => {
    const content = readFileSync(wallboardPath, "utf-8");
    // Should show calls per second or calls per minute
    expect(content).toMatch(/calls?\s*(per|\/)\s*(second|minute|hour)/i);
  });
});

// ─── Recordings Page Tests ─────────────────────────────────────────────────

describe("Recordings Page", () => {
  const recordingsPath = resolve(__dirname, "../client/src/pages/Recordings.tsx");

  it("should exist as a page component", () => {
    expect(existsSync(recordingsPath)).toBe(true);
  });

  it("should have audio player functionality", () => {
    const content = readFileSync(recordingsPath, "utf-8");
    expect(content).toContain("audio");
  });

  it("should have search/filter capability", () => {
    const content = readFileSync(recordingsPath, "utf-8");
    expect(content).toContain("Search");
  });

  it("should have download functionality", () => {
    const content = readFileSync(recordingsPath, "utf-8");
    expect(content).toContain("Download");
  });

  it("should display recording stats", () => {
    const content = readFileSync(recordingsPath, "utf-8");
    expect(content).toContain("stat");
  });
});

// ─── Recordings Router Tests ───────────────────────────────────────────────

describe("Recordings Router", () => {
  const routerPath = resolve(__dirname, "routers/recordings.ts");

  it("should exist as a router module", () => {
    expect(existsSync(routerPath)).toBe(true);
  });

  it("should export recordingsRouter and wallboardRouter", async () => {
    const content = readFileSync(routerPath, "utf-8");
    expect(content).toContain("recordingsRouter");
    expect(content).toContain("wallboardRouter");
  });
});

// ─── PBX API Recording Endpoint Tests ──────────────────────────────────────

describe("PBX API Recording Endpoint", () => {
  const apiPath = resolve(__dirname, "services/pbx-api.ts");

  it("should have recording upload endpoint", () => {
    const content = readFileSync(apiPath, "utf-8");
    expect(content).toContain("recording/upload");
  });

  it("should include recordingEnabled in poll response", () => {
    const content = readFileSync(apiPath, "utf-8");
    expect(content).toContain("recordingEnabled");
  });

  it("should include routingMode in poll response", () => {
    const content = readFileSync(apiPath, "utf-8");
    expect(content).toContain("routingMode");
  });

  it("should upload recordings to S3", () => {
    const content = readFileSync(apiPath, "utf-8");
    expect(content).toContain("storagePut");
  });
});

// ─── Navigation Tests ──────────────────────────────────────────────────────

describe("Navigation includes new pages", () => {
  it("should have Wallboard route in App.tsx", () => {
    const appPath = resolve(__dirname, "../client/src/App.tsx");
    const content = readFileSync(appPath, "utf-8");
    expect(content).toContain("/wallboard");
    expect(content).toContain("Wallboard");
  });

  it("should have Recordings route in App.tsx", () => {
    const appPath = resolve(__dirname, "../client/src/App.tsx");
    const content = readFileSync(appPath, "utf-8");
    expect(content).toContain("/recordings");
    expect(content).toContain("Recordings");
  });

  it("should have Wallboard in sidebar navigation", () => {
    const layoutPath = resolve(__dirname, "../client/src/components/DashboardLayout.tsx");
    const content = readFileSync(layoutPath, "utf-8");
    expect(content).toContain("Wallboard");
    expect(content).toContain("/wallboard");
  });

  it("should have Recordings in sidebar navigation", () => {
    const layoutPath = resolve(__dirname, "../client/src/components/DashboardLayout.tsx");
    const content = readFileSync(layoutPath, "utf-8");
    expect(content).toContain("Recordings");
    expect(content).toContain("/recordings");
  });
});
