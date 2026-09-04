import { generateWorld } from '../src/sim/generator';
import type { EstimationContext, Schedule } from '../src/types';
import {
  PDN_EXEMPT_MCC,
  CANCEL_HAZARD_BASE,
  CANCEL_FATIGUE,
  FUTURE_CYCLE_HORIZON,
  CONTRIBUTION_MARGIN,
  ATTEMPT_COST_PAISE,
  OPTIMIZER_MAX_CANDIDATES,
  CLASS_STRATEGY,
} from '../src/config/rules';
import { makePopulationEstimator } from '../src/prior/estimator';
import { feasibleSlots } from '../src/schedule/optimizer';
import { computeNrv } from '../src/eval/metrics';
import type { Slot } from '../src/types';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const estimator = makePopulationEstimator(world);
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

const nrvParams = {
  hazard: CANCEL_HAZARD_BASE.value,
  fatigue: CANCEL_FATIGUE.value,
  horizon: FUTURE_CYCLE_HORIZON.value,
  margin: CONTRIBUTION_MARGIN.value,
  attemptCostPaise: ATTEMPT_COST_PAISE.value,
  mcc: '',
  dueDate: '',
};

function runSearch(ctx: EstimationContext, cands: Slot[], remainingBudget: number) {
  nrvParams.mcc = ctx.mcc;
  nrvParams.dueDate = ctx.dueDate;
  const pdnsAlreadySent = PDN_EXEMPT_MCC.value.includes(ctx.mcc) ? 0 : 1;
  const emptySchedule: Schedule = {
    slots: [], expectedNrvPaise: 0,
    breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
    pRecoverThisCycle: 0, pMandateSurvives: 0,
  };
  const emptyNrv = computeNrv(emptySchedule, ctx.amountPaise, pdnsAlreadySent, nrvParams as any);
  
  let bestNrv = emptyNrv.totalPaise;
  const bestNrvBySize = new Map<number, number>();
  bestNrvBySize.set(0, bestNrv);

  const maxK = Math.min(remainingBudget, cands.length);
  let totalSubsetsScored = 0;

  for (let k = 1; k <= maxK; k++) {
    const indices = new Array<number>(k);
    for (let i = 0; i < k; i++) indices[i] = i;
    
    let bestForSize = -Infinity;

    while (true) {
      const subset: Slot[] = [];
      for (let i = 0; i < k; i++) subset.push(cands[indices[i]!]!);

      const schedule: Schedule = {
        slots: subset, expectedNrvPaise: 0,
        breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
        pRecoverThisCycle: 0, pMandateSurvives: 0,
      };

      const nrvResult = computeNrv(schedule, ctx.amountPaise, pdnsAlreadySent, nrvParams as any);
      totalSubsetsScored++;

      if (nrvResult.totalPaise > bestNrv) {
        bestNrv = nrvResult.totalPaise;
      }
      if (nrvResult.totalPaise > bestForSize) {
        bestForSize = nrvResult.totalPaise;
      }

      let i = k - 1;
      while (i >= 0 && indices[i] === cands.length - k + i) i--;
      if (i < 0) break;
      indices[i]!++;
      for (let j = i + 1; j < k; j++) indices[j] = (indices[j - 1] as number) + 1;
    }
    bestNrvBySize.set(k, bestForSize);
  }

  // To find chosen size, we find the smallest k that achieved bestNrv
  let chosenSize = 0;
  for (let k = 0; k <= maxK; k++) {
    if (bestNrvBySize.get(k) === bestNrv) {
      chosenSize = k;
      break;
    }
  }

  return { bestNrv, chosenSize, bestNrvBySize, totalSubsetsScored, maxK };
}

console.log('1. Distribution of chosen schedule size (0 to 4 slots) at budget 2 and 4');
// Note: chosen schedule size is the size of the subset + 1 (for the initial attempt).
// Or does "chosen size" mean the subset size?
// The prompt says "count of cycles choosing 0, 1, 2, 3, 4 slots".
// I'll output the subset sizes (0 to 4).
const distBudget2 = [0, 0, 0, 0, 0];
const distBudget4 = [0, 0, 0, 0, 0];

const targetCycles: EstimationContext[] = [];

for (const event of world.cycleEvents) {
  if (event.firstAttempt.success) continue;
  
  const mandate = mandateMap.get(event.mandateId)!;
  const ctx: EstimationContext = {
    cycleId: event.cycleId, customerId: mandate.customerId, amountPaise: mandate.amountPaise, mcc: mandate.mcc, dueDate: event.dueDate,
    diagnosis: { cycleId: event.cycleId, class: event.firstAttempt.trueClass || 'UNKNOWN', confidence: 1.0, source: 'lookup', rawCode: event.firstAttempt.declineCode, evidence: '' },
    promise: null, history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
  };

  const strat = CLASS_STRATEGY.value[ctx.diagnosis.class];
  if (!strat.spendBudget) continue;

  const rawCandidates = feasibleSlots(ctx, estimator);
  const nonDominated: Slot[] = [];
  for (const w of ['early', 'midday', 'late'] as const) {
    const slotsInWindow = rawCandidates.filter(s => s.window === w);
    let maxP = -1;
    for (const slot of slotsInWindow) {
      if (slot.pSuccess > maxP) {
        nonDominated.push(slot);
        maxP = slot.pSuccess;
      }
    }
  }
  nonDominated.sort((a, b) => b.pSuccess - a.pSuccess);
  const prunedCandidates = nonDominated.slice(0, 18);
  prunedCandidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const w = { early: 0, midday: 1, late: 2 };
    return w[a.window] - w[b.window];
  });

  const res2 = runSearch(ctx, prunedCandidates, 1);
  distBudget2[res2.chosenSize] = (distBudget2[res2.chosenSize] || 0) + 1;

  const res4 = runSearch(ctx, prunedCandidates, 3);
  distBudget4[res4.chosenSize] = (distBudget4[res4.chosenSize] || 0) + 1;

  if (targetCycles.length < 10) {
    targetCycles.push(ctx);
  }
}

console.log('Budget 2:');
console.log('Subset Size | Count');
distBudget2.forEach((count, i) => console.log(`          ${i} | ${count}`));

console.log('\nBudget 4:');
console.log('Subset Size | Count');
distBudget4.forEach((count, i) => console.log(`          ${i} | ${count}`));


console.log('\n2. Single cycle deep dive (budget 4)');
if (targetCycles.length > 0) {
  const ctx = targetCycles[0]!;
  const rawCandidates = feasibleSlots(ctx, estimator);
  const nonDominated: Slot[] = [];
  for (const w of ['early', 'midday', 'late'] as const) {
    const slotsInWindow = rawCandidates.filter(s => s.window === w);
    let maxP = -1;
    for (const slot of slotsInWindow) {
      if (slot.pSuccess > maxP) { nonDominated.push(slot); maxP = slot.pSuccess; }
    }
  }
  nonDominated.sort((a, b) => b.pSuccess - a.pSuccess);
  const prunedCandidates = nonDominated.slice(0, 18);
  prunedCandidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const w = { early: 0, midday: 1, late: 2 };
    return w[a.window] - w[b.window];
  });

  const res4 = runSearch(ctx, prunedCandidates, 3);
  
  console.log(`- number of feasible slots after pruning: ${prunedCandidates.length}`);
  console.log(`- max subset size actually enumerated: ${res4.maxK}`);
  console.log(`- total subsets scored: ${res4.totalSubsetsScored}`);
  console.log(`Confirm subsets of size 3 and 4 were among them:`);
  console.log(`Size 3 scored? ${res4.bestNrvBySize.has(3) ? 'Yes' : 'No'}`);
  console.log(`Size 4 scored? ${res4.bestNrvBySize.has(4) ? 'Yes' : 'No (maxK is 3)'}`);
}

console.log('\n3. NRV comparison table for 10 cycles');
console.log('cycleId | chosen size | chosen NRV | best 2-slot NRV | best 3-slot NRV | best 4-slot NRV');

for (const ctx of targetCycles) {
  const rawCandidates = feasibleSlots(ctx, estimator);
  const nonDominated: Slot[] = [];
  for (const w of ['early', 'midday', 'late'] as const) {
    const slotsInWindow = rawCandidates.filter(s => s.window === w);
    let maxP = -1;
    for (const slot of slotsInWindow) {
      if (slot.pSuccess > maxP) { nonDominated.push(slot); maxP = slot.pSuccess; }
    }
  }
  nonDominated.sort((a, b) => b.pSuccess - a.pSuccess);
  const prunedCandidates = nonDominated.slice(0, 18);
  prunedCandidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const w = { early: 0, midday: 1, late: 2 };
    return w[a.window] - w[b.window];
  });

  // To get the best 4-slot NRV, we must pass remainingBudget = 4.
  // The chosen size and NRV for budget 4 is based on remainingBudget = 3.
  const res3 = runSearch(ctx, prunedCandidates, 3);
  const res4 = runSearch(ctx, prunedCandidates, 4);

  const format = (n: number | undefined) => n === undefined ? 'N/A' : (n / 100).toFixed(2);
  const chosenSize = res3.chosenSize;
  const chosenNrv = res3.bestNrv;
  const best2 = res4.bestNrvBySize.get(2);
  const best3 = res4.bestNrvBySize.get(3);
  const best4 = res4.bestNrvBySize.get(4);

  console.log(`${ctx.cycleId.padEnd(7)} | ${chosenSize.toString().padEnd(11)} | ${format(chosenNrv).padEnd(10)} | ${format(best2).padEnd(15)} | ${format(best3).padEnd(15)} | ${format(best4)}`);
}
