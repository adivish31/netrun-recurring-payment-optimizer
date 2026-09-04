/**
 * NetRun — src/eval/sensitivity.ts
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

function runSensitivity() {
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
  const oracleStrategy = makeOracleStrategy(world.counterfactual);

  const { makePopulationEstimator } = require('../prior/estimator');
  const { makeNetrunStrategy } = require('./baselines');
  const estimator = makePopulationEstimator(world);
  const netrunStrategy = makeNetrunStrategy(estimator);

  const strategies = [
    fixedStrategy,
    aggressiveStrategy,
    rulesOnlyStrategy,
    netrunStrategy,
    oracleStrategy,
  ];

  const maxBudget = MAX_ATTEMPTS_PER_CYCLE.value;
  const graceDays = RECOVERY_GRACE_DAYS.value;
  const mandateMap = new Map(world.mandates.map(m => [m.mandateId, m]));

  // Cache the realized outcomes for each strategy per cycle so we don't re-simulate.
  const cachedOutcomes: Record<StrategyName, { gross: number; attempts: number; pdns: number }[]> = {} as any;

  for (const strategy of strategies) {
    cachedOutcomes[strategy.name as StrategyName] = [];
    for (const event of world.cycleEvents) {
      const mandate = mandateMap.get(event.mandateId)!;

      let cycleGross = 0;
      let cycleAttempts = 0;
      let cyclePdns = 0;

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
        const schedule = strategy.plan(ctx, maxBudget - 1);
        if (schedule && schedule.slots.length > 0) {
          const exempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);
          const leadHours = PDN_MIN_LEAD_HOURS.value;

          let successIdx = schedule.slots.length;
          for (let i = 0; i < schedule.slots.length; i++) {
            const slot = schedule.slots[i]!;
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

      cachedOutcomes[strategy.name as StrategyName].push({
        gross: cycleGross, attempts: cycleAttempts, pdns: cyclePdns });
    }
  }

  // Perform Hazard Sweep
  const [minHazard, maxHazard] = CANCEL_HAZARD_BASE.sweep;
  const step = 0.005;

  const horizon = FUTURE_CYCLE_HORIZON.value;
  const fatigue = CANCEL_FATIGUE.value;
  const margin = CONTRIBUTION_MARGIN.value;
  const attemptCost = ATTEMPT_COST_PAISE.value;

  console.log(`\n=== NRV Sensitivity Analysis (Hazard Base Sweep) ===\n`);
  
  const pad = (s: any, n: number) => String(s).padEnd(n, ' ');
  const p = (n: number) => ((n / 100).toFixed(2));

  console.log(`${pad('Hazard', 8)} | ${pad('fixed (₹)', 10)} | ${pad('aggressive', 10)} | ${pad('rules_only', 10)} | ${pad('oracle', 10)} | ${pad('Top Ranked', 15)}`);
  console.log('-'.repeat(75));

  let prevTopRanked: StrategyName | null = null;
  const breakEvenPoints: { hazard: number; newWinner: string }[] = [];

  let nrvAt0: Record<StrategyName, number> = {} as any;
  let nrvAtMax: Record<StrategyName, number> = {} as any;

  for (let hazard = minHazard; hazard <= maxHazard + 0.0001; hazard += step) {
    const sweepNrv: Record<StrategyName, number> = {} as any;
    let maxNrv = -Infinity;
    let topRanked = '';

    for (const strategy of strategies) {
      let totalNrv = 0;

      for (let i = 0; i < world.cycleEvents.length; i++) {
        const event = world.cycleEvents[i]!;
        const mandate = mandateMap.get(event.mandateId)!;
        const out = cachedOutcomes[strategy.name as StrategyName][i]!;

        let pSurvives = 1.0;
        for (let j = 1; j <= out.pdns; j++) {
          pSurvives *= (1 - hazard * Math.pow(fatigue, j - 1));
        }

        const cycleCurrent = out.gross * margin;
        const cycleFuture = pSurvives * horizon * mandate.amountPaise * margin;
        const cycleInterv = out.attempts * attemptCost;
        const cycleChurn = (1 - pSurvives) * horizon * mandate.amountPaise * margin;

        totalNrv += (cycleCurrent + cycleFuture - cycleInterv - cycleChurn);
      }

      sweepNrv[strategy.name as StrategyName] = totalNrv;
      if (strategy.name !== 'oracle' && totalNrv > maxNrv) {
        maxNrv = totalNrv;
        topRanked = strategy.name;
      }
    }

    if (Math.abs(hazard - 0.0) < 0.0001) nrvAt0 = sweepNrv;
    if (Math.abs(hazard - maxHazard) < 0.0001) nrvAtMax = sweepNrv;

    if (prevTopRanked && prevTopRanked !== topRanked) {
      breakEvenPoints.push({ hazard, newWinner: topRanked });
    }
    prevTopRanked = topRanked as StrategyName;

    console.log(`${pad(hazard.toFixed(3), 8)} | ${pad(p(sweepNrv['fixed']), 10)} | ${pad(p(sweepNrv['aggressive']), 10)} | ${pad(p(sweepNrv['rules_only']), 10)} | ${pad(p(sweepNrv['oracle']), 10)} | ${pad(topRanked, 15)}`);
  }

  console.log('\n--- Break-Even Finding ---');
  let topAt0 = Object.keys(nrvAt0).filter(k => k !== 'oracle').reduce((a, b) => nrvAt0[a as StrategyName] > nrvAt0[b as StrategyName] ? a : b);
  let topAtMax = Object.keys(nrvAtMax).filter(k => k !== 'oracle').reduce((a, b) => nrvAtMax[a as StrategyName] > nrvAtMax[b as StrategyName] ? a : b);
  
  if (breakEvenPoints.length === 0) {
    console.log(`At hazard = 0, ${topAt0} has the highest NRV. At hazard = ${maxHazard}, ${topAtMax} has the highest NRV. The ordering NEVER changes across the range.`);
  } else {
    console.log(`At hazard = 0, ${topAt0} has the highest NRV. At hazard = ${maxHazard}, ${topAtMax} has the highest NRV. The top-ranked strategy changes at hazard = ${breakEvenPoints.map(b => b.hazard.toFixed(3)).join(', ')}.`);
  }

  // --- APPEND SENSITIVITY TO JSON ---
  const fs = require('fs');
  const path = require('path');
  const resultsJsonPath = path.join(process.cwd(), 'data', 'generated', 'results.json');
  if (fs.existsSync(resultsJsonPath)) {
    const resultsObj = JSON.parse(fs.readFileSync(resultsJsonPath, 'utf-8'));
    
    // We only need the netrun strategy in the frontend? The prompt asks for: "Line chart: NRV vs hazard across [0, 0.08], all strategies."
    // So we'll save all strategies.
    
    // Re-run the sweep just to save to JSON
    resultsObj.sensitivity = [];
    for (let hazard = minHazard; hazard <= maxHazard + 0.0001; hazard += step) {
      const sweepNrv: Record<string, number> = {};
      for (const strategy of strategies) {
        let totalNrv = 0;
        for (let i = 0; i < world.cycleEvents.length; i++) {
          const event = world.cycleEvents[i]!;
          const mandate = mandateMap.get(event.mandateId)!;
          const out = cachedOutcomes[strategy.name as StrategyName][i]!;
          let pSurvives = 1.0;
          for (let j = 1; j <= out.pdns; j++) {
            pSurvives *= (1 - hazard * Math.pow(fatigue, j - 1));
          }
          const cycleCurrent = out.gross * margin;
          const cycleFuture = pSurvives * horizon * mandate.amountPaise * margin;
          const cycleInterv = out.attempts * attemptCost;
          const cycleChurn = (1 - pSurvives) * horizon * mandate.amountPaise * margin;
          totalNrv += (cycleCurrent + cycleFuture - cycleInterv - cycleChurn);
        }
        sweepNrv[strategy.name] = totalNrv;
      }
      resultsObj.sensitivity.push({ hazard, ...sweepNrv });
    }
    
    fs.writeFileSync(resultsJsonPath, JSON.stringify(resultsObj, null, 2));
  }
}

if (require.main === module) {
  runSensitivity();
}
