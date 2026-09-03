/**
 * NetRun — src/eval/run.ts
 *
 * Entry point for evaluating strategies against the simulated world.
 * Run: npm run eval
 */

import { generateWorld } from '../sim/generator';
import type { EstimationContext, StrategyName } from '../types';
import {
  MAX_ATTEMPTS_PER_CYCLE,
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
} from '../config/rules';
import { cfKey } from '../sim/counterfactual';
import { fixedStrategy, aggressiveStrategy, rulesOnlyStrategy, makeOracleStrategy } from './baselines';

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

function runEval(horizon: number = FUTURE_CYCLE_HORIZON.value) {
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
  const oracleStrategy = makeOracleStrategy(world.counterfactual);

  const strategies = [
    fixedStrategy,
    aggressiveStrategy,
    rulesOnlyStrategy,
    oracleStrategy,
  ];

  const results: Record<StrategyName, any> = {} as any;
  const maxBudget = MAX_ATTEMPTS_PER_CYCLE.value;
  const graceDays = RECOVERY_GRACE_DAYS.value;

  // Build maps
  const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

  for (const strategy of strategies) {
    let grossRecovered = 0;
    let attemptsSpent = 0;
    let pdnsSent = 0;
    let terminalCorrectlySkipped = 0;
    let escalations = 0;
    let ruleViolations = 0;
    let noActionRecovery = 0;

    let nrvCurrent = 0;
    let nrvFuture = 0;
    let nrvInterv = 0;
    let nrvChurn = 0;
    
    let pdnsPerCycleDist = [0, 0, 0, 0, 0, 0];

    for (const event of world.cycleEvents) {
      const mandate = mandateMap.get(event.mandateId)!;
      noActionRecovery += world.counterfactual.noActionRecoveryPaise.get(event.cycleId) || 0;

      let cycleGross = 0;
      let cycleAttempts = 0;
      let cyclePdns = 0;

      // Base context
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

      // First attempt is always spent
      cycleAttempts++;
      cyclePdns += PDN_EXEMPT_MCC.value.includes(mandate.mcc) ? 0 : 1;

      if (event.firstAttempt.success) {
        cycleGross += mandate.amountPaise;
      } else {
        // First attempt failed. Ask strategy.
        const schedule = strategy.plan(ctx, maxBudget - 1);

        if (!schedule || schedule.slots.length === 0) {
          if (event.firstAttempt.trueClass === 'TERMINAL') {
            terminalCorrectlySkipped++;
          }
          if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) {
            escalations++;
          }
        } else {
          // Validate Schedule
          if (schedule.slots.length > maxBudget - 1) ruleViolations++;
          if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) ruleViolations++;
          
          const exempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);
          const leadHours = PDN_MIN_LEAD_HOURS.value;

          let successIdx = schedule.slots.length;
          for (let i = 0; i < schedule.slots.length; i++) {
            const slot = schedule.slots[i]!;
            
            // Rule Validation
            if (!WINDOW_NAMES.includes(slot.window)) ruleViolations++;
            const daysElapsed = daysBetween(event.dueDate, slot.date);
            if (daysElapsed < 0 || daysElapsed > graceDays) ruleViolations++;
            if (!exempt && daysElapsed < 1) ruleViolations++;
            if (exempt && daysElapsed === 0 && slot.window === 'early') ruleViolations++;
            
            const key = cfKey(event.cycleId, slot.date, slot.window);
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
            
            // Always spend attempt if we haven't reached/passed successIdx
            if (i <= successIdx) {
              cycleAttempts++;
            }
            
            // Count PDN if not exempt AND it had to be sent before/at resolution
            if (!exempt) {
              const attemptHour = getAttemptHour(event.dueDate, slot.date, slot.window);
              const sendHour = attemptHour - leadHours;
              if (sendHour <= resolutionHour) {
                cyclePdns++;
              }
            }
          }

          if (successIdx < schedule.slots.length) {
            cycleGross += mandate.amountPaise;
          }
        }
      }

      // Calculate realized cycle NRV
      let pSurvives = 1.0;
      for (let i = 1; i <= cyclePdns; i++) {
        pSurvives *= (1 - CANCEL_HAZARD_BASE.value * Math.pow(CANCEL_FATIGUE.value, i - 1));
      }

      const cycleCurrent = cycleGross * CONTRIBUTION_MARGIN.value;
      const cycleFuture = pSurvives * horizon * mandate.amountPaise * CONTRIBUTION_MARGIN.value;
      const cycleInterv = cycleAttempts * ATTEMPT_COST_PAISE.value;
      const cycleChurn = (1 - pSurvives) * horizon * mandate.amountPaise * CONTRIBUTION_MARGIN.value;

      nrvCurrent += cycleCurrent;
      nrvFuture += cycleFuture;
      nrvInterv += cycleInterv;
      nrvChurn += cycleChurn;

      grossRecovered += cycleGross;
      attemptsSpent += cycleAttempts;
      pdnsSent += cyclePdns;
      
      const idx = Math.min(cyclePdns, 5);
      pdnsPerCycleDist[idx] = (pdnsPerCycleDist[idx] || 0) + 1;
    }

    results[strategy.name] = {
      grossRecovered,
      incremental: grossRecovered - noActionRecovery,
      nrv: nrvCurrent + nrvFuture - nrvInterv - nrvChurn,
      nrvCurrent, nrvFuture, nrvInterv, nrvChurn,
      attemptsSpent,
      pdnsSent,
      terminalCorrectlySkipped,
      escalations,
      ruleViolations,
      pdnsPerCycleDist,
    };
  }

  // Format table
  console.log(`\n=== Strategy Evaluation (Horizon: ${horizon} cycles) ===\n`);
  const pad = (s: any, n: number) => String(s).padEnd(n, ' ');
  const p = (n: number) => ((n / 100).toFixed(2));
  
  console.log(`${pad('strategy', 15)} | ${pad('NRV (₹)', 10)} | ${pad('gross', 9)} | ${pad('future', 9)} | ${pad('interv', 8)} | ${pad('churn', 9)} | ${pad('attempts', 8)} | ${pad('PDNs/cyc', 8)}`);
  console.log('-'.repeat(95));
  
  for (const strategy of strategies) {
    const res = results[strategy.name];
    console.log(`${pad(strategy.name, 15)} | ${pad(p(res.nrv), 10)} | ${pad(p(res.nrvCurrent), 9)} | ${pad(p(res.nrvFuture), 9)} | ${pad(p(res.nrvInterv), 8)} | ${pad(p(res.nrvChurn), 9)} | ${pad((res.attemptsSpent/2400).toFixed(2), 8)} | ${pad((res.pdnsSent/2400).toFixed(2), 8)}`);
  }

  console.log('\n--- PDN Distributions ---');
  for (const strategy of strategies) {
    const dist = results[strategy.name].pdnsPerCycleDist;
    console.log(`${pad(strategy.name, 15)} | 1:${dist[1]} | 2:${dist[2]} | 3:${dist[3]} | 4:${dist[4]} | 5+:${dist[5]}`);
  }
}

if (require.main === module) {
  runEval(3);
  runEval(6);
  runEval(12);
}
