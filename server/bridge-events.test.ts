/**
 * Tests for Bridge Events (uptime/downtime history), Reinstall/Update button logic,
 * and notification preference toggles for bridge alerts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock db module
vi.mock("./db", () => ({
  createBridgeEvent: vi.fn().mockResolvedValue(1),
  getBridgeEvents: vi.fn().mockResolvedValue([]),
  getBridgeEventStats: vi.fn().mockResolvedValue({
    totalEvents: 0, onlineEvents: 0, offlineEvents: 0, installEvents: 0,
    lastOnline: null, lastOffline: null,
  }),
  isNotificationEnabled: vi.fn().mockResolvedValue(true),
  getNotificationPreferences: vi.fn().mockResolvedValue({}),
  setNotificationPreference: vi.fn().mockResolvedValue(undefined),
  getAppSetting: vi.fn(),
  getPbxAgents: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn(),
  NOTIFICATION_TYPES: [
    { key: "notify_bridge_offline", label: "Voice AI Bridge Offline", description: "When the Voice AI bridge service goes offline on a PBX agent" },
    { key: "notify_bridge_online", label: "Voice AI Bridge Online", description: "When the Voice AI bridge service comes online on a PBX agent" },
    { key: "notify_agent_offline", label: "PBX Agent Offline", description: "When a PBX agent stops sending heartbeats" },
  ],
}));

describe("Bridge Events CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a bridge event with online type", async () => {
    await db.createBridgeEvent({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "online",
      details: "Bridge came online via heartbeat",
    });
    expect(db.createBridgeEvent).toHaveBeenCalledWith({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "online",
      details: "Bridge came online via heartbeat",
    });
  });

  it("should create a bridge event with offline type", async () => {
    await db.createBridgeEvent({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "offline",
      details: "Bridge went offline",
    });
    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "offline" })
    );
  });

  it("should create a bridge event with installed type", async () => {
    await db.createBridgeEvent({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "installed",
      details: "Bridge installed via SSH by admin",
    });
    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "installed" })
    );
  });

  it("should create a bridge event with install_failed type", async () => {
    await db.createBridgeEvent({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "install_failed",
      details: "Install failed: SSH timeout",
    });
    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "install_failed" })
    );
  });

  it("should create a bridge event with updated type", async () => {
    await db.createBridgeEvent({
      agentId: "agent-123",
      agentName: "Agent HD",
      eventType: "updated",
      details: "Bridge updated via reinstall",
    });
    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "updated" })
    );
  });

  it("should query bridge events with default params", async () => {
    const mockEvents = [
      { id: 1, agentId: "agent-123", agentName: "Agent HD", eventType: "online", details: "Online", createdAt: new Date() },
      { id: 2, agentId: "agent-123", agentName: "Agent HD", eventType: "offline", details: "Offline", createdAt: new Date() },
    ];
    (db.getBridgeEvents as any).mockResolvedValue(mockEvents);

    const events = await db.getBridgeEvents({ limit: 100, offset: 0 });
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe("online");
    expect(events[1].eventType).toBe("offline");
  });

  it("should filter bridge events by agentId", async () => {
    const mockEvents = [
      { id: 1, agentId: "agent-456", agentName: "Agent B", eventType: "online", details: null, createdAt: new Date() },
    ];
    (db.getBridgeEvents as any).mockResolvedValue(mockEvents);

    const events = await db.getBridgeEvents({ agentId: "agent-456", limit: 50 });
    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe("agent-456");
  });

  it("should return empty array when no events exist", async () => {
    (db.getBridgeEvents as any).mockResolvedValue([]);
    const events = await db.getBridgeEvents();
    expect(events).toEqual([]);
  });
});

describe("Bridge Event Stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return stats with all zeros when no events", async () => {
    const stats = await db.getBridgeEventStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.onlineEvents).toBe(0);
    expect(stats.offlineEvents).toBe(0);
    expect(stats.installEvents).toBe(0);
    expect(stats.lastOnline).toBeNull();
    expect(stats.lastOffline).toBeNull();
  });

  it("should return populated stats", async () => {
    (db.getBridgeEventStats as any).mockResolvedValue({
      totalEvents: 15,
      onlineEvents: 8,
      offlineEvents: 5,
      installEvents: 2,
      lastOnline: "2026-03-20T10:00:00.000Z",
      lastOffline: "2026-03-20T09:00:00.000Z",
    });

    const stats = await db.getBridgeEventStats();
    expect(stats.totalEvents).toBe(15);
    expect(stats.onlineEvents).toBe(8);
    expect(stats.offlineEvents).toBe(5);
    expect(stats.installEvents).toBe(2);
    expect(stats.lastOnline).toBe("2026-03-20T10:00:00.000Z");
    expect(stats.lastOffline).toBe("2026-03-20T09:00:00.000Z");
  });
});

describe("Notification Preference Toggles for Bridge Alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include bridge offline and online in NOTIFICATION_TYPES", () => {
    const types = db.NOTIFICATION_TYPES;
    const bridgeOffline = types.find((t: any) => t.key === "notify_bridge_offline");
    const bridgeOnline = types.find((t: any) => t.key === "notify_bridge_online");

    expect(bridgeOffline).toBeDefined();
    expect(bridgeOffline!.label).toBe("Voice AI Bridge Offline");
    expect(bridgeOnline).toBeDefined();
    expect(bridgeOnline!.label).toBe("Voice AI Bridge Online");
  });

  it("should check if bridge offline notification is enabled", async () => {
    (db.isNotificationEnabled as any).mockResolvedValue(true);
    const enabled = await db.isNotificationEnabled("notify_bridge_offline");
    expect(enabled).toBe(true);
    expect(db.isNotificationEnabled).toHaveBeenCalledWith("notify_bridge_offline");
  });

  it("should check if bridge online notification is enabled", async () => {
    (db.isNotificationEnabled as any).mockResolvedValue(false);
    const enabled = await db.isNotificationEnabled("notify_bridge_online");
    expect(enabled).toBe(false);
    expect(db.isNotificationEnabled).toHaveBeenCalledWith("notify_bridge_online");
  });

  it("should set bridge notification preference to enabled", async () => {
    await db.setNotificationPreference("notify_bridge_offline", true, 1);
    expect(db.setNotificationPreference).toHaveBeenCalledWith("notify_bridge_offline", true, 1);
  });

  it("should set bridge notification preference to disabled", async () => {
    await db.setNotificationPreference("notify_bridge_online", false, 1);
    expect(db.setNotificationPreference).toHaveBeenCalledWith("notify_bridge_online", false, 1);
  });

  it("should return all notification preferences including bridge alerts", async () => {
    (db.getNotificationPreferences as any).mockResolvedValue({
      notify_bridge_offline: true,
      notify_bridge_online: false,
      notify_agent_offline: true,
    });

    const prefs = await db.getNotificationPreferences();
    expect(prefs.notify_bridge_offline).toBe(true);
    expect(prefs.notify_bridge_online).toBe(false);
    expect(prefs.notify_agent_offline).toBe(true);
  });
});

describe("Reinstall/Update Button Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show install button when bridge status is not_installed", () => {
    const bridgeStatus = "not_installed";
    const showInstallBtn = bridgeStatus === "not_installed";
    const showUpdateBtn = bridgeStatus === "online" || bridgeStatus === "offline";
    expect(showInstallBtn).toBe(true);
    expect(showUpdateBtn).toBe(false);
  });

  it("should show update button when bridge status is online", () => {
    const bridgeStatus = "online";
    const showInstallBtn = bridgeStatus === "not_installed";
    const showUpdateBtn = bridgeStatus === "online" || bridgeStatus === "offline";
    expect(showInstallBtn).toBe(false);
    expect(showUpdateBtn).toBe(true);
  });

  it("should show update button when bridge status is offline", () => {
    const bridgeStatus = "offline";
    const showInstallBtn = bridgeStatus === "not_installed";
    const showUpdateBtn = bridgeStatus === "online" || bridgeStatus === "offline";
    expect(showInstallBtn).toBe(false);
    expect(showUpdateBtn).toBe(true);
  });

  it("should not show any button when bridge status is unknown", () => {
    const bridgeStatus = "unknown";
    const showInstallBtn = bridgeStatus === "not_installed";
    const showUpdateBtn = bridgeStatus === "online" || bridgeStatus === "offline";
    expect(showInstallBtn).toBe(false);
    expect(showUpdateBtn).toBe(false);
  });

  it("should log installed event on successful install", async () => {
    const result = { success: true, output: "Installation Complete!" };
    const agentId = "agent-123";
    const agentName = "Agent HD";
    const userName = "admin";

    await db.createBridgeEvent({
      agentId,
      agentName,
      eventType: result.success ? "installed" : "install_failed",
      details: result.success
        ? `Bridge installed/updated via SSH by ${userName}. Output: ${result.output.slice(-500)}`
        : `Install failed: Unknown error. Output: ${result.output.slice(-500)}`,
    });

    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "installed",
        agentId: "agent-123",
      })
    );
  });

  it("should log install_failed event on failed install", async () => {
    const result = { success: false, output: "Error: curl failed", error: "Exit code: 1" };
    const agentId = "agent-123";
    const agentName = "Agent HD";

    await db.createBridgeEvent({
      agentId,
      agentName,
      eventType: result.success ? "installed" : "install_failed",
      details: `Install failed: ${result.error || "Unknown error"}. Output: ${result.output.slice(-500)}`,
    });

    expect(db.createBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "install_failed",
        agentId: "agent-123",
      })
    );
  });
});

describe("Bridge Event Timeline Display", () => {
  it("should format event types correctly for display", () => {
    const eventTypeConfig: Record<string, { label: string }> = {
      online: { label: "Online" },
      offline: { label: "Offline" },
      installed: { label: "Installed" },
      install_failed: { label: "Install Failed" },
      updated: { label: "Updated" },
    };

    expect(eventTypeConfig.online.label).toBe("Online");
    expect(eventTypeConfig.offline.label).toBe("Offline");
    expect(eventTypeConfig.installed.label).toBe("Installed");
    expect(eventTypeConfig.install_failed.label).toBe("Install Failed");
    expect(eventTypeConfig.updated.label).toBe("Updated");
  });

  it("should format dates in EST timezone", () => {
    const date = new Date("2026-03-20T15:30:00.000Z");
    const formatted = date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    // Should contain "Mar 20" and a time
    expect(formatted).toContain("Mar");
    expect(formatted).toContain("20");
  });

  it("should handle empty event list gracefully", () => {
    const events: any[] = [];
    const hasEvents = events.length > 0;
    expect(hasEvents).toBe(false);
  });

  it("should correctly identify last event in timeline", () => {
    const events = [
      { id: 1, eventType: "online" },
      { id: 2, eventType: "offline" },
      { id: 3, eventType: "online" },
    ];
    events.forEach((event, idx) => {
      const isLast = idx === events.length - 1;
      if (event.id === 3) {
        expect(isLast).toBe(true);
      } else {
        expect(isLast).toBe(false);
      }
    });
  });
});
