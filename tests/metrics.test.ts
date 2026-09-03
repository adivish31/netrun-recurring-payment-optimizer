import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { computeNrv, NrvParams } from '../src/eval/metrics';
import type { Schedule, Slot } from '../src/types';

describe('computeNrv', () => {
  const params: NrvParams = {
    hazard: 0.02,
    fatigue: 1.6,
    horizon: 6,
    margin: 1.0,
    attemptCostPaise: 200,
    mcc: '1234', // Not exempt
    dueDate: '2026-01-01',
  };

  const amountPaise = 10000; // 100 Rs

  it('Case 1: empty schedule', () => {
    // Empty schedule -> N = 0 slots.
    // stopIdx = 0 (fails all slots).
    // pPath = 1.0
    // attemptsSpent = 0
    // pdnsCommitted = 0
    // pSurvives = 1.0
    // expectedCurrentRecovery = 0
    // expectedFutureValue = 1.0 * (1.0 * 6 * 10000 * 1.0) = 60000
    // expectedInterventionCost = 0
    // expectedChurnCost = 1.0 * (0 * 6 * 10000 * 1.0) = 0
    // Total NRV = 0 + 60000 - 0 - 0 = 60000

    const schedule: Schedule = {
      slots: [],
      expectedNrvPaise: 0,
      breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
      pRecoverThisCycle: 0,
      pMandateSurvives: 1,
    };

    const res = computeNrv(schedule, amountPaise, 0, params);
    assert.strictEqual(res.totalPaise, 60000);
    assert.strictEqual(res.expectedCurrentRecoveryPaise, 0);
    assert.strictEqual(res.expectedFutureValuePaise, 60000);
    assert.strictEqual(res.expectedInterventionCostPaise, 0);
    assert.strictEqual(res.expectedChurnCostPaise, 0);
  });

  it('Case 2: single-slot schedule', () => {
    // 1 slot at 2026-01-02 early, pSuccess = 0.5.
    // 
    // stopIdx = 0 (succeeds):
    //   pPath = 0.5
    //   resolutionHour = 24
    //   attemptsSpent = 1
    //   sendHour = 0 <= 24 -> pdnsCommitted = 1
    //   pSurvives = (1 - 0.02 * 1.6^0) = 0.98
    //   Current = 0.5 * 10000 = 5000
    //   Future = 0.5 * 0.98 * 60000 = 29400
    //   Interv = 0.5 * 200 = 100
    //   Churn = 0.5 * 0.02 * 60000 = 600
    // 
    // stopIdx = 1 (fails):
    //   pPath = 0.5
    //   resolutionHour = Infinity
    //   attemptsSpent = 1
    //   sendHour = 0 <= Infinity -> pdnsCommitted = 1
    //   pSurvives = 0.98
    //   Current = 0
    //   Future = 0.5 * 0.98 * 60000 = 29400
    //   Interv = 0.5 * 200 = 100
    //   Churn = 0.5 * 0.02 * 60000 = 600
    //
    // Totals:
    // Current = 5000
    // Future = 58800
    // Interv = 200
    // Churn = 1200
    // Total NRV = 5000 + 58800 - 200 - 1200 = 62400

    const schedule: Schedule = {
      slots: [
        { date: '2026-01-02', window: 'early', pSuccess: 0.5 }
      ],
      expectedNrvPaise: 0,
      breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
      pRecoverThisCycle: 0,
      pMandateSurvives: 1,
    };

    const res = computeNrv(schedule, amountPaise, 0, params);
    assert.strictEqual(res.expectedCurrentRecoveryPaise, 5000);
    assert.strictEqual(res.expectedFutureValuePaise, 58800);
    assert.strictEqual(res.expectedInterventionCostPaise, 200);
    assert.strictEqual(res.expectedChurnCostPaise, 1200);
    assert.strictEqual(res.totalPaise, 62400);
  });

  it('Case 3: three-slot clustered schedule', () => {
    // 3 slots on 2026-01-02: early (p=0.4), midday (p=0.2), late (p=0.1)
    // 
    // stopIdx = 0 (succeeds at early):
    //   pPath = 0.4
    //   resolutionHour = 24
    //   attemptsSpent = 1
    //   pdnsCommitted:
    //     early: send=0 <= 24 (Yes)
    //     midday: send=13 <= 24 (Yes)
    //     late: send=21.5 <= 24 (Yes)
    //   pdnsCommitted = 3
    //   pSurvives = (1 - 0.02)*(1 - 0.032)*(1 - 0.0512) = 0.98 * 0.968 * 0.9488 = 0.899971136
    //   Current = 0.4 * 10000 = 4000
    //   Future = 0.4 * 0.899971136 * 60000 = 21599.30726
    //   Interv = 0.4 * 1 * 200 = 80
    //   Churn = 0.4 * (1 - 0.899971136) * 60000 = 2400.692736
    // 
    // stopIdx = 1 (succeeds at midday):
    //   pPath = 0.6 * 0.2 = 0.12
    //   resolutionHour = 37
    //   attemptsSpent = 2
    //   pdnsCommitted = 3 (since all send <= 37)
    //   pSurvives = 0.899971136
    //   Current = 0.12 * 10000 = 1200
    //   Future = 0.12 * 0.899971136 * 60000 = 6479.792179
    //   Interv = 0.12 * 2 * 200 = 48
    //   Churn = 0.12 * (1 - 0.899971136) * 60000 = 720.2078208
    //
    // stopIdx = 2 (succeeds at late):
    //   pPath = 0.6 * 0.8 * 0.1 = 0.048
    //   resolutionHour = 45.5
    //   attemptsSpent = 3
    //   pdnsCommitted = 3
    //   pSurvives = 0.899971136
    //   Current = 0.048 * 10000 = 480
    //   Future = 0.048 * 0.899971136 * 60000 = 2591.916872
    //   Interv = 0.048 * 3 * 200 = 28.8
    //   Churn = 0.048 * (1 - 0.899971136) * 60000 = 288.0831283
    //
    // stopIdx = 3 (fails all):
    //   pPath = 0.6 * 0.8 * 0.9 = 0.432
    //   resolutionHour = Infinity
    //   attemptsSpent = 3
    //   pdnsCommitted = 3
    //   pSurvives = 0.899971136
    //   Current = 0
    //   Future = 0.432 * 0.899971136 * 60000 = 23327.25184
    //   Interv = 0.432 * 3 * 200 = 259.2
    //   Churn = 0.432 * (1 - 0.899971136) * 60000 = 2592.748155
    //
    // Totals:
    // Current = 4000 + 1200 + 480 + 0 = 5680
    // Future = 21599.30726 + 6479.792179 + 2591.916872 + 23327.25184 = 53998.26815
    // Interv = 80 + 48 + 28.8 + 259.2 = 416
    // Churn = 2400.692736 + 720.2078208 + 288.0831283 + 2592.748155 = 6001.73184
    // Expected total = 5680 + 53998 - 416 - 6002 = 53260

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

    const res = computeNrv(schedule, amountPaise, 0, params);
    assert.strictEqual(res.expectedCurrentRecoveryPaise, 5680);
    assert.strictEqual(res.expectedFutureValuePaise, 54004); // Corrected hand calculation
    assert.strictEqual(res.expectedInterventionCostPaise, 416);
    assert.strictEqual(res.expectedChurnCostPaise, 5996); // Corrected hand calculation
    assert.strictEqual(res.totalPaise, 53272); // 5680 + 54004 - 416 - 5996
  });

  it('Case 4: three-slot spaced schedule with pdnsAlreadySent > 0', () => {
    // pdnsAlreadySent = 1 (first attempt already happened and failed).
    // schedule: T+1 (2026-01-02 early), T+3 (2026-01-04 early), T+7 (2026-01-08 early)
    // All p=0.5
    //
    // stopIdx = 0 (succeeds at T+1):
    //   pPath = 0.5
    //   resolutionHour = 24
    //   attempts = 1
    //   pdnsCommitted = 1 (since T+3 send=48 > 24)
    //   pSurvives (commits 1 new pdn, starting at idx 1) = (1 - 0.02 * 1.6^1) = 0.968
    //   Current = 0.5 * 10000 = 5000
    //   Future = 0.5 * 0.968 * 60000 = 29040
    //   Interv = 0.5 * 1 * 200 = 100
    //   Churn = 0.5 * (1 - 0.968) * 60000 = 960
    //
    // stopIdx = 1 (succeeds at T+3):
    //   pPath = 0.5 * 0.5 = 0.25
    //   resolutionHour = 72
    //   attempts = 2
    //   pdnsCommitted = 2 (T+1 send=0, T+3 send=48 <= 72, T+7 send=144 > 72)
    //   pSurvives = 0.968 * (1 - 0.02 * 1.6^2) = 0.968 * 0.9488 = 0.9184384
    //   Current = 0.25 * 10000 = 2500
    //   Future = 0.25 * 0.9184384 * 60000 = 13776.576
    //   Interv = 0.25 * 2 * 200 = 100
    //   Churn = 0.25 * (1 - 0.9184384) * 60000 = 1223.424
    //
    // stopIdx = 2 (succeeds at T+7):
    //   pPath = 0.5 * 0.5 * 0.5 = 0.125
    //   resolutionHour = 168
    //   attempts = 3
    //   pdnsCommitted = 3 (T+1, T+3, T+7 send=144 <= 168)
    //   pSurvives = 0.9184384 * (1 - 0.02 * 1.6^3) = 0.9184384 * 0.91808 = 0.843199926
    //   Current = 0.125 * 10000 = 1250
    //   Future = 0.125 * 0.843199926 * 60000 = 6323.99944
    //   Interv = 0.125 * 3 * 200 = 75
    //   Churn = 0.125 * (1 - 0.843199926) * 60000 = 1176.00055
    //
    // stopIdx = 3 (fails all):
    //   pPath = 0.125
    //   resolutionHour = Infinity
    //   attempts = 3
    //   pdnsCommitted = 3
    //   pSurvives = 0.843199926
    //   Current = 0
    //   Future = 0.125 * 0.843199926 * 60000 = 6323.99944
    //   Interv = 0.125 * 3 * 200 = 75
    //   Churn = 0.125 * (1 - 0.843199926) * 60000 = 1176.00055
    //
    // Totals:
    // Current = 5000 + 2500 + 1250 + 0 = 8750
    // Future = 29040 + 13776.576 + 6323.99944 + 6323.99944 = 55464.57488
    // Interv = 100 + 100 + 75 + 75 = 350
    // Churn = 960 + 1223.424 + 1176.00055 + 1176.00055 = 4535.4251
    // Total Expected = 8750 + 55465 - 350 - 4535 = 59330

    const schedule: Schedule = {
      slots: [
        { date: '2026-01-02', window: 'early', pSuccess: 0.5 },
        { date: '2026-01-04', window: 'early', pSuccess: 0.5 },
        { date: '2026-01-08', window: 'early', pSuccess: 0.5 }
      ],
      expectedNrvPaise: 0,
      breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 },
      pRecoverThisCycle: 0,
      pMandateSurvives: 1,
    };

    const res = computeNrv(schedule, amountPaise, 1, params);
    assert.strictEqual(res.expectedCurrentRecoveryPaise, 8750);
    assert.strictEqual(res.expectedFutureValuePaise, 55465); // 55464.57... rounds to 55465
    assert.strictEqual(res.expectedInterventionCostPaise, 350);
    assert.strictEqual(res.expectedChurnCostPaise, 4535); // 4535.42... rounds to 4535
    assert.strictEqual(res.totalPaise, 59329);
  });
});
