/**
 * NetRun — src/sim/world-model.ts   (spec §24, §26, §27)
 *
 * LATENT STATE. Never imported by diagnose/ prior/ schedule/ policy/ execute/.
 * Keep it in this module so an accidental import is obvious in review — that
 * separation is the first thing a judge will check, and it is what makes the
 * metrics real rather than asserted.
 */

import type { ISODate, WindowName } from '../types';
import { DECLINE_CODE_CLASS } from '../config/rules';
import type { DeclineClass } from '../config/rules';

export interface LatentCustomer {
  customerId: string;
  /**
   * Day-of-month when funds arrive. Draw from a MIXTURE, not a uniform:
   *   ~55% {1,2}    salaried, month start
   *   ~25% {7,10}   staggered payroll
   *   ~20% {25,28}  self-employed / receipts-driven
   * plus +/-2 days of noise. A uniform draw flatters the prior estimator.
   */
  replenishmentDay: number;
  /** Monthly inflow in paise. Used by balanceOn(). */
  monthlyInflowPaise: number;
  /** How fast funds drain after arriving. */
  balanceVolatility: number;
  /** P(a stated promise is actually kept). Powers promise weighting. */
  promiseKeepRate: number;
  /** Base P(cancel | notification received), before fatigue. */
  cancelPropensity: number;
  /**
   * If set, the mandate dies at this cycle regardless of any action
   * (account closed / mandate revoked). ~4% of customers.
   * These exist so 100% recovery is IMPOSSIBLE — which is what kills the
   * "your dataset is rigged" objection before it is made.
   */
  terminalAtCycle: number | null;
  /** Bank identifier for downtime correlation. */
  bank: string;
}

/**
 * Time-correlated bank downtime (spec §26). NOT independent per attempt.
 *
 * The single most important modelling choice in the simulator: it is what makes
 * "retry later, in a different window" genuinely valuable for some cycles and
 * pure waste for others. If downtime were i.i.d., window diversification would
 * add nothing — and your sensitivity analysis would correctly say so.
 *
 * Implement as bursts: ~6 outages per simulated month, 2-10h each, affecting
 * one bank and one or two windows.
 */
export interface DowntimeBurst {
  bank: string;
  /** Day of month the burst starts (1-28). */
  day: number;
  affectedWindows: WindowName[];
  severity: number; // 0..1 multiplier on success probability (0 = total outage)
}

export interface AttemptOutcome {
  success: boolean;
  /**
   * Correct only ~80% of the time (spec §25). Real PSP data is messy, and this
   * label noise is EXACTLY where the LLM diagnosis fallback can beat a raw
   * lookup — and where you measure whether it actually does. Without noise the
   * LLM is provably useless and you have no honest answer to "why AI here?".
   */
  declineCode: string | null;
  trueClass: DeclineClass | null;
}

// ---------------------------------------------------------------------------
// SEEDED PRNG — the foundation of reproducibility
// ---------------------------------------------------------------------------

/** Seeded PRNG — Math.random is not reproducible, and `--seed` must be. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic hash from a numeric seed + string parts.
 * Used to derive a per-slot integer seed so that each attempt's outcome
 * is a PURE FUNCTION of (seed, cycleId, date, window).
 *
 * This is the CRITICAL seeding constraint: a later task builds a
 * counterfactual table over every (date, window) pair. With a shared
 * sequential stream, that table and the live strategy runs consume
 * randomness in different orders and silently produce different outcomes
 * for the same slot.
 */
export function hashSeed(seed: number, ...parts: string[]): number {
  let h = seed >>> 0;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h = Math.imul(h ^ part.charCodeAt(i), 0x5bd1e995);
      h ^= h >>> 13;
    }
    // Mix in a separator so "ab"+"c" !== "a"+"bc"
    h = Math.imul(h ^ 0xff, 0x5bd1e995);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/**
 * Per-slot RNG. An attempt's outcome is a PURE FUNCTION of
 * (seed, cycleId, date, window).
 */
export function slotRng(seed: number, cycleId: string, date: string, windowName: string): () => number {
  return mulberry32(hashSeed(seed, cycleId, date, windowName));
}

// ---------------------------------------------------------------------------
// BANKS — small set for correlated downtime
// ---------------------------------------------------------------------------

const BANKS = ['SBI', 'HDFC', 'ICICI', 'AXIS', 'KOTAK', 'BOB', 'PNB', 'YES'] as const;

// ---------------------------------------------------------------------------
// 2a. makeCustomers
// ---------------------------------------------------------------------------

/**
 * Generate n latent customers with trimodal replenishment-day mixture.
 *
 * Mixture weights:
 *   55% {1,2}    salaried, month start
 *   25% {7,10}   staggered payroll
 *   20% {25,28}  self-employed / receipts-driven
 *
 * CONFOUNDER: ~15% of high-value customers get LOW promiseKeepRate and
 * high cancelPropensity, so amount and recoverability are NOT cleanly
 * correlated. This prevents the dataset from being trivially solvable.
 */
export function makeCustomers(n: number, rng: () => number): LatentCustomer[] {
  const customers: LatentCustomer[] = [];
  for (let i = 0; i < n; i++) {
    const customerId = `cust_${String(i + 1).padStart(4, '0')}`;

    // Trimodal mixture for replenishment day
    const mixDraw = rng();
    let baseDay: number;
    if (mixDraw < 0.55) {
      // 55% chance: salary cluster {1, 2}
      baseDay = rng() < 0.5 ? 1 : 2;
    } else if (mixDraw < 0.80) {
      // 25% chance: staggered payroll {7, 10}
      baseDay = rng() < 0.5 ? 7 : 10;
    } else {
      // 20% chance: self-employed {25, 28}
      baseDay = rng() < 0.5 ? 25 : 28;
    }
    // +/-2 days noise
    const noise = Math.floor(rng() * 5) - 2; // -2, -1, 0, 1, 2
    const replenishmentDay = Math.max(1, Math.min(28, baseDay + noise));

    // Monthly inflow: 20,000 to 200,000 paise (Rs 200 to Rs 2,000)
    const monthlyInflowPaise = Math.floor(rng() * 180000) + 20000;

    // Balance volatility: how fast funds drain (0.05 to 0.25)
    const balanceVolatility = 0.05 + rng() * 0.20;

    // Promise keep rate: 0.3 to 0.9
    let promiseKeepRate = 0.3 + rng() * 0.6;

    // Cancel propensity: 0.01 to 0.06
    let cancelPropensity = 0.01 + rng() * 0.05;

    // CONFOUNDER: ~15% of customers with high inflow get LOW reliability
    const isHighValue = monthlyInflowPaise > 120000;
    if (isHighValue && rng() < 0.15) {
      promiseKeepRate = 0.15 + rng() * 0.20; // 0.15 to 0.35
      cancelPropensity = 0.04 + rng() * 0.04; // 0.04 to 0.08
    }

    // ~4% terminal customers
    const terminalAtCycle = rng() < 0.04
      ? Math.floor(rng() * 6) + 1 // cycle 1-6
      : null;

    // Assign bank
    const bank = BANKS[Math.floor(rng() * BANKS.length)]!;

    customers.push({
      customerId,
      replenishmentDay,
      monthlyInflowPaise,
      balanceVolatility,
      promiseKeepRate,
      cancelPropensity,
      terminalAtCycle,
      bank,
    });
  }
  return customers;
}

// ---------------------------------------------------------------------------
// 2b. makeDowntime — time-correlated bursts
// ---------------------------------------------------------------------------

const WINDOW_NAMES: WindowName[] = ['early', 'midday', 'late'];

/**
 * ~6 bursts per simulated month, 2-10h each. Time-correlated:
 * bursts cluster around certain days (a bank having a bad week).
 *
 * NOT i.i.d. per attempt — this is what makes "retry in a different
 * window" genuinely valuable for some cycles and wasteful for others.
 */
export function makeDowntime(rng: () => number): DowntimeBurst[] {
  const bursts: DowntimeBurst[] = [];
  // Generate 5-8 cluster centers (bad days for specific banks)
  const clusterCount = 5 + Math.floor(rng() * 4); // 5-8

  for (let c = 0; c < clusterCount; c++) {
    const bank = BANKS[Math.floor(rng() * BANKS.length)]!;
    const clusterCenter = Math.floor(rng() * 28) + 1; // day 1-28

    // Each cluster produces 1-3 correlated bursts around the center day
    const burstCount = 1 + Math.floor(rng() * 3);
    for (let b = 0; b < burstCount; b++) {
      const dayOffset = Math.floor(rng() * 3) - 1; // -1, 0, 1
      const day = Math.max(1, Math.min(28, clusterCenter + dayOffset));

      // Affect 1-2 windows
      const primaryWindow = WINDOW_NAMES[Math.floor(rng() * WINDOW_NAMES.length)]!;
      const affected: WindowName[] = [primaryWindow];
      if (rng() < 0.4) {
        // 40% chance of affecting a second window
        const secondIdx = Math.floor(rng() * WINDOW_NAMES.length);
        const secondWindow = WINDOW_NAMES[secondIdx]!;
        if (secondWindow !== primaryWindow) {
          affected.push(secondWindow);
        }
      }

      // Severity 0.0 (total outage) to 0.6 (partial degradation)
      const severity = rng() * 0.6;

      bursts.push({ bank, day, affectedWindows: affected, severity });
    }
  }
  return bursts;
}

// ---------------------------------------------------------------------------
// 2c. balanceOn — exponential decay from replenishment day
// ---------------------------------------------------------------------------

/**
 * balance = monthlyInflow * exp(-volatility * daysSinceReplenishment)
 *
 * Models the common pattern: salary arrives, funds drain over the month.
 * Higher volatility = faster drain = narrower recovery window.
 */
export function balanceOn(customer: LatentCustomer, dayOfMonth: number): number {
  let daysSince = dayOfMonth - customer.replenishmentDay;
  if (daysSince < 0) daysSince += 28; // wrap around month
  return Math.floor(
    customer.monthlyInflowPaise * Math.exp(-customer.balanceVolatility * daysSince)
  );
}

// ---------------------------------------------------------------------------
// 2d + 2e. simulateAttempt — the core simulator
// ---------------------------------------------------------------------------

const DECLINE_CODES_BY_CLASS: Record<DeclineClass, string[]> = {
  BALANCE: ['insufficient_funds', 'limit_exceeded'],
  TRANSIENT: ['bank_technical_error', 'bank_not_available', 'gateway_timeout'],
  AUTH: ['authentication_failed', 'authorisation_declined_by_psp'],
  TERMINAL: ['mandate_revoked', 'account_closed', 'account_frozen'],
  UNKNOWN: [],
};

const ALL_DECLINE_CODES = Object.values(DECLINE_CODES_BY_CLASS).flat();

/** Base gateway failure rate — even with sufficient balance and no downtime. */
const BASE_GATEWAY_FAILURE_RATE = 0.03;

/** Label noise rate — ~20% of decline codes are swapped. */
const LABEL_NOISE_RATE = 0.20;

/**
 * Simulate an attempt outcome.
 *
 * Success requires:
 *   1. Sufficient balance (balance >= amountPaise)
 *   2. No disabling downtime for that (bank, window, day)
 *   3. Not hit by base gateway failure rate
 *
 * On failure, emit trueClass FIRST, then derive declineCode, then apply
 * ~20% label noise (swap code while keeping trueClass unchanged).
 */
export function simulateAttempt(
  customer: LatentCustomer,
  date: ISODate,
  windowName: WindowName,
  amountPaise: number,
  downtime: DowntimeBurst[],
  rng: () => number,
): AttemptOutcome {
  const dayOfMonth = parseInt(date.slice(8, 10), 10);

  // Check if terminal
  // (Terminal state is handled at cycle level, but if we're called
  // on a terminal customer, it's always a terminal failure.)

  // 1. Balance check — models PARTIAL FUNDS
  const balance = balanceOn(customer, dayOfMonth);
  if (balance < amountPaise) {
    // Insufficient funds — but enough for partial?
    // We emit BALANCE class. The key insight: a smaller amount might
    // have succeeded, so amount interacts with timing.
    return emitFailure('BALANCE', rng);
  }

  // 2. Downtime check — look for bursts matching (bank, day, window)
  const relevantBursts = downtime.filter(
    (b) => b.bank === customer.bank && b.day === dayOfMonth && b.affectedWindows.includes(windowName)
  );
  if (relevantBursts.length > 0) {
    // Use worst severity (lowest number = worse)
    const worstSeverity = Math.min(...relevantBursts.map((b) => b.severity));
    // Probability of surviving downtime = severity (0 = total outage, 1 = no effect)
    if (rng() > worstSeverity) {
      return emitFailure('TRANSIENT', rng);
    }
  }

  // 3. Base gateway failure
  if (rng() < BASE_GATEWAY_FAILURE_RATE) {
    return emitFailure('TRANSIENT', rng);
  }

  // Success
  return { success: true, declineCode: null, trueClass: null };
}

/**
 * Emit a failure with the correct trueClass, a plausible declineCode,
 * and ~20% label noise.
 *
 * Label noise (2e): with ~20% probability, replace the declineCode with
 * a DIFFERENT one while leaving trueClass UNCHANGED. This is DELIBERATE:
 * it is the headroom the LLM diagnosis fallback is later measured against.
 */
function emitFailure(trueClass: DeclineClass, rng: () => number): AttemptOutcome {
  const codesForClass = DECLINE_CODES_BY_CLASS[trueClass];
  // Pick a code from the correct class
  let declineCode = codesForClass[Math.floor(rng() * codesForClass.length)]!;

  // 2e. Label noise: ~20% probability of swapping the code
  if (rng() < LABEL_NOISE_RATE) {
    // Pick a random code from a DIFFERENT class
    const otherCodes = ALL_DECLINE_CODES.filter((c) => !codesForClass.includes(c));
    if (otherCodes.length > 0) {
      declineCode = otherCodes[Math.floor(rng() * otherCodes.length)]!;
    }
  }

  return { success: false, declineCode, trueClass };
}
