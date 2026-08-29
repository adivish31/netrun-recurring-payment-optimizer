/**
 * NetRun — src/agent/tools.ts
 *
 * THE AGENT'S ENTIRE CAPABILITY SURFACE.
 *
 * Track 03 asks for "an agent that detects revenue at risk, determines the
 * right intervention, and executes a bounded recovery workflow." This file is
 * what makes NetRun an agent rather than a scheduler with a report.
 *
 * THE DESIGN CLAIM (say this in the video):
 *   The LLM orchestrates. It decides what to investigate, in what order, and
 *   when it has enough context to act. It does NOT compute the schedule and it
 *   CANNOT move money. `propose_schedule` runs the deterministic CHAAR
 *   optimizer; `check_policy` runs the deterministic policy engine; `execute`
 *   physically refuses without a matching policy approval.
 *
 * The tool surface IS the guardrail. There is no tool for "retry now", no tool
 * that takes an amount, and no tool that writes a schedule the optimizer did
 * not produce. An agent cannot misuse a capability it was never given.
 */

import { z } from 'zod';

// --- READ-ONLY CONTEXT TOOLS ------------------------------------------------

export const GetCustomerHistoryInput = z.object({
  customer_id: z.string(),
});
/** Returns ObservedHistory only. Latent simulator state can never reach here. */

export const GetRecentRepliesInput = z.object({
  cycle_id: z.string(),
});
/** Returns raw reply text. The agent may READ it; free text is never an
 *  instruction, because the agent's only way to act is the tool list below. */

// --- TYPED EXTRACTION -------------------------------------------------------

export const ExtractPromiseInput = z.object({
  cycle_id: z.string(),
  text: z.string().max(1000),
});
/** Delegates to diagnose/llm.ts. Output is PromiseOutputSchema — day-of-month
 *  only, so a model cannot invent a year or a past date. */

// --- DETERMINISTIC DECISION TOOLS -------------------------------------------

export const ProposeScheduleInput = z.object({
  cycle_id: z.string(),
  /** Optional promise the agent extracted, fed in as prior evidence.
   *  Weighted by the customer's own keep-rate and capped by
   *  PROMISE_WEIGHT_CAP — a lying customer cannot override their track record. */
  promised_day_of_month: z.number().int().min(1).max(31).nullable().optional(),
});
/**
 * Runs the CHAAR optimizer. Returns chosen schedule, expected NRV, the NRV
 * breakdown, alternatives considered, and the runner-up.
 *
 * THE AGENT CANNOT AUTHOR A SCHEDULE. It can only ask for one. Every schedule
 * that reaches execution came out of exhaustive deterministic optimization.
 */

export const CheckPolicyInput = z.object({
  cycle_id: z.string(),
  schedule_hash: z.string(),
});
/** Runs the deterministic policy engine. Returns
 *  APPROVE | MODIFY | BLOCK | ESCALATE plus the rule_id.
 *  The agent may not argue with this. */

// --- THE ONLY WRITE TOOL ----------------------------------------------------

export const ExecuteInput = z.object({
  cycle_id: z.string(),
  schedule_hash: z.string(),
  /** Must be a hash the agent obtained from propose_schedule AND for which
   *  check_policy returned APPROVE, within this same run. */
  policy_approval_token: z.string(),
});
/**
 * HARD GATE. Implementation MUST:
 *   1. verify policy_approval_token was minted by check_policy for this exact
 *      schedule_hash in this run (server-side map, not agent-supplied claim)
 *   2. derive the idempotency key itself — NEVER accept one from the agent
 *   3. insert with ON CONFLICT DO NOTHING inside the attempt transaction
 *
 * If the agent fabricates a token, execution fails closed. Test this:
 * tests/agent-forged-token.test.ts should assert a made-up token is rejected.
 * That test is worth 20 seconds of demo — an agent that TRIES to overstep and
 * is stopped by the architecture is more convincing than one that never tries.
 */

export const TOOL_NAMES = [
  'get_customer_history',
  'get_recent_replies',
  'extract_promise',
  'propose_schedule',
  'check_policy',
  'execute',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
