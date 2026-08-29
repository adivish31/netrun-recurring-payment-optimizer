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
 */

import type { ISODate, WindowName } from '../types';

export interface CounterfactualTable {
  /** key: `${cycleId}|${date}|${window}` -> would this attempt have succeeded? */
  outcomes: Map<string, boolean>;
  /** NRV the oracle strategy achieves, per cycle. */
  oracleNrvPaise: Map<string, number>;
  /** Recovery with NO action at all — the baseline for incremental recovery. */
  noActionRecoveryPaise: Map<string, number>;
}

export const cfKey = (cycleId: string, date: ISODate, window: WindowName): string =>
  `${cycleId}|${date}|${window}`;

/** TODO(step 3). */
export function buildCounterfactualTable(): CounterfactualTable {
  throw new Error('not implemented — build order step 3');
}
