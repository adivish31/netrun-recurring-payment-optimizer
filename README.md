# NetRun

### Spend every retry where it creates the most long-term value.

*A constrained retry-budget optimizer for recurring payments. Powered by the CHAAR optimization engine.*

> **Reality labels** (spec §57) — applies to every number in this repository. These categories are never mixed.
> **REAL** — the code, database, constraints, optimizer, tests, signature verification.
> **REAL TEST MODE** — Razorpay test-mode API behaviour (`rzp_test_` keys only).
> **SIMULATED** — synthetic customer behaviour and recurring-payment outcomes.
> **ASSUMPTION** — model parameters with no authoritative external measurement.
>
> **Not claimed:** that any real merchant recovered any real rupee. All recovery figures come from a labelled simulator.

## Problem

<!-- §2. Plain language. A merchant with a failed recurring payment has a limited
     recovery budget and must decide WHEN to spend it, and when to stop. -->

## Why the existing retry framing is incomplete

<!-- §1. Razorpay already ships intelligent retries for UPI AutoPay and a
     Subscription Recovery Agent. State that plainly and early. NetRun is not a
     replacement claim. The narrower question is: when recovery opportunities are
     constrained, how should they be ALLOCATED ACROSS TIME to maximise long-term
     recurring value rather than immediate recovery? This is an
     optimization/evaluation prototype. -->

## What NetRun does

<!-- §5 one-liner, then the §6 decision loop diagram. -->

## Trust boundary

The LLM understands messy context. Deterministic optimization chooses the schedule. Deterministic policy rules have final authority. Only bounded actions execute.

The LLM **cannot** choose the schedule, calculate money, alter policy limits, call payment APIs, execute a retry, or override the policy engine — not by policy, by wiring.

No multi-agent framework, no LangGraph: the control flow is deterministic and auditability matters more than autonomy here.

## NRV objective

<!-- §22. Paste the exact formulation from src/eval/metrics.ts. Hide nothing. -->

## Results

```text
=== Strategy Evaluation (Horizon: 6 cycles) ===

strategy         | NRV (₹)      | gross      | future       | interv     | churn      | att/cyc  | pdn/cyc  | viol 
-------------------------------------------------------------------------------------------------------------------
fixed            | 1335840.06   | 130225.80  | 1382648.61   | 13470.00   | 163564.35  | 2.81     | 2.80     | 0    
aggressive       | 1283556.30   | 108563.39  | 1367466.93   | 13728.00   | 178746.03  | 2.86     | 2.94     | 0    
rules_only       | 1320537.06   | 129665.25  | 1375304.39   | 13524.00   | 170908.57  | 2.82     | 2.87     | 0    
netrun           | 1548646.67   | 120786.06  | 1490712.79   | 7352.00    | 55500.17   | 1.53     | 1.52     | 0    
netrun_shrinkage | 1577221.38   | 143635.46  | 1493414.44   | 7030.00    | 52798.52   | 1.46     | 1.45     | 0    
oracle           | 1632688.40   | 191613.49  | 1497000.94   | 6714.00    | 49212.02   | 1.40     | 1.39     | 0    
```

**Key Finding**: The optimizer recovers **more gross** than the naive baselines (₹143k vs ₹130k for fixed), while spending **half the attempts** (1.46 vs 2.81) and incurring **a third of the churn** (₹52k vs ₹163k). By allocating the retry budget where it creates the most long-term value, NetRun achieves 96.6% of the theoretical oracle NRV ceiling.

## Sensitivity analysis — including where NetRun loses

<!-- §31, §32. The break-even hazard goes HERE, in the README, not buried. -->

**Break-even:** below a per-notification cancellation hazard of `X`, the aggressive baseline is the better strategy. The hazard is an ASSUMPTION with no authoritative public value, so this threshold is published rather than hidden.

## AI role

<!-- Where the LLM is used, and the MEASURED marginal value vs the
     deterministic baseline. If it doesn't help, say so. -->

## Guardrails

Every constraint is a `VERIFIED_RULE` or an `ASSUMPTION`. No numeric literal appears in `src/policy/` or `src/schedule/`.

```bash
npm run rules:audit
```

<!-- Paste the audit table. -->

## Razorpay test-mode integration

<!-- §33, §34. Exactly what is real and exactly what is simulated. -->

## Failure handling

<!-- §38. Duplicate webhook, 5xx, malformed LLM output, prompt injection. -->

## Setup

```bash
cp .env.example .env          # rzp_test_ keys only
docker compose up -d
npm install
npm run migrate
npm run rules:audit
npm run gen -- --seed 42
npm run eval
npm run sensitivity
npm run dev                   # dashboard on localhost:3000
```

## Testing

```bash
npm test
```

## Limitations

<!-- Be specific and unflinching. This section earns trust. -->

## What broke and how it was fixed

<!-- §54. From your actual git history. Do not invent failures. -->

## Future work

## Docs

- [`BUILD_ORDER.md`](BUILD_ORDER.md) — plan of action
- [`DECISIONS.md`](DECISIONS.md) — decisions **and rejected alternatives**
- [`DATASET.md`](DATASET.md) — world model, noise rates, anti-triviality controls
- [`RULES.md`](RULES.md) — every constraint with provenance
- [`METRICS.md`](METRICS.md) — full results including where NetRun loses
