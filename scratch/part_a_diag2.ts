import { generateWorld } from '../src/sim/generator';
import type { EstimationContext, Schedule } from '../src/types';
import {
  PDN_EXEMPT_MCC,
  CANCEL_HAZARD_BASE,
  CANCEL_FATIGUE,
  FUTURE_CYCLE_HORIZON,
  CONTRIBUTION_MARGIN,
  ATTEMPT_COST_PAISE,
} from '../src/config/rules';
import { makeNetrunStrategy } from '../src/eval/baselines';
import { makePopulationEstimator } from '../src/prior/estimator';
import { optimize, feasibleSlots } from '../src/schedule/optimizer';
import { computeNrv } from '../src/eval/metrics';
import type { Slot } from '../src/types';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const estimator = makePopulationEstimator(world);
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

const strategy4 = makeNetrunStrategy(estimator);
const chosen1: { ctx: EstimationContext, pdns: number, chosenSlots: any[] }[] = [];

for (const event of world.cycleEvents) {
  if (event.firstAttempt.success) continue;
  
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
  const pdnsAlreadySent = PDN_EXEMPT_MCC.value.includes(mandate.mcc) ? 0 : 1;

  const res4 = strategy4.plan(ctx, 3);
  const size4 = res4 ? res4.slots.length : 0;
  if (size4 === 1 && chosen1.length < 1) {
    chosen1.push({ ctx, pdns: pdnsAlreadySent, chosenSlots: res4!.slots });
  }
}

if (chosen1.length > 0) {
  const item = chosen1[0]!;
  console.log(`\n--- Part A.2: Trace one cycle ---`);
  const cands = feasibleSlots(item.ctx, estimator);
  console.log(`Cycle ${item.ctx.cycleId}: max budget=4 (remaining 3)`);
  console.log(`Candidates length: ${cands.length}`);
  
  const res = optimize(item.ctx, estimator, 3);
  console.log(`Alternatives considered: ${res.alternativesConsidered}`);
  const n1 = cands.length;
  const n2 = n1 * (n1 - 1) / 2;
  const n3 = n1 * (n1 - 1) * (n1 - 2) / 6;
  console.log(`C(n,1)=${n1}, C(n,2)=${n2}, C(n,3)=${n3}. Total for 1..3 = ${n1+n2+n3}`);
  
  console.log('\n--- Part A.3: Marginal slot NRV analysis ---');
  const nrvParams = {
    mcc: item.ctx.mcc,
    dueDate: item.ctx.dueDate,
    hazard: CANCEL_HAZARD_BASE.value,
    fatigue: CANCEL_FATIGUE.value,
    horizon: FUTURE_CYCLE_HORIZON.value,
    margin: CONTRIBUTION_MARGIN.value,
    attemptCostPaise: ATTEMPT_COST_PAISE.value,
  };

  function score(slots: Slot[]) {
    const schedule: Schedule = {
      slots, expectedNrvPaise: 0,
      breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
      pRecoverThisCycle: 0, pMandateSurvives: 0,
    };
    return computeNrv(schedule, item.ctx.amountPaise, item.pdns, nrvParams as any).totalPaise;
  }

  let best1 = -Infinity;
  for(let a=0; a<cands.length; a++) {
    const n = score([cands[a]!]);
    if (n > best1) best1 = n;
  }
  let best2 = -Infinity;
  for(let a=0; a<cands.length-1; a++) {
    for(let b=a+1; b<cands.length; b++) {
      const n = score([cands[a]!, cands[b]!]);
      if (n > best2) best2 = n;
    }
  }
  let best3 = -Infinity;
  for(let a=0; a<cands.length-2; a++) {
    for(let b=a+1; b<cands.length-1; b++) {
      for(let c=b+1; c<cands.length; c++) {
        const n = score([cands[a]!, cands[b]!, cands[c]!]);
        if (n > best3) best3 = n;
      }
    }
  }
  let best4 = -Infinity;
  for(let a=0; a<cands.length-3; a++) {
    for(let b=a+1; b<cands.length-2; b++) {
      for(let c=b+1; c<cands.length-1; c++) {
        for(let d=c+1; d<cands.length; d++) {
          const n = score([cands[a]!, cands[b]!, cands[c]!, cands[d]!]);
          if (n > best4) best4 = n;
        }
      }
    }
  }
  console.log(`Cycle ${item.ctx.cycleId}: Best 1-slot NRV = ${(best1/100).toFixed(2)}, Best 2-slot NRV = ${(best2/100).toFixed(2)}, Best 3-slot NRV = ${(best3/100).toFixed(2)}, Best 4-slot NRV = ${(best4/100).toFixed(2)}`);
}
