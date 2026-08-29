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
  OptimizerResult,
  Slot,
  SuccessEstimator,
} from '../types';

/** Apply verified feasibility constraints (spec §21) to produce candidate slots. */
export function feasibleSlots(
  _ctx: EstimationContext,
  _estimator: SuccessEstimator
): Slot[] {
  throw new Error('not implemented — build order step 6');
}

/**
 * TODO(step 6).
 * Must return `runnerUp` as well as `chosen` — the dashboard's "why THIS
 * schedule?" panel needs something to compare against, and "here is the
 * second-best plan and why it lost" is a strong 15 seconds of demo.
 *
 * Must respect OPTIMIZER_TIME_BOX_MS: on timeout, degrade to ESCALATE rather
 * than returning a partially-searched guess.
 */
export function optimize(
  _ctx: EstimationContext,
  _estimator: SuccessEstimator,
  _remainingBudget: number
): OptimizerResult {
  throw new Error('not implemented — build order step 6');
}
