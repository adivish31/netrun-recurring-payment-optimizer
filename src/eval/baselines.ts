/**
 * NetRun — src/eval/baselines.ts   (spec §29)
 *
 * BUILD THESE BEFORE THE OPTIMIZER (build order step 4). Two reasons:
 *   1. They force the Strategy interface into existence, so the optimizer
 *      slots in as just another strategy rather than as special-cased code.
 *   2. If you run out of time, four baselines + an oracle is still a real
 *      evaluation result. An optimizer with nothing to compare it to is not.
 */

import type { Schedule, StrategyName } from '../types';
import type { EstimationContext } from '../types';

/** Every strategy — including NetRun — implements exactly this. */
export interface Strategy {
  name: StrategyName;
  plan(ctx: EstimationContext, remainingBudget: number): Schedule | null;
}

/** Baseline 1 — fixed offsets from the due date, e.g. T+1 / T+3 / T+7.
 *  What most systems actually do. The honest thing to beat. */
export const fixedStrategy: Strategy = {
  name: 'fixed',
  plan: () => {
    throw new Error('not implemented — build order step 4');
  },
};

/** Baseline 2 — spend the entire budget as early as permitted.
 *  THE IMPORTANT ONE. It should beat NetRun on gross recovery and lose on NRV.
 *  If it does not, either the churn model is inert or the thesis is wrong —
 *  and you must report that outcome honestly. */
export const aggressiveStrategy: Strategy = {
  name: 'aggressive',
  plan: () => {
    throw new Error('not implemented — build order step 4');
  },
};

/** Baseline 3 — decline-code lookup only: no prior, no promise.
 *  Isolates the modelling contribution from the constraint handling. */
export const rulesOnlyStrategy: Strategy = {
  name: 'rules_only',
  plan: () => {
    throw new Error('not implemented — build order step 4');
  },
};

/** Baseline 4 — oracle. Reads the counterfactual table.
 *  The ceiling, which is BELOW 100% because of terminal customers. */
export const oracleStrategy: Strategy = {
  name: 'oracle',
  plan: () => {
    throw new Error('not implemented — build order step 4');
  },
};
