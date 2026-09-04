/**
 * NetRun — src/prior/estimator.ts   (spec §16)
 *
 * Observable history ONLY. Latent simulator state must never reach this file.
 *
 * TWO IMPLEMENTATIONS, DELIBERATELY:
 *
 * 1. PopulationEstimator (build FIRST, ~20 min)
 *    Population-level day-of-month distribution, identical for every customer.
 *    This unblocks the optimizer at build-order step 6, which is otherwise
 *    blocked on step 8. Get the whole spine running end to end on this.
 *
 * 2. ShrinkageEstimator (build at step 8)
 *    posterior[d] = (alpha * population_prior[d] + successes[d]) / (alpha + n)
 *    alpha = PRIOR_SHRINKAGE_ALPHA (ASSUMPTION, swept in the history-depth run).
 *
 * The delta between the two IS the measured contribution of personalised
 * timing estimation. Report it as a row in the results table. That is a
 * far better answer to "does your prior actually do anything?" than an
 * assertion.
 */

import type {
  EstimationContext,
  ISODate,
  SuccessEstimator,
  WindowName,
  Mandate,
} from '../types';
import {
  CLASS_STRATEGY,
  PRIOR_SHRINKAGE_ALPHA,
} from '../config/rules';
import type { GeneratedWorld } from '../sim/generator';

// ---------------------------------------------------------------------------
// Population-level day-of-month distribution
// ---------------------------------------------------------------------------

/**
 * Build from observed attempt outcomes across the entire generated world.
 * Applies Laplace smoothing so no day has probability exactly 0 or 1.
 *
 * CRITICAL: reads ONLY observable history. Does NOT import LatentCustomer,
 * DowntimeBurst, or the counterfactual table.
 */
export function buildPopulationPrior(
  world: GeneratedWorld,
): number[] {
  // Count successes and totals per day-of-month (1..28)
  const successes = new Array<number>(29).fill(0); // index 0 unused
  const totals = new Array<number>(29).fill(0);

  const mandateMap = new Map<string, Mandate>(
    world.mandates.map((m) => [m.mandateId, m]),
  );

  for (const event of world.cycleEvents) {
    const dayOfMonth = parseInt(event.dueDate.slice(8, 10), 10);
    totals[dayOfMonth]!++;
    if (event.firstAttempt.success) {
      successes[dayOfMonth]!++;
    }
  }

  // Laplace smoothing: P(day d) = (successes[d] + 1) / (totals[d] + 2)
  const prior = new Array<number>(29).fill(0);
  for (let d = 1; d <= 28; d++) {
    prior[d] = (successes[d]! + 1) / (totals[d]! + 2);
  }

  return prior;
}

export function makePopulationEstimator(world: GeneratedWorld): SuccessEstimator {
  const prior = buildPopulationPrior(world);

  return {
    name: 'population',
    pSuccess: (ctx: EstimationContext, date: ISODate, window: WindowName): number => {
      const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];

      // AUTH / TERMINAL / UNKNOWN -> spendBudget: false, pSuccess irrelevant
      if (!strat.spendBudget) return 0;

      // TRANSIENT -> diversifyWindow: true, usePrior: false
      // Don't concentrate on the prior's peak; return a flat moderate probability
      if (!strat.usePrior && strat.diversifyWindow) {
        // Flat prior: mean of all days
        let sum = 0;
        for (let d = 1; d <= 28; d++) sum += prior[d]!;
        return sum / 28;
      }

      // BALANCE -> usePrior: true, use the day-of-month prior
      const dayOfMonth = parseInt(date.slice(8, 10), 10);
      if (dayOfMonth >= 1 && dayOfMonth <= 28) {
        return prior[dayOfMonth]!;
      }
      // Fallback for edge cases
      return prior[1]!;
    },
  };
}

// Keep the stub exports for backwards compat (ShrinkageEstimator is Task 8)
export const PopulationEstimator: SuccessEstimator = {
  name: 'population',
  pSuccess: (_ctx: EstimationContext, _date: ISODate, _window: WindowName) => {
    throw new Error('Use makePopulationEstimator(world) to create an instance');
  },
};

export function makeShrinkageEstimator(world: GeneratedWorld): SuccessEstimator {
  const prior = buildPopulationPrior(world);
  const alpha = PRIOR_SHRINKAGE_ALPHA.value;

  return {
    name: 'shrinkage',
    pSuccess: (ctx: EstimationContext, date: ISODate, window: WindowName): number => {
      const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];

      if (!strat.spendBudget) return 0;

      if (!strat.usePrior && strat.diversifyWindow) {
        let sum = 0;
        for (let d = 1; d <= 28; d++) sum += prior[d]!;
        return sum / 28;
      }

      const dayOfMonth = parseInt(date.slice(8, 10), 10);
      let pPop = prior[1]!;
      if (dayOfMonth >= 1 && dayOfMonth <= 28) {
        pPop = prior[dayOfMonth]!;
      }

      let successes_d = 0;
      let failures_d = 0;

      for (const d of ctx.history.successDays) {
        if (d === dayOfMonth) successes_d++;
      }
      for (const d of ctx.history.failureDays) {
        if (d === dayOfMonth) failures_d++;
      }
      
      const n = successes_d + failures_d;
      const posterior = (alpha * pPop + successes_d) / (alpha + n);
      return posterior;
    },
  };
}

export function makePromiseEstimator(world: GeneratedWorld): SuccessEstimator {
  const popPrior = buildPopulationPrior(world);
  const alpha = PRIOR_SHRINKAGE_ALPHA.value;
  const { applyPromise } = require('./promise'); // require to avoid circular deps just in case, but let's use a standard import at the top if possible. Wait, let's just require inline for simplicity, or I can import it properly. I will import it at the top.

  return {
    name: 'shrinkage_promise',
    pSuccess: (ctx: EstimationContext, date: ISODate, window: WindowName): number => {
      // Build the customer's prior array dynamically
      const byDayOfMonth = new Array<number>(29).fill(0);
      for (let d = 1; d <= 28; d++) {
         let succ = 0; let fail = 0;
         for (const s of ctx.history.successDays) if (s === d) succ++;
         for (const f of ctx.history.failureDays) if (f === d) fail++;
         const n = succ + fail;
         byDayOfMonth[d] = (alpha * popPrior[d]! + succ) / (alpha + n);
      }
      
      let priorObj = {
         customerId: ctx.customerId,
         byDayOfMonth,
         observations: ctx.history.successDays.length + ctx.history.failureDays.length,
         promiseAdjusted: false,
         estimatorName: 'shrinkage'
      };

      if (ctx.promise) {
        const popKeepRate = 0.5;
        const keepRate = (ctx.history.pastPromisesKept + alpha * popKeepRate) / (ctx.history.pastPromisesMade + alpha);
        priorObj = applyPromise(priorObj, ctx.promise, keepRate);
      }

      const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];
      if (!strat.spendBudget) return 0;
      if (!strat.usePrior && strat.diversifyWindow) {
         let sum = 0;
         for (let d = 1; d <= 28; d++) sum += priorObj.byDayOfMonth[d]!;
         return sum / 28;
      }

      const dayOfMonth = parseInt(date.slice(8, 10), 10);
      return priorObj.byDayOfMonth[dayOfMonth] || priorObj.byDayOfMonth[1]!;
    }
  };
}
