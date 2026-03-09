/**
 * Call Pacing Engine
 * 
 * Supports three pacing modes:
 * - Fixed: Static concurrent call limit (traditional)
 * - Adaptive: Dynamically adjusts based on real-time answer rate
 * - Predictive: Uses historical data + rolling stats to predict optimal call volume
 */

export interface PacingConfig {
  mode: "fixed" | "adaptive" | "predictive";
  fixedConcurrent: number;       // Used in fixed mode
  targetDropRate: number;        // Target abandoned/drop rate % (adaptive/predictive)
  minConcurrent: number;         // Floor for dynamic pacing
  maxConcurrent: number;         // Ceiling for dynamic pacing
}

interface PacingState {
  currentConcurrent: number;     // Current calculated concurrent limit
  windowCalls: number;           // Calls in the current measurement window
  windowAnswered: number;        // Answered calls in window
  windowDropped: number;         // Dropped/abandoned calls in window
  windowBusy: number;            // Busy calls in window
  windowNoAnswer: number;        // No-answer calls in window
  windowFailed: number;          // Failed calls in window
  windowStartTime: number;       // When the current window started
  adjustmentHistory: Array<{     // History of pacing adjustments
    timestamp: number;
    from: number;
    to: number;
    reason: string;
    answerRate: number;
    dropRate: number;
  }>;
  // Predictive mode specific
  avgAnswerRate: number;         // Rolling average answer rate
  avgCallDuration: number;       // Rolling average call duration in seconds
  avgRingTime: number;           // Rolling average ring time before answer
  totalHistoricalCalls: number;  // Total calls used for historical averages
}

const MEASUREMENT_WINDOW_MS = 60_000; // 60-second rolling window
const MIN_CALLS_FOR_ADJUSTMENT = 5;   // Need at least 5 calls before adjusting
const ADJUSTMENT_STEP = 1;            // Adjust by 1 call at a time
const ADJUSTMENT_COOLDOWN_MS = 15_000; // Wait 15 seconds between adjustments
const PREDICTIVE_OVERCOMMIT = 1.2;    // Predictive mode overcommits by 20%

// Per-campaign pacing state
const pacingStates = new Map<number, PacingState>();

/**
 * Initialize pacing for a campaign
 */
export function initPacing(campaignId: number, config: PacingConfig): void {
  const initialConcurrent = config.mode === "fixed"
    ? config.fixedConcurrent
    : Math.max(config.minConcurrent, Math.ceil(config.fixedConcurrent * 0.5)); // Start conservative

  pacingStates.set(campaignId, {
    currentConcurrent: initialConcurrent,
    windowCalls: 0,
    windowAnswered: 0,
    windowDropped: 0,
    windowBusy: 0,
    windowNoAnswer: 0,
    windowFailed: 0,
    windowStartTime: Date.now(),
    adjustmentHistory: [],
    avgAnswerRate: 0.5, // Assume 50% answer rate initially
    avgCallDuration: 30,
    avgRingTime: 15,
    totalHistoricalCalls: 0,
  });

  console.log(`[Pacing] Initialized campaign ${campaignId} in ${config.mode} mode, starting at ${initialConcurrent} concurrent`);
}

/**
 * Get the current recommended concurrent call limit
 */
export function getCurrentConcurrent(campaignId: number, config: PacingConfig): number {
  if (config.mode === "fixed") {
    return config.fixedConcurrent;
  }

  const state = pacingStates.get(campaignId);
  if (!state) return config.fixedConcurrent;

  return state.currentConcurrent;
}

/**
 * Record a call result for pacing calculations
 */
export function recordCallResult(
  campaignId: number,
  config: PacingConfig,
  result: "answered" | "busy" | "no-answer" | "failed" | "dropped",
  duration?: number,
  ringTime?: number,
): void {
  if (config.mode === "fixed") return;

  const state = pacingStates.get(campaignId);
  if (!state) return;

  // Check if we need to reset the window
  const now = Date.now();
  if (now - state.windowStartTime > MEASUREMENT_WINDOW_MS) {
    // Carry forward rolling averages before resetting
    if (state.windowCalls > 0) {
      const windowAnswerRate = state.windowAnswered / state.windowCalls;
      const alpha = 0.3; // Exponential moving average weight
      state.avgAnswerRate = state.avgAnswerRate * (1 - alpha) + windowAnswerRate * alpha;
      state.totalHistoricalCalls += state.windowCalls;
    }

    state.windowCalls = 0;
    state.windowAnswered = 0;
    state.windowDropped = 0;
    state.windowBusy = 0;
    state.windowNoAnswer = 0;
    state.windowFailed = 0;
    state.windowStartTime = now;
  }

  // Record the result
  state.windowCalls++;
  switch (result) {
    case "answered":
      state.windowAnswered++;
      if (duration !== undefined) {
        const alpha = 0.2;
        state.avgCallDuration = state.avgCallDuration * (1 - alpha) + duration * alpha;
      }
      if (ringTime !== undefined) {
        const alpha = 0.2;
        state.avgRingTime = state.avgRingTime * (1 - alpha) + ringTime * alpha;
      }
      break;
    case "busy":
      state.windowBusy++;
      break;
    case "no-answer":
      state.windowNoAnswer++;
      break;
    case "failed":
      state.windowFailed++;
      break;
    case "dropped":
      state.windowDropped++;
      break;
  }

  // Attempt pacing adjustment
  adjustPacing(campaignId, config, state);
}

/**
 * Core pacing adjustment logic
 */
function adjustPacing(campaignId: number, config: PacingConfig, state: PacingState): void {
  // Need minimum calls before making adjustments
  if (state.windowCalls < MIN_CALLS_FOR_ADJUSTMENT) return;

  // Check cooldown
  const lastAdjustment = state.adjustmentHistory[state.adjustmentHistory.length - 1];
  if (lastAdjustment && Date.now() - lastAdjustment.timestamp < ADJUSTMENT_COOLDOWN_MS) return;

  const answerRate = state.windowAnswered / state.windowCalls;
  const dropRate = state.windowDropped / Math.max(state.windowCalls, 1);
  const busyRate = state.windowBusy / state.windowCalls;
  const noAnswerRate = state.windowNoAnswer / state.windowCalls;
  const targetDropRate = config.targetDropRate / 100;

  let newConcurrent = state.currentConcurrent;
  let reason = "";

  if (config.mode === "adaptive") {
    // Adaptive mode: simple feedback loop based on answer rate and drop rate
    if (dropRate > targetDropRate) {
      // Too many drops — slow down
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - ADJUSTMENT_STEP);
      reason = `Drop rate ${(dropRate * 100).toFixed(1)}% exceeds target ${config.targetDropRate}%`;
    } else if (answerRate > 0.6 && dropRate < targetDropRate * 0.5) {
      // Good answer rate and well below drop target — speed up
      newConcurrent = Math.min(config.maxConcurrent, state.currentConcurrent + ADJUSTMENT_STEP);
      reason = `Answer rate ${(answerRate * 100).toFixed(1)}%, drop rate ${(dropRate * 100).toFixed(1)}% well below target`;
    } else if (answerRate < 0.2 && noAnswerRate > 0.5) {
      // Very low answer rate — speed up to compensate
      newConcurrent = Math.min(config.maxConcurrent, state.currentConcurrent + ADJUSTMENT_STEP);
      reason = `Low answer rate ${(answerRate * 100).toFixed(1)}%, increasing to compensate`;
    } else if (busyRate > 0.4) {
      // Many busy signals — slight slowdown to spread calls
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - ADJUSTMENT_STEP);
      reason = `High busy rate ${(busyRate * 100).toFixed(1)}%, slowing down`;
    }
  } else if (config.mode === "predictive") {
    // Predictive mode: use historical averages to calculate optimal concurrent calls
    // Formula: optimal = agents_available / (answer_rate * avg_call_duration / avg_ring_time)
    // Since we don't have agents, we optimize for throughput while respecting drop rate

    const effectiveAnswerRate = state.totalHistoricalCalls > 20
      ? state.avgAnswerRate
      : answerRate || 0.5;

    // Calculate how many calls we need to place to keep the pipeline full
    // If answer rate is 40%, we need to place 2.5x calls to get 1 answered
    const overcommitRatio = 1 / Math.max(effectiveAnswerRate, 0.1);

    // Apply predictive overcommit factor
    const predictedOptimal = Math.round(
      config.fixedConcurrent * overcommitRatio * PREDICTIVE_OVERCOMMIT
    );

    // Clamp to configured bounds
    const targetConcurrent = Math.min(
      config.maxConcurrent,
      Math.max(config.minConcurrent, predictedOptimal)
    );

    // Adjust gradually toward target
    if (dropRate > targetDropRate) {
      // Safety: reduce immediately if dropping too many
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - ADJUSTMENT_STEP);
      reason = `Predictive safety: drop rate ${(dropRate * 100).toFixed(1)}% exceeds target`;
    } else if (targetConcurrent > state.currentConcurrent) {
      newConcurrent = Math.min(state.currentConcurrent + ADJUSTMENT_STEP, targetConcurrent);
      reason = `Predictive ramp-up: target ${targetConcurrent} (answer rate ${(effectiveAnswerRate * 100).toFixed(1)}%)`;
    } else if (targetConcurrent < state.currentConcurrent) {
      newConcurrent = Math.max(state.currentConcurrent - ADJUSTMENT_STEP, targetConcurrent);
      reason = `Predictive ramp-down: target ${targetConcurrent} (answer rate ${(effectiveAnswerRate * 100).toFixed(1)}%)`;
    }
  }

  // Apply adjustment if changed
  if (newConcurrent !== state.currentConcurrent) {
    const adjustment = {
      timestamp: Date.now(),
      from: state.currentConcurrent,
      to: newConcurrent,
      reason,
      answerRate: answerRate * 100,
      dropRate: dropRate * 100,
    };

    state.adjustmentHistory.push(adjustment);
    // Keep only last 50 adjustments
    if (state.adjustmentHistory.length > 50) {
      state.adjustmentHistory = state.adjustmentHistory.slice(-50);
    }

    console.log(`[Pacing] Campaign ${campaignId}: ${state.currentConcurrent} → ${newConcurrent} (${reason})`);
    state.currentConcurrent = newConcurrent;
  }
}

/**
 * Get pacing stats for the live dashboard
 */
export function getPacingStats(campaignId: number, config: PacingConfig): {
  mode: string;
  currentConcurrent: number;
  windowCalls: number;
  windowAnswerRate: number;
  windowDropRate: number;
  windowBusyRate: number;
  avgAnswerRate: number;
  avgCallDuration: number;
  recentAdjustments: Array<{
    timestamp: number;
    from: number;
    to: number;
    reason: string;
  }>;
} | null {
  if (config.mode === "fixed") {
    return {
      mode: "fixed",
      currentConcurrent: config.fixedConcurrent,
      windowCalls: 0,
      windowAnswerRate: 0,
      windowDropRate: 0,
      windowBusyRate: 0,
      avgAnswerRate: 0,
      avgCallDuration: 0,
      recentAdjustments: [],
    };
  }

  const state = pacingStates.get(campaignId);
  if (!state) return null;

  const windowAnswerRate = state.windowCalls > 0
    ? (state.windowAnswered / state.windowCalls) * 100
    : 0;
  const windowDropRate = state.windowCalls > 0
    ? (state.windowDropped / state.windowCalls) * 100
    : 0;
  const windowBusyRate = state.windowCalls > 0
    ? (state.windowBusy / state.windowCalls) * 100
    : 0;

  return {
    mode: config.mode,
    currentConcurrent: state.currentConcurrent,
    windowCalls: state.windowCalls,
    windowAnswerRate: Math.round(windowAnswerRate * 10) / 10,
    windowDropRate: Math.round(windowDropRate * 10) / 10,
    windowBusyRate: Math.round(windowBusyRate * 10) / 10,
    avgAnswerRate: Math.round(state.avgAnswerRate * 1000) / 10,
    avgCallDuration: Math.round(state.avgCallDuration),
    recentAdjustments: state.adjustmentHistory.slice(-10).map(a => ({
      timestamp: a.timestamp,
      from: a.from,
      to: a.to,
      reason: a.reason,
    })),
  };
}

/**
 * Clean up pacing state when campaign stops
 */
export function cleanupPacing(campaignId: number): void {
  pacingStates.delete(campaignId);
  console.log(`[Pacing] Cleaned up state for campaign ${campaignId}`);
}
