/**
 * NetRun — src/prior/promise.ts   (spec §19)
 *
 * How an extracted Promise-to-Pay modifies the prior.
 *
 * Weight the shift by the customer's OWN observed keep-rate
 * (pastPromisesKept / pastPromisesMade, shrunk toward the population rate),
 * capped at PROMISE_WEIGHT_CAP.
 *
 * That cap is a safety property, not a tuning knob: it means a confident or
 * manipulative message can never fully override observed behaviour. It is your
 * answer to "what if a customer just lies to your LLM?" — the promise is
 * evidence weighted by that customer's track record, not an instruction.
 */

import type { PromiseToPay, SuccessPrior } from '../types';

/** TODO(step 9). Pure function — unit-test with a zero keep-rate customer. */
export function applyPromise(
  _prior: SuccessPrior,
  _promise: PromiseToPay,
  _keepRate: number
): SuccessPrior {
  throw new Error('not implemented — build order step 9');
}
