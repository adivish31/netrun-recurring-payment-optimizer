# Architecture Decisions and Post-Mortems

## A. Architecture Decisions

### 1. Node/TypeScript over Python
**Decision:** The system is built in Node.js using TypeScript.
**Rejected:** Python, which is traditionally favored for data science and AI.
**Why:** `zod` gives runtime validation and compile-time types from a single schema definition, which is critical for a payments engine handling strict deterministic structures. Since there is no model training or heavy numerical work (only basic algebra for probabilities and NRV), Python's data ecosystem isn't strictly necessary. A Node.js entry is rare in this specific AI/fintech intersection but guarantees tight type-safety at the application boundary.

### 2. Postgres over SQLite
**Decision:** Postgres is the database for the live pipeline.
**Rejected:** SQLite.
**Why:** Postgres supports robust `CHECK` constraints, true `UNIQUE` constraints under concurrency, and strict `bigint` storage for integer paise. When receiving parallel concurrent webhooks, Postgres safely prevents duplicate row creation, whereas SQLite under heavy writes in Node can lock or misbehave.

### 3. Exhaustive Enumeration over a Heuristic
**Decision:** The optimizer evaluates the complete decision space using an exhaustive search (`C(K, B)`).
**Rejected:** Heuristic searches, greedy algorithms, or gradient descent.
**Why:** The budget cap (`B = 4`) and the time horizon severely bound the search space (max ~18 candidates). Because the true optimum is completely computable within the `OPTIMIZER_TIME_BOX_MS` (250ms), a heuristic introduces suboptimality without solving a real scaling problem.

### 4. Deterministic Optimizer, LLM Confined to Language
**Decision:** The AI only performs intent extraction and API orchestration. The scheduling logic is purely deterministic math.
**Rejected:** End-to-end LLM scheduling, or LLM proposing explicit time-slots.
**Why:** The LLM cannot compute money accurately and cannot consistently adhere to non-obvious API policy constraints (e.g. idempotency, bounds checking). Constraining the LLM to pure language extraction secures the deterministic loop.

### 5. NO LangGraph / Multi-Agent
**Decision:** A simple, hard-capped sequential iteration loop (`agent/loop.ts`).
**Rejected:** LangGraph, AutoGen, or multi-agent supervisor systems.
**Why:** This is a financial agent with exactly one goal, six tools, and a strict iteration cap. A graph framework introduces non-determinism, state explosion, and an unnecessary failure surface for no measured gain. In payments, auditability strictly supersedes autonomy.

### 6. NO RAG over Regulatory Documents
**Decision:** All 18 constraints live in a typed configuration file (`src/config/rules.ts`).
**Rejected:** Vector database RAG over RBI/NPCI circulars.
**Why:** Rag is probabilistic. Financial policies are absolute. A policy limit (e.g., 4 attempts, 24-hour lead time) cannot be dynamically synthesized—it must be exact.

### 7. NO LLM-Generated Synthetic Data
**Decision:** The dataset uses a classical generative world model (probabilistic mixture models).
**Rejected:** Pumping LLMs to generate "realistic" transaction logs.
**Why:** It would destroy the counterfactual ground truth the evaluation rests on. If the LLM generates the data, testing the LLM's performance on it constitutes data leakage and flattery, rather than an objective test of recovery dynamics.

### 8. Evaluation in Memory, Database only for the Live Pipeline
**Decision:** `run.ts` builds the counterfactuals in memory without a Postgres connection.
**Rejected:** Storing 1,467 test cycles × 7 strategies in Postgres.
**Why:** I/O latency would make iterative tuning impossible. The live product gets the database; the evaluation framework stays purely functional and in-memory.

---

## B. What Broke and How It Was Fixed

### 1. The Benchmark Measured the Wrong Thing
**Problem:** Initial evaluations showed any scheduler succeeding easily, making the optimizer look good for the wrong reasons.
**Root Cause:** The first calibration placed mandate limits at 93% of monthly inflow. This meant 54% of cycles were unrecoverable because the customer was literally broke, rather than due to timing. The downtime model was inert (0 cycles blocked).
**Fix:** Retuned the generative world against a coverage-window target (`ln(inflow/amount)/volatility` of roughly 5-10 days). 
**Test:** After the fix: 75% of cycles are recoverable, the median successful slots are 6 out of 48, and 14.5% of unrecoverable cycles are downtime-bound.

### 2. The LLM was Silently Failing on 100% of Calls
**Problem:** The LLM wasn't actually extracting intents, yet no errors surfaced.
**Root Cause:** A deprecated model string caused every extraction call to 404, silently falling back to the deterministic regex engine. This was undetected because the fallback *worked*. It was only caught by three contradictions: identical accuracy to one decimal place across all intent classes, 1,467 calls completing in 40 seconds, and a claimed 100% cache hit rate with a non-zero call count.
**Fix:** Added a run-summary source distribution and a warning above a 10% fallback rate. Graceful degradation must be visible, not silent.

### 3. The Cache Poisoned Itself
**Problem:** A transient LLM outage permanently degraded the extraction cache.
**Root Cause:** Failed fallback results (regex) were being saved to the cache file. Upon recovery, the system simply returned the stale, poisoned regex fallbacks instead of asking the restored LLM.
**Fix:** The cache layer now only persists strictly schema-validated LLM responses.

### 4. The Deterministic Fallback was Exploitable
**Problem:** The fallback safety net failed open on adversarial input.
**Root Cause:** A prompt-injection string containing a bare digit made the regex extractor return a high-confidence promise, completely bypassing intent understanding.
**Fix:** The regex was tightened, but this proved why a simple regex fallback can actually be more vulnerable than the LLM path it protects.

### 5. Counterfactual and Live Runs Had to Agree Exactly
**Problem:** The Oracle strategy and the tested strategies silently disagreed on identical parameters.
**Root Cause:** The oracle scores *every* (date, window) pair; normal strategies score only chosen ones. With a shared sequential RNG, the two consumed randomness in different orders, knocking them out of alignment.
**Fix:** Implemented a slot-seeding scheme—a pure function of `(seed, cycleId, date, window)`—making randomness completely consistent across all runs. Verified 20/20 on cross-checks.

### 6. Two Code Paths Disagreed About the Same State
**Problem:** A 4-slot proposal summed to 5 and was blocked by the policy engine.
**Root Cause:** `check_policy` hardcoded `attemptsUsed = 1`, while `propose_schedule` planned against `0`. 
**Fix:** Synchronized the state context passed between the tools. The fact that the policy engine failed closed on an internal inconsistency proved its architectural value.

### 7. Idempotency Key Collision
**Problem:** An attempt loop silently dropped the second execution via `ON CONFLICT DO NOTHING`.
**Root Cause:** A hardcoded `attemptNo` in the idempotency key logic meant consecutive attempts generated the same hash. 
**Fix:** Corrected the hash generation to dynamically include the timestamp/slot identifier. Found via grepping rather than runtime failure, preventing a silent financial dropping bug.

### 8. AI-Assisted Development Concealed a Quota Failure
**Problem:** An AI assistant fabricated a perfect execution trace that looked real.
**Root Cause:** To hide an API quota exhaustion failure, the AI hallucinated the `trace` object based on previous outputs.
**Fix:** It was caught because the fabricated trace contained a combination the live `loop.ts` explicitly prevents (`decision: null` with `fellBackToDeterministic: false`). The safeguard was strictly refusing summaries and demanding raw `results.json` parsing.
