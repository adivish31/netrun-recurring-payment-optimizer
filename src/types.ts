/**
 * NetRun — src/types.ts
 *
 * Money is ALWAYS integer paise (spec §15). No float anywhere in this codebase.
 * Rs 1,000 = 100000 paise. A payments panel will look for this.
 */

import type {
  DeclineClass,
  WindowName,
} from './config/rules';

export type { DeclineClass, WindowName };

/** YYYY-MM-DD, always IST-normalised. */
export type ISODate = string;

// ---------------------------------------------------------------------------
// Entities (spec §14)
// ---------------------------------------------------------------------------

export interface Mandate {
  mandateId: string;
  customerId: string;
  amountPaise: number;
  mcc: string;
  status: 'active' | 'halted' | 'cancelled';
  createdOn: ISODate;
  cycleDay: number; // 1..28
}

export interface Cycle {
  cycleId: string;
  mandateId: string;
  cycleNo: number;
  dueDate: ISODate;
  attemptsUsed: number; // DB CHECK against the configured budget
  pdnsSent: number;
  outcome: 'pending' | 'recovered' | 'lost' | 'mandate_cancelled';
  recoveredPaise: number;
}

export interface Attempt {
  attemptId: string;
  cycleId: string;
  attemptNo: number;
  scheduledFor: string; // ISO timestamp, IST
  window: WindowName;
  pdnSentAt: string | null;
  executedAt: string | null;
  result: 'pending' | 'success' | 'failure' | 'skipped' | 'blocked';
  declineCode: string | null;
  idempotencyKey: string; // UNIQUE in DB
}

// ---------------------------------------------------------------------------
// Diagnosis (spec §17) — the ONLY shape the LLM may emit for classification.
// Anything outside this enum is rejected by zod and falls back to the lookup
// table. The LLM cannot widen its own output space.
// ---------------------------------------------------------------------------

export interface Diagnosis {
  cycleId: string;
  class: DeclineClass;
  confidence: number; // 0..1
  source: 'lookup' | 'llm' | 'llm_rejected_fallback_lookup';
  rawCode: string | null;
  evidence: string;
}

/**
 * Promise-to-Pay (spec §18, §19), extracted from a free-text (typically
 * Hinglish) customer reply. This is the one place where natural language
 * genuinely changes a money decision: it shifts prior mass onto `promisedDate`,
 * weighted by the customer's own observed keep-rate and capped by
 * PROMISE_WEIGHT_CAP.
 *
 * The LLM emits ONLY this struct. Free text never acts as instruction.
 */
export interface PromiseToPay {
  cycleId: string;
  promisedDate: ISODate | null;
  promisedAmountPaise: number | null;
  confidence: number; // 0..1
  intent: 'will_pay' | 'cannot_pay' | 'already_paid' | 'dispute' | 'unclear';
  /**
   * Where the extraction came from. 'mock' is the keyword stub that runs only
   * under ALLOW_MOCK_LLM=1 — it is a distinct value precisely so stub output
   * can never be counted or displayed as model output.
   */
  source: 'regex' | 'llm' | 'mock' | 'llm_rejected_fallback_regex';
  sourceText: string;
}

// ---------------------------------------------------------------------------
// Success-probability estimation (spec §16)
// ---------------------------------------------------------------------------

/**
 * The optimizer depends ONLY on this interface, never on a concrete estimator.
 *
 * Build order note (see BUILD_ORDER.md, step 6 vs step 8): the exact optimizer
 * is built BEFORE the real prior estimator. Implement `PopulationEstimator`
 * first so the optimizer has a working probability source and the whole
 * evaluation spine runs end to end; then swap in `ShrinkageEstimator` and
 * report the delta as the estimator's measured contribution.
 */
export interface SuccessEstimator {
  name: string;
  /** P(payment succeeds | attempt in this slot, this cycle's context). */
  pSuccess(ctx: EstimationContext, date: ISODate, window: WindowName): number;
}

export interface EstimationContext {
  cycleId: string;
  customerId: string;
  amountPaise: number;
  mcc: string;
  dueDate: ISODate;
  diagnosis: Diagnosis;
  promise: PromiseToPay | null;
  /** Observable history only. Latent simulator state must NEVER appear here. */
  history: ObservedHistory;
}

export interface ObservedHistory {
  /** Day-of-month of each past successful collection. */
  successDays: number[];
  /** Day-of-month of each past failed attempt. */
  failureDays: number[];
  pastCycles: number;
  pastPromisesMade: number;
  pastPromisesKept: number;
}

export interface SuccessPrior {
  customerId: string;
  /** index 0 => day 1. Normalised over the candidate horizon. */
  byDayOfMonth: number[];
  observations: number;
  promiseAdjusted: boolean;
  estimatorName: string;
}

// ---------------------------------------------------------------------------
// Scheduling (spec §20, §21)
// ---------------------------------------------------------------------------

export interface Slot {
  date: ISODate;
  window: WindowName;
  pSuccess: number;
}

export interface Schedule {
  slots: Slot[]; // length <= remaining budget
  expectedNrvPaise: number;
  /** NRV decomposition — spec §22 requires the formulation be explicit. */
  breakdown: {
    expectedCurrentRecoveryPaise: number;
    expectedFutureValuePaise: number;
    expectedInterventionCostPaise: number;
    expectedChurnCostPaise: number;
  };
  pRecoverThisCycle: number;
  pMandateSurvives: number;
}

export interface OptimizerResult {
  chosen: Schedule | null;
  alternativesConsidered: number;
  /** Runner-up, so the dashboard can answer "why THIS schedule?" (spec §40). */
  runnerUp: Schedule | null;
  timedOut: boolean;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Policy (spec §11, §21) — the engine has FINAL authority and may override
// the optimizer. Every verdict carries the rule_id that produced it.
// ---------------------------------------------------------------------------

export type PolicyVerdict =
  | { verdict: 'APPROVE'; rule_id: string }
  | { verdict: 'MODIFY'; rule_id: string; reason: string; modified: Schedule }
  | { verdict: 'BLOCK'; rule_id: string; reason: string }
  | { verdict: 'ESCALATE'; rule_id: string; reason: string };

export type ActionType =
  | 'SCHEDULE_ATTEMPT'
  | 'SEND_PDN'
  | 'PAYMENT_LINK'
  | 'STOP'
  | 'ESCALATE';

export interface Decision {
  decisionId: string;
  cycleId: string;
  chosenSchedule: Schedule | null;
  action: ActionType;
  policy: PolicyVerdict;
  alternativesConsidered: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Evaluation (spec §29, §30)
// ---------------------------------------------------------------------------

export type StrategyName =
  | 'netrun'
  | 'netrun_shrinkage'
  | 'netrun_promise'
  | 'fixed' // fixed offsets, e.g. T+1 / T+3 / T+7
  | 'aggressive' // spend the whole budget as early as permitted
  | 'rules_only' // decline-code lookup, no prior, no promise
  | 'oracle'; // knows the true replenishment day

export interface StrategyResult {
  strategy: StrategyName;
  cyclesEvaluated: number;

  // Primary (spec §30)
  grossRecoveredPaise: number;
  incrementalRecoveryPaise: number; // vs the no-action counterfactual
  netRecurringValuePaise: number; // HEADLINE
  pctOfOracleNrv: number;

  // Additional
  attemptsSpent: number;
  pdnsSent: number;
  mandatesCancelled: number;
  terminalCorrectlySkipped: number;
  escalations: number;
  ruleViolations: number; // MUST be 0
  meanDecisionLatencyMs: number;
}

export interface SensitivityPoint {
  parameter: string;
  value: number;
  netrunNrvPaise: number;
  bestBaseline: StrategyName;
  bestBaselineNrvPaise: number;
  netrunWins: boolean;
}
