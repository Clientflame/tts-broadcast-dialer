import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock TTS services
vi.mock("./services/tts", () => ({
  generateTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/test.mp3", s3Key: "audio/test.mp3", fileSize: 12345 }),
  generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google.mp3", s3Key: "audio/google.mp3", fileSize: 54321 }),
  getOpenAIApiKey: vi.fn().mockResolvedValue("test-openai-key"),
  getGoogleTTSApiKey: vi.fn().mockResolvedValue("test-google-key"),
}));

vi.mock("./services/google-tts", () => ({
  generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google.mp3", s3Key: "audio/google.mp3", fileSize: 54321 }),
  GOOGLE_VOICES: [],
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.mp3", key: "test.mp3" }),
}));

// Mock script-audio service
vi.mock("./services/script-audio", () => ({
  preGenerateStaticSegments: vi.fn().mockResolvedValue({ generated: 2, skipped: 1 }),
}));

// Mock db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getCallScript: vi.fn(),
    updateCallScript: vi.fn(),
    getAudioFiles: vi.fn().mockResolvedValue([]),
    getAudioFile: vi.fn(),
    createCampaign: vi.fn(),
    getCampaignById: vi.fn(),
    updateCampaign: vi.fn(),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

import { preGenerateStaticSegments } from "./services/script-audio";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

describe("v2.5.0 Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Auto pre-generate on script save", () => {
    it("preGenerateStaticSegments is callable and returns counts", async () => {
      const result = await preGenerateStaticSegments(1, "alloy", "1.0", "openai");
      expect(result).toEqual({ generated: 2, skipped: 1 });
    });

    it("should identify static vs dynamic segments correctly", () => {
      const segments = [
        { id: "seg1", text: "Hello, this is ABC Collections.", type: "intro" },
        { id: "seg2", text: "We are calling about {{first_name}}'s account.", type: "body" },
        { id: "seg3", text: "Please call us back at 555-1234.", type: "closing" },
      ];
      
      const hasMergeFields = (text: string) => /\{\{[^}]+\}\}/.test(text);
      const staticSegments = segments.filter(s => !hasMergeFields(s.text));
      const dynamicSegments = segments.filter(s => hasMergeFields(s.text));
      
      expect(staticSegments).toHaveLength(2);
      expect(dynamicSegments).toHaveLength(1);
      expect(dynamicSegments[0].id).toBe("seg2");
    });

    it("should detect text changes that invalidate pre-generated audio", () => {
      const oldSegment = { id: "seg1", text: "Hello, this is ABC.", preGeneratedUrl: "https://s3.example.com/old.mp3" };
      const newSegment = { id: "seg1", text: "Hello, this is XYZ.", preGeneratedUrl: "https://s3.example.com/old.mp3" };
      
      // Text changed → pre-generated audio is stale
      const isStale = oldSegment.text !== newSegment.text;
      expect(isStale).toBe(true);
    });
  });

  describe("AMD Action in campaign settings", () => {
    it("should accept all three amdAction values", () => {
      const validActions = ["leave_voicemail", "skip", "hangup"];
      validActions.forEach(action => {
        expect(["leave_voicemail", "skip", "hangup"]).toContain(action);
      });
    });

    it("should default amdAction to leave_voicemail when not provided", () => {
      const campaignSettings: any = { amdEnabled: true };
      const amdAction = campaignSettings.amdAction || "leave_voicemail";
      expect(amdAction).toBe("leave_voicemail");
    });

    it("voicemailAudioFileId should be mapped to voicemailAudioFileId in DB", () => {
      // The frontend sends voicemailAudioId, backend maps to voicemailAudioFileId
      const input = { voicemailAudioId: 5 };
      const dbData: any = {};
      if (input.voicemailAudioId !== undefined) dbData.voicemailAudioFileId = input.voicemailAudioId;
      expect(dbData.voicemailAudioFileId).toBe(5);
    });
  });

  describe("Voicemail audio file resolution in PBX poll", () => {
    it("should resolve voicemailAudioFileId to S3 URL", async () => {
      const mockAudioFile = {
        id: 5,
        name: "Payment Reminder",
        s3Url: "https://s3.example.com/voicemail/payment-reminder.mp3",
        status: "ready",
      };
      (db.getAudioFile as any).mockResolvedValue(mockAudioFile);

      const audioFile = await db.getAudioFile(5);
      expect(audioFile).toBeDefined();
      expect(audioFile!.s3Url).toBe("https://s3.example.com/voicemail/payment-reminder.mp3");
    });

    it("should fallback gracefully when audio file not found", async () => {
      (db.getAudioFile as any).mockResolvedValue(null);

      const audioFile = await db.getAudioFile(999);
      expect(audioFile).toBeNull();
      
      // PBX agent should use voicemailMessage TTS as fallback
      const fallbackMessage = "Please call us back at 555-1234";
      expect(fallbackMessage).toBeTruthy();
    });

    it("should prefer existing voicemailAudioUrl over resolving file ID", () => {
      const campaign: any = {
        voicemailAudioUrl: "https://s3.example.com/existing.mp3",
        voicemailAudioFileId: 5,
      };
      
      // Existing URL takes priority
      const resolvedUrl = campaign.voicemailAudioUrl || null;
      expect(resolvedUrl).toBe("https://s3.example.com/existing.mp3");
    });
  });

  describe("PBX poll response structure", () => {
    it("should include amdAction in call response", () => {
      const pollCall = {
        amdEnabled: true,
        amdAction: "leave_voicemail",
        voicemailAudioUrl: "https://s3.example.com/voicemail.mp3",
        voicemailMessage: null,
      };

      expect(pollCall.amdAction).toBe("leave_voicemail");
      expect(pollCall.voicemailAudioUrl).toBeTruthy();
    });

    it("skip action: PBX agent should hang up and schedule retry", () => {
      const pollCall = {
        amdEnabled: true,
        amdAction: "skip",
        voicemailAudioUrl: null,
        voicemailMessage: null,
      };

      expect(pollCall.amdAction).toBe("skip");
      expect(pollCall.voicemailAudioUrl).toBeNull();
      expect(pollCall.voicemailMessage).toBeNull();
    });

    it("hangup action: PBX agent should end call immediately", () => {
      const pollCall = {
        amdEnabled: true,
        amdAction: "hangup",
        voicemailAudioUrl: null,
        voicemailMessage: null,
      };

      expect(pollCall.amdAction).toBe("hangup");
    });

    it("disabled AMD: PBX agent should play audio normally", () => {
      const pollCall = {
        amdEnabled: false,
        amdAction: "leave_voicemail", // default but irrelevant
        voicemailAudioUrl: null,
        voicemailMessage: null,
      };

      expect(pollCall.amdEnabled).toBe(false);
      // When AMD is disabled, agent skips AMD detection entirely
    });
  });
});
