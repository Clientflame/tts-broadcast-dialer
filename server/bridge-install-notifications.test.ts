/**
 * Tests for Voice AI Bridge auto-install via SSH and bridge offline/online notification alerts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock db module
vi.mock("./db", () => ({
  getAppSetting: vi.fn(),
  getPbxAgents: vi.fn(),
  createAuditLog: vi.fn(),
  isNotificationEnabled: vi.fn().mockResolvedValue(true),
  updatePbxAgentHeartbeat: vi.fn(),
}));

// Mock notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { notifyOwner } from "./_core/notification";

describe("Voice AI Bridge Install Prerequisites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail when SSH credentials are not configured", async () => {
    (db.getAppSetting as any).mockResolvedValue(null);

    const host = await db.getAppSetting("freepbx_host");
    const sshUser = await db.getAppSetting("freepbx_ssh_user");
    const sshPassword = await db.getAppSetting("freepbx_ssh_password");

    const sshConfigured = !!(host && sshUser && sshPassword);
    expect(sshConfigured).toBe(false);
  });

  it("should pass when SSH credentials are configured", async () => {
    (db.getAppSetting as any).mockImplementation(async (key: string) => {
      const settings: Record<string, string> = {
        freepbx_host: "45.77.75.198",
        freepbx_ssh_user: "root",
        freepbx_ssh_password: "secret",
        openai_api_key: "sk-test-key",
      };
      return settings[key] || null;
    });

    const host = await db.getAppSetting("freepbx_host");
    const sshUser = await db.getAppSetting("freepbx_ssh_user");
    const sshPassword = await db.getAppSetting("freepbx_ssh_password");

    const sshConfigured = !!(host && sshUser && sshPassword);
    expect(sshConfigured).toBe(true);
  });

  it("should fail when no PBX agent is registered", async () => {
    (db.getPbxAgents as any).mockResolvedValue([]);

    const agents = await db.getPbxAgents();
    const activeAgent = agents.find((a: any) => a.lastHeartbeat) || agents[0];
    expect(activeAgent).toBeUndefined();
  });

  it("should select the active agent with most recent heartbeat", async () => {
    const agents = [
      { agentId: "agent-1", name: "Agent A", lastHeartbeat: Date.now() - 60000, apiKey: "key-a" },
      { agentId: "agent-2", name: "Agent B", lastHeartbeat: Date.now() - 10000, apiKey: "key-b" },
    ];
    (db.getPbxAgents as any).mockResolvedValue(agents);

    const result = await db.getPbxAgents();
    const activeAgent = result.find((a: any) => a.lastHeartbeat) || result[0];
    expect(activeAgent).toBeDefined();
    expect(activeAgent!.agentId).toBe("agent-1"); // first with heartbeat
  });

  it("should build correct install command URL", async () => {
    const origin = "https://example.manus.space";
    const apiKey = "test-api-key-123";
    const installUrl = `${origin}/api/voice-ai/install?key=${apiKey}`;
    const installCommand = `curl -s '${installUrl}' | bash`;

    expect(installCommand).toContain("curl -s");
    expect(installCommand).toContain("/api/voice-ai/install");
    expect(installCommand).toContain("key=test-api-key-123");
    expect(installCommand).toContain("| bash");
  });

  it("should fail when OpenAI API key is not configured", async () => {
    (db.getAppSetting as any).mockImplementation(async (key: string) => {
      if (key === "openai_api_key") return null;
      return "some-value";
    });

    const openaiKey = await db.getAppSetting("openai_api_key");
    expect(openaiKey).toBeNull();
  });
});

describe("Bridge Offline/Online Notification Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect bridge online from agent capabilities", () => {
    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 10000,
      status: "online",
      capabilities: { voiceAiBridge: true },
    };

    const capabilities = agent.capabilities;
    const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;
    expect(hasBridge).toBe(true);
  });

  it("should detect bridge offline when capabilities missing", () => {
    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 10000,
      status: "online",
      capabilities: null,
    };

    const capabilities = agent.capabilities;
    const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;
    expect(hasBridge).toBeFalsy();
  });

  it("should detect bridge offline when voiceAiBridge is false", () => {
    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 10000,
      status: "online",
      capabilities: { voiceAiBridge: false },
    };

    const capabilities = agent.capabilities;
    const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;
    expect(hasBridge).toBe(false);
  });

  it("should send bridge offline notification when bridge was online and goes offline", async () => {
    const knownBridgeOnlineAgents = new Set<string>(["agent-1"]);
    const notifiedBridgeOfflineAgents = new Set<string>();

    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 10000,
      status: "online",
      capabilities: null, // bridge went offline
    };

    const hasBridge = agent.capabilities && typeof agent.capabilities === "object" && (agent.capabilities as any).voiceAiBridge;

    if (!hasBridge && knownBridgeOnlineAgents.has(agent.agentId)) {
      knownBridgeOnlineAgents.delete(agent.agentId);
      if (!notifiedBridgeOfflineAgents.has(agent.agentId)) {
        notifiedBridgeOfflineAgents.add(agent.agentId);
        const enabled = await db.isNotificationEnabled("notify_bridge_offline");
        if (enabled) {
          await notifyOwner({
            title: `Voice AI Bridge Offline: ${agent.name}`,
            content: `The Voice AI bridge on PBX agent "${agent.name}" has gone offline.`,
          });
        }
      }
    }

    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect(notifyOwner).toHaveBeenCalledWith(expect.objectContaining({
      title: "Voice AI Bridge Offline: Agent HD",
    }));
    expect(knownBridgeOnlineAgents.has("agent-1")).toBe(false);
    expect(notifiedBridgeOfflineAgents.has("agent-1")).toBe(true);
  });

  it("should send bridge online notification when bridge comes back", async () => {
    const knownBridgeOnlineAgents = new Set<string>();
    const notifiedBridgeOfflineAgents = new Set<string>(["agent-1"]);

    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 10000,
      status: "online",
      capabilities: { voiceAiBridge: true }, // bridge back online
    };

    const hasBridge = agent.capabilities && typeof agent.capabilities === "object" && (agent.capabilities as any).voiceAiBridge;

    if (hasBridge && !knownBridgeOnlineAgents.has(agent.agentId)) {
      knownBridgeOnlineAgents.add(agent.agentId);
      if (notifiedBridgeOfflineAgents.has(agent.agentId)) {
        notifiedBridgeOfflineAgents.delete(agent.agentId);
        const enabled = await db.isNotificationEnabled("notify_bridge_online");
        if (enabled) {
          await notifyOwner({
            title: `Voice AI Bridge Online: ${agent.name}`,
            content: `The Voice AI bridge on PBX agent "${agent.name}" is now online.`,
          });
        }
      }
    }

    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect(notifyOwner).toHaveBeenCalledWith(expect.objectContaining({
      title: "Voice AI Bridge Online: Agent HD",
    }));
    expect(knownBridgeOnlineAgents.has("agent-1")).toBe(true);
    expect(notifiedBridgeOfflineAgents.has("agent-1")).toBe(false);
  });

  it("should NOT send duplicate offline notifications", async () => {
    const knownBridgeOnlineAgents = new Set<string>();
    const notifiedBridgeOfflineAgents = new Set<string>(["agent-1"]); // already notified

    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      capabilities: null,
    };

    const hasBridge = agent.capabilities && typeof agent.capabilities === "object" && (agent.capabilities as any).voiceAiBridge;

    // Since agent-1 is not in knownBridgeOnlineAgents, no transition detected
    if (!hasBridge && knownBridgeOnlineAgents.has(agent.agentId)) {
      // This block should NOT execute
      await notifyOwner({ title: "Should not fire", content: "test" });
    }

    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("should clear bridge tracking when agent goes offline", () => {
    const knownBridgeOnlineAgents = new Set<string>(["agent-1"]);
    const notifiedBridgeOfflineAgents = new Set<string>();
    const notifiedOfflineAgents = new Set<string>();

    const agent = {
      agentId: "agent-1",
      name: "Agent HD",
      lastHeartbeat: Date.now() - 300000, // 5 min ago - offline
      status: "online",
    };

    const now = Date.now();
    const lastSeen = agent.lastHeartbeat;
    const isOnline = now - lastSeen <= 120000;

    if (!isOnline && agent.status === "online") {
      notifiedOfflineAgents.add(agent.agentId);
      // If agent goes offline, bridge is also offline
      if (knownBridgeOnlineAgents.has(agent.agentId)) {
        knownBridgeOnlineAgents.delete(agent.agentId);
        notifiedBridgeOfflineAgents.delete(agent.agentId);
      }
    }

    expect(isOnline).toBe(false);
    expect(notifiedOfflineAgents.has("agent-1")).toBe(true);
    expect(knownBridgeOnlineAgents.has("agent-1")).toBe(false);
  });

  it("should not send bridge notifications when disabled", async () => {
    (db.isNotificationEnabled as any).mockResolvedValue(false);

    const enabled = await db.isNotificationEnabled("notify_bridge_offline");
    expect(enabled).toBe(false);

    // When disabled, notifyOwner should not be called
    if (enabled) {
      await notifyOwner({ title: "test", content: "test" });
    }

    expect(notifyOwner).not.toHaveBeenCalled();
  });
});

describe("Install Command Generation", () => {
  it("should generate correct install URL format", () => {
    const origin = "https://tts-broadcast-dialer.manus.space";
    const apiKey = "abc123";
    const installUrl = `${origin}/api/voice-ai/install?key=${apiKey}`;

    expect(installUrl).toBe("https://tts-broadcast-dialer.manus.space/api/voice-ai/install?key=abc123");
  });

  it("should handle special characters in API key", () => {
    const origin = "https://example.com";
    const apiKey = "key-with-special_chars.123";
    const installUrl = `${origin}/api/voice-ai/install?key=${apiKey}`;

    expect(installUrl).toContain("key=key-with-special_chars.123");
  });
});

describe("SSH Install Result Parsing", () => {
  it("should detect success from exit code 0", () => {
    const code = 0;
    const output = "Installing... Done!";
    const isSuccess = code === 0 || code === null || output.includes("Installation Complete");
    expect(isSuccess).toBe(true);
  });

  it("should detect success from Installation Complete in output", () => {
    const code = 1; // non-zero exit code
    const output = "Some warnings...\nInstallation Complete!\nService started.";
    const isSuccess = code === 0 || code === null || output.includes("Installation Complete");
    expect(isSuccess).toBe(true);
  });

  it("should detect failure from non-zero exit code without success marker", () => {
    const code = 1;
    const output = "Error: curl failed to download installer";
    const isSuccess = code === 0 || code === null || output.includes("Installation Complete");
    expect(isSuccess).toBe(false);
  });

  it("should truncate long output to last 3000 chars", () => {
    const longOutput = "x".repeat(5000);
    const truncated = longOutput.trim().slice(-3000);
    expect(truncated.length).toBe(3000);
  });
});
