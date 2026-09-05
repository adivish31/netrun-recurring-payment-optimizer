# Constraints and Rules

Every numeric constraint in this system is strictly separated from the business logic. There are no magic numbers in `src/policy/` or `src/schedule/`. All constraints reside in a single typed configuration file (`src/config/rules.ts`).

## The 3/3/12 Split

The system operates under exactly **18 constraints**:
- **6 Rules**: Derived from documentation or structure.
  - **3 VERIFIED**: Successfully traced to primary or secondary public documents (e.g. NPCI circulars, press releases).
  - **3 COULD_NOT_VERIFY**: The mechanism exists, but the exact numeric threshold could not be sourced publicly.
- **12 ASSUMPTIONs**: Model parameters required to run the simulation, but for which no public measurement exists. These are aggressively swept across wide bounds to prove the system's conclusions hold regardless of the specific number.

> [!IMPORTANT]
> The optimizer is evaluated at budgets 2, 4, and 7 precisely because the attempt cap is a configuration parameter, not the product's identity. If regulatory limits change tomorrow, the engine remains correct.

## Provenance Audit

The following table is output verbatim from `npm run rules:audit`:

```text
NetRun — constraint provenance audit
======================================================================================================================
RULE ID                                 VALUE                     TYPE           PROVENANCE
----------------------------------------------------------------------------------------------------------------------
RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE  4                         VERIFIED_RULE  [VERIFIED] https://caalley.com/news-updates/indian-news/new-upi-rules-from-august-1
AUTOPAY_PERMITTED_EXECUTION_WINDOWS     {"early":[0,600],"midday"…VERIFIED_RULE  [VERIFIED] https://caalley.com/news-updates/indian-news/new-upi-rules-from-august-1
UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS        24                        VERIFIED_RULE  [COULD_NOT_VERIFY] TODO — RBI e-mandate framework / NPCI AutoPay operating guidelines.
PD_NOTICE_EXEMPT_MCC                    ["4784","7412"]           VERIFIED_RULE  [VERIFIED] https://www.business-standard.com/finance/personal-finance/new-upi-autopay-rule-no-24-hour-pre-debit-alert-for-fastag-rupay-ncmc-124092600876_1.html
RECURRING_AFA_THRESHOLD_PAISE           {"default_paise":1500000,…VERIFIED_RULE  [COULD_NOT_VERIFY] TODO -- NPCI AutoPay product overview page; MCC list not independently confirmed, see notes
DECLINE_CODE_TO_CLASS                   {"insufficient_funds":"BA…VERIFIED_RULE  [COULD_NOT_VERIFY] TODO — Razorpay error/decline-code reference + NPCI response codes.
DECLINE_CLASS_STRATEGY                  {"BALANCE":{"usePrior":tr…ASSUMPTION     sweep [0, 1] — Derived from the causal reading of each class, not a publi…
CANCEL_HAZARD_BASE                      0.02                      ASSUMPTION     sweep [0, 0.08] — No verified public universal value exists for the probabil…
CANCEL_FATIGUE_MULTIPLIER               1.6                       ASSUMPTION     sweep [1, 2.5] — cancellation_probability = base_hazard * fatigue^(notifica…
INTERVENTION_COST_PAISE                 200                       ASSUMPTION     sweep [0, 2000] — Placeholder. Small relative to typical mandate amounts, so…
FUTURE_CYCLE_HORIZON                    6                         ASSUMPTION     sweep [1, 12] — The NRV horizon. A longer horizon strengthens the thesis, …
CONTRIBUTION_MARGIN                     1                         ASSUMPTION     sweep [0.2, 1] — Set to 1.0 so NRV is stated in gross revenue terms and is …
RECOVERY_GRACE_DAYS                     15                        ASSUMPTION     sweep [5, 25] — Bounds the candidate day set. Tied to cycle length: attemp…
PRIOR_SHRINKAGE_ALPHA                   5                         ASSUMPTION     sweep [1, 20] — posterior[d] = (alpha * population_prior[d] + successes[d]…
PROMISE_WEIGHT_CAP                      0.6                       ASSUMPTION     sweep [0, 1] — A promise shifts prior mass onto the promised date, weight…
OPTIMIZER_TIME_BOX_MS                   250                       ASSUMPTION     sweep [50, 2000] — Guards the exhaustive enumeration. With a small budget ove…
OPTIMIZER_MAX_CANDIDATES                18                        ASSUMPTION     sweep [10, 20] — Bounds C(K, B) complexity. Prevents combinatorial explosio…
REGEX_FALLBACK_CONFIDENCE_CAP           0.6                       ASSUMPTION     sweep [0.3, 0.8] — Regex extraction is deterministic but brittle. It can easi…
----------------------------------------------------------------------------------------------------------------------
18 constraints — 6 rules, 12 assumptions, 3 could not be verified

COULD_NOT_VERIFY (state this openly in README + video):
  - UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS
  - RECURRING_AFA_THRESHOLD_PAISE
  - DECLINE_CODE_TO_CLASS
Audit complete (some rules could not be verified).
```

### Note on Unverified Rules

The 3 `COULD_NOT_VERIFY` rules listed above are never presented as verified facts. The mechanisms absolutely exist in UPI AutoPay logic (AFA threshold steps, advance notice windows), but retrieving the primary source circular PDF proving the *exact numeric integer* was not achieved before release. 
