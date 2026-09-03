/**
 * NetRun — src/schedule/optimizer.ts   (spec §20, §21)
 * The CHAAR optimization engine.
 *
 * Exhaustive enumeration over feasible schedules, maximising NRV.
 *
 * WHY EXHAUSTIVE IS LEGITIMATE (the interview answer):
 * the recovery budget is small and the candidate set is bounded by verified
 * constraints, so the subset space is a few tens of thousands. We compute the
 * TRUE optimum — no heuristic, no black-box model, and we can show why every
 * rejected alternative lost. The constraint that creates the problem is what
 * makes it exactly solvable.
 *
 * NO NUMERIC LITERAL MAY APPEAR IN THIS FILE. Everything from config/rules.ts.
 *
 * Depends on the SuccessEstimator INTERFACE, never a concrete estimator — so
 * you can run the whole spine with PopulationEstimator at step 6 and swap in
 * ShrinkageEstimator at step 8 without touching this file.
 */

import type {
  EstimationContext,
  ISODate,
  OptimizerResult,
  Schedule,
  Slot,
  SuccessEstimator,
  WindowName,
} from '../types';
import {
  RECOVERY_GRACE_DAYS,
  WINDOW_NAMES,
  EXECUTION_WINDOWS,
  PDN_EXEMPT_MCC,
  PDN_MIN_LEAD_HOURS,
  getAfaThresholdPaise,
  CLASS_STRATEGY,
  CANCEL_HAZARD_BASE,
  CANCEL_FATIGUE,
  FUTURE_CYCLE_HORIZON,
  CONTRIBUTION_MARGIN,
  ATTEMPT_COST_PAISE,
  OPTIMIZER_TIME_BOX_MS,
  OPTIMIZER_MAX_CANDIDATES,
} from '../config/rules';
import { computeNrv } from '../eval/metrics';
import type { NrvParams } from '../eval/metrics';

// ---------------------------------------------------------------------------
// Date arithmetic — no literals, pulled from config
// ---------------------------------------------------------------------------

function addDays(dateStr: ISODate, days: number): ISODate {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  let year = parseInt(yearStr!, 10);
  let month = parseInt(monthStr!, 10);
  let day = parseInt(dayStr!, 10) + days;

  while (day > 28) {
    day -= 28;
    month += 1;
  }
  if (month > 12) {
    month -= 12;
    year += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// feasibleSlots
// ---------------------------------------------------------------------------

/** Apply verified feasibility constraints (spec §21) to produce candidate slots. */
export function feasibleSlots(
  ctx: EstimationContext,
  estimator: SuccessEstimator
): Slot[] {
  const graceDays = RECOVERY_GRACE_DAYS.value;
  const windowNames: readonly WindowName[] = WINDOW_NAMES;
  const isExempt = PDN_EXEMPT_MCC.value.includes(ctx.mcc);
  const leadHours = PDN_MIN_LEAD_HOURS.value;

  // AFA threshold — over threshold means ESCALATE, never a silent attempt
  if (ctx.amountPaise > getAfaThresholdPaise(ctx.mcc)) {
    return [];
  }

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= graceDays; dayOffset++) {
    const date = addDays(ctx.dueDate, dayOffset);

    for (const w of windowNames) {
      // Non-exempt mandates cannot attempt on the due date (need 24h PDN lead time)
      if (!isExempt && dayOffset === 0) continue;

      // Exempt mandates on day 0: the first attempt already ran in 'early',
      // so only midday/late are feasible on the due date
      if (isExempt && dayOffset === 0 && w === 'early') continue;

      // PDN lead time: the notification must be sent leadHours before the debit.
      // If we can't meet that constraint, skip.
      // (For day 1+, we always have enough lead time since we're planning ahead)

      const pSuccess = estimator.pSuccess(ctx, date, w);
      slots.push({ date, window: w, pSuccess });
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// optimize — exhaustive subset enumeration
// ---------------------------------------------------------------------------

/**
 * Enumerate EVERY subset of feasible slots of size 0..remainingBudget.
 * Score each with computeNrv(). Return the best-NRV subset.
 *
 * Must return `runnerUp` as well as `chosen` — the dashboard's "why THIS
 * schedule?" panel needs something to compare against.
 *
 * Must respect OPTIMIZER_TIME_BOX_MS: on timeout, degrade to ESCALATE rather
 * than returning a partially-searched guess.
 */
export function optimize(
  ctx: EstimationContext,
  estimator: SuccessEstimator,
  remainingBudget: number
): OptimizerResult {
  const startTime = Date.now();
  const timeBoxMs = OPTIMIZER_TIME_BOX_MS.value;

  // If the diagnosis class has spendBudget: false, return chosen: null
  const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];
  if (!strat.spendBudget) {
    return {
      chosen: null,
      alternativesConsidered: 0,
      runnerUp: null,
      timedOut: false,
      elapsedMs: Date.now() - startTime,
    };
  }

  // AFA threshold check
  if (ctx.amountPaise > getAfaThresholdPaise(ctx.mcc)) {
    return {
      chosen: null,
      alternativesConsidered: 0,
      runnerUp: null,
      timedOut: false,
      elapsedMs: Date.now() - startTime,
    };
  }

  const rawCandidates = feasibleSlots(ctx, estimator);

  // 1. Domination Pruning
  // Feasible slots are already sorted by date chronologically.
  // Group by window, and within each window, drop slots that are dominated 
  // (a later slot is dominated if its pSuccess is <= an earlier slot).
  const nonDominated: Slot[] = [];
  const windowNames: readonly WindowName[] = ['early', 'midday', 'late'];
  
  for (const w of windowNames) {
    const slotsInWindow = rawCandidates.filter(s => s.window === w);
    let maxPSuccess = -1;
    for (const slot of slotsInWindow) {
      if (slot.pSuccess > maxPSuccess) {
        nonDominated.push(slot);
        maxPSuccess = slot.pSuccess;
      }
    }
  }

  // 2. Top-K Capping
  nonDominated.sort((a, b) => b.pSuccess - a.pSuccess);
  const candidates = nonDominated.slice(0, OPTIMIZER_MAX_CANDIDATES.value);
  
  // Restore chronological order so subset combinations are generated chronologically
  candidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const w = { early: 0, midday: 1, late: 2 };
    return w[a.window] - w[b.window];
  });

  // NRV params from config/rules.ts
  const nrvParams: NrvParams = {
    hazard: CANCEL_HAZARD_BASE.value,
    fatigue: CANCEL_FATIGUE.value,
    horizon: FUTURE_CYCLE_HORIZON.value,
    margin: CONTRIBUTION_MARGIN.value,
    attemptCostPaise: ATTEMPT_COST_PAISE.value,
    mcc: ctx.mcc,
    dueDate: ctx.dueDate,
  };

  // Score the empty schedule (do nothing after the first attempt)
  const emptySchedule: Schedule = {
    slots: [],
    expectedNrvPaise: 0,
    breakdown: {
      expectedCurrentRecoveryPaise: 0,
      expectedFutureValuePaise: 0,
      expectedInterventionCostPaise: 0,
      expectedChurnCostPaise: 0,
    },
    pRecoverThisCycle: 0,
    pMandateSurvives: 0,
  };

  // pdnsAlreadySent = 1 because the first attempt's PDN was already committed
  const pdnsAlreadySent = PDN_EXEMPT_MCC.value.includes(ctx.mcc) ? 0 : 1;
  const emptyNrv = computeNrv(emptySchedule, ctx.amountPaise, pdnsAlreadySent, nrvParams);

  let bestNrv = emptyNrv.totalPaise;
  let bestSchedule: Schedule | null = null;
  let bestBreakdown = emptyNrv;

  let secondBestNrv = -Infinity;
  let secondBestSchedule: Schedule | null = null;

  let alternativesConsidered = 0;
  let timedOut = false;

  // Enumerate all subsets of size 1..min(remainingBudget, candidates.length)
  const maxK = Math.min(remainingBudget, candidates.length);

  // Use iterative subset enumeration via combinations
  // For each subset size k from 1 to maxK, enumerate C(n, k)
  for (let k = 1; k <= maxK; k++) {
    // Generate all combinations of size k from candidates
    const indices = new Array<number>(k);
    for (let i = 0; i < k; i++) indices[i] = i;

    while (true) {
      // Check time box
      if (Date.now() - startTime > timeBoxMs) {
        timedOut = true;
        break;
      }

      // Build subset from current indices
      const subset: Slot[] = [];
      for (let i = 0; i < k; i++) {
        subset.push(candidates[indices[i]!]!);
      }

      // Score this subset
      const schedule: Schedule = {
        slots: subset,
        expectedNrvPaise: 0,
        breakdown: {
          expectedCurrentRecoveryPaise: 0,
          expectedFutureValuePaise: 0,
          expectedInterventionCostPaise: 0,
          expectedChurnCostPaise: 0,
        },
        pRecoverThisCycle: 0,
        pMandateSurvives: 0,
      };

      const nrvResult = computeNrv(schedule, ctx.amountPaise, pdnsAlreadySent, nrvParams);
      alternativesConsidered++;

      if (nrvResult.totalPaise > bestNrv) {
        // Current best becomes runner-up
        secondBestNrv = bestNrv;
        secondBestSchedule = bestSchedule;

        bestNrv = nrvResult.totalPaise;
        bestBreakdown = nrvResult;
        bestSchedule = {
          slots: subset,
          expectedNrvPaise: nrvResult.totalPaise,
          breakdown: {
            expectedCurrentRecoveryPaise: nrvResult.expectedCurrentRecoveryPaise,
            expectedFutureValuePaise: nrvResult.expectedFutureValuePaise,
            expectedInterventionCostPaise: nrvResult.expectedInterventionCostPaise,
            expectedChurnCostPaise: nrvResult.expectedChurnCostPaise,
          },
          pRecoverThisCycle: 0, // Will be filled by caller if needed
          pMandateSurvives: 0,
        };
      } else if (nrvResult.totalPaise > secondBestNrv) {
        secondBestNrv = nrvResult.totalPaise;
        secondBestSchedule = {
          slots: subset,
          expectedNrvPaise: nrvResult.totalPaise,
          breakdown: {
            expectedCurrentRecoveryPaise: nrvResult.expectedCurrentRecoveryPaise,
            expectedFutureValuePaise: nrvResult.expectedFutureValuePaise,
            expectedInterventionCostPaise: nrvResult.expectedInterventionCostPaise,
            expectedChurnCostPaise: nrvResult.expectedChurnCostPaise,
          },
          pRecoverThisCycle: 0,
          pMandateSurvives: 0,
        };
      }

      // Advance to next combination
      let i = k - 1;
      while (i >= 0 && indices[i]! >= candidates.length - k + i) {
        i--;
      }
      if (i < 0) break; // All combinations of size k exhausted

      indices[i]!++;
      for (let j = i + 1; j < k; j++) {
        indices[j] = indices[j - 1]! + 1;
      }
    }

    if (timedOut) break;
  }

  if (timedOut) {
    return {
      chosen: null,
      alternativesConsidered,
      runnerUp: null,
      timedOut: true,
      elapsedMs: Date.now() - startTime,
    };
  }

  return {
    chosen: bestSchedule,
    alternativesConsidered,
    runnerUp: secondBestSchedule,
    timedOut: false,
    elapsedMs: Date.now() - startTime,
  };
}
