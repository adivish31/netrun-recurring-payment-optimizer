/**
 * NetRun — src/sim/counterfactual.ts   (spec §28)
 *
 * THE ORACLE. Build this immediately after the simulator and BEFORE anything
 * else. Without it there is no ceiling to measure against and the entire
 * evaluation story collapses.
 *
 * For every cycle, record the outcome of an attempt in EVERY feasible
 * (date, window). That yields:
 *   - a true oracle strategy (perfect knowledge of the replenishment day)
 *   - honest incremental recovery: recovery(strategy) - recovery(no action)
 *   - a ceiling BELOW 100%, because of terminal customers
 *
 * Report NetRun as "% of oracle NRV". A raw rupee figure is not a result;
 * a fraction of an achievable ceiling is.
 *
 * NOTE: cancellation / churn is NOT modelled in this table. Cancellation
 * depends on how many notifications a given strategy sends, which varies
 * per strategy. It does not belong in a table of raw attempt outcomes and
 * must be computed later, per-strategy, in the eval harness.
 */

import type { ISODate, WindowName, Mandate } from '../types';
import { RECOVERY_GRACE_DAYS, WINDOW_NAMES, PDN_EXEMPT_MCC } from '../config/rules';
import type { LatentCustomer, DowntimeBurst, AttemptOutcome } from './world-model';
import { slotRng, simulateAttempt } from './world-model';

export interface CounterfactualTable {
  /** key: `${cycleId}|${date}|${window}` -> would this attempt have succeeded? */
  outcomes: Map<string, boolean>;
  /**
   * Best achievable GROSS recovery per cycle — what a perfectly-informed
   * actor would get. Keyed by cycleId.
   *
   * NOTE: This is a gross-recovery proxy (does ANY feasible slot succeed
   * -> mandate amount, else 0). The full NRV formula — which accounts for
   * future value, intervention cost, and churn — belongs to eval/metrics.ts
   * and will supersede this once that module exists.
   */
  oracleNrvPaise: Map<string, number>;
  /** Recovery with NO action at all — the baseline for incremental recovery. */
  noActionRecoveryPaise: Map<string, number>;
}

export const cfKey = (cycleId: string, date: ISODate, window: WindowName): string =>
  `${cycleId}|${date}|${window}`;

// ---------------------------------------------------------------------------
// Date helper — same logic as generator.ts dueDate()
// ---------------------------------------------------------------------------

function candidateDate(cycleNo: number, dayOfMonth: number): ISODate {
  let month = cycleNo;
  let day = dayOfMonth;
  if (day > 28) {
    day -= 28;
    month += 1;
  }
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// buildCounterfactualTable
// ---------------------------------------------------------------------------

/**
 * For every cycle, compute the outcome of an attempt in EVERY feasible
 * (date, window) pair across [dueDate, dueDate + RECOVERY_GRACE_DAYS].
 *
 * Uses the EXACT SAME per-slot seeding helper (slotRng) from world-model.ts.
 * This table and live strategy runs in later tasks MUST produce IDENTICAL
 * outcomes for identical (seed, cycleId, date, window) inputs.
 *
 * @param mandates     - all mandates from the generated world
 * @param customers    - all latent customers
 * @param downtime     - all downtime bursts
 * @param cycleCount   - number of cycles per mandate
 * @param seed         - the world seed
 * @param cycleEvents  - the first-attempt outcomes from runCycles() in Task 2
 */
export function buildCounterfactualTable(
  mandates: Mandate[],
  customers: LatentCustomer[],
  downtime: DowntimeBurst[],
  cycleCount: number,
  seed: number,
  cycleEvents: Array<{
    cycleId: string;
    mandateId: string;
    cycleNo: number;
    dueDate: ISODate;
    firstAttempt: AttemptOutcome;
  }>,
): CounterfactualTable {
  const customerMap = new Map(customers.map((c) => [c.customerId, c]));
  const outcomes = new Map<string, boolean>();
  const oracleNrvPaise = new Map<string, number>();
  const noActionRecoveryPaise = new Map<string, number>();

  const graceDays = RECOVERY_GRACE_DAYS.value;
  const windowNames: readonly WindowName[] = WINDOW_NAMES;

  // Build a lookup for first-attempt results (for noActionRecoveryPaise)
  const firstAttemptMap = new Map<string, AttemptOutcome>();
  for (const event of cycleEvents) {
    firstAttemptMap.set(event.cycleId, event.firstAttempt);
  }

  for (const mandate of mandates) {
    const customer = customerMap.get(mandate.customerId)!;

    for (let cycleNo = 1; cycleNo <= cycleCount; cycleNo++) {
      const cycleId = `${mandate.mandateId}_c${cycleNo}`;
      let anySlotSucceeds = false;

      // Terminal customers: all slots fail
      if (customer.terminalAtCycle !== null && cycleNo >= customer.terminalAtCycle) {
        for (let dayOffset = 0; dayOffset <= graceDays; dayOffset++) {
          const dayOfMonth = mandate.cycleDay + dayOffset;
          const date = candidateDate(cycleNo, dayOfMonth);
          for (const w of windowNames) {
            outcomes.set(cfKey(cycleId, date, w), false);
          }
        }
        // Terminal: oracle gets 0, no-action gets 0
        oracleNrvPaise.set(cycleId, 0);
        noActionRecoveryPaise.set(cycleId, 0);
        continue;
      }

      // Enumerate every feasible (date, window)
      const isExempt = PDN_EXEMPT_MCC.value.includes(mandate.mcc);
      for (let dayOffset = 0; dayOffset <= graceDays; dayOffset++) {
        const dayOfMonth = mandate.cycleDay + dayOffset;
        const date = candidateDate(cycleNo, dayOfMonth);
        for (const w of windowNames) {
          // EXACT SAME slotRng as Task 2's simulateAttempt calls
          const rng = slotRng(seed, cycleId, date, w);
          const result = simulateAttempt(
            customer,
            date,
            w,
            mandate.amountPaise,
            downtime,
            rng,
          );
          const succeeded = result.success;
          outcomes.set(cfKey(cycleId, date, w), succeeded);
          
          // Only legally reachable slots contribute to oracleNrvPaise
          const isFirstAttempt = (dayOffset === 0 && w === 'early');
          const isLegalRetry = isExempt || dayOffset > 0;
          if (succeeded && (isFirstAttempt || isLegalRetry)) {
            anySlotSucceeds = true;
          }
        }
      }

      // oracleNrvPaise: gross-recovery proxy — mandate amount if ANY slot
      // succeeds, else 0. (Full NRV formula will be in eval/metrics.ts.)
      oracleNrvPaise.set(cycleId, anySlotSucceeds ? mandate.amountPaise : 0);

      // noActionRecoveryPaise: outcome of the first attempt only
      const firstAttempt = firstAttemptMap.get(cycleId);
      const firstSucceeded = firstAttempt?.success ?? false;
      noActionRecoveryPaise.set(cycleId, firstSucceeded ? mandate.amountPaise : 0);
    }
  }

  return { outcomes, oracleNrvPaise, noActionRecoveryPaise };
}
