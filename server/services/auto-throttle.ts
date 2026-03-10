/**
 * Auto-Throttle Service
 * 
 * Monitors carrier errors (congestion, failed, all-circuits-busy) reported by PBX agents.
 * When errors exceed a threshold, automatically reduces the agent's effective max calls.
 * Gradually ramps back up when errors subside.
 * 
 * Thresholds:
 * - THROTTLE_TRIGGER: 5 carrier errors in 60 seconds → reduce by 25%
 * - RAMP_UP_INTERVAL: Every 30 seconds with no new errors → increase by 10%
 * - MIN_EFFECTIVE: Never go below 10% of maxCalls (minimum 2)
 */

import * as db from "../db";
import { notifyOwner } from "../_core/notification";

// Log throttle events to the database
async function logThrottleEvent(agentId: string, eventType: "throttle_triggered" | "ramp_up" | "full_recovery" | "manual_reset", data: { previousMaxCalls?: number; newMaxCalls?: number; carrierErrors?: number; reason?: string; agentName?: string }) {
  try {
    await db.createThrottleEvent({ agentId, agentName: data.agentName, eventType, ...data });
  } catch (err) {
    console.error(`[AutoThrottle] Failed to log throttle event:`, err);
  }
}

// In-memory tracking per agent
interface AgentThrottleState {
  recentErrors: number[];       // timestamps of recent carrier errors
  lastRampUp: number;           // timestamp of last ramp-up
  isThrottled: boolean;
  notifiedAt: number | null;    // when we last notified the owner
}

const agentStates = new Map<string, AgentThrottleState>();

const THROTTLE_WINDOW_MS = 60_000;      // 60-second window for error counting
const THROTTLE_ERROR_THRESHOLD = 10;     // 10 carrier errors in window triggers throttle (raised from 5)
const THROTTLE_REDUCTION_FACTOR = 0.75;  // Reduce to 75% of current effective
const RAMP_UP_INTERVAL_MS = 30_000;      // Check for ramp-up every 30 seconds
const RAMP_UP_FACTOR = 1.10;             // Increase by 10% each ramp-up
const MIN_EFFECTIVE_RATIO = 0.10;        // Never go below 10% of maxCalls
const MIN_EFFECTIVE_ABSOLUTE = 2;        // Absolute minimum of 2 concurrent calls
const NOTIFICATION_COOLDOWN_MS = 300_000; // Only notify once every 5 minutes

// Carrier error result types - ONLY true carrier/trunk errors
// "failed" is NOT included because it covers normal call failures (wrong number, disconnected, etc.)
// These should only be errors that indicate the trunk/carrier is overloaded or unavailable
const CARRIER_ERROR_RESULTS = new Set([
  "congestion",
  "all-circuits-busy",
  "service-unavailable",
  "trunk-error",
]);

function getOrCreateState(agentId: string): AgentThrottleState {
  let state = agentStates.get(agentId);
  if (!state) {
    state = {
      recentErrors: [],
      lastRampUp: Date.now(),
      isThrottled: false,
      notifiedAt: null,
    };
    agentStates.set(agentId, state);
  }
  return state;
}

/**
 * Record a carrier error from a PBX agent call result.
 * Called from the /report endpoint when a call fails with a carrier error.
 */
export async function recordCarrierError(agentId: string, errorType: string): Promise<void> {
  if (!CARRIER_ERROR_RESULTS.has(errorType)) return;

  const state = getOrCreateState(agentId);
  const now = Date.now();

  // Add error timestamp
  state.recentErrors.push(now);

  // Prune old errors outside the window
  state.recentErrors = state.recentErrors.filter(t => now - t < THROTTLE_WINDOW_MS);

  // Update DB error count
  try {
    await db.incrementAgentCarrierErrors(agentId);
  } catch (err) {
    console.error(`[AutoThrottle] Failed to increment carrier errors for ${agentId}:`, err);
  }

  // Check if we should throttle
  if (state.recentErrors.length >= THROTTLE_ERROR_THRESHOLD) {
    await applyThrottle(agentId, state);
  }
}

/**
 * Apply throttle to an agent - reduce effective max calls
 */
async function applyThrottle(agentId: string, state: AgentThrottleState): Promise<void> {
  try {
    const agent = await db.getPbxAgentByAgentId(agentId);
    if (!agent) return;

    const currentEffective = agent.effectiveMaxCalls ?? agent.maxCalls ?? 10;
    const minEffective = Math.max(
      Math.ceil((agent.maxCalls ?? 10) * MIN_EFFECTIVE_RATIO),
      MIN_EFFECTIVE_ABSOLUTE
    );

    // Calculate new effective (reduce by 25%)
    let newEffective = Math.floor(currentEffective * THROTTLE_REDUCTION_FACTOR);
    newEffective = Math.max(newEffective, minEffective);

    if (newEffective < currentEffective) {
      await db.updateAgentThrottle(agentId, {
        effectiveMaxCalls: newEffective,
        throttleReason: `Auto-throttled: ${state.recentErrors.length} carrier errors in ${THROTTLE_WINDOW_MS / 1000}s (reduced from ${currentEffective} to ${newEffective})`,
        throttleStartedAt: Date.now(),
      });

      state.isThrottled = true;
      state.lastRampUp = Date.now(); // Reset ramp-up timer

      console.log(`[AutoThrottle] Agent ${agentId}: throttled ${currentEffective} → ${newEffective} (${state.recentErrors.length} errors in window)`);

      // Log to throttle history
      await logThrottleEvent(agentId, "throttle_triggered", {
        previousMaxCalls: currentEffective,
        newMaxCalls: newEffective,
        carrierErrors: state.recentErrors.length,
        reason: `${state.recentErrors.length} carrier errors in ${THROTTLE_WINDOW_MS / 1000}s`,
        agentName: agent.name || undefined,
      });

      // Notify owner (with cooldown)
      const now = Date.now();
      if (!state.notifiedAt || now - state.notifiedAt > NOTIFICATION_COOLDOWN_MS) {
        state.notifiedAt = now;
        notifyOwner({
          title: `PBX Agent Auto-Throttled: ${agent.name || agentId}`,
          content: `Agent "${agent.name || agentId}" has been auto-throttled due to carrier errors.\n\nConcurrent calls reduced: ${currentEffective} → ${newEffective}\nErrors in last 60s: ${state.recentErrors.length}\n\nThe system will automatically ramp back up when errors subside. You can also manually reset the throttle from the FreePBX page.`,
        }).catch(err => console.warn("[AutoThrottle] Failed to send notification:", err));
      }
    }
  } catch (err) {
    console.error(`[AutoThrottle] Failed to apply throttle for ${agentId}:`, err);
  }
}

/**
 * Attempt to ramp up an agent's effective max calls.
 * Called periodically (e.g., on each heartbeat or poll).
 */
export async function attemptRampUp(agentId: string): Promise<void> {
  const state = getOrCreateState(agentId);
  if (!state.isThrottled) return;

  const now = Date.now();

  // Prune old errors
  state.recentErrors = state.recentErrors.filter(t => now - t < THROTTLE_WINDOW_MS);

  // Only ramp up if no recent errors and enough time has passed
  if (state.recentErrors.length > 0) {
    state.lastRampUp = now; // Reset timer if there are still errors
    return;
  }

  if (now - state.lastRampUp < RAMP_UP_INTERVAL_MS) return;

  try {
    const agent = await db.getPbxAgentByAgentId(agentId);
    if (!agent) return;

    const currentEffective = agent.effectiveMaxCalls ?? agent.maxCalls ?? 10;
    const maxCalls = agent.maxCalls ?? 10;

    if (currentEffective >= maxCalls) {
      // Fully recovered
      await db.updateAgentThrottle(agentId, {
        effectiveMaxCalls: null,
        throttleReason: null,
        throttleStartedAt: null,
        throttleCarrierErrors: 0,
      });
      state.isThrottled = false;
      console.log(`[AutoThrottle] Agent ${agentId}: fully recovered to ${maxCalls} max calls`);
      return;
    }

    // Ramp up by 10%
    let newEffective = Math.ceil(currentEffective * RAMP_UP_FACTOR);
    newEffective = Math.min(newEffective, maxCalls);

    await db.updateAgentThrottle(agentId, {
      effectiveMaxCalls: newEffective >= maxCalls ? null : newEffective,
      throttleReason: newEffective >= maxCalls ? null : `Ramping up: ${newEffective}/${maxCalls} (recovering from throttle)`,
      throttleStartedAt: newEffective >= maxCalls ? null : agent.throttleStartedAt,
    });

    state.lastRampUp = now;

    console.log(`[AutoThrottle] Agent ${agentId}: ramp-up ${currentEffective} → ${newEffective}/${maxCalls}`);

    if (newEffective >= maxCalls) {
      state.isThrottled = false;
      // Log full recovery
      await logThrottleEvent(agentId, "full_recovery", {
        previousMaxCalls: currentEffective,
        newMaxCalls: maxCalls,
        reason: "Fully recovered from throttle",
        agentName: agent.name || undefined,
      });
    } else {
      // Log ramp-up step
      await logThrottleEvent(agentId, "ramp_up", {
        previousMaxCalls: currentEffective,
        newMaxCalls: newEffective,
        reason: `Ramping up: ${newEffective}/${maxCalls}`,
        agentName: agent.name || undefined,
      });
    }
  } catch (err) {
    console.error(`[AutoThrottle] Failed to ramp up ${agentId}:`, err);
  }
}

/**
 * Manually reset throttle for an agent (called from UI)
 */
export async function resetThrottle(agentId: string): Promise<void> {
  const state = agentStates.get(agentId);
  if (state) {
    state.recentErrors = [];
    state.isThrottled = false;
    state.notifiedAt = null;
  }

  await db.updateAgentThrottle(agentId, {
    effectiveMaxCalls: null,
    throttleReason: null,
    throttleStartedAt: null,
    throttleCarrierErrors: 0,
  });

  // Log manual reset
  await logThrottleEvent(agentId, "manual_reset", {
    reason: "Throttle manually reset by user",
  });

  console.log(`[AutoThrottle] Agent ${agentId}: throttle manually reset`);
}

/**
 * Get throttle status for an agent
 */
export function getThrottleStatus(agentId: string): {
  isThrottled: boolean;
  recentErrors: number;
  windowMs: number;
  threshold: number;
} {
  const state = agentStates.get(agentId);
  const now = Date.now();
  const recentErrors = state
    ? state.recentErrors.filter(t => now - t < THROTTLE_WINDOW_MS).length
    : 0;

  return {
    isThrottled: state?.isThrottled ?? false,
    recentErrors,
    windowMs: THROTTLE_WINDOW_MS,
    threshold: THROTTLE_ERROR_THRESHOLD,
  };
}

/**
 * Check if a result is a carrier error
 */
export function isCarrierError(result: string): boolean {
  return CARRIER_ERROR_RESULTS.has(result);
}
