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

function runEval() {
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

    for (const event of world.cycleEvents) {
      const mandate = mandateMap.get(event.mandateId)!;
      noActionRecovery += world.counterfactual.noActionRecoveryPaise.get(event.cycleId) || 0;

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
      attemptsSpent++;
      pdnsSent += PDN_EXEMPT_MCC.value.includes(mandate.mcc) ? 0 : 1;

      if (event.firstAttempt.success) {
        grossRecovered += mandate.amountPaise;
        continue;
      }

      // First attempt failed. Ask strategy.
      const schedule = strategy.plan(ctx, maxBudget - 1);

      if (!schedule || schedule.slots.length === 0) {
        if (event.firstAttempt.trueClass === 'TERMINAL') {
          terminalCorrectlySkipped++;
        }
        if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) {
          escalations++;
        }
        continue;
      }

      // Validate Schedule
      if (schedule.slots.length > maxBudget - 1) ruleViolations++;
      if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) ruleViolations++;
      
      const exempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);

      for (const slot of schedule.slots) {
        attemptsSpent++;
        pdnsSent += exempt ? 0 : 1;

        if (!WINDOW_NAMES.includes(slot.window)) ruleViolations++;
        
        const daysElapsed = daysBetween(event.dueDate, slot.date);
        
        if (daysElapsed < 0 || daysElapsed > graceDays) ruleViolations++;
        if (!exempt && daysElapsed < 1) ruleViolations++;
        if (exempt && daysElapsed === 0 && slot.window === 'early') ruleViolations++;

        const key = cfKey(event.cycleId, slot.date, slot.window);
        const outcome = world.counterfactual.outcomes.get(key);

        if (outcome) {
          grossRecovered += mandate.amountPaise;
          break; // Stop retrying after success
        }
      }
    }

    results[strategy.name] = {
      grossRecovered,
      incremental: grossRecovered - noActionRecovery,
      attemptsSpent,
      pdnsSent,
      terminalCorrectlySkipped,
      escalations,
      ruleViolations,
    };
  }

  // Calculate oracle %
  const oracleGross = results['oracle'].grossRecovered;
  
  // Format table
  console.log(`\n=== Strategy Evaluation ===\n`);
  const pad = (s: any, n: number) => String(s).padEnd(n, ' ');
  const p = (n: number) => ((n / 100).toFixed(2));
  
  console.log(`${pad('strategy', 15)} | ${pad('gross (₹)', 10)} | ${pad('incr (₹)', 10)} | ${pad('% oracle', 10)} | ${pad('attempts', 10)} | ${pad('PDNs', 8)} | ${pad('term_skip', 10)} | ${pad('escal', 8)} | ${pad('viol', 5)}`);
  console.log('-'.repeat(105));
  
  for (const strategy of strategies) {
    const res = results[strategy.name];
    const pctOracle = ((res.grossRecovered / oracleGross) * 100).toFixed(2) + '%';
    console.log(`${pad(strategy.name, 15)} | ${pad(p(res.grossRecovered), 10)} | ${pad(p(res.incremental), 10)} | ${pad(pctOracle, 10)} | ${pad(res.attemptsSpent, 10)} | ${pad(res.pdnsSent, 8)} | ${pad(res.terminalCorrectlySkipped, 10)} | ${pad(res.escalations, 8)} | ${pad(res.ruleViolations, 5)}`);
  }
}

if (require.main === module) {
  runEval();
}
