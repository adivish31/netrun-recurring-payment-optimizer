/**
 * NetRun — src/sim/generator.ts   (spec §24)
 * Entry point: `npm run gen -- --seed 42`
 *
 * Emits ~400 mandates x 6 cycles plus the counterfactual table.
 * Write DATASET.md as you build this, while the design is fresh.
 */

import type { Mandate, ISODate } from '../types';
import type { WindowName } from '../config/rules';
import {
  PDN_EXEMPT_MCC,
  AFA_THRESHOLD_PAISE,
  RECOVERY_GRACE_DAYS,
  WINDOW_NAMES,
} from '../config/rules';
import type { LatentCustomer, DowntimeBurst, AttemptOutcome } from './world-model';
import {
  mulberry32,
  hashSeed,
  slotRng,
  makeCustomers,
  makeDowntime,
  simulateAttempt,
} from './world-model';
import type { CounterfactualTable } from './counterfactual';
import { cfKey } from './counterfactual';
import type { SimulatedReply } from './replies';
import { generateReplies } from './replies';

export interface GeneratedWorld {
  mandates: Mandate[];
  cycleEvents: Array<{
    cycleId: string;
    mandateId: string;
    cycleNo: number;
    dueDate: ISODate;
    firstAttempt: AttemptOutcome;
  }>;
  replies: SimulatedReply[];
  counterfactual: CounterfactualTable;
  /** Eval harness only. NEVER import this into the engine path. */
  latent: LatentCustomer[];
  downtime: DowntimeBurst[];
  seed: number;
}

// ---------------------------------------------------------------------------
// MCC pools — pulled from rules.ts, not hardcoded
// ---------------------------------------------------------------------------

const PDN_EXEMPT_MCCS: readonly string[] = PDN_EXEMPT_MCC.value;
const ELEVATED_MCCS: readonly string[] = AFA_THRESHOLD_PAISE.value.elevated_mccs;

/** MCCs that are NOT in the elevated list — default threshold bucket. */
const DEFAULT_MCCS = ['5411', '5812', '5814', '6513', '4900', '5999', '7311', '5944'];

// ---------------------------------------------------------------------------
// 2f. makeMandates
// ---------------------------------------------------------------------------

function makeMandates(
  customers: LatentCustomer[],
  mandateCount: number,
  rng: () => number,
): Mandate[] {
  const mandates: Mandate[] = [];

  for (let i = 0; i < mandateCount; i++) {
    const mandateId = `mdt_${String(i + 1).padStart(4, '0')}`;
    const customer = customers[i % customers.length]!;

    // Assign MCC with guaranteed coverage:
    //   - First 2 mandates: PDN_EXEMPT_MCC (one each)
    //   - Next 4 mandates: elevated MCCs
    //   - Remaining: mix of default and elevated
    let mcc: string;
    if (i < PDN_EXEMPT_MCCS.length) {
      // Guarantee at least one mandate per exempt MCC
      mcc = PDN_EXEMPT_MCCS[i]!;
    } else if (i < PDN_EXEMPT_MCCS.length + 4) {
      // Guarantee some elevated MCCs
      mcc = ELEVATED_MCCS[(i - PDN_EXEMPT_MCCS.length) % ELEVATED_MCCS.length]!;
    } else {
      // Mix: ~30% elevated, ~70% default
      if (rng() < 0.30) {
        mcc = ELEVATED_MCCS[Math.floor(rng() * ELEVATED_MCCS.length)]!;
      } else {
        mcc = DEFAULT_MCCS[Math.floor(rng() * DEFAULT_MCCS.length)]!;
      }
    }

    // Amount: 5,000 to 200,000 paise (Rs 50 to Rs 2,000)
    const amountPaise = Math.floor(rng() * 195000) + 5000;

    // Cycle day: 1-28, often aligned with customer's replenishment
    // but not perfectly (that would be too easy)
    let cycleDay: number;
    if (rng() < 0.4) {
      // 40% aligned with replenishment (easy cases)
      cycleDay = customer.replenishmentDay;
    } else {
      // 60% random offset
      cycleDay = Math.floor(rng() * 28) + 1;
    }

    const createdOn: ISODate = '2025-12-01';

    mandates.push({
      mandateId,
      customerId: customer.customerId,
      amountPaise,
      mcc,
      status: 'active',
      createdOn,
      cycleDay,
    });
  }

  return mandates;
}

// ---------------------------------------------------------------------------
// 2f. runCycles — iterate cycles, produce firstAttempt per cycle
// ---------------------------------------------------------------------------

interface CycleEvent {
  cycleId: string;
  mandateId: string;
  cycleNo: number;
  dueDate: ISODate;
  firstAttempt: AttemptOutcome;
}

function dueDate(cycleNo: number, cycleDay: number): ISODate {
  // Cycles map to months: cycle 1 = Jan 2026, cycle 2 = Feb 2026, etc.
  const month = String(cycleNo).padStart(2, '0');
  const day = String(cycleDay).padStart(2, '0');
  return `2026-${month}-${day}`;
}

function runCycles(
  mandates: Mandate[],
  customers: LatentCustomer[],
  downtime: DowntimeBurst[],
  cycleCount: number,
  seed: number,
): CycleEvent[] {
  const customerMap = new Map(customers.map((c) => [c.customerId, c]));
  const events: CycleEvent[] = [];

  for (const mandate of mandates) {
    const customer = customerMap.get(mandate.customerId)!;

    for (let cycleNo = 1; cycleNo <= cycleCount; cycleNo++) {
      const cycleId = `${mandate.mandateId}_c${cycleNo}`;
      const due = dueDate(cycleNo, mandate.cycleDay);

      // Check terminal
      if (customer.terminalAtCycle !== null && cycleNo >= customer.terminalAtCycle) {
        // Terminal failure — mandate is dead
        events.push({
          cycleId,
          mandateId: mandate.mandateId,
          cycleNo,
          dueDate: due,
          firstAttempt: {
            success: false,
            declineCode: 'mandate_revoked',
            trueClass: 'TERMINAL',
          },
        });
        continue;
      }

      // First attempt: on the due date, in the 'early' window
      const rng = slotRng(seed, cycleId, due, 'early');
      const outcome = simulateAttempt(
        customer,
        due,
        'early',
        mandate.amountPaise,
        downtime,
        rng,
      );

      events.push({
        cycleId,
        mandateId: mandate.mandateId,
        cycleNo,
        dueDate: due,
        firstAttempt: outcome,
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Counterfactual table — oracle for every (date, window) pair
// ---------------------------------------------------------------------------

function buildCounterfactual(
  mandates: Mandate[],
  customers: LatentCustomer[],
  downtime: DowntimeBurst[],
  cycleCount: number,
  seed: number,
): CounterfactualTable {
  const customerMap = new Map(customers.map((c) => [c.customerId, c]));
  const outcomes = new Map<string, boolean>();
  const graceDays = RECOVERY_GRACE_DAYS.value;
  const windowNames: WindowName[] = [...WINDOW_NAMES];

  for (const mandate of mandates) {
    const customer = customerMap.get(mandate.customerId)!;

    for (let cycleNo = 1; cycleNo <= cycleCount; cycleNo++) {
      const cycleId = `${mandate.mandateId}_c${cycleNo}`;

      // Terminal customers always fail
      if (customer.terminalAtCycle !== null && cycleNo >= customer.terminalAtCycle) {
        // Fill all slots with false
        for (let dayOffset = 0; dayOffset <= graceDays; dayOffset++) {
          const candidateDay = Math.min(mandate.cycleDay + dayOffset, 28);
          const candidateDate = dueDate(cycleNo, candidateDay);
          for (const w of windowNames) {
            outcomes.set(cfKey(cycleId, candidateDate, w), false);
          }
        }
        continue;
      }

      // Enumerate every (date, window) in the recovery window
      for (let dayOffset = 0; dayOffset <= graceDays; dayOffset++) {
        const candidateDay = Math.min(mandate.cycleDay + dayOffset, 28);
        const candidateDate = dueDate(cycleNo, candidateDay);
        for (const w of windowNames) {
          const rng = slotRng(seed, cycleId, candidateDate, w);
          const result = simulateAttempt(
            customer,
            candidateDate,
            w,
            mandate.amountPaise,
            downtime,
            rng,
          );
          outcomes.set(cfKey(cycleId, candidateDate, w), result.success);
        }
      }
    }
  }

  // Oracle NRV and no-action baselines are computed by eval, not here.
  // We just provide the raw outcome table.
  return {
    outcomes,
    oracleNrvPaise: new Map(),
    noActionRecoveryPaise: new Map(),
  };
}

// ---------------------------------------------------------------------------
// generateWorld — the top-level entry point
// ---------------------------------------------------------------------------

export function generateWorld(opts: {
  seed: number;
  mandateCount: number;
  cycleCount: number;
}): GeneratedWorld {
  const { seed, mandateCount, cycleCount } = opts;
  const rng = mulberry32(seed);

  // 2a. Customers — one per mandate
  const customers = makeCustomers(mandateCount, rng);

  // 2b. Downtime
  const downtime = makeDowntime(rng);

  // 2f. Mandates
  const mandates = makeMandates(customers, mandateCount, rng);

  // 2f. Run cycles
  const cycleEvents = runCycles(mandates, customers, downtime, cycleCount, seed);

  // Build maps for replies
  const cycleIds = cycleEvents.map((e) => e.cycleId);
  const customerLookup = new Map(
    customers.map((c) => [c.customerId, { promiseKeepRate: c.promiseKeepRate, replenishmentDay: c.replenishmentDay }])
  );
  const mandateCustomerMap = new Map<string, string>();
  for (const event of cycleEvents) {
    const mandate = mandates.find((m) => m.mandateId === event.mandateId);
    if (mandate) {
      mandateCustomerMap.set(event.cycleId, mandate.customerId);
    }
  }

  // 2g. Replies
  const replyRng = mulberry32(hashSeed(seed, 'replies'));
  const replies = generateReplies(cycleIds, replyRng, customerLookup, mandateCustomerMap);

  // Counterfactual table
  const counterfactual = buildCounterfactual(mandates, customers, downtime, cycleCount, seed);

  return {
    mandates,
    cycleEvents,
    replies,
    counterfactual,
    latent: customers,
    downtime,
    seed,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point: npm run gen -- --seed 42
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const seedIdx = args.indexOf('--seed');
  const seedArg = seedIdx !== -1 ? args[seedIdx + 1] : undefined;
  const seed = seedArg !== undefined ? parseInt(seedArg, 10) : 42;

  if (isNaN(seed)) {
    console.error('Usage: npm run gen -- --seed <number>');
    process.exit(1);
  }

  const world = generateWorld({ seed, mandateCount: 400, cycleCount: 6 });

  // Serialize — Map objects need special handling for JSON
  const serializable = {
    ...world,
    counterfactual: {
      outcomes: Object.fromEntries(world.counterfactual.outcomes),
      oracleNrvPaise: Object.fromEntries(world.counterfactual.oracleNrvPaise),
      noActionRecoveryPaise: Object.fromEntries(world.counterfactual.noActionRecoveryPaise),
    },
  };

  console.log(JSON.stringify(serializable));
}
