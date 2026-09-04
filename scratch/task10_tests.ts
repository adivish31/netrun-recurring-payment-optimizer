import { evaluatePolicy } from '../src/policy/policy-engine';
import type { EstimationContext, Slot } from '../src/types';

function buildCtx(overrides: Partial<EstimationContext> = {}): EstimationContext {
  return {
    cycleId: 'c1',
    customerId: 'u1',
    amountPaise: 50000,
    mcc: '1234',
    dueDate: '2026-01-01',
    diagnosis: {
      cycleId: 'c1',
      class: 'BALANCE',
      confidence: 1.0,
      source: 'lookup',
      rawCode: 'insufficient_funds',
      evidence: 'test',
    },
    promise: null,
    history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
    ...overrides,
  };
}

async function run() {
  console.log("=== Policy Engine Tests ===");

  // 1. over-budget schedule
  const ctx1 = buildCtx();
  const schedule1: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 },
    { date: '2026-01-06', window: 'early', pSuccess: 0.1 },
  ];
  const res1 = evaluatePolicy(ctx1, schedule1, 3); // 3 + 2 = 5 > 4
  console.log(`1. over-budget: ${res1.verdict} (${(res1 as any).rule_id})`);

  // 2. slot in a peak-hour window (invalid window)
  const ctx2 = buildCtx();
  const schedule2: Slot[] = [
    { date: '2026-01-05', window: 'peak_hour' as any, pSuccess: 0.1 },
  ];
  const res2 = evaluatePolicy(ctx2, schedule2, 0);
  console.log(`2. invalid window: ${res2.verdict} (${(res2 as any).rule_id})`);

  // 3. attempt scheduled inside the notice lead time
  const ctx3 = buildCtx({ dueDate: '2026-01-05' });
  const schedule3: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 }, // same day -> < 24h
  ];
  const res3 = evaluatePolicy(ctx3, schedule3, 0);
  console.log(`3. notice lead time: ${res3.verdict} (${(res3 as any).rule_id})`);

  // 4. same violating schedule but with an exempt MCC
  const ctx4 = buildCtx({ dueDate: '2026-01-05', mcc: '4784' }); // FASTag
  const schedule4: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 },
  ];
  const res4 = evaluatePolicy(ctx4, schedule4, 0);
  console.log(`4. exempt MCC: ${res4.verdict} (${(res4 as any).rule_id})`);

  // 5. amount above the MCC-resolved threshold
  const ctx5 = buildCtx({ amountPaise: 20_00_000 }); // default is 15_00_000
  const schedule5: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 },
  ];
  const res5 = evaluatePolicy(ctx5, schedule5, 0);
  console.log(`5. over threshold: ${res5.verdict} (${(res5 as any).rule_id})`);

  // 6. TERMINAL diagnosis
  const ctx6 = buildCtx({
    diagnosis: { ...ctx1.diagnosis, class: 'TERMINAL' },
  });
  const schedule6: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 },
  ];
  const res6 = evaluatePolicy(ctx6, schedule6, 0);
  console.log(`6. TERMINAL diagnosis: ${res6.verdict} (${(res6 as any).rule_id})`);

  // 7. AUTH diagnosis
  const ctx7 = buildCtx({
    diagnosis: { ...ctx1.diagnosis, class: 'AUTH' },
  });
  const schedule7: Slot[] = [
    { date: '2026-01-05', window: 'early', pSuccess: 0.1 },
  ];
  const res7 = evaluatePolicy(ctx7, schedule7, 0);
  console.log(`7. AUTH diagnosis: ${res7.verdict} (${(res7 as any).rule_id})`);
}

run().catch(console.error);
