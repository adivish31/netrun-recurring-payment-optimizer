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
} from '../src/config/rules';
import { makePopulationEstimator } from '../src/prior/estimator';
import { feasibleSlots } from '../src/schedule/optimizer';
import { computeNrv } from '../src/eval/metrics';
import type { Slot } from '../src/types';
import * as assert from 'assert';

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
  let bestSchedule: Schedule | null = null;
  const maxK = Math.min(remainingBudget, cands.length);

  for (let k = 1; k <= maxK; k++) {
    const indices = new Array<number>(k);
    for (let i = 0; i < k; i++) indices[i] = i;

    while (true) {
      const subset: Slot[] = [];
      for (let i = 0; i < k; i++) subset.push(cands[indices[i]!]!);

      const schedule: Schedule = {
        slots: subset, expectedNrvPaise: 0,
        breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
        pRecoverThisCycle: 0, pMandateSurvives: 0,
      };

      const nrvResult = computeNrv(schedule, ctx.amountPaise, pdnsAlreadySent, nrvParams as any);
      if (nrvResult.totalPaise > bestNrv) {
        bestNrv = nrvResult.totalPaise;
        bestSchedule = schedule;
      }

      let i = k - 1;
      while (i >= 0 && indices[i] === cands.length - k + i) i--;
      if (i < 0) break;
      indices[i]!++;
      for (let j = i + 1; j < k; j++) indices[j] = (indices[j - 1] as number) + 1;
    }
  }
  return bestSchedule;
}

console.log('Testing pruning logic on budget=4 (remaining 3) for all non-successful cycles...');
let tested = 0;
for (const event of world.cycleEvents) {
  if (event.firstAttempt.success) continue;
  
  const mandate = mandateMap.get(event.mandateId)!;
  const ctx: EstimationContext = {
    cycleId: event.cycleId, customerId: mandate.customerId, amountPaise: mandate.amountPaise, mcc: mandate.mcc, dueDate: event.dueDate,
    diagnosis: { cycleId: event.cycleId, class: event.firstAttempt.trueClass || 'UNKNOWN', confidence: 1.0, source: 'lookup', rawCode: event.firstAttempt.declineCode, evidence: '' },
    promise: null, history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
  };

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
  const prunedCandidates = nonDominated.slice(0, OPTIMIZER_MAX_CANDIDATES.value);
  prunedCandidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const w = { early: 0, midday: 1, late: 2 };
    return w[a.window] - w[b.window];
  });

  const bestRaw = runSearch(ctx, rawCandidates, 3);
  const bestPruned = runSearch(ctx, prunedCandidates, 3);

  const strRaw = bestRaw ? bestRaw.slots.map(s => `${s.date}:${s.window}`).join(',') : 'null';
  const strPruned = bestPruned ? bestPruned.slots.map(s => `${s.date}:${s.window}`).join(',') : 'null';
  
  assert.strictEqual(strRaw, strPruned, `Mismatch on cycle ${ctx.cycleId}! raw=${strRaw} pruned=${strPruned}`);
  tested++;
}

console.log(`Success! Pruning logic verified on ${tested} cycles. Chosen schedules match exactly.`);
