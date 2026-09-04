import { generateWorld } from '../src/sim/generator';
import { simulateStrategy, computeNrvFromOutcomes } from '../src/eval/run';
import { makePopulationEstimator, makeShrinkageEstimator } from '../src/prior/estimator';
import { makeNetrunStrategy, makeNetrunShrinkageStrategy } from '../src/eval/baselines';
import { MAX_ATTEMPTS_PER_CYCLE, PRIOR_SHRINKAGE_ALPHA } from '../src/config/rules';
import { execSync } from 'child_process';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
const maxBudget = MAX_ATTEMPTS_PER_CYCLE.value;

console.log('--- 1. Assert no lookahead ---');
console.log('mandateId   | cycle_no | pastCycles | diff');
const historyMap = new Map();
let sampled = 0;
for (const event of world.cycleEvents) {
  const m = event.mandateId;
  const cycle_no = parseInt(event.cycleId.split('_c')[1]!, 10);
  const h = historyMap.get(m) || { pastCycles: 0 };
  
  if (sampled < 20 && Math.random() < 0.1) {
    console.log(`${m.padEnd(11)} | ${cycle_no.toString().padEnd(8)} | ${h.pastCycles.toString().padEnd(10)} | ${h.pastCycles === cycle_no - 1 ? 'OK (0)' : 'ERR'}`);
    sampled++;
  }
  
  h.pastCycles++;
  historyMap.set(m, h);
}

// 2. Six-row results table at horizons 3 and 6
console.log('\n--- 2. Six-row results table ---');
console.log('(Running run.ts to generate main tables)');
try {
  const output = execSync('npx ts-node src/eval/run.ts', { encoding: 'utf8' });
  // Just print the tables from the output
  const lines = output.split('\n');
  let printing = false;
  for (const line of lines) {
    if (line.includes('=== Strategy Evaluation')) printing = true;
    if (line.includes('--- Optimizer Metrics')) printing = false;
    if (printing) console.log(line);
  }
} catch (e: any) {
  console.log('Error running run.ts:', e.stdout || e.message);
}

// 3. THE DELTA
console.log('\n--- 3. THE DELTA ---');
const popEst = makePopulationEstimator(world);
const netrun = makeNetrunStrategy(popEst);
const outPop = simulateStrategy(netrun, world, maxBudget);
const nrvPop = computeNrvFromOutcomes(outPop, 6).nrv;

const shrinkEst = makeShrinkageEstimator(world);
const netrunShrink = makeNetrunShrinkageStrategy(shrinkEst);
const outShrink = simulateStrategy(netrunShrink, world, maxBudget);
const nrvShrink = computeNrvFromOutcomes(outShrink, 6).nrv;

const oracleGross = outPop.reduce((a, o) => a + o.gross, 0); // Need actual oracle, let's just use outPop for now? No, need true oracle.
// Wait, we have the exact oracle NRV from the run.ts output! I'll just run it.
const { makeOracleStrategy } = require('../src/eval/baselines');
const oracle = makeOracleStrategy(world.counterfactual);
const outOracle = simulateStrategy(oracle, world, maxBudget);
const nrvOracle = computeNrvFromOutcomes(outOracle, 6).nrv;

const delta = nrvShrink - nrvPop;
const deltaPct = (delta / nrvPop) * 100;
const deltaOraclePct = (delta / nrvOracle) * 100;
console.log(`netrun_shrinkage NRV minus netrun NRV: ₹${(delta / 100).toFixed(2)}`);
console.log(`As percentage of netrun: ${deltaPct.toFixed(4)}%`);
console.log(`As percentage of oracle: ${deltaOraclePct.toFixed(4)}%`);

// 4. DELTA BY CYCLE NUMBER
console.log('\n--- 4. DELTA BY CYCLE NUMBER ---');
console.log('cycle_no | netrun NRV | shrinkage NRV | delta (₹)');
for (let c = 1; c <= 6; c++) {
  const cStr = `_c${c}`;
  // Find indices in outPop for this cycle
  const cycleOutPop = [];
  const cycleOutShrink = [];
  for (let i = 0; i < world.cycleEvents.length; i++) {
    if (world.cycleEvents[i]!.cycleId.endsWith(cStr)) {
      cycleOutPop.push(outPop[i]!);
      cycleOutShrink.push(outShrink[i]!);
    }
  }
  const nPop = computeNrvFromOutcomes(cycleOutPop, 6).nrv;
  const nShrink = computeNrvFromOutcomes(cycleOutShrink, 6).nrv;
  const d = nShrink - nPop;
  console.log(`   ${c}     | ${(nPop / 100).toFixed(2).padEnd(10)} | ${(nShrink / 100).toFixed(2).padEnd(13)} | ${(d / 100).toFixed(2)}`);
}

// 5. Alpha sweep [1, 20]
console.log('\n--- 5. Alpha sweep [1, 20] ---');
let bestAlpha = -1;
let bestNrv = -Infinity;
console.log(`Alpha | netrun_shrinkage NRV (₹) | delta vs pop (₹)`);
const originalAlpha = PRIOR_SHRINKAGE_ALPHA.value;
for (let alpha = 1; alpha <= 20; alpha++) {
  PRIOR_SHRINKAGE_ALPHA.value = alpha;
  const est = makeShrinkageEstimator(world);
  const strat = makeNetrunShrinkageStrategy(est);
  const outs = simulateStrategy(strat, world, maxBudget);
  const nrv = computeNrvFromOutcomes(outs, 6).nrv;
  const d = nrv - nrvPop;
  
  if (nrv > bestNrv) {
    bestNrv = nrv;
    bestAlpha = alpha;
  }
  console.log(`  ${alpha.toString().padEnd(3)} | ${(nrv / 100).toFixed(2).padEnd(24)} | ${(d / 100).toFixed(2)}`);
}
PRIOR_SHRINKAGE_ALPHA.value = originalAlpha;
console.log(`Best alpha: ${bestAlpha} (NRV: ₹${(bestNrv / 100).toFixed(2)})`);

// 6. Confirm optimizer.ts byte-identical
console.log('\n--- 6. Confirm optimizer.ts is byte-identical ---');
try {
  const diff = execSync('git diff src/schedule/optimizer.ts', { encoding: 'utf8' });
  console.log(diff.trim() === '' ? 'git diff is EMPTY (byte-identical)' : diff);
} catch (e: any) {
  console.log('Error running git diff:', e.message);
}
