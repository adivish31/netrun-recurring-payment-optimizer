/**
 * NetRun — web/src/lib/traceDerive.ts
 *
 * Turns raw trace / cycle data into the values the cockpit displays.
 *
 * Every string this module produces comes from labels.ts. Every number comes
 * from the data passed in. Nothing here is hardcoded for the demo, and nothing
 * here invents a value when the data does not have one — callers get `null`
 * and must render an honest empty state.
 */

import {
  AGENT_LEADS,
  AND_JOIN,
  DECLINE_CLASS_LABELS,
  ORDINAL,
  POLICY_LABELS,
  REPEAT_PHRASE,
  STEP_SUMMARY,
  TOOL_ORDER,
  WINDOW_LABELS,
  extractSourceLabel,
  formatCount,
  formatDate,
  formatPercent,
  formatRupees,
  toolLabel,
  type AgentOutcome,
} from './labels';

// ---------------------------------------------------------------------------
// Types — loose on purpose; the API is JSON
// ---------------------------------------------------------------------------

export interface Iteration {
  n: number;
  toolCalled: string;
  inputSummary: string;
  outputSummary: string;
  reasoning: string;
}

export interface AgentTrace {
  cycleId: string;
  iterations: Iteration[];
  decision: any;
  fellBackToDeterministic: boolean;
  fallbackReason: string | null;
  llmCalls: number;
  elapsedMs: number;
  captured: string;
  type: string;
}

export interface CycleTrace {
  diagnosisClass: string;
  diagnosisSource: string;
  chosenSchedule: { date: string; window: string; pSuccess: number }[];
  runnerUpSchedule: { date: string; window: string; pSuccess: number }[];
  runnerUpNrv: number;
  nrvBreakdown: { gross: number; future: number; interv: number; churn: number };
  alternativesConsidered: number;
  policyVerdict: string;
  ruleId: string;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export function parseJson(raw: string | null | undefined): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const PIPELINE_STAGE_COUNT = 5;

// ---------------------------------------------------------------------------
// Trace selection — P0
// ---------------------------------------------------------------------------

/** Never offer a trace with nothing in it. */
export function usableTraces(traces: AgentTrace[]): AgentTrace[] {
  return (traces || [])
    .filter((t) => (t?.iterations?.length || 0) > 0)
    .slice()
    .sort((a, b) => b.iterations.length - a.iterations.length);
}

/** The default is the richest trace: the highest iteration count. */
export function defaultCycleId(traces: AgentTrace[]): string {
  const usable = usableTraces(traces);
  return usable.length > 0 ? usable[0]!.cycleId : '';
}

export function findTrace(traces: AgentTrace[], cycleId: string): AgentTrace | undefined {
  const usable = usableTraces(traces);
  return usable.find((t) => t.cycleId === cycleId) || usable[0];
}

// ---------------------------------------------------------------------------
// Outcome classification — drives the lead sentence
// ---------------------------------------------------------------------------

/**
 * `scheduledAttempts` comes from the evaluated cycle the Pipeline and Decision
 * tabs display. It is passed in so a lead sentence never claims an outcome
 * ("the payment was still scheduled") that nothing on screen supports.
 */
export function traceOutcome(
  trace: AgentTrace | undefined,
  scheduledAttempts = 0
): AgentOutcome | null {
  if (!trace || !trace.iterations?.length) return null;

  const ruleId = trace.decision?.policy?.rule_id;
  const verdict = trace.decision?.policy?.verdict;

  if (trace.type === 'adversarial_injection') return 'injection_blocked';
  if (trace.type === 'adversarial_forged') return 'forged_token';
  if (ruleId === 'EXECUTION_BLOCKED') return 'forged_token';
  if (ruleId === 'DECLINE_CLASS_STRATEGY' || ruleId === 'TERMINAL') return 'declined_terminal';

  const unavailable = (): AgentOutcome =>
    scheduledAttempts > 0 ? 'ai_unavailable' : 'ai_unavailable_unscheduled';

  const executed = trace.iterations.some(
    (i) => i.toolCalled === 'execute' && parseJson(i.outputSummary)?.success === true
  );
  if (executed) {
    // A run that never reached the model but still scheduled is the
    // rule-based-planner story, not the happy path.
    return trace.captured === 'deterministic' && trace.fellBackToDeterministic
      ? unavailable()
      : 'executed';
  }

  if (verdict === 'BLOCK' && ruleId === 'TRANSIENT') return 'no_legal_schedule';
  if (trace.type === 'adversarial_unavailable') return unavailable();
  return 'incomplete';
}

export function agentLead(
  trace: AgentTrace | undefined,
  scheduledAttempts = 0
): string | null {
  const outcome = traceOutcome(trace, scheduledAttempts);
  return outcome ? AGENT_LEADS[outcome] : null;
}

// ---------------------------------------------------------------------------
// Over-calling — volunteered, computed, never hardcoded
// ---------------------------------------------------------------------------

export interface OverCallInfo {
  toolCalls: number;
  modelTurns: number;
  stages: number;
  repeats: string;
}

export function overCallInfo(trace: AgentTrace | undefined): OverCallInfo | null {
  if (!trace?.iterations?.length) return null;

  const counts = new Map<string, number>();
  for (const it of trace.iterations) {
    counts.set(it.toolCalled, (counts.get(it.toolCalled) || 0) + 1);
  }

  const repeated = TOOL_ORDER.filter((name) => (counts.get(name) || 0) > 1).map((name) => ({
    label: toolLabel(name).label,
    times: counts.get(name)!,
  }));

  if (repeated.length === 0) return null;

  return {
    toolCalls: trace.iterations.length,
    modelTurns: trace.llmCalls || 0,
    stages: PIPELINE_STAGE_COUNT,
    repeats: REPEAT_PHRASE(repeated),
  };
}

// ---------------------------------------------------------------------------
// Per-step plain sentence
// ---------------------------------------------------------------------------

export function stepSummary(it: Iteration): string {
  const out = parseJson(it.outputSummary);
  const input = parseJson(it.inputSummary);

  switch (it.toolCalled) {
    case 'get_customer_history': {
      if (!out) return STEP_SUMMARY.unknown;
      const days: number[] = out.successDays || [];
      const phrase = days.length ? AND_JOIN(days.map((d) => `the ${ORDINAL(d)}`)) : '';
      return STEP_SUMMARY.history(phrase, out.pastCycles || 0);
    }

    case 'get_recent_replies': {
      const raw: string = out?.text || '';
      const quoted = raw.match(/"([^"]*)"/);
      if (!raw || /no recent replies/i.test(raw)) return STEP_SUMMARY.noReply;
      return STEP_SUMMARY.reply(quoted ? quoted[1]! : raw);
    }

    case 'extract_promise': {
      if (!out) return STEP_SUMMARY.unknown;
      const sourceNote = extractSourceLabel(out.source);
      if (out.intent === 'unclear' || !out.promisedDate) {
        return STEP_SUMMARY.promiseUnclear(sourceNote);
      }
      const day = Number(String(out.promisedDate).slice(-2));
      return STEP_SUMMARY.promiseFound(
        ORDINAL(day),
        formatPercent((out.confidence || 0) * 100, 0),
        sourceNote
      );
    }

    case 'propose_schedule': {
      if (!out || out.error) return STEP_SUMMARY.scheduleFailed;
      const slots: any[] = out.schedule || [];
      const when = slots
        .map((s) => `${formatDate(s.date)}, ${WINDOW_LABELS[s.window] || s.window}`)
        .join('; ');
      return STEP_SUMMARY.scheduleProposed(
        slots.length,
        when,
        formatRupees(out.nrv || 0, 2),
        formatCount(out.alternativesConsidered || 0)
      );
    }

    case 'check_policy': {
      if (!out) return STEP_SUMMARY.unknown;
      if (out.verdict === 'APPROVE') return STEP_SUMMARY.policyApproved;
      return STEP_SUMMARY.policyRefused(out.reason || POLICY_LABELS[out.rule_id] || out.verdict);
    }

    case 'execute': {
      // An execute that was blocked server-side carries an empty output; the
      // reason lives on the trace, not the step.
      if (!it.outputSummary || it.outputSummary.trim() === '') {
        return STEP_SUMMARY.executeBlockedNoOutput;
      }
      if (out?.success) return STEP_SUMMARY.executed;
      return STEP_SUMMARY.executeRefused;
    }

    default:
      return input ? STEP_SUMMARY.unknown : STEP_SUMMARY.unknown;
  }
}

/** True when this step is the one that got refused — drives the red flash. */
export function isRejectedStep(it: Iteration, trace: AgentTrace | undefined): boolean {
  if (it.toolCalled !== 'execute') return false;
  const out = parseJson(it.outputSummary);
  if (out?.error && String(out.error).includes('EXECUTION_BLOCKED')) return true;
  if (!it.outputSummary?.trim() && trace?.decision?.policy?.rule_id === 'EXECUTION_BLOCKED') {
    return true;
  }
  return false;
}

/**
 * True when the model became unreachable mid-run AND deterministic code went
 * on to produce a schedule anyway. Only then is the "fell back to rules" leg
 * of the flow graph an accurate thing to draw: the model call was lost, and
 * the planner still ran. If nothing was scheduled, nothing fell back.
 */
export function fellBackToRulesPlanner(
  trace: AgentTrace | undefined,
  scheduledAttempts: number
): boolean {
  if (!trace?.fellBackToDeterministic || scheduledAttempts <= 0) return false;
  const reason = trace.fallbackReason || '';
  if (!/unavailable|503|failed/i.test(reason)) return false;
  // If the trace itself already shows the planner running, the fallback leg
  // would be inventing a second call that never happened.
  return !trace.iterations.some((i) => i.toolCalled === 'propose_schedule');
}

/** The promise-extraction step of an injection trace, for the guardrail panel. */
export function injectionExtractStep(trace: AgentTrace | undefined): Iteration | null {
  if (!trace || trace.type !== 'adversarial_injection') return null;
  return trace.iterations.find((i) => i.toolCalled === 'extract_promise') || null;
}

// ---------------------------------------------------------------------------
// Schedule / economics from an agent trace
// ---------------------------------------------------------------------------

export function proposedScheduleFromTrace(trace: AgentTrace | undefined): any | null {
  if (!trace?.iterations) return null;
  for (const it of trace.iterations) {
    if (it.toolCalled !== 'propose_schedule') continue;
    const out = parseJson(it.outputSummary);
    if (out && !out.error) return out;
  }
  return null;
}

export interface Economics {
  gross: number;
  future: number;
  interv: number;
  churn: number;
  total: number;
  runnerUpNrv: number | null;
  deltaPaise: number | null;
  attempts: number;
  alternatives: number;
}

/**
 * Economics for a cycle, preferring the evaluated cycle trace (which carries a
 * real runner-up schedule) and falling back to the agent's own
 * propose_schedule output (which carries no distinct runner-up).
 */
export function cycleEconomics(
  cycleTrace: CycleTrace | undefined | null,
  agentTrace: AgentTrace | undefined
): Economics | null {
  if (cycleTrace?.nrvBreakdown) {
    const b = cycleTrace.nrvBreakdown;
    const total = (b.gross || 0) + (b.future || 0) - (b.interv || 0) - (b.churn || 0);
    const hasRunnerUp = (cycleTrace.runnerUpSchedule?.length || 0) > 0;
    return {
      gross: b.gross || 0,
      future: b.future || 0,
      interv: b.interv || 0,
      churn: b.churn || 0,
      total,
      runnerUpNrv: hasRunnerUp ? cycleTrace.runnerUpNrv : null,
      deltaPaise: hasRunnerUp ? total - (cycleTrace.runnerUpNrv || 0) : null,
      attempts: cycleTrace.chosenSchedule?.length || 0,
      alternatives: cycleTrace.alternativesConsidered || 0,
    };
  }

  const proposed = proposedScheduleFromTrace(agentTrace);
  if (!proposed) return null;
  const b = proposed.breakdown || {};
  const total =
    (b.expectedCurrentRecoveryPaise || 0) +
    (b.expectedFutureValuePaise || 0) -
    (b.expectedInterventionCostPaise || 0) -
    (b.expectedChurnCostPaise || 0);
  return {
    gross: b.expectedCurrentRecoveryPaise || 0,
    future: b.expectedFutureValuePaise || 0,
    interv: b.expectedInterventionCostPaise || 0,
    churn: b.expectedChurnCostPaise || 0,
    total,
    runnerUpNrv: null,
    deltaPaise: null,
    attempts: proposed.schedule?.length || 0,
    alternatives: proposed.alternativesConsidered || 0,
  };
}

// ---------------------------------------------------------------------------
// Delta distribution across every evaluated cycle — P2 Decision
// ---------------------------------------------------------------------------

export interface DeltaRow {
  id: string;
  deltaPaise: number;
  totalPaise: number;
  runnerUpNrv: number;
  diagnosisClass: string;
  chosenSlots: number;
  runnerUpSlots: number;
  /** true when the runner-up is the chosen schedule with only the window changed */
  windowShiftOnly: boolean;
}

const dateSignature = (slots: { date: string }[] = []) =>
  slots
    .map((s) => s.date)
    .slice()
    .sort()
    .join('|');

export function deltaRows(cycleTraces: Record<string, CycleTrace>): DeltaRow[] {
  const rows: DeltaRow[] = [];
  for (const [id, t] of Object.entries(cycleTraces || {})) {
    if (!(t.chosenSchedule?.length > 0) || !(t.runnerUpSchedule?.length > 0)) continue;
    if (!(t.alternativesConsidered > 0)) continue;
    const b = t.nrvBreakdown || ({} as any);
    const total = (b.gross || 0) + (b.future || 0) - (b.interv || 0) - (b.churn || 0);
    rows.push({
      id,
      deltaPaise: total - (t.runnerUpNrv || 0),
      totalPaise: total,
      runnerUpNrv: t.runnerUpNrv || 0,
      diagnosisClass: t.diagnosisClass,
      chosenSlots: t.chosenSchedule.length,
      runnerUpSlots: t.runnerUpSchedule.length,
      windowShiftOnly:
        dateSignature(t.chosenSchedule) === dateSignature(t.runnerUpSchedule),
    });
  }
  return rows.sort((a, b) => b.deltaPaise - a.deltaPaise);
}

export function largestDeltaCycleId(cycleTraces: Record<string, CycleTrace>): string | null {
  const rows = deltaRows(cycleTraces).filter((r) => r.deltaPaise !== 0);
  return rows.length ? rows[0]!.id : null;
}

export function deltaDistribution(cycleTraces: Record<string, CycleTrace>) {
  const rows = deltaRows(cycleTraces);
  const buckets = new Map<number, number>();
  for (const r of rows) buckets.set(r.deltaPaise, (buckets.get(r.deltaPaise) || 0) + 1);
  return {
    comparable: rows.length,
    nonZero: rows.filter((r) => r.deltaPaise !== 0).length,
    windowShiftOnly: rows.filter((r) => r.windowShiftOnly).length,
    buckets: [...buckets.entries()].sort((a, b) => b[0] - a[0]),
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export function diagnosisClassOf(
  cycleTrace: CycleTrace | undefined | null,
  agentTrace: AgentTrace | undefined
): string {
  if (cycleTrace?.diagnosisClass) return cycleTrace.diagnosisClass;
  const ruleId = agentTrace?.decision?.policy?.rule_id;
  return DECLINE_CLASS_LABELS[ruleId] ? ruleId : 'UNKNOWN';
}

/** How far the pipeline actually got, from the data — not a playback counter. */
export function reachedStage(
  cycleTrace: CycleTrace | undefined | null,
  agentTrace: AgentTrace | undefined
): number {
  const cls = diagnosisClassOf(cycleTrace, agentTrace);
  // A class that spends no budget stops at DIAGNOSE. Nothing lights past it.
  if (cls === 'TERMINAL' || cls === 'AUTH' || cls === 'UNKNOWN') return 1;
  const econ = cycleEconomics(cycleTrace, agentTrace);
  if (!econ || econ.attempts === 0) return 2;
  const verdict = cycleTrace?.policyVerdict || '';
  const blocked =
    verdict.startsWith('BLOCK') || agentTrace?.decision?.policy?.verdict === 'BLOCK';
  if (blocked) return 4;
  return PIPELINE_STAGE_COUNT;
}
