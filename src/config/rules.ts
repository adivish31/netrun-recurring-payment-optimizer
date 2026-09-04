/**
 * NetRun — src/config/rules.ts
 *
 * SINGLE SOURCE OF TRUTH for every numeric constraint in the system.
 *
 * THE ONE RULE OF THIS CODEBASE:
 *   No numeric literal may appear in src/policy/ or src/schedule/.
 *   Every constraint lives here and declares its provenance.
 *
 * Two kinds only (spec §3, §43):
 *   VERIFIED_RULE — traceable to a primary NPCI / RBI / Razorpay source.
 *                   `verification_status` must reach 'VERIFIED' before the
 *                   value may be quoted in the README, demo or video.
 *   ASSUMPTION    — no authoritative public measurement exists. Must declare
 *                   a `sweep` range so eval/sensitivity.ts can prove the
 *                   headline result is robust, or honestly report the
 *                   break-even point where it is not.
 *
 * Never mix the two categories in prose (spec §57).
 *
 * IMPORTANT (spec §60): the attempt cap is a CONFIGURED constraint, not the
 * product's identity. Regulatory limits change. NetRun is a constrained
 * recovery-budget optimizer — it must be correct for a budget of 2, 4 or 7.
 * Never hardcode the number outside this file, and test the optimizer at more
 * than one budget value.
 *
 * Run `npm run rules:audit` to print the provenance table. Paste it into
 * RULES.md and show it on camera.
 */

// ---------------------------------------------------------------------------
// Provenance schema (spec §43)
// ---------------------------------------------------------------------------

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'COULD_NOT_VERIFY';

export interface VerifiedRule<T> {
  rule_id: string;
  type: 'VERIFIED_RULE';
  value: T;
  unit: string;
  source: string;
  verification_status: VerificationStatus;
  effective_from: string; // ISO date
  notes?: string;
}

export interface Assumption<T> {
  rule_id: string;
  type: 'ASSUMPTION';
  value: T;
  unit: string;
  rationale: string;
  sweep: readonly [number, number];
  notes?: string;
}

export type Rule<T> = VerifiedRule<T> | Assumption<T>;

// ---------------------------------------------------------------------------
// A. RECOVERY BUDGET — configured, not identity (spec §4.1, §60)
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS_PER_CYCLE: Rule<number> = {
  rule_id: 'RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE',
  type: 'VERIFIED_RULE',
  value: 4,
  unit: 'attempts per mandate per cycle (original + retries)',
  source: 'https://caalley.com/news-updates/indian-news/new-upi-rules-from-august-1',
  verification_status: 'VERIFIED',
  effective_from: '2025-08-01',
  notes: 'Secondary (CAalley/Economic Times, 2025-07-28). Verbatim: "one initial attempt and up to three retries per mandate... a total of four attempts". Quotes NPCI press release dated 2025-05-21, compliance deadline 2025-07-31. Primary circular not publicly retrievable.',
};

// ---------------------------------------------------------------------------
// B. EXECUTION WINDOWS — [startMinuteOfDay, endMinuteOfDay) in IST
// ---------------------------------------------------------------------------

export type WindowName = 'early' | 'midday' | 'late';

export const EXECUTION_WINDOWS: Rule<Record<WindowName, readonly [number, number]>> = {
  rule_id: 'AUTOPAY_PERMITTED_EXECUTION_WINDOWS',
  type: 'VERIFIED_RULE',
  value: {
    early: [0, 10 * 60], // 00:00 - 10:00
    midday: [13 * 60, 17 * 60], // 13:00 - 17:00
    late: [21 * 60 + 30, 24 * 60], // 21:30 - 24:00
  },
  unit: 'minutes past IST midnight',
  source: 'https://caalley.com/news-updates/indian-news/new-upi-rules-from-august-1',
  verification_status: 'VERIFIED',
  effective_from: '2025-08-01',
  notes: 'Secondary. Source states PEAK hours as 10:00-13:00 and 17:00-21:30 IST and requires AutoPay execution during non-peak hours only. The three permitted windows encoded here are the COMPLEMENT of stated peak hours -- a derivation, not a verbatim window list.',
};

export const WINDOW_NAMES: readonly WindowName[] = ['early', 'midday', 'late'];

// ---------------------------------------------------------------------------
// C. PRE-DEBIT NOTIFICATION — why an attempt is not a free action
// ---------------------------------------------------------------------------

export const PDN_MIN_LEAD_HOURS: Rule<number> = {
  rule_id: 'UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS',
  type: 'VERIFIED_RULE',
  value: 24,
  unit: 'hours before scheduled debit',
  source: 'TODO — RBI e-mandate framework / NPCI AutoPay operating guidelines.',
  verification_status: 'COULD_NOT_VERIFY',
  effective_from: '2021-10-01',
  notes:
    'Applicable recurring transactions require at least 24 hours of notice. ' +
    'Combined with the customer\'s documented ability to modify / revoke / pause a ' +
    'mandate through supported UPI flows, this is why an attempt is not free: it ' +
    'must be pre-announced to a customer who can act on the announcement. ' +
    'State the MECHANISM only. Do NOT assert a cancellation rate — see section F. ' +
    'Search terms used: "RBI" "e-mandate" "24 hours" "pre-debit"',
};

export const PDN_EXEMPT_MCC: Rule<readonly string[]> = {
  rule_id: 'PD_NOTICE_EXEMPT_MCC',
  type: 'VERIFIED_RULE',
  value: ['4784', '7412'], // FASTag, RuPay NCMC
  unit: 'merchant category code',
  source: 'https://www.business-standard.com/finance/personal-finance/new-upi-autopay-rule-no-24-hour-pre-debit-alert-for-fastag-rupay-ncmc-124092600876_1.html',
  verification_status: 'VERIFIED',
  effective_from: '2024-09-23',
  notes: 'Secondary (Business Standard, 2024-09-26). Names NPCI notification dated 2024-09-23 removing PDN validation for MCC 4784 (NETC FASTag) and MCC 7412 (RuPay NCMC). Traces to RBI Statement on Developmental and Regulatory Policies 2024-06-07 and circular 2024-08-22.',
};

// ---------------------------------------------------------------------------
// D. AUTHENTICATION THRESHOLD — above this, an attempt must become an
//    authenticated / escalated action, never a silent retry (spec §21)
// ---------------------------------------------------------------------------

export const AFA_THRESHOLD_PAISE: Rule<{ default_paise: number; elevated_paise: number; elevated_mccs: readonly string[] }> = {
  rule_id: 'RECURRING_AFA_THRESHOLD_PAISE',
  type: 'VERIFIED_RULE',
  value: {
    default_paise: 15_00_000,
    elevated_paise: 1_00_00_000,
    elevated_mccs: ['5413','5960','6012','6211','6300','6381','6399','6529'],
  },
  unit: 'paise per transaction',
  source: 'TODO -- NPCI AutoPay product overview page; MCC list not independently confirmed, see notes',
  verification_status: 'COULD_NOT_VERIFY',
  effective_from: '2023-12-14',
  notes: 'Checked https://www.npci.org.in/what-we-do/AutoPay/product-overview directly. The rupee figures (15,000 / 1,00,000) are consistent with what is publicly reported, but the elevated-threshold MCC list (5413, 5960, 6012, 6211, 6300, 6381, 6399, 6529) could not be independently confirmed as current -- the page renders content client-side and the MCC list specifically was not verified against it. Values retained in the config as the best available figures but treated as an assumption pending confirmation.',
};

export function getAfaThresholdPaise(mcc: string): number {
  const { default_paise, elevated_paise, elevated_mccs } = AFA_THRESHOLD_PAISE.value;
  return elevated_mccs.includes(mcc) ? elevated_paise : default_paise;
}

// ---------------------------------------------------------------------------
// E. FAILURE DIAGNOSIS SEMANTICS (spec §17)
//    Deterministic mapping first. LLM only for what falls through.
// ---------------------------------------------------------------------------

export type DeclineClass = 'BALANCE' | 'TRANSIENT' | 'AUTH' | 'TERMINAL' | 'UNKNOWN';

export const DECLINE_CODE_CLASS: Rule<Record<string, DeclineClass>> = {
  rule_id: 'DECLINE_CODE_TO_CLASS',
  type: 'VERIFIED_RULE',
  value: {
    insufficient_funds: 'BALANCE',
    limit_exceeded: 'BALANCE',
    bank_technical_error: 'TRANSIENT',
    bank_not_available: 'TRANSIENT',
    gateway_timeout: 'TRANSIENT',
    authentication_failed: 'AUTH',
    authorisation_declined_by_psp: 'AUTH',
    mandate_revoked: 'TERMINAL',
    account_closed: 'TERMINAL',
    account_frozen: 'TERMINAL',
  },
  unit: 'decline code -> class',
  source: 'TODO — Razorpay error/decline-code reference + NPCI response codes.',
  verification_status: 'COULD_NOT_VERIFY',
  effective_from: '2026-01-01',
  notes:
    'Codes absent from this table resolve to UNKNOWN, the ONLY path that reaches the ' +
    'LLM fallback. UNKNOWN that stays unresolved -> ESCALATE, never a silent attempt. ' +
    'This table is also the baseline the LLM fallback is measured against. ' +
    'Search terms used: "Razorpay" "decline codes" OR "error codes" "insufficient_funds" "mandate_revoked"',
};

/**
 * Strategy per class. Deterministic. The LLM never selects this.
 * TERMINAL and AUTH spend ZERO budget — declining to act is a decision, and
 * eval/metrics.ts must reward it (spec §30).
 */
export const CLASS_STRATEGY: Rule<
  Record<DeclineClass, { usePrior: boolean; diversifyWindow: boolean; spendBudget: boolean }>
> = {
  rule_id: 'DECLINE_CLASS_STRATEGY',
  type: 'ASSUMPTION',
  value: {
    BALANCE: { usePrior: true, diversifyWindow: false, spendBudget: true },
    TRANSIENT: { usePrior: false, diversifyWindow: true, spendBudget: true },
    AUTH: { usePrior: false, diversifyWindow: false, spendBudget: false },
    TERMINAL: { usePrior: false, diversifyWindow: false, spendBudget: false },
    UNKNOWN: { usePrior: false, diversifyWindow: false, spendBudget: false },
  },
  unit: 'class -> strategy flags',
  rationale:
    'Derived from the causal reading of each class, not a published table. Defensible ' +
    'from first principles: an attempt cannot cure a revoked mandate or a failed ' +
    'authentication, so spending budget on either is waste. Validated by ablation ' +
    'rather than numeric sweep.',
  sweep: [0, 1],
};

// ---------------------------------------------------------------------------
// F. SURVIVAL / CANCELLATION MODEL — ASSUMPTION; the sweep is MANDATORY
//    (spec §23). The headline depends on this, so the break-even MUST be
//    published. This is the most important honesty in the repository.
// ---------------------------------------------------------------------------

export const CANCEL_HAZARD_BASE: Assumption<number> = {
  rule_id: 'CANCEL_HAZARD_BASE',
  type: 'ASSUMPTION',
  value: 0.02,
  unit: 'probability of mandate cancellation per notification sent',
  rationale:
    'No verified public universal value exists for the probability a customer cancels ' +
    'after an additional pre-debit notification. The MECHANISM is documented; the ' +
    'MAGNITUDE is not. Never present this as measured. eval/sensitivity.ts sweeps it ' +
    'and reports the threshold below which the aggressive baseline is better. ' +
    'PUBLISH THAT NUMBER — it is the single most credible thing in the repo.',
  sweep: [0.0, 0.08],
};

export const CANCEL_FATIGUE: Assumption<number> = {
  rule_id: 'CANCEL_FATIGUE_MULTIPLIER',
  type: 'ASSUMPTION',
  value: 1.6,
  unit: 'hazard multiplier per additional notification in the same cycle',
  rationale:
    'cancellation_probability = base_hazard * fatigue^(notification_number - 1). ' +
    'Geometric fatigue is a modelling choice, not an observation. Swept jointly with ' +
    'the base hazard so the reader sees the surface, not one point.',
  sweep: [1.0, 2.5],
};

// ---------------------------------------------------------------------------
// G. NRV OBJECTIVE PARAMETERS (spec §22)
//    NRV = expected current-cycle recovery
//        + expected future recurring value
//        - expected intervention cost
//        - expected churn / relationship cost
//    Document the exact formulation in METRICS.md. Hide nothing.
// ---------------------------------------------------------------------------

export const ATTEMPT_COST_PAISE: Assumption<number> = {
  rule_id: 'INTERVENTION_COST_PAISE',
  type: 'ASSUMPTION',
  value: 200,
  unit: 'paise per attempt (notification + processing overhead)',
  rationale:
    'Placeholder. Small relative to typical mandate amounts, so it should NOT drive ' +
    'the result — verify that in the sweep. If the headline flips on this value, the ' +
    'objective is mis-specified and you must say so.',
  sweep: [0, 2000],
};

export const FUTURE_CYCLE_HORIZON: Assumption<number> = {
  rule_id: 'FUTURE_CYCLE_HORIZON',
  type: 'ASSUMPTION',
  value: 6,
  unit: 'future cycles of recurring value at risk if the mandate dies',
  rationale:
    'The NRV horizon. A longer horizon strengthens the thesis, so 6 is the cautious ' +
    'choice rather than the flattering one. Report NRV at horizons 3 / 6 / 12 so the ' +
    'reader can see how much of the result the horizon is doing.',
  sweep: [1, 12],
};

export const CONTRIBUTION_MARGIN: Assumption<number> = {
  rule_id: 'CONTRIBUTION_MARGIN',
  type: 'ASSUMPTION',
  value: 1.0,
  unit: 'fraction of mandate amount counted as preserved value',
  rationale:
    'Set to 1.0 so NRV is stated in gross revenue terms and is not inflated by an ' +
    'invented margin. A real merchant would substitute their own.',
  sweep: [0.2, 1.0],
};

// ---------------------------------------------------------------------------
// H. SCHEDULING / ESTIMATION PARAMETERS
// ---------------------------------------------------------------------------

export const RECOVERY_GRACE_DAYS: Assumption<number> = {
  rule_id: 'RECOVERY_GRACE_DAYS',
  type: 'ASSUMPTION',
  value: 15,
  unit: 'days after due date within which recovery may still be attempted',
  rationale:
    'Bounds the candidate day set. Tied to cycle length: attempting past the midpoint ' +
    'of the next cycle risks colliding with the next scheduled debit. Swept to show ' +
    'the coverage/complexity tradeoff.',
  sweep: [5, 25],
};

export const PRIOR_SHRINKAGE_ALPHA: Assumption<number> = {
  rule_id: 'PRIOR_SHRINKAGE_ALPHA',
  type: 'ASSUMPTION',
  value: 5,
  unit: 'pseudo-observations of shrinkage toward the population prior',
  rationale:
    'posterior[d] = (alpha * population_prior[d] + successes[d]) / (alpha + n). ' +
    'alpha = 5 means a customer needs roughly 5 observations before their own pattern ' +
    'dominates. Prevents extreme probabilities on thin history. NOT a regulatory fact. ' +
    'Swept in the history-depth sensitivity run.',
  sweep: [1, 20],
};

export const PROMISE_WEIGHT_CAP: Assumption<number> = {
  rule_id: 'PROMISE_WEIGHT_CAP',
  type: 'ASSUMPTION',
  value: 0.6,
  unit: 'maximum share of prior mass a single promise may claim',
  rationale:
    'A promise shifts prior mass onto the promised date, weighted by the customer\'s ' +
    'own observed keep-rate. Capped so a confident-sounding message can never fully ' +
    'override observed behaviour — this is also the guardrail that makes promise ' +
    'extraction safe against a manipulative or prompt-injected reply.',
  sweep: [0.0, 1.0],
};

export const OPTIMIZER_TIME_BOX_MS: Assumption<number> = {
  rule_id: 'OPTIMIZER_TIME_BOX_MS',
  type: 'ASSUMPTION',
  value: 250,
  unit: 'milliseconds per cycle decision',
  rationale:
    'Guards the exhaustive enumeration. With a small budget over a bounded candidate ' +
    'set the subset space is tiny, so this should never trip; if it does, the decision ' +
    'degrades to ESCALATE rather than a guess. Assert in tests that it never trips on ' +
    'the full generated world.',
  sweep: [50, 2000],
};

export const OPTIMIZER_MAX_CANDIDATES: Assumption<number> = {
  rule_id: 'OPTIMIZER_MAX_CANDIDATES',
  type: 'ASSUMPTION',
  value: 18,
  unit: 'max number of non-dominated candidates to evaluate',
  rationale:
    'Bounds C(K, B) complexity. Prevents combinatorial explosion in subset search.',
  sweep: [10, 20],
};



export const REGEX_FALLBACK_CONFIDENCE_CAP: Assumption<number> = {
  rule_id: 'REGEX_FALLBACK_CONFIDENCE_CAP',
  type: 'ASSUMPTION',
  value: 0.6,
  unit: 'confidence score (0-1)',
  rationale:
    'Regex extraction is deterministic but brittle. It can easily be spoofed by bare ' +
    'digits or injection strings. Its confidence must be strictly lower than a parsed ' +
    'LLM output (which is typically 0.9 or 1.0) so it does not override priors as aggressively.',
  sweep: [0.3, 0.8],
};

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------

export const ALL_RULES: readonly Rule<unknown>[] = [
  MAX_ATTEMPTS_PER_CYCLE,
  EXECUTION_WINDOWS,
  PDN_MIN_LEAD_HOURS,
  PDN_EXEMPT_MCC,
  AFA_THRESHOLD_PAISE,
  DECLINE_CODE_CLASS,
  CLASS_STRATEGY,
  CANCEL_HAZARD_BASE,
  CANCEL_FATIGUE,
  ATTEMPT_COST_PAISE,
  FUTURE_CYCLE_HORIZON,
  CONTRIBUTION_MARGIN,
  RECOVERY_GRACE_DAYS,
  PRIOR_SHRINKAGE_ALPHA,
  PROMISE_WEIGHT_CAP,
  OPTIMIZER_TIME_BOX_MS,
  OPTIMIZER_MAX_CANDIDATES,
  REGEX_FALLBACK_CONFIDENCE_CAP,
];

export const unverifiedRules = (): string[] =>
  ALL_RULES.filter(
    (r) => r.type === 'VERIFIED_RULE' && r.verification_status === 'UNVERIFIED'
  ).map((r) => r.rule_id);

export const couldNotVerify = (): string[] =>
  ALL_RULES.filter(
    (r) => r.type === 'VERIFIED_RULE' && r.verification_status === 'COULD_NOT_VERIFY'
  ).map((r) => r.rule_id);
