/**
 * NetRun — src/eval/sensitivity.ts   (spec §31, §32)
 *
 * THE MOST IMPORTANT EXPERIMENT IN THE PROJECT.
 *
 * Almost no student submission publishes a result that says "here is where my
 * approach loses." At a payments company that is the strongest possible signal.
 * Budget real time for this; it is on the never-cut list.
 *
 * Required sweeps:
 *   1. CANCELLATION HAZARD  [0, 0.08]
 *      -> report the BREAK-EVEN: below hazard = X, aggressive wins.
 *         This number goes in the README, the video, and your first answer to
 *         "isn't the hazard made up?" — "Yes. Here is the break-even."
 *   2. DOWNTIME CORRELATION
 *      -> when downtime is i.i.d., window diversification adds ~nothing.
 *   3. HISTORY DEPTH
 *      -> with thin history the prior collapses toward population and NetRun
 *         converges to the fixed baseline.
 *   4. LLM MARGINAL VALUE
 *      -> promise extraction: regex baseline vs LLM, on a held-out split.
 *         If the LLM does not beat regex meaningfully, SAY SO ON CAMERA.
 */

import type { SensitivityPoint } from '../types';

/** TODO(step 7). */
export function sweepHazard(): SensitivityPoint[] {
  throw new Error('not implemented — build order step 7');
}

/** Find the parameter value at which NetRun stops winning. Publish it. */
export function findBreakEven(_points: SensitivityPoint[]): number | null {
  throw new Error('not implemented — build order step 7');
}
