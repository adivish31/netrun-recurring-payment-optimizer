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

const distBudget2 = [0, 0, 0, 0, 0, 0, 0, 0];
const distBudget4 = [0, 0, 0, 0, 0, 0, 0, 0];

const strategy2 = makeNetrunStrategy(estimator);
const strategy4 = makeNetrunStrategy(estimator);

const budget4Chosen2: { ctx: EstimationContext, pdns: number, chosenSlots: any[] }[] = [];

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

  const res2 = strategy2.plan(ctx, 1);
  const size2 = res2 ? res2.slots.length : 0;
  distBudget2[size2] = (distBudget2[size2] || 0) + 1;

  const res4 = strategy4.plan(ctx, 3);
  const size4 = res4 ? res4.slots.length : 0;
  distBudget4[size4] = (distBudget4[size4] || 0) + 1;

  if (size4 === 2 && budget4Chosen2.length < 10) {
    budget4Chosen2.push({ ctx, pdns: pdnsAlreadySent, chosenSlots: res4!.slots });
  }
}

console.log('--- Part A.1: Distribution of |chosen| ---');
console.log('Budget 2:', distBudget2);
console.log('Budget 4:', distBudget4);

console.log('\n--- Part A.2: Trace one cycle ---');
if (budget4Chosen2.length > 0) {
  const ctx = budget4Chosen2[0]!.ctx;
  const cands = feasibleSlots(ctx, estimator);
  console.log(`Cycle ${ctx.cycleId}: max budget=4 (remaining 3)`);
  console.log(`Candidates length: ${cands.length}`);
  
  const res = optimize(ctx, estimator, 3);
  console.log(`Alternatives considered: ${res.alternativesConsidered}`);
  const n1 = cands.length;
  const n2 = n1 * (n1 - 1) / 2;
  const n3 = n1 * (n1 - 1) * (n1 - 2) / 6;
  console.log(`C(n,1)=${n1}, C(n,2)=${n2}, C(n,3)=${n3}. Total for 1..3 = ${n1+n2+n3}`);
}

console.log('\n--- Part A.3: Marginal slot NRV analysis ---');
const nrvParams = {
  mcc: '0000',
  dueDate: '',
  hazard: CANCEL_HAZARD_BASE.value,
  fatigue: CANCEL_FATIGUE.value,
  horizon: FUTURE_CYCLE_HORIZON.value,
  margin: CONTRIBUTION_MARGIN.value,
  attemptCostPaise: ATTEMPT_COST_PAISE.value,
};

function score(ctx: EstimationContext, pdns: number, slots: Slot[]) {
  const schedule: Schedule = {
    slots,
    expectedNrvPaise: 0,
    breakdown: {
      expectedCurrentRecoveryPaise: 0,
      expectedFutureValuePaise: 0,
      expectedInterventionCostPaise: 0,
      expectedChurnCostPaise: 0,
    },
    pRecoverThisCycle: 0,
    pMandateSurvives: 0,
  };
  nrvParams.mcc = ctx.mcc;
  nrvParams.dueDate = ctx.dueDate;
  return computeNrv(schedule, ctx.amountPaise, pdns, nrvParams as any).totalPaise;
}

for (let i = 0; i < budget4Chosen2.length; i++) {
  const item = budget4Chosen2[i]!;
  const cands = feasibleSlots(item.ctx, estimator);
  
  let best2 = -Infinity;
  for(let a=0; a<cands.length-1; a++) {
    for(let b=a+1; b<cands.length; b++) {
      const n = score(item.ctx, item.pdns, [cands[a]!, cands[b]!]);
      if (n > best2) best2 = n;
    }
  }

  let best3 = -Infinity;
  for(let a=0; a<cands.length-2; a++) {
    for(let b=a+1; b<cands.length-1; b++) {
      for(let c=b+1; c<cands.length; c++) {
        const n = score(item.ctx, item.pdns, [cands[a]!, cands[b]!, cands[c]!]);
        if (n > best3) best3 = n;
      }
    }
  }

  let best4 = -Infinity;
  for(let a=0; a<cands.length-3; a++) {
    for(let b=a+1; b<cands.length-2; b++) {
      for(let c=b+1; c<cands.length-1; c++) {
        for(let d=c+1; d<cands.length; d++) {
          const n = score(item.ctx, item.pdns, [cands[a]!, cands[b]!, cands[c]!, cands[d]!]);
          if (n > best4) best4 = n;
        }
      }
    }
  }

  console.log(`Cycle ${i+1}: Best 2-slot NRV = ${(best2/100).toFixed(2)}, Best 3-slot NRV = ${(best3/100).toFixed(2)}, Best 4-slot NRV = ${(best4/100).toFixed(2)}`);
}
