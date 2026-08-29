/**
 * NetRun — src/eval/metrics.ts   (spec §22, §30)
 *
 * THE NRV FORMULATION LIVES HERE AND NOWHERE ELSE.
 * Spec §22: "The implementation must document the exact mathematical
 * formulation. Do not hide assumptions." Copy this docblock into METRICS.md
 * verbatim so the README and the code cannot drift apart.
 *
 *   NRV(schedule)
 *     = P(recover this cycle | schedule) * amount * margin        [current]
 *     + P(mandate survives | schedule) * horizon * amount * margin [future]
 *     - |schedule| * attempt_cost                                  [intervention]
 *     - (1 - P(survives)) * horizon * amount * margin              [churn]
 *
 *   P(recover | S)  = 1 - PROD_{s in S} (1 - p(s))
 *   P(survives | S) = PROD_{i=1..|S|} (1 - hazard * fatigue^(pdns_sent + i - 1))
 *
 * Every parameter comes from config/rules.ts. hazard and fatigue are
 * ASSUMPTIONs — the churn term is the whole reason NRV differs from gross
 * recovery, so the hazard sweep is not optional (spec §23, §31).
 *
 * All arithmetic in integer paise. Round ONCE, at the end, with Math.round.
 */

import type { Schedule, StrategyResult, SensitivityPoint } from '../types';

export interface NrvParams {
  hazard: number;
  fatigue: number;
  horizon: number;
  margin: number;
  attemptCostPaise: number;
}

/** TODO(step 5). Pure function. Unit-test it against hand-computed cases. */
export function computeNrv(
  _schedule: Schedule,
  _amountPaise: number,
  _pdnsAlreadySent: number,
  _params: NrvParams
): Schedule['breakdown'] & { totalPaise: number } {
  throw new Error('not implemented — build order step 5');
}

/** TODO(step 4/7). */
export function summarise(): StrategyResult {
  throw new Error('not implemented');
}

export type { SensitivityPoint };
