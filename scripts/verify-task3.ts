/**
 * Acceptance checks for Task 3: Counterfactual Oracle.
 * Run: npx ts-node scripts/verify-task3.ts
 */
import { generateWorld } from '../src/sim/generator';
import { RECOVERY_GRACE_DAYS, WINDOW_NAMES } from '../src/config/rules';
import { cfKey } from '../src/sim/counterfactual';

const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });

console.log('\n=== ACCEPTANCE 1: Entry Count ===\n');
const expectedCycles = 400 * 6; // 2400
const expectedDays = RECOVERY_GRACE_DAYS.value + 1; // 15 + 1 = 16
const expectedWindows = WINDOW_NAMES.length; // 3
const expectedEntries = expectedCycles * expectedDays * expectedWindows;
const actualEntries = world.counterfactual.outcomes.size;

console.log(`Expected size: ${expectedCycles} cycles * ${expectedDays} days * ${expectedWindows} windows = ${expectedEntries}`);
console.log(`Actual size:   ${actualEntries}`);
if (expectedEntries === actualEntries) {
  console.log('✅ Entry count matches.');
} else {
  console.log('❌ Entry count MISMATCH.');
}

console.log('\n=== ACCEPTANCE 2: ORACLE CEILING ===\n');
let totalMandatePaise = 0;
let totalOraclePaise = 0;

// Create map of mandateId -> amount
const mandateAmountMap = new Map(world.mandates.map(m => [m.mandateId, m.amountPaise]));

for (const event of world.cycleEvents) {
  const amount = mandateAmountMap.get(event.mandateId) || 0;
  totalMandatePaise += amount;
  
  const oracleAmount = world.counterfactual.oracleNrvPaise.get(event.cycleId) || 0;
  totalOraclePaise += oracleAmount;
}

const ceilingPct = (totalOraclePaise / totalMandatePaise * 100).toFixed(2);
console.log(`Total Theoretical Maximum: ${totalMandatePaise}`);
console.log(`Total Oracle Gross:        ${totalOraclePaise}`);
console.log(`Oracle Ceiling %:          ${ceilingPct}%`);
if (parseFloat(ceilingPct) < 100) {
  console.log('✅ Ceiling is strictly below 100%.');
} else {
  console.log('❌ Ceiling is not strictly below 100%. Terminal customers may not be failing correctly.');
}

console.log('\n=== ACCEPTANCE 4: Downtime Sensitivity Spot-Check ===\n');
let foundCycleWithDowntime = false;

// Iterate through cycles to find one with varying outcomes on the same day
for (const event of world.cycleEvents) {
  const { cycleId } = event;
  const cycleOutcomes = new Map<string, Record<string, boolean>>();
  
  // Collect outcomes for this cycle
  for (const [key, outcome] of world.counterfactual.outcomes.entries()) {
    if (key.startsWith(cycleId + '|')) {
      const parts = key.split('|');
      const date = parts[1]!;
      const window = parts[2]!;
      if (!cycleOutcomes.has(date)) {
        cycleOutcomes.set(date, {});
      }
      cycleOutcomes.get(date)![window] = outcome;
    }
  }

  // Look for a day with varying outcomes
  for (const [date, windows] of cycleOutcomes.entries()) {
    const results = Object.values(windows);
    if (results.includes(true) && results.includes(false)) {
      console.log(`Found varying outcomes for cycle: ${cycleId}`);
      console.log('Full outcomes for this cycle:');
      for (const [d, w] of cycleOutcomes.entries()) {
        console.log(`  Date: ${d} -> early: ${w.early}, midday: ${w.midday}, late: ${w.late}`);
      }
      console.log(`\n✅ Date ${date} shows differing outcomes across windows (sensitive to downtime).`);
      foundCycleWithDowntime = true;
      break;
    }
  }
  if (foundCycleWithDowntime) break;
}

if (!foundCycleWithDowntime) {
  console.log('❌ Could not find a cycle with varying outcomes on the same day.');
}

console.log('\n=== ACCEPTANCE 5: Cross-check Consistency ===\n');
const sampleSize = 20;
let matches = 0;

for (let i = 0; i < sampleSize; i++) {
  // Use a pseudo-random index
  const idx = Math.floor(Math.sin(i + 1234) * 10000) % world.cycleEvents.length;
  const event = world.cycleEvents[Math.abs(idx)]!;
  
  const cfOutcome = world.counterfactual.outcomes.get(cfKey(event.cycleId, event.dueDate, 'early'));
  const firstAttemptOutcome = event.firstAttempt.success;
  
  if (cfOutcome === firstAttemptOutcome) {
    matches++;
  } else {
    console.log(`Mismatch at cycle ${event.cycleId}: cf=${cfOutcome}, firstAttempt=${firstAttemptOutcome}`);
  }
}

console.log(`Cross-checked 20 random cycles.`);
console.log(`Matches: ${matches}/20`);
if (matches === 20) {
  console.log('✅ Consistency check passed 20/20.');
} else {
  console.log('❌ Consistency check FAILED.');
}
