/**
 * NetRun — src/agent/loop.ts
 *
 * The recovery agent. One bounded tool-calling loop per at-risk cycle.
 *
 * WHY A LOOP AND NOT A FIXED PIPELINE:
 * a fixed pipeline always does the same six steps. The agent decides whether a
 * reply is worth reading, whether the promise it extracted is worth feeding to
 * the optimizer, whether an ESCALATE verdict warrants re-proposing with a
 * different assumption, and when it has enough to act. That is genuine
 * orchestration, and it is what Track 03 means by "agent".
 *
 * WHY IT IS STILL SAFE:
 * the loop is capped, the tool surface is tiny, `execute` is hard-gated on a
 * server-minted approval token, and the optimizer and policy engine are
 * deterministic. Autonomy over WHAT TO LOOK AT; zero autonomy over WHAT TO PAY.
 *
 * WHY NOT LangGraph (spec §12):
 * this is one agent with six tools and a hard iteration cap. A graph framework
 * would add a dependency, nondeterminism and failure surface for no measured
 * gain. Say that plainly if asked.
 *
 * FAILURE HANDLING (this is a scored criterion — Failure Recovery):
 *   - model unavailable / timeout   -> fall back to the DETERMINISTIC pipeline
 *                                      (diagnose -> optimize -> policy). The
 *                                      agent is an orchestration layer, not a
 *                                      dependency. Recovery still happens.
 *   - malformed tool call            -> zod rejects, one retry, then fallback
 *   - hallucinated tool name         -> rejected against TOOL_NAMES
 *   - iteration cap reached          -> ESCALATE, never a partial action
 *   - forged approval token          -> execution fails closed
 *
 * That fallback is the single most important property here: NetRun degrades to
 * a working deterministic system when the LLM is down. Demo it by setting a
 * bad API key and showing the batch still completes.
 */

import type { Decision } from '../types';

export const MAX_AGENT_ITERATIONS = 6;

export interface AgentRunTrace {
  cycleId: string;
  iterations: Array<{
    n: number;
    toolCalled: string;
    inputSummary: string;
    outputSummary: string;
    reasoning: string; // the agent's stated reason — for the audit trail
  }>;
  decision: Decision | null;
  fellBackToDeterministic: boolean;
  fallbackReason: string | null;
  llmCalls: number;
  elapsedMs: number;
}

/**
 * TODO(after build-order step 10, ~3h).
 *
 * Build the deterministic pipeline FIRST and keep it as a first-class code
 * path, not a stub. The agent wraps it. If you run out of time, the
 * deterministic path alone is a complete submission; the agent alone is not.
 */
export async function runAgent(_cycleId: string): Promise<AgentRunTrace> {
  throw new Error('not implemented — build after step 10; deterministic path first');
}

/**
 * TODO(~30 min, high demo value).
 * Reads a completed decision trace and writes a finance-manager-readable
 * explanation: what failed, what was considered, why this schedule beat the
 * runner-up, which rule permitted it. Pure text generation, zero authority.
 * This is the visible AI in your dashboard.
 */
export async function narrateDecision(_trace: AgentRunTrace): Promise<string> {
  throw new Error('not implemented');
}
