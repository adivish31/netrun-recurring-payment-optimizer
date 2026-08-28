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
} from '../types';

export const PopulationEstimator: SuccessEstimator = {
  name: 'population',
  pSuccess: (_ctx: EstimationContext, _date: ISODate, _window: WindowName) => {
    throw new Error('not implemented — build order step 6 prerequisite');
  },
};

export const ShrinkageEstimator: SuccessEstimator = {
  name: 'shrinkage',
  pSuccess: (_ctx: EstimationContext, _date: ISODate, _window: WindowName) => {
    throw new Error('not implemented — build order step 8');
  },
};
