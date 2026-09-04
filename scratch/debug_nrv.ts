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

console.log(computeNrv(schedule, amountPaise, 0, params));
