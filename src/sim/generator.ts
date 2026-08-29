/**
 * NetRun — src/sim/generator.ts   (spec §24)
 * Entry point: `npm run gen -- --seed 42`
 *
 * Emits ~400 mandates x 6 cycles plus the counterfactual table.
 * Write DATASET.md as you build this, while the design is fresh.
 */

import type { Mandate, ISODate } from '../types';
import type { LatentCustomer, DowntimeBurst, AttemptOutcome } from './world-model';
import type { CounterfactualTable } from './counterfactual';
import type { SimulatedReply } from './replies';

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

/** TODO(step 2). */
export function generateWorld(_opts: {
  seed: number;
  mandateCount: number;
  cycleCount: number;
}): GeneratedWorld {
  throw new Error('not implemented — build order step 2, START HERE');
}
