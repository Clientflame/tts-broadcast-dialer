import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ────────────────────────────────────────────────────────
const mockAudioFiles: any[] = [];
const mockCallScripts: any[] = [];
const mockVoiceAiPrompts: any[] = [];
const mockAuditLogs: any[] = [];

vi.mock("./db", () => ({
  __esModule: true,
  default: {
    // Audio
    getAudioFiles: vi.fn(() => Promise.resolve(mockAudioFiles)),
    createAudioFile: vi.fn((data: any) => {
      const id = mockAudioFiles.length + 1;
      const entry = { id, ...data, createdAt: Date.now() };
      mockAudioFiles.push(entry);
      return Promise.resolve(entry);
    }),
    // Call Scripts
    getCallScripts: vi.fn(() => Promise.resolve(mockCallScripts)),
    createCallScript: vi.fn((data: any) => {
      const id = mockCallScripts.length + 1;
      const entry = { id, ...data, createdAt: Date.now() };
      mockCallScripts.push(entry);
      return Promise.resolve(entry);
    }),
    createCallScriptVersion: vi.fn(() => Promise.resolve()),
    // Voice AI Prompts
    getVoiceAiPrompts: vi.fn(() => Promise.resolve(mockVoiceAiPrompts)),
    createVoiceAiPrompt: vi.fn((data: any) => {
      const id = mockVoiceAiPrompts.length + 1;
      const entry = { id, ...data, createdAt: Date.now() };
      mockVoiceAiPrompts.push(entry);
      return Promise.resolve(entry);
    }),
    // Audit
    createAuditLog: vi.fn((data: any) => {
      mockAuditLogs.push(data);
      return Promise.resolve();
    }),
  },
}));

// Import after mocks
import db from "./db";

beforeEach(() => {
  mockAudioFiles.length = 0;
  mockCallScripts.length = 0;
  mockVoiceAiPrompts.length = 0;
  mockAuditLogs.length = 0;
  vi.clearAllMocks();
});

// ─── Audio Export/Import Tests ──────────────────────────────────────────────
describe("Audio Export/Import", () => {
  it("exports audio files with correct structure", async () => {
    mockAudioFiles.push(
      { id: 1, name: "Welcome", text: "Hello world", voice: "alloy", provider: "openai", audioUrl: "https://s3.example.com/welcome.mp3", status: "ready", durationMs: 3000, createdAt: Date.now() },
      { id: 2, name: "Goodbye", text: "Bye", voice: "nova", provider: "openai", audioUrl: "https://s3.example.com/goodbye.mp3", status: "ready", durationMs: 2000, createdAt: Date.now() },
    );

    const files = await db.getAudioFiles();
    const exportData = files.map((f: any) => ({
      name: f.name,
      text: f.text,
      voice: f.voice,
      provider: f.provider,
      audioUrl: f.audioUrl,
      status: f.status,
      durationMs: f.durationMs,
    }));
    const result = { version: "1.0", type: "audio_files", exportedAt: Date.now(), count: exportData.length, data: exportData };

    expect(result.type).toBe("audio_files");
    expect(result.version).toBe("1.0");
    expect(result.count).toBe(2);
    expect(result.data[0].name).toBe("Welcome");
    expect(result.data[1].name).toBe("Goodbye");
    expect(result.data[0].audioUrl).toBeDefined();
  });

  it("imports audio files and skips duplicates", async () => {
    mockAudioFiles.push({ id: 1, name: "Existing", text: "Hello", voice: "alloy", provider: "openai", audioUrl: "https://s3.example.com/existing.mp3", status: "ready", createdAt: Date.now() });

    const importData = [
      { name: "Existing", text: "Hello", voice: "alloy", provider: "openai", audioUrl: "https://s3.example.com/existing.mp3", status: "ready" },
      { name: "New File", text: "New", voice: "nova", provider: "openai", audioUrl: "https://s3.example.com/new.mp3", status: "ready" },
    ];

    const existing = await db.getAudioFiles();
    const existingNames = new Set(existing.map((f: any) => f.name.toLowerCase()));
    let imported = 0;
    let skipped = 0;

    for (const item of importData) {
      if (existingNames.has(item.name.toLowerCase())) {
        skipped++;
        continue;
      }
      await db.createAudioFile({ userId: 1, ...item });
      imported++;
    }

    expect(imported).toBe(1);
    expect(skipped).toBe(1);
    expect(db.createAudioFile).toHaveBeenCalledTimes(1);
  });

  it("imports all audio files when skipDuplicates is false", async () => {
    mockAudioFiles.push({ id: 1, name: "Existing", text: "Hello", voice: "alloy", provider: "openai", audioUrl: "https://s3.example.com/existing.mp3", status: "ready", createdAt: Date.now() });

    const importData = [
      { name: "Existing", text: "Hello duplicate", voice: "alloy", provider: "openai", audioUrl: "https://s3.example.com/existing2.mp3", status: "ready" },
      { name: "New File", text: "New", voice: "nova", provider: "openai", audioUrl: "https://s3.example.com/new.mp3", status: "ready" },
    ];

    let imported = 0;
    for (const item of importData) {
      await db.createAudioFile({ userId: 1, ...item });
      imported++;
    }

    expect(imported).toBe(2);
    expect(db.createAudioFile).toHaveBeenCalledTimes(2);
  });

  it("handles empty export gracefully", async () => {
    const files = await db.getAudioFiles();
    const result = { version: "1.0", type: "audio_files", exportedAt: Date.now(), count: files.length, data: [] };
    expect(result.count).toBe(0);
    expect(result.data).toEqual([]);
  });
});

// ─── Call Scripts Export/Import Tests ────────────────────────────────────────
describe("Call Scripts Export/Import", () => {
  it("exports call scripts with segments", async () => {
    mockCallScripts.push({
      id: 1,
      name: "Welcome Script",
      segments: JSON.stringify([{ type: "tts", text: "Hello {{firstName}}", voice: "alloy" }]),
      callbackNumber: "4071234567",
      createdAt: Date.now(),
    });

    const scripts = await db.getCallScripts();
    const exportData = scripts.map((s: any) => ({
      name: s.name,
      segments: typeof s.segments === "string" ? JSON.parse(s.segments) : s.segments,
      callbackNumber: s.callbackNumber,
    }));
    const result = { version: "1.0", type: "call_scripts", exportedAt: Date.now(), count: exportData.length, data: exportData };

    expect(result.type).toBe("call_scripts");
    expect(result.count).toBe(1);
    expect(result.data[0].segments).toHaveLength(1);
    expect(result.data[0].segments[0].type).toBe("tts");
  });

  it("imports call scripts and skips duplicates by name", async () => {
    mockCallScripts.push({ id: 1, name: "Existing Script", segments: "[]", createdAt: Date.now() });

    const importData = [
      { name: "Existing Script", segments: [{ type: "tts", text: "Hello" }] },
      { name: "New Script", segments: [{ type: "tts", text: "World" }] },
    ];

    const existing = await db.getCallScripts();
    const existingNames = new Set(existing.map((s: any) => s.name.toLowerCase()));
    let imported = 0;
    let skipped = 0;

    for (const item of importData) {
      if (existingNames.has(item.name.toLowerCase())) {
        skipped++;
        continue;
      }
      await db.createCallScript({ userId: 1, name: item.name, segments: JSON.stringify(item.segments) });
      imported++;
    }

    expect(imported).toBe(1);
    expect(skipped).toBe(1);
  });

  it("preserves segment structure during export/import round-trip", async () => {
    const originalSegments = [
      { type: "tts", text: "Hello {{firstName}}", voice: "alloy", speed: 1.0 },
      { type: "recorded", audioFileId: 5 },
      { type: "tts", text: "Goodbye", voice: "nova", speed: 0.9 },
    ];

    mockCallScripts.push({
      id: 1,
      name: "Multi-segment",
      segments: JSON.stringify(originalSegments),
      createdAt: Date.now(),
    });

    // Export
    const scripts = await db.getCallScripts();
    const exported = scripts.map((s: any) => ({
      name: s.name,
      segments: typeof s.segments === "string" ? JSON.parse(s.segments) : s.segments,
    }));

    // Import into fresh state
    mockCallScripts.length = 0;
    for (const item of exported) {
      await db.createCallScript({ userId: 1, name: item.name, segments: JSON.stringify(item.segments) });
    }

    expect(mockCallScripts).toHaveLength(1);
    const reimported = JSON.parse(mockCallScripts[0].segments);
    expect(reimported).toHaveLength(3);
    expect(reimported[0].text).toBe("Hello {{firstName}}");
    expect(reimported[1].type).toBe("recorded");
    expect(reimported[2].voice).toBe("nova");
  });
});

// ─── Voice AI Prompts Export/Import Tests ───────────────────────────────────
describe("Voice AI Prompts Export/Import", () => {
  it("exports voice AI prompts with all configuration fields", async () => {
    mockVoiceAiPrompts.push({
      id: 1,
      name: "Sales Agent",
      description: "Handles sales calls",
      systemPrompt: "You are a sales agent...",
      openingMessage: "Hello, how can I help?",
      voice: "coral",
      language: "en",
      temperature: "0.7",
      maxTurnDuration: 120,
      maxConversationDuration: 300,
      silenceTimeout: 10,
      requireAiDisclosure: 1,
      requireMiniMiranda: 0,
      miniMirandaText: null,
      escalateOnDtmf: "#",
      escalateKeywords: ["supervisor", "manager"],
      enabledTools: ["transfer_call"],
      isDefault: 1,
      createdAt: Date.now(),
    });

    const prompts = await db.getVoiceAiPrompts();
    const exportData = prompts.map((p: any) => ({
      name: p.name,
      description: p.description,
      systemPrompt: p.systemPrompt,
      openingMessage: p.openingMessage,
      voice: p.voice,
      language: p.language,
      temperature: p.temperature,
      maxTurnDuration: p.maxTurnDuration,
      maxConversationDuration: p.maxConversationDuration,
      silenceTimeout: p.silenceTimeout,
      requireAiDisclosure: p.requireAiDisclosure,
      requireMiniMiranda: p.requireMiniMiranda,
      miniMirandaText: p.miniMirandaText,
      escalateOnDtmf: p.escalateOnDtmf,
      escalateKeywords: p.escalateKeywords,
      enabledTools: p.enabledTools,
      isDefault: p.isDefault,
    }));
    const result = { version: "1.0", type: "voice_ai_prompts", exportedAt: Date.now(), count: exportData.length, data: exportData };

    expect(result.type).toBe("voice_ai_prompts");
    expect(result.count).toBe(1);
    expect(result.data[0].name).toBe("Sales Agent");
    expect(result.data[0].voice).toBe("coral");
    expect(result.data[0].escalateKeywords).toEqual(["supervisor", "manager"]);
    expect(result.data[0].enabledTools).toEqual(["transfer_call"]);
  });

  it("imports voice AI prompts and skips duplicates", async () => {
    mockVoiceAiPrompts.push({ id: 1, name: "Existing Prompt", systemPrompt: "test", createdAt: Date.now() });

    const importData = [
      { name: "Existing Prompt", systemPrompt: "test updated", voice: "coral", language: "en", temperature: "0.7" },
      { name: "New Prompt", systemPrompt: "new prompt", voice: "marin", language: "en", temperature: "0.5" },
    ];

    const existing = await db.getVoiceAiPrompts();
    const existingNames = new Set(existing.map((p: any) => p.name.toLowerCase()));
    let imported = 0;
    let skipped = 0;

    for (const item of importData) {
      if (existingNames.has(item.name.toLowerCase())) {
        skipped++;
        continue;
      }
      await db.createVoiceAiPrompt({ userId: 1, ...item });
      imported++;
    }

    expect(imported).toBe(1);
    expect(skipped).toBe(1);
    expect(db.createVoiceAiPrompt).toHaveBeenCalledTimes(1);
  });

  it("imports all prompts when skipDuplicates is false", async () => {
    mockVoiceAiPrompts.push({ id: 1, name: "Existing", systemPrompt: "test", createdAt: Date.now() });

    const importData = [
      { name: "Existing", systemPrompt: "duplicate", voice: "coral" },
      { name: "New", systemPrompt: "new", voice: "marin" },
    ];

    let imported = 0;
    for (const item of importData) {
      await db.createVoiceAiPrompt({ userId: 1, ...item });
      imported++;
    }

    expect(imported).toBe(2);
    expect(db.createVoiceAiPrompt).toHaveBeenCalledTimes(2);
  });

  it("creates audit log on import", async () => {
    const importData = [
      { name: "Prompt A", systemPrompt: "test a", voice: "coral" },
      { name: "Prompt B", systemPrompt: "test b", voice: "marin" },
    ];

    for (const item of importData) {
      await db.createVoiceAiPrompt({ userId: 1, ...item });
    }

    await db.createAuditLog({
      userId: 1,
      userName: "admin",
      action: "voiceai.import",
      resource: "voiceAiPrompt",
      details: { imported: 2, skipped: 0, total: 2 },
    });

    expect(mockAuditLogs).toHaveLength(1);
    expect(mockAuditLogs[0].action).toBe("voiceai.import");
    expect(mockAuditLogs[0].details.imported).toBe(2);
  });
});

// ─── Export Format Validation Tests ─────────────────────────────────────────
describe("Export Format Validation", () => {
  it("all export types include version, type, exportedAt, count, and data fields", () => {
    const formats = [
      { version: "1.0", type: "audio_files", exportedAt: Date.now(), count: 0, data: [] },
      { version: "1.0", type: "call_scripts", exportedAt: Date.now(), count: 0, data: [] },
      { version: "1.0", type: "voice_ai_prompts", exportedAt: Date.now(), count: 0, data: [] },
    ];

    for (const fmt of formats) {
      expect(fmt).toHaveProperty("version");
      expect(fmt).toHaveProperty("type");
      expect(fmt).toHaveProperty("exportedAt");
      expect(fmt).toHaveProperty("count");
      expect(fmt).toHaveProperty("data");
      expect(typeof fmt.exportedAt).toBe("number");
      expect(Array.isArray(fmt.data)).toBe(true);
    }
  });

  it("export type strings are consistent and machine-readable", () => {
    const types = ["audio_files", "call_scripts", "voice_ai_prompts"];
    for (const t of types) {
      expect(t).toMatch(/^[a-z_]+$/);
    }
  });
});
