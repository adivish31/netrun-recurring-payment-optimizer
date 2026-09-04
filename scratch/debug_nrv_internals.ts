import { computeNrv, NrvParams } from '../src/eval/metrics';
import type { Schedule } from '../src/types';

const params: NrvParams = {
  hazard: 0.02,
  fatigue: 1.6,
  horizon: 6,
  margin: 1.0,
  attemptCostPaise: 200,
  mcc: '1234',
  dueDate: '2026-01-01',
};

const amountPaise = 10000;

const schedule: Schedule = {
  slots: [
    { date: '2026-01-02', window: 'early', pSuccess: 0.4 },
    { date: '2026-01-02', window: 'midday', pSuccess: 0.2 },
    { date: '2026-01-02', window: 'late', pSuccess: 0.1 }
  ],
  expectedNrvPaise: 0,
  breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
  pRecoverThisCycle: 0,
  pMandateSurvives: 1,
};

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

const nSlots = schedule.slots.length;
const leadHours = 24;

let probReachesSlot = 1.0;
for (let stopIdx = 0; stopIdx <= nSlots; stopIdx++) {
  let pPath = 0;
  if (stopIdx < nSlots) {
    pPath = probReachesSlot * schedule.slots[stopIdx]!.pSuccess;
    probReachesSlot = probReachesSlot * (1 - schedule.slots[stopIdx]!.pSuccess);
  } else {
    pPath = probReachesSlot;
  }

  const resolutionHour = stopIdx < nSlots 
    ? getAttemptHour(params.dueDate, schedule.slots[stopIdx]!.date, schedule.slots[stopIdx]!.window)
    : Infinity;

  let pdnsCommitted = 0;
  for (let i = 0; i < nSlots; i++) {
    const slot = schedule.slots[i]!;
    const attemptHour = getAttemptHour(params.dueDate, slot.date, slot.window);
    const sendHour = attemptHour - leadHours;
    if (sendHour <= resolutionHour) {
      pdnsCommitted++;
    }
  }

  let pSurvivesPath = 1.0;
  for (let i = 1; i <= pdnsCommitted; i++) {
    pSurvivesPath *= (1 - params.hazard * Math.pow(params.fatigue, i - 1));
  }

  console.log(`stopIdx: ${stopIdx}, pPath: ${pPath}, resHour: ${resolutionHour}, pdns: ${pdnsCommitted}, pSurvives: ${pSurvivesPath}`);
}
