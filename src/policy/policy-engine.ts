/**
 * NetRun — src/policy/policy-engine.ts   (spec §11, §21)
 *
 * FINAL AUTHORITY. Pure, synchronous, no I/O, no model access.
 * May override the optimizer. Every verdict carries the rule_id that produced
 * it, so the dashboard and the audit log can always answer "under which rule?".
 *
 * NO NUMERIC LITERAL MAY APPEAR IN THIS FILE.
 *
 * Checks (each maps to one rule_id in config/rules.ts):
 *   - remaining budget vs RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE
 *   - every slot's window in AUTOPAY_PERMITTED_EXECUTION_WINDOWS
 *   - notice lead time vs UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS
 *       (skip for MCCs in PD_NOTICE_EXEMPT_MCC)
 *   - amount vs RECURRING_AFA_THRESHOLD_PAISE
 *       -> over threshold: ESCALATE to an authenticated flow, never a silent attempt
 *   - TERMINAL / AUTH diagnosis -> STOP, spend zero budget
 *   - merchant stopping rules
 *
 * Tests must prove each of these REJECTS, not merely that the happy path passes.
 * A policy engine with only positive tests is not evidence of anything.
 */

import type { PolicyVerdict, Schedule, EstimationContext } from '../types';

export function evaluatePolicy(
  _ctx: EstimationContext,
  _proposed: Schedule | null,
  _attemptsUsed: number
): PolicyVerdict {
  throw new Error('not implemented — build order step 10');
}
