import { describe, it, expect, vi } from "vitest";

// Mock the call-recording service
vi.mock("./services/call-recording", () => ({
  getRecordingsByCallLogIds: vi.fn(async (callLogIds: number[]) => {
    // Simulate recordings for some call log IDs
    const mockRecordings = [
      { id: 1, callLogId: 100, s3Url: "https://s3.example.com/rec1.wav", duration: 45, status: "ready", mimeType: "audio/wav" },
      { id: 2, callLogId: 200, s3Url: "https://s3.example.com/rec2.wav", duration: 120, status: "ready", mimeType: "audio/wav" },
      { id: 3, callLogId: 100, s3Url: "https://s3.example.com/rec1-old.wav", duration: 30, status: "ready", mimeType: "audio/wav" }, // older duplicate
    ];
    return mockRecordings.filter(r => callLogIds.includes(r.callLogId!));
  }),
  getRecordingByCallLogId: vi.fn(async (callLogId: number) => {
    if (callLogId === 100) {
      return { id: 1, s3Url: "https://s3.example.com/rec1.wav", duration: 45, status: "ready", recordingType: "full", mimeType: "audio/wav" };
    }
    return null;
  }),
}));

describe("Recording Playback - byCallLogIds", () => {
  it("should return recordings mapped by callLogId", async () => {
    const { getRecordingsByCallLogIds } = await import("./services/call-recording");

    const callLogIds = [100, 200, 300];
    const recordings = await getRecordingsByCallLogIds(callLogIds);

    // Build the map like the endpoint does
    const map: Record<number, { id: number; s3Url: string; duration: number | null; mimeType: string }> = {};
    for (const rec of recordings) {
      if (rec.callLogId && !map[rec.callLogId]) {
        map[rec.callLogId] = { id: rec.id, s3Url: rec.s3Url, duration: rec.duration, mimeType: rec.mimeType };
      }
    }

    expect(map[100]).toBeDefined();
    expect(map[100].s3Url).toBe("https://s3.example.com/rec1.wav");
    expect(map[100].duration).toBe(45);
    expect(map[200]).toBeDefined();
    expect(map[200].s3Url).toBe("https://s3.example.com/rec2.wav");
    expect(map[300]).toBeUndefined(); // no recording for this call log
  });

  it("should only return the first (most recent) recording per callLogId", async () => {
    const { getRecordingsByCallLogIds } = await import("./services/call-recording");

    const recordings = await getRecordingsByCallLogIds([100]);

    // Build map - should only have the first one (id=1), not the older duplicate (id=3)
    const map: Record<number, { id: number; s3Url: string; duration: number | null; mimeType: string }> = {};
    for (const rec of recordings) {
      if (rec.callLogId && !map[rec.callLogId]) {
        map[rec.callLogId] = { id: rec.id, s3Url: rec.s3Url, duration: rec.duration, mimeType: rec.mimeType };
      }
    }

    expect(map[100].id).toBe(1); // first one wins (most recent due to DESC order)
    expect(map[100].s3Url).toBe("https://s3.example.com/rec1.wav");
  });

  it("should return empty map for empty callLogIds array", async () => {
    const { getRecordingsByCallLogIds } = await import("./services/call-recording");

    const recordings = await getRecordingsByCallLogIds([]);
    expect(recordings).toEqual([]);

    const map: Record<number, any> = {};
    for (const rec of recordings) {
      if (rec.callLogId && !map[rec.callLogId]) {
        map[rec.callLogId] = rec;
      }
    }
    expect(Object.keys(map)).toHaveLength(0);
  });

  it("should get single recording by callLogId", async () => {
    const { getRecordingByCallLogId } = await import("./services/call-recording");

    const recording = await getRecordingByCallLogId(100);
    expect(recording).not.toBeNull();
    expect(recording!.s3Url).toBe("https://s3.example.com/rec1.wav");
    expect(recording!.duration).toBe(45);

    const noRecording = await getRecordingByCallLogId(999);
    expect(noRecording).toBeNull();
  });
});
