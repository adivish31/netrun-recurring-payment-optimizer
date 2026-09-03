/**
 * NetRun — src/eval/metrics.ts   (spec §22, §30)
 *
 * THE NRV FORMULATION LIVES HERE AND NOWHERE ELSE.
 * Spec §22: "The implementation must document the exact mathematical
 * formulation. Do not hide assumptions." Copy this docblock into METRICS.md
 * verbatim so the README and the code cannot drift apart.
 *
 *   NRV(schedule)
 *     = P(recover this cycle | schedule) * amount * margin        [current]
 *     + P(mandate survives | schedule) * horizon * amount * margin [future]
 *     - |schedule| * attempt_cost                                  [intervention]
 *     - (1 - P(survives)) * horizon * amount * margin              [churn]
 *
 *   P(recover | S)  = 1 - PROD_{s in S} (1 - p(s))
 *   P(survives | S) = PROD_{i=1..|S|} (1 - hazard * fatigue^(pdns_sent + i - 1))
 *
 * Every parameter comes from config/rules.ts. hazard and fatigue are
 * ASSUMPTIONs — the churn term is the whole reason NRV differs from gross
 * recovery, so the hazard sweep is not optional (spec §23, §31).
 *
 * All arithmetic in integer paise. Round ONCE, at the end, with Math.round.
 */

import type { Schedule, StrategyResult, SensitivityPoint } from '../types';

export interface NrvParams {
  hazard: number;
  fatigue: number;
  horizon: number;
  margin: number;
  attemptCostPaise: number;
  mcc: string;
  dueDate: string; // ISODate
}

function daysBetween(d1: string, d2: string): number {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const totalDays1 = (y1! * 12 * 28) + (m1! * 28) + day1!;
  const totalDays2 = (y2! * 12 * 28) + (m2! * 28) + day2!;
  return totalDays2 - totalDays1;
}

function getAttemptHour(dueDate: string, slotDate: string, window: 'early' | 'midday' | 'late' | string): number {
  const days = daysBetween(dueDate, slotDate);
  let hour = days * 24;
  if (window === 'early') hour += 0;
  else if (window === 'midday') hour += 13;
  else if (window === 'late') hour += 21.5;
  return hour;
}

/** TODO(step 5). Pure function. Unit-test it against hand-computed cases. */
/** Pure function. Unit-test it against hand-computed cases. */
export function computeNrv(
  schedule: Schedule,
  amountPaise: number,
  pdnsAlreadySent: number,
  params: NrvParams
): Schedule['breakdown'] & { totalPaise: number } {
  // We evaluate the schedule as a probability tree.
  // There are |S| + 1 paths: succeeds at slot 0, succeeds at slot 1... or fails all slots.
  const nSlots = schedule.slots.length;
  
  // Exempt check
  const isExempt = ['4784', '7412'].includes(params.mcc); // From PDN_EXEMPT_MCC
  const leadHours = 24; // From PDN_MIN_LEAD_HOURS

  let expectedCurrentRecovery = 0;
  let expectedFutureValue = 0;
  let expectedInterventionCost = 0;
  let expectedChurnCost = 0;

  let probReachesSlot = 1.0;

  // We will iterate through each possible stopping point.
  // Stop at slot i (it succeeded). Or if i === nSlots, it failed completely.
  for (let stopIdx = 0; stopIdx <= nSlots; stopIdx++) {
    let pPath = 0;
    
    if (stopIdx < nSlots) {
      // Succeeds at stopIdx
      const slot = schedule.slots[stopIdx]!;
      pPath = probReachesSlot * slot.pSuccess;
      probReachesSlot = probReachesSlot * (1 - slot.pSuccess);
    } else {
      // Failed all slots
      pPath = probReachesSlot;
    }

    if (pPath === 0) continue;

    const resolutionHour = stopIdx < nSlots 
      ? getAttemptHour(params.dueDate, schedule.slots[stopIdx]!.date, schedule.slots[stopIdx]!.window)
      : Infinity;

    // How many attempts spent on this path?
    const attemptsSpent = Math.min(stopIdx + 1, nSlots);

    // How many PDNs committed on this path?
    let pdnsCommitted = 0;
    if (!isExempt) {
      for (let i = 0; i < nSlots; i++) {
        const slot = schedule.slots[i]!;
        const attemptHour = getAttemptHour(params.dueDate, slot.date, slot.window);
        const sendHour = attemptHour - leadHours;
        if (sendHour <= resolutionHour) {
          pdnsCommitted++;
        }
      }
    }

    // Calculate P(survives | path)
    let pSurvivesPath = 1.0;
    for (let i = 1; i <= pdnsCommitted; i++) {
      pSurvivesPath *= (1 - params.hazard * Math.pow(params.fatigue, pdnsAlreadySent + i - 1));
    }

    // Add to expectations
    if (stopIdx < nSlots) {
      expectedCurrentRecovery += pPath * amountPaise * params.margin;
    }
    
    expectedFutureValue += pPath * (pSurvivesPath * params.horizon * amountPaise * params.margin);
    expectedInterventionCost += pPath * (attemptsSpent * params.attemptCostPaise);
    expectedChurnCost += pPath * ((1 - pSurvivesPath) * params.horizon * amountPaise * params.margin);
  }

  const current = expectedCurrentRecovery;
  const future = expectedFutureValue;
  const interv = expectedInterventionCost;
  const churn = expectedChurnCost;
  const total = current + future - interv - churn;

  return {
    expectedCurrentRecoveryPaise: Math.round(current),
    expectedFutureValuePaise: Math.round(future),
    expectedInterventionCostPaise: Math.round(interv),
    expectedChurnCostPaise: Math.round(churn),
    totalPaise: Math.round(total),
  };
}

/** TODO(step 4/7). */
export function summarise(): StrategyResult {
  throw new Error('not implemented');
}

export type { SensitivityPoint };
