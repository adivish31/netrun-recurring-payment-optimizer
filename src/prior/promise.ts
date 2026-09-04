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
import { PROMISE_WEIGHT_CAP } from '../config/rules';

export function applyPromise(
  prior: SuccessPrior,
  promise: PromiseToPay,
  keepRate: number
): SuccessPrior {
  if (!promise.promisedDate || promise.intent !== 'will_pay') {
    return prior;
  }

  const promisedDay = parseInt(promise.promisedDate.slice(8, 10), 10);
  if (isNaN(promisedDay) || promisedDay < 1 || promisedDay > 28) {
    return prior;
  }

  const weight = Math.min(keepRate, PROMISE_WEIGHT_CAP.value);
  const byDayOfMonth = [...prior.byDayOfMonth];

  for (let d = 1; d <= 28; d++) {
    if (d === promisedDay) {
      byDayOfMonth[d] = (1 - weight) * (byDayOfMonth[d] || 0) + weight;
    } else {
      byDayOfMonth[d] = (1 - weight) * (byDayOfMonth[d] || 0);
    }
  }

  return {
    ...prior,
    byDayOfMonth,
    promiseAdjusted: true,
  };
}
