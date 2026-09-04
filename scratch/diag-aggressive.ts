/**
 * Diagnostic for aggressive vs fixed strategy attempt usage
 * Run: npx ts-node scratch/diag-aggressive.ts
 */
import { generateWorld } from '../src/sim/generator';
import type { EstimationContext } from '../src/types';
import {
  MAX_ATTEMPTS_PER_CYCLE,
  getAfaThresholdPaise,
  WINDOW_NAMES,
  RECOVERY_GRACE_DAYS,
  PDN_EXEMPT_MCC,
} from '../src/config/rules';
import { cfKey } from '../src/sim/counterfactual';
import { fixedStrategy, aggressiveStrategy } from '../src/eval/baselines';

function daysBetween(d1: string, d2: string): number {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const totalDays1 = (y1! * 12 * 28) + (m1! * 28) + day1!;
  const totalDays2 = (y2! * 12 * 28) + (m2! * 28) + day2!;
  return totalDays2 - totalDays1;
}

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const maxBudget = MAX_ATTEMPTS_PER_CYCLE.value;
const graceDays = RECOVERY_GRACE_DAYS.value;
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

const aggressiveDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '>4': 0 };
const fixedDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '>4': 0 };

const aggressiveShortfallCauses = {
  terminalOrAuth: 0,
  outOfFeasibleSlots: 0,
  escalatedAFA: 0,
  other: 0,
};

let totalFeasibleSlots = 0;
let validCyclesCount = 0;

for (const event of world.cycleEvents) {
  const mandate = mandateMap.get(event.mandateId)!;
  const isExempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);

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

  // calculate feasible slots
  let feasibleCount = 0;
  for (let offset = (isExempt ? 0 : 1); offset <= graceDays; offset++) {
    for (const w of WINDOW_NAMES) {
      if (offset === 0 && w === 'early') continue;
      feasibleCount++;
    }
  }
  totalFeasibleSlots += feasibleCount;
  validCyclesCount++;

  // fixed
  let fixedAttempts = 1;
  if (!event.firstAttempt.success) {
    const fixedSched = fixedStrategy.plan(ctx, maxBudget - 1);
    if (fixedSched) {
      for (const slot of fixedSched.slots) {
        fixedAttempts++;
        const key = cfKey(event.cycleId, slot.date, slot.window);
        if (world.counterfactual.outcomes.get(key)) break;
      }
    }
  }
  const fCount = Math.min(fixedAttempts, 5);
  (fixedDist as any)[fCount === 5 ? '>4' : fCount]++;

  // aggressive
  let aggressiveAttempts = 1;
  if (!event.firstAttempt.success) {
    const aggSched = aggressiveStrategy.plan(ctx, maxBudget - 1);
    if (aggSched) {
      for (const slot of aggSched.slots) {
        aggressiveAttempts++;
        const key = cfKey(event.cycleId, slot.date, slot.window);
        if (world.counterfactual.outcomes.get(key)) break;
      }
    } else {
      // shortfall
      if (ctx.diagnosis.class === 'TERMINAL' || ctx.diagnosis.class === 'AUTH') {
        aggressiveShortfallCauses.terminalOrAuth++;
      } else if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) {
        aggressiveShortfallCauses.escalatedAFA++;
      } else {
        aggressiveShortfallCauses.other++;
      }
    }
    
    // what if it didn't succeed, why did it stop? 
    // Wait, shortfall means (it used less than the FULL BUDGET WITHOUT SUCCEEDING)
    if (aggSched) {
      let succeeded = false;
      for (const slot of aggSched.slots) {
        const key = cfKey(event.cycleId, slot.date, slot.window);
        if (world.counterfactual.outcomes.get(key)) {
          succeeded = true;
          break;
        }
      }
      if (!succeeded && aggressiveAttempts < maxBudget) {
        // It failed all attempts, but didn't use maxBudget. Why?
        if (aggSched.slots.length < maxBudget - 1) {
           // slots returned were fewer than remaining budget
           if (feasibleCount < maxBudget - 1) {
             aggressiveShortfallCauses.outOfFeasibleSlots++;
           } else {
             aggressiveShortfallCauses.other++;
           }
        }
      }
    }
  }
  const aCount = Math.min(aggressiveAttempts, 5);
  (aggressiveDist as any)[aCount === 5 ? '>4' : aCount]++;
}

console.log('--- FIXED ATTEMPTS DIST ---');
console.log(fixedDist);
console.log('--- AGGRESSIVE ATTEMPTS DIST ---');
console.log(aggressiveDist);
console.log('--- AGGRESSIVE SHORTFALL CAUSES ---');
console.log(aggressiveShortfallCauses);
console.log(`Average feasible slots per cycle: ${(totalFeasibleSlots / validCyclesCount).toFixed(2)}`);
