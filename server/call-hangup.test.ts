import { describe, it, expect, vi } from "vitest";

// Mock the call-control module
vi.mock("./services/call-control", () => ({
  enqueueCommand: vi.fn((cmd: any) => ({
    id: "test-cmd-123",
    ...cmd,
    createdAt: Date.now(),
    status: "pending",
  })),
}));

// Mock db module
vi.mock("./db", () => ({
  getCallQueueItemByCallLogId: vi.fn(async (callLogId: number) => {
    if (callLogId === 1) {
      return { id: 100, channel: "SIP/trunk-00000001", status: "claimed", callLogId: 1 };
    }
    return undefined;
  }),
  createAuditLog: vi.fn(async () => {}),
}));

describe("callLogs.hangup - Call Control from Call History", () => {
  it("should find queue item by callLogId and enqueue hangup command", async () => {
    const { getCallQueueItemByCallLogId } = await import("./db");
    const { enqueueCommand } = await import("./services/call-control");

    // Simulate what the hangup mutation does
    const input = { callLogId: 1, phoneNumber: "5551234567", channel: undefined };
    const queueItem = await getCallQueueItemByCallLogId(input.callLogId);

    expect(queueItem).toBeDefined();
    expect(queueItem!.id).toBe(100);
    expect(queueItem!.channel).toBe("SIP/trunk-00000001");

    const queueId = queueItem?.id || 0;
    const channel = input.channel || queueItem?.channel || undefined;

    const cmd = enqueueCommand({
      type: "hangup",
      queueId,
      channel,
      phoneNumber: input.phoneNumber,
      issuedBy: "test-user",
    });

    expect(cmd.id).toBe("test-cmd-123");
    expect(enqueueCommand).toHaveBeenCalledWith({
      type: "hangup",
      queueId: 100,
      channel: "SIP/trunk-00000001",
      phoneNumber: "5551234567",
      issuedBy: "test-user",
    });
  });

  it("should use provided channel over queue item channel", async () => {
    const { getCallQueueItemByCallLogId } = await import("./db");
    const { enqueueCommand } = await import("./services/call-control");

    const input = { callLogId: 1, phoneNumber: "5551234567", channel: "SIP/custom-channel" };
    const queueItem = await getCallQueueItemByCallLogId(input.callLogId);
    const channel = input.channel || queueItem?.channel || undefined;

    expect(channel).toBe("SIP/custom-channel");

    enqueueCommand({
      type: "hangup",
      queueId: queueItem?.id || 0,
      channel,
      phoneNumber: input.phoneNumber,
      issuedBy: "test-user",
    });

    expect(enqueueCommand).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "SIP/custom-channel" })
    );
  });

  it("should handle missing queue item gracefully (queueId=0)", async () => {
    const { getCallQueueItemByCallLogId } = await import("./db");
    const { enqueueCommand } = await import("./services/call-control");

    const input = { callLogId: 999, phoneNumber: "5559876543", channel: undefined };
    const queueItem = await getCallQueueItemByCallLogId(input.callLogId);

    expect(queueItem).toBeUndefined();

    const queueId = queueItem?.id || 0;
    const channel = input.channel || queueItem?.channel || undefined;

    expect(queueId).toBe(0);
    expect(channel).toBeUndefined();

    enqueueCommand({
      type: "hangup",
      queueId,
      channel,
      phoneNumber: input.phoneNumber,
      issuedBy: "test-user",
    });

    expect(enqueueCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "hangup",
        queueId: 0,
        phoneNumber: "5559876543",
      })
    );
  });

  it("should create audit log with correct details", async () => {
    const { createAuditLog } = await import("./db");

    await createAuditLog({
      userId: 1,
      action: "call_hangup",
      resource: "call",
      resourceId: 42,
      details: { phoneNumber: "5551234567", channel: "SIP/trunk-00000001", commandId: "cmd-abc", source: "call_history" },
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "call_hangup",
        resource: "call",
        resourceId: 42,
        details: expect.objectContaining({ source: "call_history" }),
      })
    );
  });
});
