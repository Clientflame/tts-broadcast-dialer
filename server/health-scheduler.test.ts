import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Health Check Scheduler", () => {
  const testUserId = 950;

  it("should create a health check schedule", async () => {
    const result = await db.upsertHealthCheckSchedule(testUserId, { enabled: 1, intervalHours: 24 });
    expect(result.enabled).toBe(1);
    expect(result.intervalHours).toBe(24);
    expect(result.nextRunAt).toBeTruthy();
  });

  it("should retrieve the schedule", async () => {
    const schedule = await db.getHealthCheckSchedule(testUserId);
    expect(schedule).toBeTruthy();
    expect(schedule!.enabled).toBe(1);
    expect(schedule!.intervalHours).toBe(24);
  });

  it("should update an existing schedule", async () => {
    const result = await db.upsertHealthCheckSchedule(testUserId, { enabled: 1, intervalHours: 8 });
    expect(result.intervalHours).toBe(8);
    const schedule = await db.getHealthCheckSchedule(testUserId);
    expect(schedule!.intervalHours).toBe(8);
  });

  it("should disable the schedule", async () => {
    const result = await db.upsertHealthCheckSchedule(testUserId, { enabled: 0, intervalHours: 8 });
    expect(result.enabled).toBe(0);
    // nextRunAt should be null when disabled
    expect(result.nextRunAt).toBeNull();
  });

  it("should not return disabled schedules as due", async () => {
    await db.upsertHealthCheckSchedule(testUserId, { enabled: 0, intervalHours: 1 });
    const due = await db.getDueHealthCheckSchedules();
    const found = due.find(s => s.userId === testUserId);
    expect(found).toBeUndefined();
  });

  it("should mark a health check run and update nextRunAt", async () => {
    // Enable with 1 hour interval
    await db.upsertHealthCheckSchedule(testUserId, { enabled: 1, intervalHours: 1 });
    await db.markHealthCheckRun(testUserId);
    const schedule = await db.getHealthCheckSchedule(testUserId);
    expect(schedule!.lastRunAt).toBeTruthy();
    expect(schedule!.nextRunAt).toBeTruthy();
    // nextRunAt should be ~1 hour from now
    const diff = new Date(schedule!.nextRunAt!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(50 * 60 * 1000); // at least 50 minutes
    expect(diff).toBeLessThan(70 * 60 * 1000); // at most 70 minutes
  });
});
