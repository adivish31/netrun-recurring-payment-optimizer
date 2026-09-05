# NetRun: Constrained Recovery-Budget Optimizer

**One-line Value Proposition:** Optimizing UPI AutoPay retry budgets over time to maximize long-term recurring value, rather than immediate recovery.

> [!CAUTION]
> ### REALITY LEGEND
> - **REAL**: engine, schema, constraints, optimizer, tests, signature verification
> - **REAL TEST MODE**: Razorpay test-mode API behaviour (rzp_test_ only)
> - **SIMULATED**: synthetic customer behaviour and payment outcomes
> - **ASSUMPTION**: model parameters with no authoritative source
> 
> **Not claimed:** that any real merchant recovered any real rupee. All recovery figures come from a labelled simulator.

---

## 🏆 Buildathon Judging Criteria

### 1. Problem Taste (Did we pick something that matters?)
Yes. Businesses lose massive revenue due to failed recurring payments, but current solutions rely on generic, aggressive retry engines. Under UPI AutoPay, merchants get exactly 4 attempts per billing cycle, each requiring a 24-hour pre-debit notice. Every notice risks annoying the customer into revoking the mandate entirely. A retry is not free—it's a scarce resource with a high churn cost. NetRun solves a highly specific, high-stakes financial optimization problem: allocating a constrained retry budget across time to maximize long-term Net Recurring Value.

### 2. Build Quality (Does it run, is it structured, would you trust it?)
**Yes.** NetRun is built for integer-paise correctness. 
- **Deterministic and Replayable**: There are no unpredictable multi-agent loops handling money.
- **Strict Guardrails**: Governed by 18 explicitly defined constraints (verified against NPCI). 
- **Idempotent Execution**: Concurrency edge cases (like 10 duplicate webhooks firing simultaneously) are handled not by brittle application checks, but by hard Postgres `UNIQUE` constraints.
- **Auditable**: Every decision is logged, and the tool surface itself is the guardrail (the AI cannot compute money or execute without a server-minted token).

### 3. AI Judgment (The right tool in the right place)
We use the LLM specifically for what it excels at: **reading unstructured, messy customer replies** (like Hinglish emails: *"meri salary 8 tarikh ko aayegi bro"*) and extracting structured intent (promised dates). 
**Where we chose NOT to use AI:** The AI does **not** author schedules, compute money, or execute payments. Everything that touches money—the planner, the rulebook, the executor—is strict deterministic code. This separation ensures the system remains mathematically optimal and perfectly auditable.

### 4. Failure Recovery (What broke, and what you did about it)
During development, the execution pipeline used an in-memory guard to prevent duplicate webhook processing. When stress-tested with ten identical webhooks delivered concurrently, the in-memory lock completely failed due to race conditions, leading to duplicate charges.
**The Fix:** I abandoned application-level checks entirely. The idempotency guard was moved to the database level and is now enforced by a hard Postgres unique constraint. It now guarantees integer-paise correctness under any concurrent load and fails safely.

---

## 1. The Problem

Under UPI AutoPay, merchants get exactly 4 attempts per billing cycle. Every attempt requires a pre-debit notification sent 24 hours in advance. This notice reaches a customer who holds the right to pause or revoke their mandate entirely.

Retries are therefore a scarce budget, and using them carries a churn cost.

## 2. Why the Existing Framing is Incomplete

Razorpay already ships intelligent retries and a Subscription Recovery Agent. NetRun is **not** a replacement claim. 

The narrower question this addresses: when recovery opportunities are constrained (4 attempts per cycle), how should they be allocated *across time* to maximise long-term recurring value, rather than immediate recovery?

## 3. What NetRun Does

NetRun operates a five-stage autonomous loop:
1. **Context Fetch**: Pulls the customer's payment history and recent communications.
2. **Intent Extraction**: Reads messy text replies and extracts promised dates.
3. **Scheduling**: Passes the constraints to a deterministic optimizer to allocate the scarce attempt budget.
4. **Policy Verification**: Submits the proposal to a strict policy engine that mints an execution token if all rules are obeyed.
5. **Execution**: Issues the API calls using the server-minted token.

## 4. Trust Boundary

The LLM reads messy replies and orchestrates the tool calls. **It cannot:**
- Author a schedule (only request one)
- Compute money
- Alter a policy limit
- Supply its own idempotency key
- Execute without a server-minted approval token

**No LangGraph:** Control flow is entirely deterministic. Auditability matters more than autonomy.

## 5. The NRV Objective

The engine optimizes for **Net Recurring Value (NRV)**.

```typescript
/**
 * Net Recurring Value (NRV)
 *
 * NRV = Gross Recovery
 *       + Future Value (if mandate survives)
 *       - Intervention Cost (cost of attempts)
 *       - Churn Cost (expected future value lost due to notification fatigue)
 */
```

## 6. Results

*(Evaluated at Horizon 6)*

| Strategy | NRV | Gross Recovery | Churn Cost |
| :--- | :--- | :--- | :--- |
| **Oracle (Ceiling)** | ₹1,632,688 | ₹191,613 | ₹49,212 |
| **NetRun (promise)** | ₹1,582,034 | ₹146,637 | ₹51,928 |
| **NetRun (shrinkage)**| ₹1,577,221 | ₹143,635 | ₹52,798 |
| **NetRun (baseline)** | ₹1,548,646 | ₹120,786 | ₹55,500 |
| **Fixed Schedule** | ₹1,335,840 | ₹130,225 | ₹163,564 |
| **Rules Only** | ₹1,320,537 | ₹129,665 | ₹170,908 |
| **Aggressive Retry** | ₹1,283,556 | ₹108,563 | ₹178,746 |

**Key Observation:** Gross recovery and NRV rank the strategies differently. NetRun recovers *more* gross than the naive baselines (Fixed and Aggressive) while spending roughly half the attempts and a third of the churn cost.

> [!WARNING]
> The full 1,467-reply evaluation ran on the **deterministic regex fallback path** due to free-tier LLM quota constraints. The promise-delta figures do not imply LLM contribution at scale.

## 7. Where This Analysis is Uncertain

See [METRICS.md](./METRICS.md). 

A critical vulnerability is that `CANCEL_HAZARD_BASE` is an ASSUMPTION with no authoritative public value. However, the hazard sweep finding proves that the strategy ordering does not change anywhere in `[0, 0.08]`. The conclusion does not depend on the parameter that could not be verified.

## 8. AI Role

The LLM is strictly an orchestration and extraction router. 

| Layer | Marginal NRV Gain vs Baseline |
| :--- | :--- |
| **Base Optimizer (no AI)** | +₹212,806 (over Fixed) |
| **Bayesian Shrinkage** | +₹28,575 |
| **Text Extraction (Regex/LLM)** | +₹4,813 |

Because of the API quota, the LLM added nothing at scale over the deterministic regex path for the mass evaluation.

## 9. Guardrails

The system is governed by exactly **18 constraints**. 
- **3** are VERIFIED against NPCI sources.
- **3** COULD_NOT_VERIFY.
- **12** are ASSUMPTIONs swept across ranges.

A `grep` for a numeric literal inside `src/policy/` returns nothing.

## 10. Razorpay Integration

- **Real Test Mode:** Valid API interactions with `rzp_test_` keys. Webhook verification is a real HMAC-SHA256 hash over the raw body with a timing-safe compare.
- **Simulated:** The origin payloads are self-signed. Simulated origin, real verification.

## 11. Failure Handling

1. **Terminal Decline / Forged Token**: Fails closed and safely logs out.
2. **Concurrency**: 10 concurrent duplicate webhooks produce exactly 1 attempt row, enforced by a Postgres `UNIQUE` constraint rather than a brittle application check.

## 12. Setup

```bash
# Clone the repository
git clone https://github.com/adivish31/netrun-recurring-payment-optimizer.git
cd netrun-recurring-payment-optimizer

# Install dependencies and setup Postgres database
npm install
cp .env.example .env
# Edit .env with your Razorpay test keys and Postgres URL
npm run db:setup

# Run backend API
npm run dev

# Run frontend Next.js Dashboard
npm run web:dev
```

## 13. Testing

- `npm test`: Validates core optimizer logic, policy engines, and deterministic workflows.
- `npm run eval`: Runs the 1,467-cycle counterfactual benchmark locally in memory.

## 14. Limitations

1. **No Live Churn Tracking:** The dataset is a synthetic mixture; real customers may cancel at different magnitudes than `CANCEL_FATIGUE_MULTIPLIER` assumes.
2. **Hardcoded Budgets:** Expanding past `MAX_ATTEMPTS_PER_CYCLE = 4` triggers combinatoric explosions requiring tighter `OPTIMIZER_TIME_BOX_MS`.

## 15. What Broke and How It Was Fixed

See [DECISIONS.md](./DECISIONS.md).

## 16. Links
- [DECISIONS.md](./DECISIONS.md)
- [DATASET.md](./DATASET.md)
- [RULES.md](./RULES.md)
- [METRICS.md](./METRICS.md)
