# Dataset and Simulation Environment

## The Generative World Model

The simulator creates a synthetic dataset of recurring payment cycles (`C = 1467`). It does not rely on API-generated synthetic LLM data, which would destroy the counterfactual ground truth the evaluation rests on.

Each cycle is defined by the following latent fields:
- **Baseline Inflow & Volatility**: Defines the solvency threshold of the customer account.
- **Downtime Bursts**: Probability of infrastructure failure at a given time slot.
- **Customer Responsiveness**: Likelihood and accuracy of a customer reply (e.g., promising a date).
- **Hazard Susceptibility**: The baseline probability that a customer cancels their mandate due to retry fatigue.

## The Replenishment-Day Mixture
Customers do not receive their income uniformly across the month. The dataset models payday inflows across three distinct cohorts:
- **~55% Month Start**: Salaried employees receiving funds between the 1st and 5th.
- **~25% Staggered**: Mid-month or irregular business cash flows.
- **~20% Month End**: Wage workers or end-of-month dispersals.

A uniform distribution would artificially flatten the optimizer's advantage, as clustered liquidity demands highly precise scheduling.

## Time-Correlated Downtime Bursts
Bank outages and infrastructure downtime are modelled as time-correlated bursts, rather than independent identically distributed (i.i.d.) random variables. If the NPCI or an issuer bank goes down at 10:00 AM, the probability of failure at 10:15 AM is significantly higher. The scheduling engine must learn to space attempts out rather than spamming a broken network.

## The ~20% Decline-Code Label Noise
Error codes returned by issuer banks are infamously unreliable (e.g., returning `TECHNICAL_DECLINE` when the account is actually out of funds). The simulator injects a ~20% label noise rate into the decline codes. This noise is the exact headroom the LLM is measured against—its ability to extract true intent from customer text when the bank's error code lies.

## The ~4% Terminal-Customer Rate
Approximately 4% of cycles belong to customers whose accounts are permanently frozen, closed, or fundamentally unrecoverable. This enforces the reality that 100% gross recovery is impossible, preventing the optimizer from continuously burning attempts on doomed mandates.

## The High-Value / Low-Reliability Confounder
A built-in confounder exists in the data: high-value mandates (larger transaction amounts) are negatively correlated with account reliability (volatility of inflow). This prevents trivial "always retry the highest amount" strategies from dominating without consequence, as higher amounts carry higher true churn risk.

## Calibration (Before and After)
The initial generation of the dataset placed mandate limits at 93% of monthly inflow.
- **Before Calibration**: 54% of cycles were unrecoverable because customers were fundamentally insolvent. The downtime model was inert (0 blocked cycles), making any scheduling strategy look artificially identical.
- **The Coverage-Window Target**: The dataset was retuned against a target of `ln(inflow/amount)/volatility` equal to roughly 5-10 days. 
- **After Calibration**: 75% of cycles are now recoverable. The median successful slots are 6 out of 48. Crucially, 14.5% of unrecoverable cycles are now explicitly downtime-bound, forcing the optimizer to work for its margin.

## Anti-Triviality Controls
This dataset is strictly designed *not* to flatter the optimizer. 
If the dataset were uniformly distributed, or if downtime were non-correlated, a naive Fixed or Aggressive strategy would naturally score within 99% of the Oracle. The mixture models, label noise, and terminal rates force the engine to actually utilize its LLM context and budget constraints to achieve the stated +₹212,806 NRV gain.

## Per-Slot Seeding
To ensure counterfactual consistency, the simulator uses a strict per-slot seeding scheme. Randomness is a pure function of `(seed, cycleId, date, window)`. This prevents the Oracle (which scores all slots) and the NetRun agent (which scores only chosen slots) from consuming randomness in different sequential orders and silently disagreeing on the same state.

**Reproduction Command:**
```bash
npm run eval
```
