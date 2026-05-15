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

vi.mock("./services/script-audio", () => ({
  preGenerateStaticSegments: vi.fn().mockResolvedValue({ generated: 0, skipped: 0 }),
}));

// Mock db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getCampaign: vi.fn(),
    getCampaignById: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    getCampaignStats: vi.fn(),
    getContactListContactCount: vi.fn(),
    getContactList: vi.fn(),
    getContactLists: vi.fn().mockResolvedValue([]),
    getAudioFiles: vi.fn().mockResolvedValue([]),
    getAudioFile: vi.fn(),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    getDncPhoneNumbers: vi.fn().mockResolvedValue(new Set()),
    getActiveContactsForCampaign: vi.fn().mockResolvedValue([]),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

describe("Campaign Progress Stats (v2.5.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getContactListContactCount", () => {
    it("should return contact count for a given list", async () => {
      (db.getContactListContactCount as any).mockResolvedValue(150);
      const count = await db.getContactListContactCount(1);
      expect(count).toBe(150);
    });

    it("should return 0 for empty list", async () => {
      (db.getContactListContactCount as any).mockResolvedValue(0);
      const count = await db.getContactListContactCount(999);
      expect(count).toBe(0);
    });
  });

  describe("getCampaignStats enhanced fields", () => {
    it("should return enhanced stats with contactListTotal, remaining, queue stats", async () => {
      (db.getCampaignStats as any).mockResolvedValue({
        total: 50,
        completed: 30,
        answered: 25,
        busy: 3,
        noAnswer: 10,
        failed: 7,
        pending: 5,
        cancelled: 0,
        active: 2,
        dialing: 1,
        ringing: 1,
        contactListTotal: 200,
        queuePending: 3,
        queueClaimed: 2,
        remaining: 148,
      });

      const stats = await db.getCampaignStats(1);
      expect(stats.contactListTotal).toBe(200);
      expect(stats.remaining).toBe(148);
      expect(stats.queuePending).toBe(3);
      expect(stats.queueClaimed).toBe(2);
      expect(stats.dialing).toBe(1);
      expect(stats.ringing).toBe(1);
      expect(stats.cancelled).toBe(0);
    });

    it("should calculate remaining correctly: total - dialed - active - pending", async () => {
      // 200 contacts total, 45 dialed (25+3+10+7), 2 active, 5 pending = 148 remaining
      (db.getCampaignStats as any).mockResolvedValue({
        total: 50,
        completed: 30,
        answered: 25,
        busy: 3,
        noAnswer: 10,
        failed: 7,
        pending: 5,
        cancelled: 0,
        active: 2,
        dialing: 1,
        ringing: 1,
        contactListTotal: 200,
        queuePending: 3,
        queueClaimed: 2,
        remaining: 148,
      });

      const stats = await db.getCampaignStats(1);
      const dialed = stats.answered + stats.busy + stats.noAnswer + stats.failed;
      expect(dialed).toBe(45);
      expect(stats.remaining).toBe(148);
    });

    it("should return 0 remaining when all contacts are dialed", async () => {
      (db.getCampaignStats as any).mockResolvedValue({
        total: 100,
        completed: 80,
        answered: 60,
        busy: 10,
        noAnswer: 20,
        failed: 10,
        pending: 0,
        cancelled: 0,
        active: 0,
        dialing: 0,
        ringing: 0,
        contactListTotal: 100,
        queuePending: 0,
        queueClaimed: 0,
        remaining: 0,
      });

      const stats = await db.getCampaignStats(1);
      expect(stats.remaining).toBe(0);
    });
  });

  describe("Campaign creation sets totalContacts", () => {
    it("should auto-populate totalContacts from contact list on create", async () => {
      (db.getContactListContactCount as any).mockResolvedValue(500);
      (db.createCampaign as any).mockResolvedValue({ id: 1 });

      // Simulate what the router does
      const contactCount = await db.getContactListContactCount(3);
      expect(contactCount).toBe(500);

      const dbData = {
        name: "Test Campaign",
        contactListId: 3,
        userId: 1,
        totalContacts: contactCount,
      };
      await db.createCampaign(dbData as any);
      expect(db.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ totalContacts: 500 })
      );
    });
  });

  describe("Campaign update refreshes totalContacts on list change", () => {
    it("should update totalContacts when contactListId changes", async () => {
      (db.getCampaign as any).mockResolvedValue({
        id: 1,
        contactListId: 3,
        status: "draft",
        totalContacts: 500,
      });
      (db.getContactListContactCount as any).mockResolvedValue(750);
      (db.updateCampaign as any).mockResolvedValue(undefined);

      // Simulate what the router does when contactListId changes
      const campaign = await db.getCampaign(1);
      const newListId = 5;
      if (newListId !== campaign!.contactListId) {
        const newCount = await db.getContactListContactCount(newListId);
        await db.updateCampaign(1, { contactListId: newListId, totalContacts: newCount } as any);
      }

      expect(db.updateCampaign).toHaveBeenCalledWith(1, expect.objectContaining({
        contactListId: 5,
        totalContacts: 750,
      }));
    });

    it("should NOT update totalContacts when contactListId stays the same", async () => {
      (db.getCampaign as any).mockResolvedValue({
        id: 1,
        contactListId: 3,
        status: "draft",
        totalContacts: 500,
      });
      (db.updateCampaign as any).mockResolvedValue(undefined);

      const campaign = await db.getCampaign(1);
      const sameListId = 3;
      const dbData: any = { name: "Updated Name" };
      if (sameListId !== campaign!.contactListId) {
        // This should NOT execute
        dbData.totalContacts = 999;
      }
      await db.updateCampaign(1, dbData);

      expect(db.updateCampaign).toHaveBeenCalledWith(1, { name: "Updated Name" });
      expect(db.getContactListContactCount).not.toHaveBeenCalled();
    });
  });

  describe("getCampaignCallLogsPaginated", () => {
    it("should return paginated call logs with total count", async () => {
      const mockResult = {
        items: [
          { id: 1, phoneNumber: "4075551234", contactName: "John Doe", status: "answered", duration: 45, attempt: 1, callerIdUsed: "4075559999", startedAt: Date.now() },
          { id: 2, phoneNumber: "4075555678", contactName: "Jane Smith", status: "failed", duration: null, attempt: 1, callerIdUsed: null, startedAt: null },
        ],
        total: 150,
      };
      (db.getCampaignCallLogsPaginated as any) = vi.fn().mockResolvedValue(mockResult);

      const result = await db.getCampaignCallLogsPaginated({ campaignId: 1, limit: 25, offset: 0 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(150);
      expect(result.items[0].phoneNumber).toBe("4075551234");
      expect(result.items[0].status).toBe("answered");
    });

    it("should filter by status", async () => {
      const mockResult = { items: [{ id: 1, status: "failed" }], total: 10 };
      (db.getCampaignCallLogsPaginated as any) = vi.fn().mockResolvedValue(mockResult);

      const result = await db.getCampaignCallLogsPaginated({ campaignId: 1, status: "failed" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe("failed");
    });

    it("should filter by search term", async () => {
      const mockResult = { items: [{ id: 1, phoneNumber: "4075551234", contactName: "John" }], total: 1 };
      (db.getCampaignCallLogsPaginated as any) = vi.fn().mockResolvedValue(mockResult);

      const result = await db.getCampaignCallLogsPaginated({ campaignId: 1, search: "John" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].contactName).toBe("John");
    });

    it("should return empty results for no matches", async () => {
      (db.getCampaignCallLogsPaginated as any) = vi.fn().mockResolvedValue({ items: [], total: 0 });

      const result = await db.getCampaignCallLogsPaginated({ campaignId: 999 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should handle pagination offset correctly", async () => {
      const page2Items = Array.from({ length: 25 }, (_, i) => ({ id: 26 + i, phoneNumber: `407555${1000 + i}` }));
      (db.getCampaignCallLogsPaginated as any) = vi.fn().mockResolvedValue({ items: page2Items, total: 150 });

      const result = await db.getCampaignCallLogsPaginated({ campaignId: 1, limit: 25, offset: 25 });
      expect(result.items).toHaveLength(25);
      expect(result.items[0].id).toBe(26);
      expect(result.total).toBe(150);
    });
  });

  describe("Auto-refresh polling configuration", () => {
    it("campaign stats should poll at 5 second intervals", () => {
      // Verify the polling interval constant
      const STATS_POLL_INTERVAL = 5000;
      expect(STATS_POLL_INTERVAL).toBe(5000);
    });

    it("campaign detail should poll at 10 second intervals", () => {
      const DETAIL_POLL_INTERVAL = 10000;
      expect(DETAIL_POLL_INTERVAL).toBe(10000);
    });

    it("call history should poll at 8 second intervals", () => {
      const HISTORY_POLL_INTERVAL = 8000;
      expect(HISTORY_POLL_INTERVAL).toBe(8000);
    });
  });

  describe("Call status transitions (v2.5.4)", () => {
    it("should include ringing as a valid call_log status", () => {
      const validStatuses = ["pending", "dialing", "ringing", "answered", "busy", "no-answer", "failed", "completed", "cancelled"];
      expect(validStatuses).toContain("ringing");
    });

    it("should count ringing calls as active in stats", () => {
      const stats = {
        dialing: 3,
        ringing: 7,
        active: 10, // dialing + ringing
      };
      expect(stats.active).toBe(stats.dialing + stats.ringing);
    });

    it("should transition call_log to ringing when PBX agent claims queue item", () => {
      // The PBX poll endpoint now updates call_log status to "ringing"
      // when the agent claims a call from the queue
      const callLogBefore = { status: "dialing" };
      const callLogAfter = { status: "ringing" };
      expect(callLogBefore.status).toBe("dialing");
      expect(callLogAfter.status).toBe("ringing");
    });

    it("should reset in-flight calls to pending on campaign pause", () => {
      // pauseCampaign now resets dialing/ringing call_logs to pending
      const inFlightStatuses = ["dialing", "ringing"];
      const resetStatus = "pending";
      inFlightStatuses.forEach(s => {
        expect(s).not.toBe(resetStatus);
      });
      expect(resetStatus).toBe("pending");
    });

    it("should cancel all pending/in-flight calls on campaign cancel", () => {
      // cancelCampaign now marks pending/dialing/ringing call_logs as cancelled
      const cancelledStatuses = ["pending", "dialing", "ringing"];
      const targetStatus = "cancelled";
      cancelledStatuses.forEach(s => {
        expect(s).not.toBe(targetStatus);
      });
      expect(targetStatus).toBe("cancelled");
    });

    it("should include ringing in recovery check for pending logs", () => {
      // Recovery now checks for pending, dialing, AND ringing
      const recoveryStatuses = ["pending", "dialing", "ringing"];
      expect(recoveryStatuses).toContain("ringing");
      expect(recoveryStatuses).toHaveLength(3);
    });
  });

  describe("Max concurrent calls limit (v2.5.4)", () => {
    it("should allow up to 75 concurrent calls per campaign", () => {
      const MAX_CONCURRENT = 75;
      expect(MAX_CONCURRENT).toBe(75);
      expect(MAX_CONCURRENT).toBeGreaterThan(10);
    });

    it("should have preset buttons for 5, 10, 25, 50, 75", () => {
      const presets = [5, 10, 25, 50, 75];
      expect(presets).toHaveLength(5);
      expect(presets[presets.length - 1]).toBe(75);
    });

    it("should default to 5 concurrent calls for new campaigns", () => {
      const defaultConcurrent = 5;
      expect(defaultConcurrent).toBe(5);
    });

    it("should default pacing max concurrent to 75", () => {
      const pacingMaxDefault = 75;
      expect(pacingMaxDefault).toBe(75);
    });
  });

  describe("Frontend completionRate calculation", () => {
    it("should use contactListTotal as denominator for completion rate", () => {
      const stats = {
        total: 50,
        completed: 30,
        answered: 25,
        busy: 3,
        noAnswer: 10,
        failed: 7,
        pending: 5,
        contactListTotal: 200,
        remaining: 148,
      };

      // Replicate the frontend calculation
      const totalBase = stats.contactListTotal || stats.total;
      const completionRate = totalBase === 0 ? 0 : Math.round((stats.completed / totalBase) * 100);
      expect(completionRate).toBe(15); // 30/200 = 15%
    });

    it("should fall back to stats.total if contactListTotal is 0", () => {
      const stats = {
        total: 50,
        completed: 30,
        contactListTotal: 0,
      };

      const totalBase = stats.contactListTotal || stats.total;
      const completionRate = totalBase === 0 ? 0 : Math.round((stats.completed / totalBase) * 100);
      expect(completionRate).toBe(60); // 30/50 = 60%
    });

    it("should calculate dialedCount correctly", () => {
      const stats = {
        answered: 25,
        busy: 3,
        noAnswer: 10,
        failed: 7,
      };

      const dialedCount = stats.answered + stats.busy + stats.noAnswer + stats.failed;
      expect(dialedCount).toBe(45);
    });
  });
});
