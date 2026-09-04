import { generateWorld } from '../src/sim/generator';
import { cfKey } from '../src/sim/counterfactual';
import { fixedStrategy, aggressiveStrategy } from '../src/eval/baselines';
import { MAX_ATTEMPTS_PER_CYCLE, getAfaThresholdPaise, WINDOW_NAMES, RECOVERY_GRACE_DAYS, PDN_EXEMPT_MCC } from '../src/config/rules';
import type { EstimationContext } from '../src/types';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

let fixedMisses = 0;
let aggressiveMisses = 0;

for (const event of world.cycleEvents) {
  const mandate = mandateMap.get(event.mandateId)!;
  if (event.firstAttempt.success) continue;

  const ctx: EstimationContext = {
    cycleId: event.cycleId,
    customerId: mandate.customerId,
    amountPaise: mandate.amountPaise,
    mcc: mandate.mcc,
    dueDate: event.dueDate,
    diagnosis: {
      cycleId: event.cycleId,
      class: event.firstAttempt.trueClass || 'UNKNOWN',
      confidence: 1.0,
      source: 'lookup',
      rawCode: event.firstAttempt.declineCode,
      evidence: '',
    },
    promise: null,
    history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
  };

  const isRecoverable = (world.counterfactual.oracleNrvPaise.get(event.cycleId) || 0) > 0;

  // fixed
  let fixedSuccess = false;
  const fSched = fixedStrategy.plan(ctx, MAX_ATTEMPTS_PER_CYCLE.value - 1);
  if (fSched) {
    for (const slot of fSched.slots) {
      if (world.counterfactual.outcomes.get(cfKey(event.cycleId, slot.date, slot.window))) {
        fixedSuccess = true;
        break;
      }
    }
  }
  if (!fixedSuccess && isRecoverable) {
    fixedMisses++;
  }

  // aggressive
  let aggressiveSuccess = false;
  const aSched = aggressiveStrategy.plan(ctx, MAX_ATTEMPTS_PER_CYCLE.value - 1);
  if (aSched) {
    for (const slot of aSched.slots) {
      if (world.counterfactual.outcomes.get(cfKey(event.cycleId, slot.date, slot.window))) {
        aggressiveSuccess = true;
        break;
      }
    }
  }
  if (!aggressiveSuccess && isRecoverable) {
    aggressiveMisses++;
  }
}

console.log(`Fixed missed recoverable cycles: ${fixedMisses}`);
console.log(`Aggressive missed recoverable cycles: ${aggressiveMisses}`);
