import { generateWorld } from '../src/sim/generator';
import type { EstimationContext, StrategyName } from '../src/types';
import {
  getAfaThresholdPaise,
  WINDOW_NAMES,
  RECOVERY_GRACE_DAYS,
  PDN_EXEMPT_MCC,
  PDN_MIN_LEAD_HOURS,
  CANCEL_HAZARD_BASE,
  CANCEL_FATIGUE,
  FUTURE_CYCLE_HORIZON,
  CONTRIBUTION_MARGIN,
  ATTEMPT_COST_PAISE,
} from '../src/config/rules';
import { cfKey } from '../src/sim/counterfactual';
import { makeNetrunStrategy } from '../src/eval/baselines';
import type { NetrunStrategy } from '../src/eval/baselines';
import { makePopulationEstimator } from '../src/prior/estimator';

function daysBetween(d1: string, d2: string): number {
  const y1 = (d1.charCodeAt(0) - 48) * 1000 + (d1.charCodeAt(1) - 48) * 100 + (d1.charCodeAt(2) - 48) * 10 + (d1.charCodeAt(3) - 48);
  const m1 = (d1.charCodeAt(5) - 48) * 10 + (d1.charCodeAt(6) - 48);
  const day1 = (d1.charCodeAt(8) - 48) * 10 + (d1.charCodeAt(9) - 48);
  const y2 = (d2.charCodeAt(0) - 48) * 1000 + (d2.charCodeAt(1) - 48) * 100 + (d2.charCodeAt(2) - 48) * 10 + (d2.charCodeAt(3) - 48);
  const m2 = (d2.charCodeAt(5) - 48) * 10 + (d2.charCodeAt(6) - 48);
  const day2 = (d2.charCodeAt(8) - 48) * 10 + (d2.charCodeAt(9) - 48);
  
  const totalDays1 = (y1 * 12 * 28) + (m1 * 28) + day1;
  const totalDays2 = (y2 * 12 * 28) + (m2 * 28) + day2;
  return totalDays2 - totalDays1;
}

function getAttemptHour(dueDate: string, slotDate: string, window: string): number {
  const days = daysBetween(dueDate, slotDate);
  let hour = days * 24;
  if (window === 'early') hour += 0;
  else if (window === 'midday') hour += 13;
  else if (window === 'late') hour += 21.5;
  return hour;
}

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const estimator = makePopulationEstimator(world);
const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));
const graceDays = RECOVERY_GRACE_DAYS.value;
const horizon = FUTURE_CYCLE_HORIZON.value;

async function run() {
  for (const budget of [2, 4, 7]) {
    console.log(`\nEvaluating budget=${budget}...`);
    const strategy = makeNetrunStrategy(estimator);
    
    let totalAttempts = 0;
    let totalTimeouts = 0;
    let ruleViolations = 0;
    
    let nrvCurrent = 0;
    let nrvFuture = 0;
    let nrvInterv = 0;
    let nrvChurn = 0;
    let totalGross = 0;

    for (const event of world.cycleEvents) {
      const mandate = mandateMap.get(event.mandateId)!;

      let cycleAttempts = 0;
      let cyclePdns = 0;
      let cycleGross = 0;

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

      cycleAttempts++;
      cyclePdns += PDN_EXEMPT_MCC.value.includes(mandate.mcc) ? 0 : 1;

      if (event.firstAttempt.success) {
        cycleGross += mandate.amountPaise;
      } else {
        const schedule = strategy.plan(ctx, budget - 1);
        
        if (strategy.lastResult?.timedOut) {
          totalTimeouts++;
        }

        if (schedule && schedule.slots.length > 0) {
          if (schedule.slots.length > budget - 1) ruleViolations++;
          if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) ruleViolations++;

          const exempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);
          const leadHours = PDN_MIN_LEAD_HOURS.value;

          let successIdx = schedule.slots.length;
          for (let i = 0; i < schedule.slots.length; i++) {
            const slot = schedule.slots[i]!;
            if (!WINDOW_NAMES.includes(slot.window as any)) ruleViolations++;
            const daysElapsed = daysBetween(event.dueDate, slot.date);
            if (daysElapsed < 0 || daysElapsed > graceDays) ruleViolations++;
            if (!exempt && daysElapsed < 1) ruleViolations++;
            if (exempt && daysElapsed === 0 && slot.window === 'early') ruleViolations++;
            
            const key = cfKey(event.cycleId, slot.date, slot.window as any);
            if (world.counterfactual.outcomes.get(key)) {
              successIdx = i;
              break;
            }
          }

          const resolutionHour = successIdx < schedule.slots.length 
            ? getAttemptHour(event.dueDate, schedule.slots[successIdx]!.date, schedule.slots[successIdx]!.window)
            : Infinity;

          for (let i = 0; i < schedule.slots.length; i++) {
            const slot = schedule.slots[i]!;
            if (i <= successIdx) cycleAttempts++;
            if (!exempt) {
              const sendHour = getAttemptHour(event.dueDate, slot.date, slot.window) - leadHours;
              if (sendHour <= resolutionHour) cyclePdns++;
            }
          }

          if (successIdx < schedule.slots.length) {
            cycleGross += mandate.amountPaise;
          }
        }
      }

      totalAttempts += cycleAttempts;
      totalGross += cycleGross;

      // NRV maths
      let pSurvives = 1.0;
      for (let i = 1; i <= cyclePdns; i++) {
        pSurvives *= (1 - CANCEL_HAZARD_BASE.value * Math.pow(CANCEL_FATIGUE.value, i - 1));
      }

      const margin = CONTRIBUTION_MARGIN.value;
      const attemptCost = ATTEMPT_COST_PAISE.value;
      nrvCurrent += cycleGross * margin;
      nrvFuture += pSurvives * horizon * mandate.amountPaise * margin;
      nrvInterv += cycleAttempts * attemptCost;
      nrvChurn += (1 - pSurvives) * horizon * mandate.amountPaise * margin;
    }

    const nrv = nrvCurrent + nrvFuture - nrvInterv - nrvChurn;
    const meanAttempts = totalAttempts / world.cycleEvents.length;

    console.log(`Budget=${budget}:`);
    console.log(`  mean attempts: ${meanAttempts.toFixed(2)}`);
    console.log(`  NRV (h=6)    : ₹${(nrv/100).toFixed(2)}`);
    console.log(`  violations   : ${ruleViolations}`);
    console.log(`  timeouts     : ${totalTimeouts}`);
  }
}

run();
