/**
 * NetRun — src/eval/run.ts
 *
 * Entry point for evaluating strategies against the simulated world.
 * Run: npm run eval
 */

import { generateWorld } from '../sim/generator';
import type {
  EstimationContext,
  StrategyName,
  ObservedHistory,
  Diagnosis,
} from '../types';
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
import { fixedStrategy, aggressiveStrategy, rulesOnlyStrategy, makeOracleStrategy, makeNetrunStrategy, makeNetrunShrinkageStrategy } from './baselines';
import type { NetrunStrategy, Strategy } from './baselines';
import { makePopulationEstimator, makeShrinkageEstimator } from '../prior/estimator';
import type { GeneratedWorld } from '../sim/generator';

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

function getAttemptHour(dueDate: string, slotDate: string, window: 'early' | 'midday' | 'late' | string): number {
  const days = daysBetween(dueDate, slotDate);
  let hour = days * 24;
  if (window === 'early') hour += 0;
  else if (window === 'midday') hour += 13;
  else if (window === 'late') hour += 21.5;
  return hour;
}

interface CycleOutcome {
  gross: number;
  attempts: number;
  pdns: number;
  amountPaise: number;
  ruleViolations: number;
  terminalCorrectlySkipped: number;
  escalations: number;
  optimizerElapsedMs: number;
  alternativesConsidered: number;
  timedOut: boolean;
  policyVerdict: string;
}

export function simulateStrategy(
  strategy: Strategy,
  world: GeneratedWorld,
  maxBudget: number,
  promisesMap?: Map<string, import('../types').PromiseToPay>
): CycleOutcome[] {
  const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));
  const graceDays = RECOVERY_GRACE_DAYS.value;
  const outcomes: CycleOutcome[] = [];
  
  const historyMap = new Map<string, ObservedHistory>();

  for (const event of world.cycleEvents) {
    const mandate = mandateMap.get(event.mandateId)!;

    let cycleGross = 0;
    let cycleAttempts = 0;
    let cyclePdns = 0;
    let ruleViolations = 0;
    let terminalCorrectlySkipped = 0;
    let escalations = 0;
    let optimizerElapsedMs = 0;
    let alternativesConsidered = 0;
    let timedOut = false;
    let policyVerdictKey = 'NONE';
    
    let h = historyMap.get(mandate.mandateId);
    if (!h) {
      h = { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 };
      historyMap.set(mandate.mandateId, h);
    }
    
    // Pass a deep copy so strategy can't mutate the accumulator or look ahead
    const ctxHistory = {
      successDays: [...h.successDays],
      failureDays: [...h.failureDays],
      pastCycles: h.pastCycles,
      pastPromisesMade: h.pastPromisesMade,
      pastPromisesKept: h.pastPromisesKept,
    };

    const diagnosisCode = event.firstAttempt.trueClass === 'TERMINAL' ? 'TRM_01' : 
                          event.firstAttempt.trueClass === 'AUTH' ? 'AUTH_01' :
                          event.firstAttempt.trueClass === 'BALANCE' ? 'BAL_01' : 'TRN_01';

    const diagnosis: Diagnosis = {
      cycleId: event.cycleId,
      class: event.firstAttempt.trueClass || 'UNKNOWN',
      confidence: 1.0,
      source: 'lookup',
      rawCode: diagnosisCode,
      evidence: 'Simulated baseline',
    };

    const promise = promisesMap ? (promisesMap.get(event.cycleId) || null) : null;

    const ctx: EstimationContext = {
      cycleId: event.cycleId,
      customerId: mandate.customerId,
      amountPaise: mandate.amountPaise,
      mcc: mandate.mcc,
      dueDate: event.dueDate,
      diagnosis,
      promise,
      history: ctxHistory,
    };

    // First attempt is always spent
    cycleAttempts++;
    cyclePdns += PDN_EXEMPT_MCC.value.includes(mandate.mcc) ? 0 : 1;
    
    const dueDay = parseInt(event.dueDate.slice(8, 10), 10);
    h.pastCycles++;
    if (promise) {
      h.pastPromisesMade++;
    }

    if (event.firstAttempt.success) {
      cycleGross += mandate.amountPaise;
      h.successDays.push(dueDay);
      if (promise) {
        h.pastPromisesKept++;
      }
    } else {
      h.failureDays.push(dueDay);
      // First attempt failed. Ask strategy.
      const schedule = strategy.plan(ctx, maxBudget - 1);

      const { evaluatePolicy } = require('../policy/policy-engine');
      const policyVerdict = evaluatePolicy(ctx, schedule ? schedule.slots : [], cycleAttempts);
      
      policyVerdictKey = `${policyVerdict.verdict}:${policyVerdict.rule_id}`;
      const effectiveSlots = (policyVerdict.verdict === 'BLOCK' || policyVerdict.verdict === 'ESCALATE') ? [] : (schedule?.slots || []);

      // Capture optimizer metrics for netrun
      if (strategy.name === 'netrun') {
        const netrun = strategy as NetrunStrategy;
        if (netrun.lastResult) {
          optimizerElapsedMs = netrun.lastResult.elapsedMs;
          alternativesConsidered = netrun.lastResult.alternativesConsidered;
          timedOut = netrun.lastResult.timedOut;
        }
      }

      if (effectiveSlots.length === 0) {
        if (event.firstAttempt.trueClass === 'TERMINAL') {
          terminalCorrectlySkipped++;
        }
        if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) {
          escalations++;
        }
      } else {
        // Validate Schedule
        if (effectiveSlots.length > maxBudget - 1) ruleViolations++;
        if (mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) ruleViolations++;
        
        const exempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);
        const leadHours = PDN_MIN_LEAD_HOURS.value;

        let successIdx = effectiveSlots.length;
        for (let i = 0; i < effectiveSlots.length; i++) {
          const slot = effectiveSlots[i]!;
          
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

        const resolutionHour = successIdx < effectiveSlots.length 
          ? getAttemptHour(event.dueDate, effectiveSlots[successIdx]!.date, effectiveSlots[successIdx]!.window)
          : Infinity;

        for (let i = 0; i < effectiveSlots.length; i++) {
          const slot = effectiveSlots[i]!;
          
          if (i <= successIdx) {
            cycleAttempts++;
            const slotDay = parseInt(slot.date.slice(8, 10), 10);
            if (i === successIdx) {
              h.successDays.push(slotDay);
            } else {
              h.failureDays.push(slotDay);
            }
          }
          
          if (!exempt) {
            const attemptHour = getAttemptHour(event.dueDate, slot.date, slot.window);
            const sendHour = attemptHour - leadHours;
            if (sendHour <= resolutionHour) {
              cyclePdns++;
            }
          }
        }

        if (successIdx < effectiveSlots.length) {
          cycleGross += mandate.amountPaise;
          if (promise) {
            h.pastPromisesKept++;
          }
        }
      }
    }

    outcomes.push({
      gross: cycleGross,
      attempts: cycleAttempts,
      pdns: cyclePdns,
      amountPaise: mandate.amountPaise,
      ruleViolations,
      terminalCorrectlySkipped,
      escalations,
      optimizerElapsedMs,
      alternativesConsidered,
      timedOut,
      policyVerdict: policyVerdictKey,
    });
  }

  return outcomes;
}

export function computeNrvFromOutcomes(
  outcomes: CycleOutcome[],
  horizon: number,
) {
  const hazard = CANCEL_HAZARD_BASE.value;
  const fatigue = CANCEL_FATIGUE.value;
  const margin = CONTRIBUTION_MARGIN.value;
  const attemptCost = ATTEMPT_COST_PAISE.value;

  let nrvCurrent = 0;
  let nrvFuture = 0;
  let nrvInterv = 0;
  let nrvChurn = 0;

  for (const out of outcomes) {
    let pSurvives = 1.0;
    for (let i = 1; i <= out.pdns; i++) {
      pSurvives *= (1 - hazard * Math.pow(fatigue, i - 1));
    }

    nrvCurrent += out.gross * margin;
    nrvFuture += pSurvives * horizon * out.amountPaise * margin;
    nrvInterv += out.attempts * attemptCost;
    nrvChurn += (1 - pSurvives) * horizon * out.amountPaise * margin;
  }

  return { nrv: nrvCurrent + nrvFuture - nrvInterv - nrvChurn, nrvCurrent, nrvFuture, nrvInterv, nrvChurn };
}

async function runEval() {
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });

  console.log('Extracting promises (this may hit the LLM cache)...');
  const { extractPromise } = require('../diagnose/llm');
  const promisesMap = new Map<string, import('../types').PromiseToPay>();
  
  // Throttle LLM calls to prevent socket hang up or massive rate limits if cache is cold
  for (let i = 0; i < world.replies.length; i += 10) {
    const chunk = world.replies.slice(i, i + 10);
    await Promise.all(chunk.map(async (reply) => {
      const promise = await extractPromise(reply.cycleId, reply.text);
      promisesMap.set(reply.cycleId, promise);
    }));
  }
  const sources: Record<string, number> = {};
  for (const promise of promisesMap.values()) {
    sources[promise.source] = (sources[promise.source] || 0) + 1;
  }
  console.log(`Extracted ${promisesMap.size} promises.`);
  console.log(`Source distribution:`, sources);
  const fallbackCount = sources['llm_rejected_fallback_regex'] || 0;
  if (promisesMap.size > 0 && fallbackCount / promisesMap.size > 0.1) {
    console.warn(`\nWARNING: LLM fallback rate is ${((fallbackCount / promisesMap.size) * 100).toFixed(1)}%. Check API keys and rate limits.\n`);
  }
  const populationEstimator = makePopulationEstimator(world);
  const netrunStrategy = makeNetrunStrategy(populationEstimator);
  const shrinkageEstimator = makeShrinkageEstimator(world);
  const netrunShrinkageStrategy = makeNetrunShrinkageStrategy(shrinkageEstimator);
  const { makePromiseEstimator } = require('../prior/estimator');
  const promiseEstimator = makePromiseEstimator(world);
  const { makeNetrunPromiseStrategy } = require('./baselines');
  const netrunPromiseStrategy = makeNetrunPromiseStrategy(promiseEstimator);
  const oracleStrategy = makeOracleStrategy(world.counterfactual);

  const strategies: Strategy[] = [
    fixedStrategy,
    aggressiveStrategy,
    rulesOnlyStrategy,
    netrunStrategy,
    netrunShrinkageStrategy,
    netrunPromiseStrategy,
    oracleStrategy,
  ];

  const maxBudget = MAX_ATTEMPTS_PER_CYCLE.value;
  const totalCycles = world.cycleEvents.length;

  // Simulate all strategies ONCE and cache outcomes
  const cachedOutcomes: Record<string, CycleOutcome[]> = {} as any;
  for (const strategy of strategies) {
    console.log(`Simulating ${strategy.name}...`);
    cachedOutcomes[strategy.name] = simulateStrategy(strategy, world, maxBudget, promisesMap);
  }

  // Report at multiple horizons
  for (const horizon of [3, 6]) {
    console.log(`\n=== Strategy Evaluation (Horizon: ${horizon} cycles) ===\n`);
    const pad = (s: any, n: number) => String(s).padEnd(n, ' ');
    const p = (n: number) => ((n / 100).toFixed(2));

    console.log(`${pad('strategy', 15)} | ${pad('NRV (₹)', 12)} | ${pad('gross', 10)} | ${pad('future', 12)} | ${pad('interv', 10)} | ${pad('churn', 10)} | ${pad('att/cyc', 8)} | ${pad('pdn/cyc', 8)} | ${pad('viol', 5)}`);
    console.log('-'.repeat(110));

    for (const strategy of strategies) {
      const outs = cachedOutcomes[strategy.name]!;
      const nrvData = computeNrvFromOutcomes(outs, horizon);
      
      let totalGross = 0, totalAttempts = 0, totalPdns = 0, totalViol = 0;
      for (const o of outs) {
        totalGross += o.gross;
        totalAttempts += o.attempts;
        totalPdns += o.pdns;
        totalViol += o.ruleViolations;
      }

      console.log(
        `${pad(strategy.name, 15)} | ${pad(p(nrvData.nrv), 12)} | ${pad(p(nrvData.nrvCurrent), 10)} | ${pad(p(nrvData.nrvFuture), 12)} | ${pad(p(nrvData.nrvInterv), 10)} | ${pad(p(nrvData.nrvChurn), 10)} | ${pad((totalAttempts/totalCycles).toFixed(2), 8)} | ${pad((totalPdns/totalCycles).toFixed(2), 8)} | ${pad(totalViol, 5)}`
      );
    }
  }

  // Optimizer metrics for netrun
  const netrunOuts = cachedOutcomes['netrun']!;
  const optimizerCalls = netrunOuts.filter(o => o.alternativesConsidered > 0 || o.optimizerElapsedMs > 0);
  const allElapsed = netrunOuts.map(o => o.optimizerElapsedMs);
  const allAlts = netrunOuts.map(o => o.alternativesConsidered);
  const maxElapsed = Math.max(...allElapsed);
  const meanElapsed = allElapsed.reduce((a, b) => a + b, 0) / allElapsed.length;
  const maxAlts = Math.max(...allAlts);
  const meanAlts = allAlts.reduce((a, b) => a + b, 0) / allAlts.length;
  const timeouts = netrunOuts.filter(o => o.timedOut).length;
  
  console.log(`\n--- Optimizer Metrics (netrun) ---`);
  console.log(`Mean elapsedMs: ${meanElapsed.toFixed(1)}`);
  console.log(`Max elapsedMs: ${maxElapsed}`);
  console.log(`Mean alternativesConsidered: ${meanAlts.toFixed(0)}`);
  console.log(`Max alternativesConsidered: ${maxAlts}`);
  console.log(`Timeouts: ${timeouts}`);

  // Policy Verdicts
  console.log(`\n--- Policy Verdict Distribution (netrun) ---`);
  const verdicts: Record<string, number> = {};
  for (const o of netrunOuts) {
    if (o.policyVerdict !== 'NONE') {
      verdicts[o.policyVerdict] = (verdicts[o.policyVerdict] || 0) + 1;
    }
  }
  for (const [v, count] of Object.entries(verdicts).sort()) {
    console.log(`${v}: ${count}`);
  }

  // Rule violations
  console.log(`\n--- Rule Violations ---`);
  for (const strategy of strategies) {
    const totalViol = cachedOutcomes[strategy.name]!.reduce((a, o) => a + o.ruleViolations, 0);
    console.log(`${strategy.name}: ${totalViol}`);
  }

  // PDN distributions
  console.log(`\n--- PDN Distributions ---`);
  const pad2 = (s: any, n: number) => String(s).padEnd(n, ' ');
  for (const strategy of strategies) {
    const dist = [0, 0, 0, 0, 0, 0];
    for (const o of cachedOutcomes[strategy.name]!) {
      const idx = Math.min(o.pdns, 5);
      dist[idx]!++;
    }
    console.log(`${pad2(strategy.name, 15)} | 0:${dist[0]} | 1:${dist[1]} | 2:${dist[2]} | 3:${dist[3]} | 4:${dist[4]} | 5+:${dist[5]}`);
  }

  // Headline numbers
  const netrunGross = cachedOutcomes['netrun']!.reduce((a, o) => a + o.gross, 0);
  const oracleGross = cachedOutcomes['oracle']!.reduce((a, o) => a + o.gross, 0);
  const netrunNrv6 = computeNrvFromOutcomes(cachedOutcomes['netrun']!, 6);
  const oracleNrv6 = computeNrvFromOutcomes(cachedOutcomes['oracle']!, 6);

  console.log(`\n--- Headline Numbers ---`);
  console.log(`netrun NRV as % of oracle NRV (h=6): ${((netrunNrv6.nrv / oracleNrv6.nrv) * 100).toFixed(2)}%`);
  console.log(`netrun gross as % of oracle gross: ${((netrunGross / oracleGross) * 100).toFixed(2)}%`);
}

if (require.main === module) {
  runEval();
}
