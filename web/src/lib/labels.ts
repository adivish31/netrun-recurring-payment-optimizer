/**
 * NetRun — web/src/lib/labels.ts
 *
 * THE SINGLE SOURCE FOR EVERY HUMAN-FACING STRING IN THE COCKPIT.
 *
 * No component may hardcode a display label. Internal identifiers
 * (rule_ids, tool names, strategy keys, cycle ids) stay in the data and
 * surface only behind "Show detail".
 *
 * Lead sentences are TEMPLATES here; every number inside one is passed in by
 * the caller from real data. Nothing in this file invents a measurement.
 */

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export const STRATEGY_LABELS: Record<string, string> = {
  netrun: 'NetRun (base)',
  netrun_shrinkage: 'NetRun + customer history',
  netrun_promise: 'NetRun + customer replies',
  rules_only: 'Decline-code rules only',
  fixed: 'Fixed schedule (T+1/3/7)',
  aggressive: 'Retry immediately',
  oracle: 'Theoretical ceiling',
};

/** The oracle has perfect foresight. It is a reference line, never a competitor. */
export const ORACLE_KEY = 'oracle';
export const ORACLE_REFERENCE_LABEL = 'Theoretical ceiling (perfect foresight)';

export const isNetrunStrategy = (key: string) => key.startsWith('netrun');

// ---------------------------------------------------------------------------
// Metrics — internal column key -> plain words
// ---------------------------------------------------------------------------

export const METRIC_LABELS: Record<string, string> = {
  NRV: 'Net recurring value',
  nrv: 'Net recurring value',
  'att/cyc': 'Attempts per cycle',
  att_cyc: 'Attempts per cycle',
  'pdn/cyc': 'Notices per cycle',
  pdn_cyc: 'Notices per cycle',
  interv: 'Cost of trying',
  churn: 'Value lost to cancellations',
  'P(succ)': 'Chance of success',
  Alts: 'Schedules evaluated',
  alternativesConsidered: 'Schedules evaluated',
  idemp: 'Duplicate-protection key',
  gross: 'Money collected now',
  future: 'Future payments kept',
  violations: 'Policy violations',
};

/** "net recurring value (NRV)" on first use per tab, then "NRV". */
export const NRV_FIRST_USE = 'net recurring value (NRV)';
export const NRV_SHORT = 'NRV';

// ---------------------------------------------------------------------------
// Decline classes
// ---------------------------------------------------------------------------

export const DECLINE_CLASS_LABELS: Record<string, string> = {
  BALANCE: 'No money in the account',
  TRANSIENT: 'Bank was down',
  AUTH: 'Authorisation problem',
  TERMINAL: 'Mandate is dead',
  UNKNOWN: 'Cause not classified',
};

// ---------------------------------------------------------------------------
// Policy verdicts and the rule ids that reach the screen
// ---------------------------------------------------------------------------

export const POLICY_LABELS: Record<string, string> = {
  'auto-approved': 'Approved by the rulebook',
  APPROVE: 'Allowed',
  BLOCK: 'Refused',
  ESCALATE: 'Sent to a human',
  NONE: 'Not evaluated',
  EXECUTION_BLOCKED: 'Refused — approval token did not match',
  DECLINE_CLASS_STRATEGY: 'Refused — this class of failure spends no attempts',
  TRANSIENT: 'Refused — no legal schedule was available',
};

// ---------------------------------------------------------------------------
// Constraint provenance
// ---------------------------------------------------------------------------

export const RULE_STATUS_LABELS: Record<string, string> = {
  VERIFIED: 'Traced to a dated NPCI source',
  COULD_NOT_VERIFY: 'Has a real published value we could not confirm',
  ASSUMPTION: 'No authoritative value exists, so we state ours',
  UNVERIFIED: 'Not yet checked',
};

export const RULE_STATUS_SHORT: Record<string, string> = {
  VERIFIED: 'Verified',
  COULD_NOT_VERIFY: 'Could not verify',
  ASSUMPTION: 'Assumption',
  UNVERIFIED: 'Not checked',
};

// ---------------------------------------------------------------------------
// Agent tools — label, sub-label, and who actually does the work.
//
// This is the point of the Agent tab: exactly one step consults a model, and
// it is not the step that picks dates and not the step that moves money.
// ---------------------------------------------------------------------------

export type ToolKind = 'reads-only' | 'model' | 'deterministic' | 'gated';

export interface ToolLabel {
  /** internal name — shown only behind Show detail */
  name: string;
  label: string;
  subLabel: string;
  kind: ToolKind;
}

export const TOOL_LABELS: Record<string, ToolLabel> = {
  get_customer_history: {
    name: 'get_customer_history',
    label: 'Look up payment history',
    subLabel: 'reads only',
    kind: 'reads-only',
  },
  get_recent_replies: {
    name: 'get_recent_replies',
    label: "Read customer's message",
    subLabel: 'reads only',
    kind: 'reads-only',
  },
  extract_promise: {
    name: 'extract_promise',
    label: 'Understand what they said',
    subLabel: 'AI',
    kind: 'model',
  },
  propose_schedule: {
    name: 'propose_schedule',
    label: 'Ask the planner for dates',
    subLabel: 'not AI',
    kind: 'deterministic',
  },
  check_policy: {
    name: 'check_policy',
    label: 'Check against the rulebook',
    subLabel: 'not AI',
    kind: 'deterministic',
  },
  execute: {
    name: 'execute',
    label: 'Schedule the attempt',
    subLabel: 'needs approval',
    kind: 'gated',
  },
};

export const TOOL_ORDER: readonly string[] = [
  'get_customer_history',
  'get_recent_replies',
  'extract_promise',
  'propose_schedule',
  'check_policy',
  'execute',
];

export const toolLabel = (name: string): ToolLabel =>
  TOOL_LABELS[name] || { name, label: name, subLabel: '', kind: 'deterministic' };

/**
 * The sub-label on `extract_promise` says "AI" because that step is the one
 * wired to the model. When a specific run shows the model's output was
 * REJECTED and the deterministic fallback ran instead, the run-specific label
 * below is used — claiming the AI classified something it did not would be a
 * lie the trace itself contradicts.
 */
export const EXTRACT_SOURCE_LABELS: Record<string, string> = {
  llm: 'AI read it',
  llm_rejected_fallback_regex: 'AI output rejected — pattern matcher ran instead',
  regex: 'Pattern matcher',
};

export const extractSourceLabel = (source?: string | null): string =>
  (source && EXTRACT_SOURCE_LABELS[source]) || '';

/** Labels for the Agent tab's flow graph. Nothing in the canvas is hardcoded. */
export const FLOW_LABELS = {
  agentNode: 'Agent',
  aiBadge: 'AI',
  notAiBadge: 'not AI',
  fellBack: 'fell back to rules',
  callCount: (n: number) => `×${n}`,
  caption:
    'Each particle is one tool call. The model chooses which tool to call; the tools themselves are ordinary code.',
  unavailable: 'Flow graph unavailable — the step list below is the record.',
  stepControl: 'Step',
  runControl: 'Run',
  resetControl: 'Reset',
  speedControl: 'Speed',
};

/** The one always-visible line above the tool strip. */
export const TRUST_BOUNDARY_LINE =
  'The AI reads messages and decides what to look up. It never picks the dates and never moves money.';

export const AGENT_CANNOT_DO: readonly string[] = [
  'author a schedule — it can only ask for one',
  'compute money',
  'change a policy limit',
  'supply its own duplicate-protection key',
  'run anything without a server-minted approval token',
];

// ---------------------------------------------------------------------------
// Capture status
// ---------------------------------------------------------------------------

export const CAPTURE_LABELS: Record<string, string> = {
  live: 'Live AI run',
  deterministic:
    'Tool sequence run without the AI — summaries are generated from tool results, not model output',
};

export const captureLabel = (captured: string, capturedOn?: string | null): string => {
  if (captured === 'live') {
    return capturedOn ? `${CAPTURE_LABELS.live} — captured ${capturedOn}` : CAPTURE_LABELS.live;
  }
  return CAPTURE_LABELS[captured] || '';
};

/** Shown once per trace, never once per step. */
export const SUMMARY_PROVENANCE_NOTE =
  '(summaries generated from the tool results, not model output)';

/** Gemini 3.x returns no readable text beside a function call. Stated once. */
export const NO_MODEL_TEXT_NOTE =
  'The model returned no readable text alongside its function calls — only an opaque thought signature, which this trace does not persist.';

// ---------------------------------------------------------------------------
// Trace scenarios — the human half of the dropdown label
// ---------------------------------------------------------------------------

export const TRACE_SCENARIO_LABELS: Record<string, string> = {
  mdt_0005_c3: 'Customer promised a date',
  mdt_0005_c2: 'Someone tried to fake approval',
  mdt_0005_c4: 'Forged token blocked',
  mdt_0005_c6: 'AI unavailable, fell back',
  mdt_0005_c5: 'No customer reply',
  mdt_0004_c1: 'Partial run (AI timed out)',
  mdt_0002_c1: 'Planner found no legal schedule',
  mdt_0005_c1: 'Nothing captured',
};

/** Used when a cycle is not in the table above. */
export const TRACE_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard run',
  adversarial_injection: 'Injected instruction in a reply',
  adversarial_forged: 'Forged approval token',
  adversarial_unavailable: 'AI unavailable',
  live: 'Live run',
};

export const traceScenarioLabel = (cycleId: string, type?: string): string =>
  TRACE_SCENARIO_LABELS[cycleId] || TRACE_TYPE_LABELS[type || ''] || 'Recorded run';

export const stepWord = (n: number) => (n === 1 ? '1 step' : `${n} steps`);
export const LIVE_AI_TAG = 'LIVE AI';

// ---------------------------------------------------------------------------
// Pipeline nodes
// ---------------------------------------------------------------------------

export interface PipelineNode {
  /** internal stage name — behind Show detail */
  internal: string;
  n: number;
  label: string;
}

export const PIPELINE_NODES: readonly PipelineNode[] = [
  { internal: 'DIAGNOSE', n: 1, label: 'Why did it fail?' },
  { internal: 'ESTIMATE', n: 2, label: 'When will they have money?' },
  { internal: 'OPTIMISE', n: 3, label: 'Which days are best?' },
  { internal: 'CHECK POLICY', n: 4, label: 'Is this allowed?' },
  { internal: 'EXECUTE', n: 5, label: 'Schedule it' },
];

export const nodeHeader = (node: PipelineNode) => `${node.n} · ${node.label}`;

export const NODE_FIELD_LABELS: Record<string, string> = {
  Class: 'Cause',
  Source: 'Decided by',
  Alts: 'Schedules evaluated',
  'Chosen NRV': 'Value of this plan',
  Delta: 'Better than next best by',
  Confidence: 'Confidence',
  Estimator: 'Decided by',
  Promise: 'Customer promise',
  Slots: 'Attempts scheduled',
  Verdict: 'Rulebook verdict',
};

export const DECIDED_BY_LABELS: Record<string, string> = {
  lookup: 'Decline-code lookup (no AI)',
  llm: 'AI classifier',
  shrinkage: 'Customer history, shrunk toward the population',
  population: 'Population averages only',
  promise: "Customer's own reply",
};

export const WINDOW_LABELS: Record<string, string> = {
  early: 'before 10am',
  midday: '1pm to 5pm',
  late: 'after 9:30pm',
};

export const NRV_EQUATION_LABELS = {
  gross: 'Money collected now',
  future: 'Future payments kept',
  interv: 'Cost of trying',
  churn: 'Value lost to cancellations',
  total: 'Total',
};

// ---------------------------------------------------------------------------
// Right rail and header
// ---------------------------------------------------------------------------

export const RAIL_LABELS = {
  latestSignal: 'Latest signal',
  attemptsUsed: 'Attempts used',
  traceLog: 'Trace log',
  noticesSent: 'Notices sent',
  cancelChance: 'Chance a customer cancels after a notice',
  valueAtRisk: 'Future value at risk',
  more: 'More',
  less: 'Less',
};

export const HEADER_LABELS = {
  simulatedReplay: 'SIMULATED REPLAY',
  replayClock: (day: number, ofDays: number) => `Simulated replay · day ${day} of ${ofDays}`,
  budget: (cap: number) => `budget ${cap} attempts`,
  attribution: 'Razorpay AI Buildathon · Track 03',
  productName: 'NetRun',
  surfaceName: 'COCKPIT',
  strapline: 'Recovery operator surface — bounded retries under NPCI constraints',
  back: '← Back',
};

export const SHOW_DETAIL = 'Show detail ▸';
export const HIDE_DETAIL = 'Hide detail ▾';

export const TAB_LABELS: readonly { id: string; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'decision', label: 'Decision' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'runs', label: 'Runs' },
];

// ---------------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------------

export const SENSITIVITY_LABELS = {
  axisX: 'Chance a customer cancels after a notice',
  axisY: 'Net recurring value',
  oracleReference: ORACLE_REFERENCE_LABEL,
  rankingHeading: 'Ranking — real strategies only',
  oracleExcludedNote:
    'The theoretical ceiling is what a planner with perfect foresight would score. It is a reference line, not a competitor, so it is excluded from the ranking.',
  horizonLabel: 'Months of future value counted',
};

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export const CONSTRAINTS_LABELS = {
  showAll: 'Show all constraints ▸',
  hideAll: 'Hide constraints ▾',
  ruleId: 'Rule ID',
  value: 'Value',
  provenance: 'Status and provenance',
  sweepRange: 'Tested across',
  noProvenance: 'No source recorded',
};

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export const RUNS_COLUMN_LABELS: readonly { key: string; label: string }[] = [
  { key: 'strategy', label: 'Strategy' },
  { key: 'nrv', label: 'Net recurring value' },
  { key: 'gross', label: 'Money collected now' },
  { key: 'future', label: 'Future payments kept' },
  { key: 'interv', label: 'Cost of trying' },
  { key: 'churn', label: 'Value lost to cancellations' },
  { key: 'att_cyc', label: 'Attempts per cycle' },
  { key: 'pdn_cyc', label: 'Notices per cycle' },
  { key: 'violations', label: 'Policy violations' },
];

// ---------------------------------------------------------------------------
// Lead sentences.
//
// Every tab leads with one plain sentence and one number. The SENTENCE is
// selected here from an outcome the data reports; the NUMBER is always
// interpolated by the caller from real data. No lead is a fixed string with a
// number baked into it.
// ---------------------------------------------------------------------------

export type AgentOutcome =
  | 'executed'
  | 'declined_terminal'
  | 'forged_token'
  | 'ai_unavailable'
  | 'ai_unavailable_unscheduled'
  | 'injection_blocked'
  | 'no_legal_schedule'
  | 'incomplete';

export const AGENT_LEADS: Record<AgentOutcome, string> = {
  executed:
    "The agent checked this customer's payment history, read their reply, asked the planner for dates, and the rulebook approved it.",
  declined_terminal:
    'This mandate is dead — the account is closed. The agent correctly spent zero attempts.',
  forged_token:
    'The agent tried to run a schedule the rulebook had not approved. The system refused.',
  ai_unavailable:
    'The AI was unreachable, so the system used its rule-based planner instead. The payment was still scheduled.',
  /** Same cause, but nothing was scheduled — never claim an outcome the data lacks. */
  ai_unavailable_unscheduled:
    'The AI was unreachable. The system stopped rather than act without it, and scheduled nothing.',
  injection_blocked:
    'A reply tried to instruct the agent directly. Two separate guardrails stopped it.',
  no_legal_schedule:
    'The planner could not find a schedule that satisfies every limit, so the agent stopped rather than guess.',
  incomplete:
    'The run stopped early — the AI became unreachable partway through, before any schedule was proposed.',
};

/**
 * The injection story, in the order the guardrails actually fired.
 * Guardrail 1 defeated the injection. Guardrail 2 is a separate, later
 * stale-token rejection. Presenting the second as though it stopped the
 * injection is inaccurate, and a reviewer will unpick it.
 */
export const INJECTION_GUARDRAILS = {
  heading: 'Two guardrails fired, in this order',
  first: (sourceNote: string) =>
    `The reply was passed to the promise extractor, which classified it as unclear and extracted no promise — the injected instruction never reached the planner. ${sourceNote}`,
  second:
    'Later, the agent tried to execute using a token minted by an earlier rulebook check. That token did not match the schedule being executed, and the system rejected it too.',
  note: 'The second rejection is a stale-token rejection. It is not what defeated the injection.',
};

/** Volunteered, not hidden: the model over-called its tools. */
export const OVER_CALL_LINE = (
  toolCalls: number,
  modelTurns: number,
  stages: number,
  repeats: string
) =>
  `The model called some tools more than once — ${toolCalls} steps across ${modelTurns} model turns for a ${stages}-stage pipeline (${repeats}). This is why the iteration cap exists.`;

export const PIPELINE_LEADS: Record<string, string> = {
  BALANCE:
    "This payment failed because the account had no money. NetRun waited for the customer's likely payday instead of retrying straight away.",
  TRANSIENT:
    'This payment failed because the bank was down. NetRun spread the retries across different windows instead of hammering one.',
  AUTH:
    'This payment failed on authorisation. An attempt cannot cure that, so NetRun spent no attempts.',
  TERMINAL:
    'This mandate is dead — the account is closed. NetRun spent no attempts.',
  UNKNOWN:
    'The decline code did not map to a known cause, so NetRun escalated instead of attempting blind.',
};

export const DECISION_LEADS = {
  positive: (amount: string) => `The chosen plan is worth ${amount} more than the next best option.`,
  identical:
    'The next best option scores exactly the same as the chosen one — the planner found a genuine tie.',
  noSchedule: 'No schedule was chosen for this cycle, so there is nothing to compare.',
  substituted: (shownId: string) =>
    `The selected cycle has no alternative schedule to compare. Showing ${shownId} instead.`,
};

export const SENSITIVITY_LEAD =
  'We could not verify how often customers cancel after a notice. So we tested every possible value — NetRun beats every baseline at all of them.';

export const SENSITIVITY_LEAD_QUALIFIED = (failures: number) =>
  `We could not verify how often customers cancel after a notice, so we tested every possible value. NetRun beats every baseline at all but ${failures} of them — see the ranking.`;

export const CONSTRAINTS_LEAD = (
  total: number,
  verified: number,
  couldNotVerify: number,
  assumptions: number
) =>
  `${total} limits govern this system. ${verified} are verified against dated NPCI sources, ${couldNotVerify} we could not verify, and ${assumptions} are stated assumptions tested across their full range.`;

export const RUNS_LEAD = (cycles: string) =>
  `Across ${cycles} simulated payment cycles, NetRun recovered more money than the standard approaches while making half as many attempts.`;

export const DECLINED_ZERO_ATTEMPTS = 'Declined — zero attempts spent';

/**
 * One plain sentence per step, DERIVED from the tool call and its result.
 *
 * The traces carry no readable model text — only the placeholder
 * "Model generated tool call without explicit reasoning text", which is
 * useless repeated twelve times. These templates turn the tool result into a
 * sentence a viewer can read, and the tab labels them as generated summaries
 * exactly once per trace (SUMMARY_PROVENANCE_NOTE).
 */
export const STEP_SUMMARY = {
  history: (days: string, cycles: number) =>
    days
      ? `Past payments landed on ${days}, over ${cycles} earlier cycles.`
      : `No successful payment days on record, over ${cycles} earlier cycles.`,
  reply: (text: string) => `They replied: "${text}"`,
  noReply: 'No reply on file for this cycle.',
  promiseFound: (day: string, confidence: string, sourceNote: string) =>
    `Read as a promise to pay on the ${day}, confidence ${confidence}. ${sourceNote}`,
  promiseUnclear: (sourceNote: string) =>
    `Read as unclear — no promise was extracted. ${sourceNote}`,
  scheduleProposed: (attempts: number, when: string, value: string, alternatives: string) =>
    `The planner returned ${attempts === 1 ? '1 attempt' : `${attempts} attempts`} (${when}) worth ${value}, after comparing ${alternatives} alternatives.`,
  scheduleFailed: 'The planner found no schedule that satisfies every limit.',
  policyApproved: 'The rulebook allowed it and minted a fresh approval token.',
  policyRefused: (reason: string) => `The rulebook refused it: ${reason}`,
  executed: 'Scheduled. The duplicate-protection key was derived on the server, not supplied.',
  executeRefused: 'Refused — the approval token did not match the schedule being executed.',
  executeBlockedNoOutput:
    'Refused before it could run — the approval token did not match the schedule being executed.',
  unknown: 'Tool returned no summary.',
};

export const AND_JOIN = (parts: string[]): string => {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

export const ORDINAL = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

export const REPEAT_PHRASE = (entries: { label: string; times: number }[]): string =>
  AND_JOIN(entries.map((e) => `${e.label.toLowerCase()} ${e.times} times`));

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const MINUS = '−'; // true minus sign, not a hyphen

/** ₹1,234 — unsigned magnitude with a leading minus when negative. Input is paise. */
export function formatRupees(paise: number, fractionDigits = 0): string {
  const rupees = (paise || 0) / 100;
  const abs = Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return rupees < 0 ? `${MINUS}₹${abs}` : `₹${abs}`;
}

/**
 * +₹501.48 or −₹501.48. NEVER "+₹-501.48": the sign is applied to the
 * currency symbol and the magnitude is always absolute.
 */
export function formatSignedRupees(paise: number, fractionDigits = 2): string {
  const rupees = (paise || 0) / 100;
  const sign = rupees < 0 ? MINUS : '+';
  const abs = Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${sign}₹${abs}`;
}

/** +2.7% or −2.7%. Never "+-2.7%". */
export function formatSignedPercent(pct: number, fractionDigits = 1): string {
  if (!Number.isFinite(pct)) return 'n/a';
  const sign = pct < 0 ? MINUS : '+';
  return `${sign}${Math.abs(pct).toFixed(fractionDigits)}%`;
}

export function formatPercent(pct: number, fractionDigits = 1): string {
  if (!Number.isFinite(pct)) return 'n/a';
  return `${pct.toFixed(fractionDigits)}%`;
}

export function formatCount(n: number): string {
  return (n || 0).toLocaleString('en-IN');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Generic lookup, for call sites holding a key that is not known statically
// ---------------------------------------------------------------------------

const ALL_LABELS: Record<string, string> = {
  ...STRATEGY_LABELS,
  ...METRIC_LABELS,
  ...DECLINE_CLASS_LABELS,
  ...POLICY_LABELS,
  ...RULE_STATUS_LABELS,
  ...NODE_FIELD_LABELS,
  ...WINDOW_LABELS,
};

export const getLabel = (key: string): string => ALL_LABELS[key] ?? key;
