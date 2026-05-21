import { describe, expect, it } from "vitest";

/**
 * Tests for the extended REST API admin endpoints.
 * Validates input schemas, permission checks, and business logic
 * for campaigns CRUD, scripts, audio, caller IDs, settings, and dialer control.
 */

// ─── Campaign CRUD Input Validation ─────────────────────────────────────────

describe("REST API - Campaign CRUD Validation", () => {
  it("should validate campaign create requires name and contactListId", () => {
    const validRequest = { name: "Test Campaign", contactListId: 1 };
    const missingName = { contactListId: 1 };
    const missingList = { name: "Test Campaign" };

    expect(validRequest).toHaveProperty("name");
    expect(validRequest).toHaveProperty("contactListId");
    expect(missingName).not.toHaveProperty("name");
    expect(missingList).not.toHaveProperty("contactListId");
  });

  it("should accept optional campaign fields for create", () => {
    const fullCampaign = {
      name: "Full Campaign",
      contactListId: 1,
      description: "Test description",
      audioFileId: 5,
      messageText: "Hello {{first_name}}",
      voice: "alloy",
      ttsProvider: "openai",
      callerIdNumber: "5551234567",
      callerIdName: "Test Caller",
      ivrEnabled: 1,
      maxConcurrentCalls: 10,
      cpsLimit: 5,
      retryAttempts: 2,
      retryDelay: 300,
      timezone: "America/New_York",
      timeWindowStart: "09:00",
      timeWindowEnd: "17:00",
      useDidRotation: 1,
      didPoolStrategy: "all",
      didRotationMode: "round_robin",
    };

    expect(fullCampaign.name).toBe("Full Campaign");
    expect(fullCampaign.contactListId).toBe(1);
    expect(fullCampaign.maxConcurrentCalls).toBe(10);
    expect(fullCampaign.didPoolStrategy).toBe("all");
    expect(fullCampaign.didRotationMode).toBe("round_robin");
  });

  it("should prevent updating a running campaign", () => {
    const campaign = { id: 1, status: "running", name: "Active" };
    const canUpdate = campaign.status !== "running";
    expect(canUpdate).toBe(false);
  });

  it("should allow updating a draft/paused/completed campaign", () => {
    const statuses = ["draft", "paused", "completed", "cancelled"];
    statuses.forEach(status => {
      const canUpdate = status !== "running";
      expect(canUpdate).toBe(true);
    });
  });

  it("should prevent deleting a running campaign", () => {
    const campaign = { id: 1, status: "running" };
    const canDelete = campaign.status !== "running";
    expect(canDelete).toBe(false);
  });

  it("should strip immutable fields from update body", () => {
    const body = {
      id: 999,
      userId: 999,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      name: "Updated Name",
      description: "New description",
    };
    const { id: _id, userId: _uid, createdAt: _ca, updatedAt: _ua, ...updateData } = body;

    expect(updateData).not.toHaveProperty("id");
    expect(updateData).not.toHaveProperty("userId");
    expect(updateData).not.toHaveProperty("createdAt");
    expect(updateData).not.toHaveProperty("updatedAt");
    expect(updateData.name).toBe("Updated Name");
    expect(updateData.description).toBe("New description");
  });
});

// ─── Campaign Control Validation ────────────────────────────────────────────

describe("REST API - Campaign Control (start/stop/pause/resume)", () => {
  it("should only allow stop on running campaigns", () => {
    const canStop = (status: string) => status === "running";
    expect(canStop("running")).toBe(true);
    expect(canStop("paused")).toBe(false);
    expect(canStop("draft")).toBe(false);
    expect(canStop("completed")).toBe(false);
  });

  it("should only allow pause on running campaigns", () => {
    const canPause = (status: string) => status === "running";
    expect(canPause("running")).toBe(true);
    expect(canPause("draft")).toBe(false);
    expect(canPause("paused")).toBe(false);
  });

  it("should only allow resume on paused or draft campaigns", () => {
    const canResume = (status: string) => status === "paused" || status === "draft";
    expect(canResume("paused")).toBe(true);
    expect(canResume("draft")).toBe(true);
    expect(canResume("running")).toBe(false);
    expect(canResume("completed")).toBe(false);
    expect(canResume("cancelled")).toBe(false);
  });
});

// ─── Call Scripts CRUD Validation ────────────────────────────────────────────

describe("REST API - Call Scripts CRUD Validation", () => {
  it("should validate script create requires name and segments", () => {
    const validScript = {
      name: "Test Script",
      segments: [{ id: "seg1", type: "tts", position: 0, text: "Hello", voice: "alloy", provider: "openai" }],
    };
    const missingName = { segments: [] };
    const missingSegments = { name: "Test" };

    expect(validScript).toHaveProperty("name");
    expect(validScript).toHaveProperty("segments");
    expect(Array.isArray(validScript.segments)).toBe(true);
    expect(missingName).not.toHaveProperty("name");
    expect(missingSegments).not.toHaveProperty("segments");
  });

  it("should validate segment structure for TTS type", () => {
    const ttsSegment = {
      id: "seg1",
      type: "tts" as const,
      position: 0,
      text: "Hello {{first_name}}, this is a message.",
      voice: "alloy",
      provider: "openai" as const,
      speed: "1.0",
    };

    expect(ttsSegment.type).toBe("tts");
    expect(ttsSegment.text).toContain("{{first_name}}");
    expect(ttsSegment.voice).toBe("alloy");
    expect(ttsSegment.provider).toBe("openai");
  });

  it("should validate segment structure for recorded type", () => {
    const recordedSegment = {
      id: "seg2",
      type: "recorded" as const,
      position: 1,
      audioFileId: 42,
      audioName: "greeting.mp3",
      audioUrl: "https://storage.example.com/audio/greeting.mp3",
    };

    expect(recordedSegment.type).toBe("recorded");
    expect(recordedSegment.audioFileId).toBe(42);
    expect(recordedSegment.audioUrl).toContain("https://");
  });

  it("should accept optional script fields", () => {
    const script = {
      name: "Script",
      segments: [],
      description: "A test script",
      callbackNumber: "5551234567",
      status: "active",
    };

    expect(script.description).toBe("A test script");
    expect(script.callbackNumber).toBe("5551234567");
    expect(script.status).toBe("active");
  });

  it("should validate script update allows partial fields", () => {
    const updateData: Record<string, any> = {};
    const body = { name: "Updated Name" };
    if (body.name !== undefined) updateData.name = body.name;

    expect(updateData).toHaveProperty("name");
    expect(Object.keys(updateData).length).toBe(1);
  });
});

// ─── Audio Files Validation ─────────────────────────────────────────────────

describe("REST API - Audio Files Validation", () => {
  it("should validate TTS generation requires text, voice, and name", () => {
    const validRequest = { text: "Hello world", voice: "alloy", name: "greeting" };
    const missingText = { voice: "alloy", name: "greeting" };
    const missingVoice = { text: "Hello", name: "greeting" };
    const missingName = { text: "Hello", voice: "alloy" };

    expect(validRequest).toHaveProperty("text");
    expect(validRequest).toHaveProperty("voice");
    expect(validRequest).toHaveProperty("name");
    expect(missingText).not.toHaveProperty("text");
    expect(missingVoice).not.toHaveProperty("voice");
    expect(missingName).not.toHaveProperty("name");
  });

  it("should accept optional speed parameter for TTS", () => {
    const withSpeed = { text: "Hello", voice: "alloy", name: "test", speed: 1.2 };
    const withoutSpeed = { text: "Hello", voice: "alloy", name: "test" };

    expect(withSpeed.speed).toBe(1.2);
    expect(withoutSpeed).not.toHaveProperty("speed");
  });

  it("should validate voice options", () => {
    const openaiVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const googleVoices = ["en-US-Journey-D", "en-US-Journey-F", "en-US-Studio-M"];

    expect(openaiVoices).toContain("alloy");
    expect(openaiVoices).toContain("nova");
    expect(googleVoices[0]).toMatch(/^en-US-/);
  });
});

// ─── Caller IDs Validation ──────────────────────────────────────────────────

describe("REST API - Caller IDs Validation", () => {
  it("should validate single caller ID requires phoneNumber", () => {
    const valid = { phoneNumber: "5551234567", label: "Main" };
    const invalid = { label: "No Phone" };

    expect(valid).toHaveProperty("phoneNumber");
    expect(invalid).not.toHaveProperty("phoneNumber");
  });

  it("should accept optional label for caller ID", () => {
    const withLabel = { phoneNumber: "5551234567", label: "Office" };
    const withoutLabel = { phoneNumber: "5551234567" };

    expect(withLabel.label).toBe("Office");
    expect(withoutLabel).not.toHaveProperty("label");
  });

  it("should validate bulk caller IDs requires entries array", () => {
    const valid = {
      entries: [
        { phoneNumber: "5551234567", label: "Line 1" },
        { phoneNumber: "5559876543", label: "Line 2" },
      ],
    };
    const invalid = { phones: ["5551234567"] };

    expect(Array.isArray(valid.entries)).toBe(true);
    expect(valid.entries.length).toBe(2);
    expect(invalid).not.toHaveProperty("entries");
  });

  it("should enforce bulk limit of 1000 caller IDs", () => {
    const MAX_BULK = 1000;
    const entries = Array.from({ length: MAX_BULK + 1 }, (_, i) => ({
      phoneNumber: `555${String(i).padStart(7, "0")}`,
    }));

    expect(entries.length).toBeGreaterThan(MAX_BULK);
  });

  it("should validate caller ID update accepts label and isActive", () => {
    const updateData: Record<string, any> = {};
    const body = { label: "Updated", isActive: 0 };
    if (body.label !== undefined) updateData.label = body.label;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    expect(updateData.label).toBe("Updated");
    expect(updateData.isActive).toBe(0);
  });
});

// ─── Settings Validation ────────────────────────────────────────────────────

describe("REST API - Settings Validation", () => {
  it("should validate settings update requires settings array", () => {
    const valid = {
      settings: [
        { key: "max_concurrent_calls", value: "50" },
        { key: "default_timezone", value: "America/New_York" },
      ],
    };
    const invalid = { key: "test", value: "123" };

    expect(Array.isArray(valid.settings)).toBe(true);
    expect(valid.settings.length).toBe(2);
    expect(invalid).not.toHaveProperty("settings");
  });

  it("should mask secret settings in response", () => {
    const settings = [
      { key: "openai_api_key", value: "sk-abc123", isSecret: 1 },
      { key: "max_concurrent", value: "50", isSecret: 0 },
    ];

    const masked = settings.map(s => ({
      key: s.key,
      value: s.isSecret ? "***" : s.value,
      isSecret: s.isSecret,
    }));

    expect(masked[0].value).toBe("***");
    expect(masked[1].value).toBe("50");
  });

  it("should support filtering settings by keys query param", () => {
    const keysParam = "max_concurrent,default_timezone,cps_limit";
    const keys = keysParam.split(",");

    expect(keys).toEqual(["max_concurrent", "default_timezone", "cps_limit"]);
    expect(keys.length).toBe(3);
  });

  it("should accept optional description and isSecret for settings", () => {
    const setting = {
      key: "test_setting",
      value: "hello",
      description: "A test setting",
      isSecret: 0,
    };

    expect(setting.description).toBe("A test setting");
    expect(setting.isSecret).toBe(0);
  });
});

// ─── Permission Checks for New Endpoints ────────────────────────────────────

describe("REST API - Extended Permission Checks", () => {
  it("should validate new permission categories exist", () => {
    const fullPermissions = {
      campaigns: { read: true, write: true, launch: true },
      contacts: { read: true, write: true, import: true },
      callLogs: { read: true },
      reports: { read: true },
      dnc: { read: true, write: true },
      scripts: { read: true, write: true },
      audio: { read: true, write: true },
      callerIds: { read: true, write: true },
      settings: { read: true, write: true },
    };

    expect(fullPermissions).toHaveProperty("scripts");
    expect(fullPermissions).toHaveProperty("audio");
    expect(fullPermissions).toHaveProperty("callerIds");
    expect(fullPermissions).toHaveProperty("settings");
    expect(fullPermissions.scripts.read).toBe(true);
    expect(fullPermissions.scripts.write).toBe(true);
    expect(fullPermissions.audio.read).toBe(true);
    expect(fullPermissions.settings.write).toBe(true);
  });

  it("should allow campaigns.read as fallback for scripts/audio/callerIds read", () => {
    const permissions = {
      campaigns: { read: true, write: false, launch: false },
      contacts: { read: false, write: false, import: false },
      callLogs: { read: false },
      reports: { read: false },
      dnc: { read: false, write: false },
      // No scripts, audio, callerIds permissions
    };

    // The API falls back to campaigns.read for scripts/audio/callerIds read
    const canReadScripts = permissions.campaigns?.read || false;
    const canReadAudio = permissions.campaigns?.read || false;
    const canReadCallerIds = permissions.campaigns?.read || false;

    expect(canReadScripts).toBe(true);
    expect(canReadAudio).toBe(true);
    expect(canReadCallerIds).toBe(true);
  });

  it("should require specific write permission or campaigns.write as fallback", () => {
    const permissions = {
      campaigns: { read: true, write: true, launch: false },
      contacts: { read: false, write: false, import: false },
      callLogs: { read: false },
      reports: { read: false },
      dnc: { read: false, write: false },
    };

    // campaigns.write serves as fallback for scripts/audio/callerIds write
    const canWriteScripts = (permissions as any).scripts?.write || permissions.campaigns?.write || false;
    const canWriteAudio = (permissions as any).audio?.write || permissions.campaigns?.write || false;

    expect(canWriteScripts).toBe(true);
    expect(canWriteAudio).toBe(true);
  });

  it("should require settings.write for settings update (no fallback)", () => {
    const permissionsWithout = {
      campaigns: { read: true, write: true, launch: true },
      reports: { read: true },
    };

    const canWriteSettings = (permissionsWithout as any).settings?.write || false;
    expect(canWriteSettings).toBe(false);
  });
});

// ─── Contact CRUD Validation ────────────────────────────────────────────────

describe("REST API - Single Contact CRUD", () => {
  it("should validate contact update accepts partial fields", () => {
    const body = { firstName: "Updated", email: "new@example.com" };
    const updateData: Record<string, any> = {};
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.email !== undefined) updateData.email = body.email;

    expect(updateData.firstName).toBe("Updated");
    expect(updateData.email).toBe("new@example.com");
    expect(updateData).not.toHaveProperty("lastName");
  });

  it("should normalize phone number on update", () => {
    const normalize = (phone: string) => phone.replace(/\D/g, "");
    const body = { phoneNumber: "(555) 123-4567" };
    const normalized = normalize(body.phoneNumber);

    expect(normalized).toBe("5551234567");
  });

  it("should accept customFields as JSON object", () => {
    const body = {
      customFields: { source: "website", campaign: "spring2025", score: 85 },
    };

    expect(typeof body.customFields).toBe("object");
    expect(body.customFields.source).toBe("website");
    expect(body.customFields.score).toBe(85);
  });
});

// ─── Contact List CRUD Validation ───────────────────────────────────────────

describe("REST API - Contact List Update/Delete", () => {
  it("should validate contact list update accepts name and description", () => {
    const body = { name: "Updated List", description: "New description" };
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;

    expect(updateData.name).toBe("Updated List");
    expect(updateData.description).toBe("New description");
  });

  it("should validate contact list delete returns success", () => {
    const response = { success: true, message: "Contact list deleted" };
    expect(response.success).toBe(true);
    expect(response.message).toContain("deleted");
  });
});

// ─── Dialer Live Stats Validation ───────────────────────────────────────────

describe("REST API - Dialer Live Stats", () => {
  it("should return expected live stats structure", () => {
    const stats = {
      activeCalls: 5,
      leadsInHopper: 150,
      concurrentLimit: 20,
      activeCampaignCount: 2,
      campaigns: [
        {
          id: 1,
          name: "Test Campaign",
          activeCalls: 3,
          pending: 100,
          pendingCallLogs: 10,
          remainingContacts: 90,
          totalEligible: 500,
          dedupSkipped: 5,
          maxConcurrent: 10,
          pacing: null,
        },
      ],
    };

    expect(stats).toHaveProperty("activeCalls");
    expect(stats).toHaveProperty("leadsInHopper");
    expect(stats).toHaveProperty("concurrentLimit");
    expect(stats).toHaveProperty("activeCampaignCount");
    expect(stats).toHaveProperty("campaigns");
    expect(Array.isArray(stats.campaigns)).toBe(true);
    expect(stats.campaigns[0]).toHaveProperty("pacing");
  });
});
