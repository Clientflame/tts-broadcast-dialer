/**
 * Call Pacing Engine (Enhanced Predictive Dialer)
 * 
 * Supports three pacing modes:
 * - Fixed: Static concurrent call limit (traditional power dialer)
 * - Adaptive: Dynamically adjusts based on real-time answer rate
 * - Predictive: Uses Erlang-C inspired algorithm + rolling stats to predict optimal call volume
 *   while keeping abandon rate under TCPA 3% limit
 * 
 * Predictive Dialer Algorithm:
 * 1. Track rolling answer rate, avg call duration, avg ring time
 * 2. Calculate overdial ratio = 1 / answer_rate (how many calls to place per expected answer)
 * 3. Factor in agent count (lines available) and target wait time
 * 4. Apply safety circuit breaker if abandon rate exceeds threshold
 * 5. Gradually ramp up/down toward calculated optimal concurrent calls
 */

export interface PacingConfig {
  mode: "fixed" | "adaptive" | "predictive";
  fixedConcurrent: number;       // Used in fixed mode
  targetDropRate: number;        // Target abandoned/drop rate % (adaptive/predictive)
  minConcurrent: number;         // Floor for dynamic pacing
  maxConcurrent: number;         // Ceiling for dynamic pacing
  // Predictive mode specific
  agentCount?: number;           // Number of available agents/lines
  targetWaitTime?: number;       // Target agent wait time in seconds
  maxAbandonRate?: number;       // Max abandon rate % (TCPA limit = 3%)
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
  // Enhanced predictive tracking
  totalAnswered: number;         // Total answered calls (all time)
  totalAbandoned: number;        // Total abandoned calls (all time)
  consecutiveDrops: number;      // Consecutive dropped calls (circuit breaker)
  circuitBreakerActive: boolean; // Emergency slowdown active
  circuitBreakerUntil: number;   // When circuit breaker expires
  overdialRatio: number;         // Current overdial ratio
  predictedOptimal: number;      // Last calculated optimal concurrent
}

const MEASUREMENT_WINDOW_MS = 60_000; // 60-second rolling window
const MIN_CALLS_FOR_ADJUSTMENT = 5;   // Need at least 5 calls before adjusting
const ADJUSTMENT_STEP = 1;            // Adjust by 1 call at a time
const ADJUSTMENT_COOLDOWN_MS = 10_000; // Wait 10 seconds between adjustments
const CIRCUIT_BREAKER_THRESHOLD = 3;  // 3 consecutive drops triggers circuit breaker
const CIRCUIT_BREAKER_DURATION_MS = 30_000; // Circuit breaker lasts 30 seconds
const RAMP_UP_STEP = 2;              // Predictive can ramp up by 2 at a time
const MAX_OVERDIAL_RATIO = 5.0;      // Never overdial more than 5x

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
    // Enhanced predictive
    totalAnswered: 0,
    totalAbandoned: 0,
    consecutiveDrops: 0,
    circuitBreakerActive: false,
    circuitBreakerUntil: 0,
    overdialRatio: 1.0,
    predictedOptimal: initialConcurrent,
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

  // Circuit breaker override
  if (state.circuitBreakerActive && Date.now() < state.circuitBreakerUntil) {
    return config.minConcurrent;
  } else if (state.circuitBreakerActive) {
    state.circuitBreakerActive = false;
    console.log(`[Pacing] Campaign ${campaignId}: Circuit breaker released`);
  }

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
      state.totalAnswered++;
      state.consecutiveDrops = 0; // Reset consecutive drops
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
      state.consecutiveDrops = 0;
      break;
    case "no-answer":
      state.windowNoAnswer++;
      state.consecutiveDrops = 0;
      break;
    case "failed":
      state.windowFailed++;
      state.consecutiveDrops = 0;
      break;
    case "dropped":
      state.windowDropped++;
      state.totalAbandoned++;
      state.consecutiveDrops++;
      // Circuit breaker: too many consecutive drops
      if (state.consecutiveDrops >= CIRCUIT_BREAKER_THRESHOLD && !state.circuitBreakerActive) {
        state.circuitBreakerActive = true;
        state.circuitBreakerUntil = now + CIRCUIT_BREAKER_DURATION_MS;
        state.currentConcurrent = config.minConcurrent;
        console.log(`[Pacing] Campaign ${campaignId}: CIRCUIT BREAKER activated — ${state.consecutiveDrops} consecutive drops, reducing to ${config.minConcurrent}`);
      }
      break;
  }

  // Attempt pacing adjustment
  adjustPacing(campaignId, config, state);
}

/**
 * Core pacing adjustment logic
 */
function adjustPacing(campaignId: number, config: PacingConfig, state: PacingState): void {
  // Skip if circuit breaker is active
  if (state.circuitBreakerActive && Date.now() < state.circuitBreakerUntil) return;

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
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - ADJUSTMENT_STEP);
      reason = `Drop rate ${(dropRate * 100).toFixed(1)}% exceeds target ${config.targetDropRate}%`;
    } else if (answerRate > 0.6 && dropRate < targetDropRate * 0.5) {
      newConcurrent = Math.min(config.maxConcurrent, state.currentConcurrent + ADJUSTMENT_STEP);
      reason = `Answer rate ${(answerRate * 100).toFixed(1)}%, drop rate ${(dropRate * 100).toFixed(1)}% well below target`;
    } else if (answerRate < 0.2 && noAnswerRate > 0.5) {
      newConcurrent = Math.min(config.maxConcurrent, state.currentConcurrent + ADJUSTMENT_STEP);
      reason = `Low answer rate ${(answerRate * 100).toFixed(1)}%, increasing to compensate`;
    } else if (busyRate > 0.4) {
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - ADJUSTMENT_STEP);
      reason = `High busy rate ${(busyRate * 100).toFixed(1)}%, slowing down`;
    }
  } else if (config.mode === "predictive") {
    // Enhanced Predictive Mode
    // Uses Erlang-C inspired calculation for optimal overdial ratio
    
    const agentCount = config.agentCount || config.fixedConcurrent;
    const maxAbandonRate = (config.maxAbandonRate || 3) / 100; // Default TCPA 3%
    
    // Use rolling average if we have enough data, otherwise use window rate
    const effectiveAnswerRate = state.totalHistoricalCalls > 20
      ? state.avgAnswerRate
      : answerRate || 0.5;

    // Calculate overdial ratio based on answer rate
    // overdialRatio = 1 / answerRate tells us how many calls to place per expected answer
    const rawOverdial = 1 / Math.max(effectiveAnswerRate, 0.1);
    
    // Apply safety factor based on current abandon rate
    // If we're close to the abandon limit, reduce the overdial
    const currentAbandonRate = state.totalAnswered + state.totalAbandoned > 0
      ? state.totalAbandoned / (state.totalAnswered + state.totalAbandoned)
      : 0;
    
    let safetyFactor = 1.0;
    if (currentAbandonRate > maxAbandonRate * 0.8) {
      // Within 80% of max abandon rate — start reducing
      safetyFactor = 0.8;
    } else if (currentAbandonRate > maxAbandonRate * 0.5) {
      // Within 50% — slight reduction
      safetyFactor = 0.95;
    } else if (currentAbandonRate < maxAbandonRate * 0.2) {
      // Well under limit — can be more aggressive
      safetyFactor = 1.1;
    }

    // Calculate optimal concurrent calls
    // Formula: agentCount * overdialRatio * safetyFactor
    const overdialRatio = Math.min(rawOverdial * safetyFactor, MAX_OVERDIAL_RATIO);
    const predictedOptimal = Math.round(agentCount * overdialRatio);
    
    // Store for dashboard
    state.overdialRatio = overdialRatio;
    state.predictedOptimal = predictedOptimal;

    // Clamp to configured bounds
    const targetConcurrent = Math.min(
      config.maxConcurrent,
      Math.max(config.minConcurrent, predictedOptimal)
    );

    // Adjust toward target
    if (dropRate > targetDropRate) {
      // Safety: reduce immediately if dropping too many
      const reduction = dropRate > targetDropRate * 2 ? RAMP_UP_STEP : ADJUSTMENT_STEP;
      newConcurrent = Math.max(config.minConcurrent, state.currentConcurrent - reduction);
      reason = `Predictive safety: drop rate ${(dropRate * 100).toFixed(1)}% exceeds target ${config.targetDropRate}%`;
    } else if (targetConcurrent > state.currentConcurrent) {
      // Ramp up faster in predictive mode
      const step = targetConcurrent - state.currentConcurrent > 3 ? RAMP_UP_STEP : ADJUSTMENT_STEP;
      newConcurrent = Math.min(state.currentConcurrent + step, targetConcurrent);
      reason = `Predictive ramp-up: target ${targetConcurrent} (overdial ${overdialRatio.toFixed(2)}x, answer rate ${(effectiveAnswerRate * 100).toFixed(1)}%, abandon ${(currentAbandonRate * 100).toFixed(1)}%)`;
    } else if (targetConcurrent < state.currentConcurrent) {
      newConcurrent = Math.max(state.currentConcurrent - ADJUSTMENT_STEP, targetConcurrent);
      reason = `Predictive ramp-down: target ${targetConcurrent} (overdial ${overdialRatio.toFixed(2)}x, answer rate ${(effectiveAnswerRate * 100).toFixed(1)}%)`;
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
  // Enhanced predictive stats
  overdialRatio: number;
  predictedOptimal: number;
  totalAbandonRate: number;
  circuitBreakerActive: boolean;
  consecutiveDrops: number;
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
      overdialRatio: 1,
      predictedOptimal: config.fixedConcurrent,
      totalAbandonRate: 0,
      circuitBreakerActive: false,
      consecutiveDrops: 0,
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
  const totalAbandonRate = state.totalAnswered + state.totalAbandoned > 0
    ? (state.totalAbandoned / (state.totalAnswered + state.totalAbandoned)) * 100
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
    overdialRatio: Math.round(state.overdialRatio * 100) / 100,
    predictedOptimal: state.predictedOptimal,
    totalAbandonRate: Math.round(totalAbandonRate * 10) / 10,
    circuitBreakerActive: state.circuitBreakerActive && Date.now() < state.circuitBreakerUntil,
    consecutiveDrops: state.consecutiveDrops,
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
