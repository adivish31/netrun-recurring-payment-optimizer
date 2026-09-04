/**
 * NetRun — src/eval/baselines.ts   (spec §29)
 *
 * BUILD THESE BEFORE THE OPTIMIZER (build order step 4). Two reasons:
 *   1. They force the Strategy interface into existence, so the optimizer
 *      slots in as just another strategy rather than as special-cased code.
 *   2. If you run out of time, four baselines + an oracle is still a real
 *      evaluation result. An optimizer with nothing to compare it to is not.
 */

import type { Schedule, StrategyName, EstimationContext, Slot, ISODate, WindowName, SuccessEstimator } from '../types';
import {
  PDN_EXEMPT_MCC,
  getAfaThresholdPaise,
  CLASS_STRATEGY,
  RECOVERY_GRACE_DAYS,
  WINDOW_NAMES,
} from '../config/rules';
import type { CounterfactualTable } from '../sim/counterfactual';
import { cfKey } from '../sim/counterfactual';
import { optimize } from '../schedule/optimizer';

export interface Strategy {
  name: StrategyName;
  plan(ctx: EstimationContext, remainingBudget: number): Schedule | null;
}

// ---------------------------------------------------------------------------
// Shared Date Arithmetic
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
// Shared Constraints Helper
// ---------------------------------------------------------------------------

function canRetry(ctx: EstimationContext, remainingBudget: number): boolean {
  if (remainingBudget <= 0) return false;
  if (ctx.amountPaise > getAfaThresholdPaise(ctx.mcc)) return false;
  const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];
  if (!strat || !strat.spendBudget) return false;
  return true;
}

function earliestOffset(ctx: EstimationContext): number {
  return PDN_EXEMPT_MCC.value.includes(ctx.mcc) ? 0 : 1;
}

function buildSchedule(slots: Slot[]): Schedule {
  return {
    slots,
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
}

// ---------------------------------------------------------------------------
// Baseline 1: Fixed
// ---------------------------------------------------------------------------

export const fixedStrategy: Strategy = {
  name: 'fixed',
  plan: (ctx, remainingBudget) => {
    if (!canRetry(ctx, remainingBudget)) return null;

    const minOffset = earliestOffset(ctx);
    const graceDays = RECOVERY_GRACE_DAYS.value;
    const offsets = [1, 3, 7].filter(o => o >= minOffset && o <= graceDays);
    
    const slots: Slot[] = [];
    for (const offset of offsets) {
      if (slots.length >= remainingBudget) break;
      slots.push({
        date: addDays(ctx.dueDate, offset),
        window: 'early', // Fixed typically just fires off in the early morning
        pSuccess: 0,
      });
    }

    if (slots.length === 0) return null;
    return buildSchedule(slots);
  },
};

// ---------------------------------------------------------------------------
// Baseline 2: Aggressive
// ---------------------------------------------------------------------------

export const aggressiveStrategy: Strategy = {
  name: 'aggressive',
  plan: (ctx, remainingBudget) => {
    if (!canRetry(ctx, remainingBudget)) return null;

    const minOffset = earliestOffset(ctx);
    const graceDays = RECOVERY_GRACE_DAYS.value;
    
    const slots: Slot[] = [];
    for (let offset = minOffset; offset <= graceDays; offset++) {
      const date = addDays(ctx.dueDate, offset);
      for (const w of WINDOW_NAMES) {
        // If it's day 0 (exempt), and we evaluate after early window, 
        // we can schedule midday or late. We assume evaluation is after early.
        if (offset === 0 && w === 'early') continue;

        if (slots.length >= remainingBudget) break;
        slots.push({
          date,
          window: w,
          pSuccess: 0,
        });
      }
      if (slots.length >= remainingBudget) break;
    }

    if (slots.length === 0) return null;
    return buildSchedule(slots);
  },
};

// ---------------------------------------------------------------------------
// Baseline 3: Rules Only
// ---------------------------------------------------------------------------

export const rulesOnlyStrategy: Strategy = {
  name: 'rules_only',
  plan: (ctx, remainingBudget) => {
    if (!canRetry(ctx, remainingBudget)) return null;

    const minOffset = earliestOffset(ctx);
    const graceDays = RECOVERY_GRACE_DAYS.value;
    const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];
    
    const slots: Slot[] = [];
    if (strat.diversifyWindow) {
      // TRANSIENT: try next available windows
      let count = 0;
      for (let offset = minOffset; offset <= graceDays && count < remainingBudget; offset++) {
        const date = addDays(ctx.dueDate, offset);
        for (const w of WINDOW_NAMES) {
          if (offset === 0 && w === 'early') continue;
          if (count >= remainingBudget) break;
          slots.push({ date, window: w, pSuccess: 0 });
          count++;
        }
      }
    } else {
      // BALANCE: behave like fixed (T+1, T+3, T+7)
      const offsets = [1, 3, 7].filter(o => o >= minOffset && o <= graceDays);
      for (const offset of offsets) {
        if (slots.length >= remainingBudget) break;
        slots.push({
          date: addDays(ctx.dueDate, offset),
          window: 'early',
          pSuccess: 0,
        });
      }
    }

    if (slots.length === 0) return null;
    return buildSchedule(slots);
  },
};

// ---------------------------------------------------------------------------
// Baseline 4: Oracle
// ---------------------------------------------------------------------------

export function makeOracleStrategy(cfTable: CounterfactualTable): Strategy {
  return {
    name: 'oracle',
    plan: (ctx, remainingBudget) => {
      if (!canRetry(ctx, remainingBudget)) return null;

      const minOffset = earliestOffset(ctx);
      const graceDays = RECOVERY_GRACE_DAYS.value;
      
      const slots: Slot[] = [];
      // Oracle scans and picks the FIRST slot that succeeds
      for (let offset = minOffset; offset <= graceDays; offset++) {
        const date = addDays(ctx.dueDate, offset);
        for (const w of WINDOW_NAMES) {
          if (offset === 0 && w === 'early') continue;
          
          const key = cfKey(ctx.cycleId, date, w);
          if (cfTable.outcomes.get(key)) {
            slots.push({ date, window: w, pSuccess: 1 });
            return buildSchedule(slots);
          }
        }
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Strategy 5: NetRun (optimizer-backed)
// ---------------------------------------------------------------------------

export interface NetrunStrategy extends Strategy {
  lastResult: import('../types').OptimizerResult | null;
}

export function makeNetrunStrategy(estimator: SuccessEstimator): NetrunStrategy {
  return {
    name: 'netrun',
    lastResult: null,
    plan(ctx: EstimationContext, remainingBudget: number): Schedule | null {
      const result = optimize(ctx, estimator, remainingBudget);
      this.lastResult = result;
      return result.chosen;
    },
  };
}

export function makeNetrunShrinkageStrategy(estimator: SuccessEstimator): NetrunStrategy {
  return {
    name: 'netrun_shrinkage',
    lastResult: null,
    plan(ctx: EstimationContext, remainingBudget: number): Schedule | null {
      const result = optimize(ctx, estimator, remainingBudget);
      this.lastResult = result;
      return result.chosen;
    },
  };
}

export function makeNetrunPromiseStrategy(estimator: SuccessEstimator): NetrunStrategy {
  return {
    name: 'netrun_promise',
    lastResult: null,
    plan(ctx: EstimationContext, remainingBudget: number): Schedule | null {
      const result = optimize(ctx, estimator, remainingBudget);
      this.lastResult = result;
      return result.chosen;
    },
  };
}
