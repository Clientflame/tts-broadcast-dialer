import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the db module before importing pbx-api
vi.mock("./db", () => ({
  getCallQueueItem: vi.fn(),
  updateCallQueueItem: vi.fn(),
  updateCallLog: vi.fn(),
  getPbxAgentByApiKey: vi.fn(),
  updatePbxAgentHeartbeat: vi.fn(),
}));

import * as db from "./db";

describe("PBX API /status-update endpoint", () => {
  let app: express.Express;
  const TEST_API_KEY = "test-api-key-123";

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock getPbxAgentByApiKey to authenticate our test agent
    (db.getPbxAgentByApiKey as any).mockResolvedValue({
      id: 1,
      agentId: "test-agent",
      name: "Test Agent",
      apiKey: TEST_API_KEY,
      maxCalls: 5,
      effectiveMaxCalls: 5,
    });

    // Create a minimal express app with the pbx router
    app = express();
    app.use(express.json());

    const { pbxRouter } = await import("./services/pbx-api");
    app.use("/api/pbx", pbxRouter);
  });

  function authReq() {
    return { Authorization: `Bearer ${TEST_API_KEY}` };
  }

  it("returns 400 when queueId is missing", async () => {
    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ status: "dialing" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing queueId or status");
  });

  it("returns 400 when status is missing", async () => {
    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing queueId or status");
  });

  it("returns 400 for invalid intermediate status", async () => {
    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 123, status: "completed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid intermediate status");
  });

  it("returns 404 when queue item not found", async () => {
    (db.getCallQueueItem as any).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 999, status: "dialing" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Queue item not found");
  });

  it("skips update for already-terminal queue items", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 123,
      status: "completed",
      result: "answered",
      resultDetails: {},
      callLogId: 1,
    });

    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 123, status: "ringing" });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.reason).toBe("already_terminal");
    expect(db.updateCallQueueItem).not.toHaveBeenCalled();
  });

  it("updates queue item status from claimed to dialing", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 123,
      status: "claimed",
      result: null,
      resultDetails: {},
      callLogId: 10,
    });
    (db.updateCallQueueItem as any).mockResolvedValue(undefined);
    (db.updateCallLog as any).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 123, status: "dialing", details: { startedAt: 1700000000000 } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(db.updateCallQueueItem).toHaveBeenCalledWith(123, expect.objectContaining({
      status: "dialing",
      resultDetails: expect.objectContaining({
        currentState: "dialing",
        startedAt: 1700000000000,
      }),
    }));
    // Should also update call log
    expect(db.updateCallLog).toHaveBeenCalledWith(10, expect.objectContaining({
      status: "dialing",
    }));
  });

  it("updates queue item with ringing state", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 456,
      status: "dialing",
      result: null,
      resultDetails: { currentState: "dialing" },
      callLogId: 20,
    });
    (db.updateCallQueueItem as any).mockResolvedValue(undefined);
    (db.updateCallLog as any).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 456, status: "ringing" });

    expect(res.status).toBe(200);
    expect(db.updateCallQueueItem).toHaveBeenCalledWith(456, expect.objectContaining({
      resultDetails: expect.objectContaining({
        currentState: "ringing",
      }),
    }));
    expect(db.updateCallLog).toHaveBeenCalledWith(20, expect.objectContaining({
      status: "ringing",
    }));
  });

  it("updates queue item with answered state and sets answeredAt", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 789,
      status: "dialing",
      result: null,
      resultDetails: { currentState: "ringing" },
      callLogId: 30,
    });
    (db.updateCallQueueItem as any).mockResolvedValue(undefined);
    (db.updateCallLog as any).mockResolvedValue(undefined);

    const answeredAt = Date.now();
    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 789, status: "answered", details: { answeredAt } });

    expect(res.status).toBe(200);
    expect(db.updateCallLog).toHaveBeenCalledWith(30, expect.objectContaining({
      status: "answered",
      answeredAt,
    }));
  });

  it("updates queue item with playing_audio state", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 101,
      status: "dialing",
      result: null,
      resultDetails: { currentState: "answered" },
      callLogId: 40,
    });
    (db.updateCallQueueItem as any).mockResolvedValue(undefined);
    (db.updateCallLog as any).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/pbx/status-update")
      .set(authReq())
      .send({ queueId: 101, status: "playing_audio" });

    expect(res.status).toBe(200);
    expect(db.updateCallQueueItem).toHaveBeenCalledWith(101, expect.objectContaining({
      resultDetails: expect.objectContaining({
        currentState: "playing_audio",
      }),
    }));
    expect(db.updateCallLog).toHaveBeenCalledWith(40, expect.objectContaining({
      status: "playing_audio",
    }));
  });

  it("accepts all valid intermediate statuses", async () => {
    const validStatuses = ["dialing", "ringing", "answered", "playing_audio"];

    for (const status of validStatuses) {
      vi.clearAllMocks();
      (db.getPbxAgentByApiKey as any).mockResolvedValue({
        id: 1, agentId: "test-agent", name: "Test Agent", apiKey: TEST_API_KEY, maxCalls: 5,
      });
      (db.getCallQueueItem as any).mockResolvedValue({
        id: 200,
        status: "claimed",
        result: null,
        resultDetails: {},
        callLogId: 50,
      });
      (db.updateCallQueueItem as any).mockResolvedValue(undefined);
      (db.updateCallLog as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/pbx/status-update")
        .set(authReq())
        .send({ queueId: 200, status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    }
  });
});
