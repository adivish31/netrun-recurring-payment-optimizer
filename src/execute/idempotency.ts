/**
 * NetRun — src/execute/idempotency.ts   (spec §37)
 *
 * Deterministic key: hash(cycle_id + attempt_no + action_type).
 * Deterministic because a retried webhook must produce the SAME key — a random
 * key would defeat the whole mechanism.
 *
 * Enforcement is the DB UNIQUE constraint plus INSERT ... ON CONFLICT DO
 * NOTHING, inside the same transaction as the attempt row. Application-level
 * checking is not enough: two concurrent workers both pass an if-statement.
 */

import { createHash } from 'node:crypto';
import type { ActionType } from '../types';

export function idempotencyKey(
  cycleId: string,
  attemptNo: number,
  action: ActionType
): string {
  return createHash('sha256').update(`${cycleId}|${attemptNo}|${action}`).digest('hex').slice(0, 32);
}
