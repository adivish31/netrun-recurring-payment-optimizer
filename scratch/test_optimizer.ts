import { generateWorld } from '../src/sim/generator';
import { makePopulationEstimator } from '../src/prior/estimator';
import { optimize, feasibleSlots } from '../src/schedule/optimizer';
import type { EstimationContext } from '../src/types';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const estimator = makePopulationEstimator(world);
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

// Test on 10 cycles
let totalElapsed = 0;
let maxElapsed = 0;
let totalAlts = 0;
let maxAlts = 0;
let timeouts = 0;

for (let i = 0; i < 10; i++) {
  const event = world.cycleEvents[i]!;
  const mandate = mandateMap.get(event.mandateId)!;

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

  const fs = feasibleSlots(ctx, estimator);
  console.log(`Cycle ${i}: class=${event.firstAttempt.trueClass}, feasible=${fs.length}`);

  const result = optimize(ctx, estimator, 3);
  console.log(`  elapsed=${result.elapsedMs}ms, alts=${result.alternativesConsidered}, timedOut=${result.timedOut}, chosen=${result.chosen ? result.chosen.slots.length + ' slots' : 'null'}`);
  
  totalElapsed += result.elapsedMs;
  maxElapsed = Math.max(maxElapsed, result.elapsedMs);
  totalAlts += result.alternativesConsidered;
  maxAlts = Math.max(maxAlts, result.alternativesConsidered);
  if (result.timedOut) timeouts++;
}

console.log(`\nSummary: mean=${(totalElapsed/10).toFixed(1)}ms, max=${maxElapsed}ms, meanAlts=${(totalAlts/10).toFixed(0)}, maxAlts=${maxAlts}, timeouts=${timeouts}`);
