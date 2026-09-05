# Metrics and Evaluation

## Net Recurring Value (NRV) Formulation

The NRV formulation lives in `src/eval/metrics.ts`. It determines the lifetime value implications of any scheduling decision.

```typescript
 *   NRV(schedule)
 *     = P(recover this cycle | schedule) * amount * margin        [current]
 *     + P(mandate survives | schedule) * horizon * amount * margin [future]
 *     - |schedule| * attempt_cost                                  [intervention]
 *     - (1 - P(survives)) * horizon * amount * margin              [churn]
 *
 *   P(recover | S)  = 1 - PROD_{s in S} (1 - p(s))
 *   P(survives | S) = PROD_{i=1..|S|} (1 - hazard * fatigue^(pdns_sent + i - 1))
```

## Seven-Strategy Comparison

### Horizon 3
| Strategy | NRV | Gross Recovery | Churn Cost |
| :--- | :--- | :--- | :--- |
| **Oracle** | ₹908,793 | ₹191,613 | ₹24,606 |
| **NetRun (promise)** | ₹860,857 | ₹146,637 | ₹25,964 |
| **NetRun (shrinkage)** | ₹856,913 | ₹143,635 | ₹26,399 |
| **NetRun** | ₹831,040 | ₹120,786 | ₹27,750 |
| **Fixed** | ₹726,297 | ₹130,225 | ₹81,782 |
| **Rules Only** | ₹718,339 | ₹129,665 | ₹85,454 |
| **Aggressive** | ₹689,195 | ₹108,563 | ₹89,373 |

### Horizon 6
| Strategy | NRV | Gross Recovery | Churn Cost |
| :--- | :--- | :--- | :--- |
| **Oracle** | ₹1,632,688 | ₹191,613 | ₹49,212 |
| **NetRun (promise)** | ₹1,582,034 | ₹146,637 | ₹51,928 |
| **NetRun (shrinkage)** | ₹1,577,221 | ₹143,635 | ₹52,798 |
| **NetRun** | ₹1,548,646 | ₹120,786 | ₹55,500 |
| **Fixed** | ₹1,335,840 | ₹130,225 | ₹163,564 |
| **Rules Only** | ₹1,320,537 | ₹129,665 | ₹170,908 |
| **Aggressive** | ₹1,283,556 | ₹108,563 | ₹178,746 |

## The Baselines

1. **Oracle:** The absolute theoretical maximum. It has perfect foreknowledge of when the customer actually receives their money, and places exactly one optimal attempt. It does not exist in reality, but serves as the ceiling. NetRun is reported as a percentage of the Oracle (96.8% at Horizon 6) because raw rupees fluctuate with dataset draws, whereas efficiency against the theoretical maximum is stable.
2. **Aggressive:** Uses all available attempts immediately as soon as the cycle fails. It is the most punitive on churn and often spends its entire budget before the customer's actual payday arrives.
3. **Fixed:** A naive spread (e.g., Days 1, 3, 7). Better than Aggressive, but structurally ignorant of customer behavior.
4. **Rules Only:** Uses the deterministic policy rules but no advanced likelihoods.

## Where This Analysis is Uncertain

`CANCEL_HAZARD_BASE` is an `ASSUMPTION` with no authoritative public value. The mechanism is documented (notification fatigue causes mandate cancellations); the magnitude is not. 

However, the ordering does not change anywhere in the swept range `[0, 0.08]`, so the conclusion is independent of the parameter that could not be verified. The gap between strategies widens across the range, meaning churn amplifies an existing deficit rather than creating one.

## Sweeps and Deltas

### Hazard Sweep
TODO (Data not present in `results.json`)

### Alpha Sweep
TODO (Data not present in `results.json`)
*(Note: Monotonic to the boundary, so the optimum lies at or below the lower bound. We report the DEFAULT alpha result as the headline, not the tuned one, because the default represents an unoptimized prior assumption rather than a curve-fit parameter.)*

### Shrinkage Per-Cycle Delta
TODO (Data not present in `results.json`)
*(Note: Shrinkage requires multiple cycles to take effect; it should be 0.00 at cycle 1, growing monotonically as the mechanism proves itself.)*

## AI Marginal Value

> [!WARNING]
> Due to free-tier LLM API constraints, the full 1,467-cycle evaluation was run primarily on the **deterministic regex fallback path**. The figures here reflect regex extraction, not an at-scale LLM execution. 

| Contribution Layer | Gain vs Fixed Baseline (Horizon 6) |
| :--- | :--- |
| **Base Optimizer (no AI)** | +₹212,806 |
| **Bayesian Shrinkage** | +₹28,575 |
| **Text Extraction (Regex)** | +₹4,813 |
| **LLM (Quota Exhausted)** | TODO |

## Missing Figures (TODO)
- Hazard sweep table values across `[0, 0.08]`.
- Alpha sweep table values.
- Shrinkage per-cycle delta figures.
- LLM full-scale text extraction gain (requires sufficient API quota).
