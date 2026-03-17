/**
 * Live Agent Tracker
 * 
 * Monitors live agent SIP extensions via the PBX agent's heartbeat/poll cycle.
 * Manages agent state machine: offline → available → ringing → on_call → wrap_up → available
 * Routes answered calls to available agents via AMI transfer commands.
 * 
 * Architecture:
 * - The PBX agent (Python) on FreePBX monitors SIP extension states via AMI
 * - It reports agent states in its heartbeat payload
 * - This service processes those reports and maintains the DB state
 * - When a campaign call is answered, this service finds the best available agent
 *   and instructs the PBX agent to transfer the call
 */

import { getDb } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  liveAgents,
  agentSessions,
  agentCallLog,
  campaignAgentAssignments,
  type LiveAgent,
} from "../../drizzle/schema";

// In-memory cache of agent states for fast routing decisions
export interface AgentState {
  id: number;
  sipExtension: string;
  name: string;
  status: LiveAgent["status"];
  currentCallId: number | null;
  currentCampaignId: number | null;
  statusChangedAt: number;
  skills: string[];
  priority: number;
  // Timing
  availableSince: number | null;    // When agent became available (for wait time calc)
  callConnectedAt: number | null;   // When current call connected
  wrapUpStartedAt: number | null;   // When wrap-up started
}

const agentStates = new Map<number, AgentState>();

// Campaign-specific agent pools
const campaignAgentPools = new Map<number, Set<number>>(); // campaignId -> Set<agentId>

/**
 * Initialize agent tracker — load all active agents from DB
 */
export async function initAgentTracker(): Promise<void> {
  try {
    const dbInst = await getDb();
    if (!dbInst) return;
    const agents = await dbInst.select().from(liveAgents).where(eq(liveAgents.isActive, 1));
    
    for (const agent of agents) {
      agentStates.set(agent.id, {
        id: agent.id,
        sipExtension: agent.sipExtension,
        name: agent.name,
        status: agent.status,
        currentCallId: agent.currentCallId,
        currentCampaignId: agent.currentCampaignId,
        statusChangedAt: agent.statusChangedAt || Date.now(),
        skills: (agent.skills as string[]) || [],
        priority: agent.priority,
        availableSince: agent.status === "available" ? Date.now() : null,
        callConnectedAt: agent.status === "on_call" ? Date.now() : null,
        wrapUpStartedAt: agent.status === "wrap_up" ? Date.now() : null,
      });
    }

    // Load campaign assignments
    const assignments = await dbInst.select().from(campaignAgentAssignments);
    for (const a of assignments) {
      if (!campaignAgentPools.has(a.campaignId)) {
        campaignAgentPools.set(a.campaignId, new Set());
      }
      campaignAgentPools.get(a.campaignId)!.add(a.agentId);
    }

    console.log(`[AgentTracker] Initialized with ${agents.length} agents, ${campaignAgentPools.size} campaign pools`);
  } catch (err) {
    console.error("[AgentTracker] Init error:", err);
  }
}

/**
 * Update agent status from PBX agent heartbeat
 */
export async function updateAgentStatus(
  agentId: number,
  newStatus: LiveAgent["status"],
  metadata?: {
    callId?: number;
    campaignId?: number;
    sipExtension?: string;
  }
): Promise<void> {
  const state = agentStates.get(agentId);
  if (!state) return;

  const previousStatus = state.status;
  if (previousStatus === newStatus && !metadata?.callId) return; // No change

  const now = Date.now();

  // Update in-memory state
  state.status = newStatus;
  state.statusChangedAt = now;

  if (metadata?.callId !== undefined) state.currentCallId = metadata.callId;
  if (metadata?.campaignId !== undefined) state.currentCampaignId = metadata.campaignId;

  // Track timing
  switch (newStatus) {
    case "available":
      state.availableSince = now;
      state.callConnectedAt = null;
      state.wrapUpStartedAt = null;
      state.currentCallId = null;
      break;
    case "ringing":
      state.availableSince = null;
      break;
    case "on_call":
      state.callConnectedAt = now;
      state.availableSince = null;
      break;
    case "wrap_up":
      state.wrapUpStartedAt = now;
      state.callConnectedAt = null;
      break;
    case "on_break":
    case "offline":
      state.availableSince = null;
      state.callConnectedAt = null;
      state.wrapUpStartedAt = null;
      state.currentCallId = null;
      state.currentCampaignId = null;
      break;
  }

  // Persist to DB
  try {
    const dbInst = await getDb();
    if (!dbInst) return;
    await dbInst.update(liveAgents).set({
      status: newStatus,
      currentCallId: state.currentCallId,
      currentCampaignId: state.currentCampaignId,
      statusChangedAt: now,
    }).where(eq(liveAgents.id, agentId));

    // Log session event for significant transitions
    if (["available", "offline", "on_break"].includes(newStatus) || 
        ["available", "offline", "on_break"].includes(previousStatus)) {
      const sessionType = newStatus === "offline" ? "logout" as const
        : newStatus === "on_break" ? "break_start" as const
        : previousStatus === "on_break" ? "break_end" as const
        : previousStatus === "offline" ? "login" as const
        : "status_change" as const;

      await dbInst.insert(agentSessions).values({
        agentId,
        userId: 0, // system
        sessionType,
        previousStatus,
        newStatus,
        campaignId: state.currentCampaignId,
      });
    }
  } catch (err) {
    console.error(`[AgentTracker] Error updating agent ${agentId}:`, err);
  }
}

/**
 * Find the best available agent for a campaign call
 * Uses skill-based routing with longest-idle-first selection
 */
export function findAvailableAgent(
  campaignId: number,
  requiredSkills?: string[]
): AgentState | null {
  // Get agents assigned to this campaign
  const assignedAgentIds = campaignAgentPools.get(campaignId);
  
  let candidates: AgentState[] = [];

  if (assignedAgentIds && assignedAgentIds.size > 0) {
    // Only consider assigned agents
    for (const agentId of Array.from(assignedAgentIds)) {
      const state = agentStates.get(agentId);
      if (state && state.status === "available") {
        candidates.push(state);
      }
    }
  } else {
    // No specific assignment — use all available agents
  for (const state of Array.from(agentStates.values())) {
    if (state.status === "available") {
      candidates.push(state);
    }
  }
  }

  // Filter by required skills
  if (requiredSkills && requiredSkills.length > 0) {
    candidates = candidates.filter(agent =>
      requiredSkills.every(skill => agent.skills.includes(skill))
    );
  }

  if (candidates.length === 0) return null;

  // Sort by: priority (ascending), then longest idle (ascending availableSince)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aIdle = a.availableSince || Infinity;
    const bIdle = b.availableSince || Infinity;
    return aIdle - bIdle; // Longest idle first
  });

  return candidates[0];
}

/**
 * Reserve an agent for an incoming call (prevents double-routing)
 */
export async function reserveAgent(agentId: number, callId: number, campaignId: number): Promise<boolean> {
  const state = agentStates.get(agentId);
  if (!state || state.status !== "available") return false;

  await updateAgentStatus(agentId, "reserved", { callId, campaignId });
  return true;
}

/**
 * Get count of available agents for a campaign
 */
export function getAvailableAgentCount(campaignId?: number): number {
  if (campaignId) {
    const assignedIds = campaignAgentPools.get(campaignId);
  if (assignedIds && assignedIds.size > 0) {
    let count = 0;
    for (const id of Array.from(assignedIds)) {
        const state = agentStates.get(id);
        if (state && state.status === "available") count++;
      }
      return count;
    }
  }
  
  let count = 0;
  for (const state of Array.from(agentStates.values())) {
    if (state.status === "available") count++;
  }
  return count;
}

/**
 * Get all agent states for the dashboard
 */
export function getAllAgentStates(): AgentState[] {
  return Array.from(agentStates.values()) as AgentState[];
}

/**
 * Get agent states for a specific campaign
 */
export function getCampaignAgentStates(campaignId: number): AgentState[] {
  const assignedIds = campaignAgentPools.get(campaignId);
  if (!assignedIds || assignedIds.size === 0) {
    return Array.from(agentStates.values());
  }
  
  const states: AgentState[] = [];
  for (const id of Array.from(assignedIds)) {
    const state = agentStates.get(id);
    if (state) states.push(state);
  }
  return states;
}

/**
 * Get real-time agent utilization stats
 */
export function getAgentUtilizationStats(campaignId?: number): {
  total: number;
  available: number;
  onCall: number;
  ringing: number;
  wrapUp: number;
  onBreak: number;
  offline: number;
  reserved: number;
  utilizationPercent: number;
  avgWaitTimeSecs: number;
  avgTalkTimeSecs: number;
} {
  const agents = campaignId ? getCampaignAgentStates(campaignId) : getAllAgentStates();
  const now = Date.now();

  let available = 0, onCall = 0, ringing = 0, wrapUp = 0, onBreak = 0, offline = 0, reserved = 0;
  let totalWaitTime = 0, waitCount = 0;
  let totalTalkTime = 0, talkCount = 0;

  for (const agent of agents) {
    switch (agent.status) {
      case "available": 
        available++;
        if (agent.availableSince) {
          totalWaitTime += (now - agent.availableSince) / 1000;
          waitCount++;
        }
        break;
      case "on_call":
        onCall++;
        if (agent.callConnectedAt) {
          totalTalkTime += (now - agent.callConnectedAt) / 1000;
          talkCount++;
        }
        break;
      case "ringing": ringing++; break;
      case "wrap_up": wrapUp++; break;
      case "on_break": onBreak++; break;
      case "offline": offline++; break;
      case "reserved": reserved++; break;
    }
  }

  const total = agents.length;
  const loggedIn = total - offline;
  const productive = onCall + wrapUp + ringing + reserved;
  const utilizationPercent = loggedIn > 0 ? Math.round((productive / loggedIn) * 100) : 0;

  return {
    total,
    available,
    onCall,
    ringing,
    wrapUp,
    onBreak,
    offline,
    reserved,
    utilizationPercent,
    avgWaitTimeSecs: waitCount > 0 ? Math.round(totalWaitTime / waitCount) : 0,
    avgTalkTimeSecs: talkCount > 0 ? Math.round(totalTalkTime / talkCount) : 0,
  };
}

/**
 * Record agent call completion and disposition
 */
export async function recordAgentCallCompletion(
  agentId: number,
  callQueueId: number,
  disposition: string,
  wrapUpNotes?: string,
  wrapUpCode?: string,
): Promise<void> {
  const state = agentStates.get(agentId);
  if (!state) return;

  const now = Date.now();
  const talkDuration = state.callConnectedAt 
    ? Math.round((now - state.callConnectedAt) / 1000) 
    : 0;

  try {
    const dbInst = await getDb();
    if (!dbInst) return;
    await dbInst.insert(agentCallLog).values({
      agentId,
      userId: 0,
      campaignId: state.currentCampaignId,
      callQueueId,
      callLogId: null,
      phoneNumber: "",
      connectedAt: state.callConnectedAt,
      disconnectedAt: now,
      talkDuration,
      disposition: disposition as any,
      wrapUpNotes,
      wrapUpCode,
    });

    // Update agent rolling stats
    await dbInst.update(liveAgents).set({
      totalCallsHandled: sql`${liveAgents.totalCallsHandled} + 1`,
      totalTalkTime: sql`${liveAgents.totalTalkTime} + ${talkDuration}`,
    }).where(eq(liveAgents.id, agentId));
  } catch (err) {
    console.error(`[AgentTracker] Error recording call completion for agent ${agentId}:`, err);
  }
}

/**
 * Process auto wrap-up timeout — move agents from wrap_up back to available
 */
export async function processWrapUpTimeouts(wrapUpTimeSecs: number = 30): Promise<void> {
  const now = Date.now();
  const timeoutMs = wrapUpTimeSecs * 1000;

  for (const state of Array.from(agentStates.values())) {
    if (state.status === "wrap_up" && state.wrapUpStartedAt) {
      if (now - state.wrapUpStartedAt > timeoutMs) {
        await updateAgentStatus(state.id, "available");
        console.log(`[AgentTracker] Agent ${state.name} auto-transitioned from wrap_up to available`);
      }
    }
  }
}

/**
 * Assign agents to a campaign
 */
export async function assignAgentsToCampaign(
  campaignId: number,
  agentIds: number[]
): Promise<void> {
  const dbInst = await getDb();
  if (!dbInst) return;
  // Clear existing assignments
  await dbInst.delete(campaignAgentAssignments).where(
    eq(campaignAgentAssignments.campaignId, campaignId)
  );

  // Insert new assignments
  if (agentIds.length > 0) {
    await dbInst.insert(campaignAgentAssignments).values(
      agentIds.map(agentId => ({ campaignId, agentId }))
    );
  }

  // Update in-memory pool
  campaignAgentPools.set(campaignId, new Set(agentIds));
  console.log(`[AgentTracker] Assigned ${agentIds.length} agents to campaign ${campaignId}`);
}

/**
 * Refresh agent cache from DB (call periodically or after manual DB changes)
 */
export async function refreshAgentCache(): Promise<void> {
  await initAgentTracker();
}

/**
 * Process bulk agent status update from PBX agent heartbeat
 * The PBX agent sends SIP extension states it monitors via AMI
 */
export async function processBulkAgentUpdate(
  extensionStates: Array<{ extension: string; state: string; callId?: string }>
): Promise<void> {
  for (const extState of extensionStates) {
    // Find agent by SIP extension
    let agentId: number | null = null;
    for (const [id, state] of Array.from(agentStates.entries())) {
      if (state.sipExtension === extState.extension) {
        agentId = id;
        break;
      }
    }
    if (!agentId) continue;

    // Map SIP state to agent status
    const sipToStatus: Record<string, LiveAgent["status"]> = {
      "NOT_INUSE": "available",
      "INUSE": "on_call",
      "RINGING": "ringing",
      "BUSY": "on_call",
      "UNAVAILABLE": "offline",
      "ONHOLD": "on_call",
      "IDLE": "available",
    };

    const newStatus = sipToStatus[extState.state] || "available";
    await updateAgentStatus(agentId, newStatus);
  }
}
