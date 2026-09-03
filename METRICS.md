# NetRun Metrics and Evaluation

## NRV Formulation

```typescript
/**
 * NetRun — src/eval/metrics.ts   (spec §22, §30)
 *
 * THE NRV FORMULATION LIVES HERE AND NOWHERE ELSE.
 * Spec §22: "The implementation must document the exact mathematical
 * formulation. Do not hide assumptions." Copy this docblock into METRICS.md
 * verbatim so the README and the code cannot drift apart.
 *
 *   NRV(schedule)
 *     = P(recover this cycle | schedule) * amount * margin        [current]
 *     + P(mandate survives | schedule) * horizon * amount * margin [future]
 *     - |schedule| * attempt_cost                                  [intervention]
 *     - (1 - P(survives)) * horizon * amount * margin              [churn]
 *
 *   P(recover | S)  = 1 - PROD_{s in S} (1 - p(s))
 *   P(survives | S) = PROD_{i=1..|S|} (1 - hazard * fatigue^(pdns_sent + i - 1))
 *
 * Every parameter comes from config/rules.ts. hazard and fatigue are
 * ASSUMPTIONs — the churn term is the whole reason NRV differs from gross
 * recovery, so the hazard sweep is not optional (spec §23, §31).
 *
 * All arithmetic in integer paise. Round ONCE, at the end, with Math.round.
 */
```

## Strategy Evaluation (Baseline Results)

This table evaluates the baseline strategies with `CANCEL_HAZARD_BASE = 0.02` at a 6-cycle horizon.

```text
=== Strategy Evaluation (Horizon: 6 cycles) ===

strategy        | NRV (₹)    | gross     | future    | interv   | churn     | attempts | PDNs/cyc
-----------------------------------------------------------------------------------------------
fixed           | 1335840.06 | 130225.80 | 1382648.61 | 13470.00 | 163564.35 | 2.81     | 2.80    
aggressive      | 1283556.30 | 108563.39 | 1367466.93 | 13728.00 | 178746.03 | 2.86     | 2.94    
rules_only      | 1320537.06 | 129665.25 | 1375304.39 | 13524.00 | 170908.57 | 2.82     | 2.87    
oracle          | 1632688.40 | 191613.49 | 1497000.94 | 6714.00  | 49212.02  | 1.40     | 1.39    
```

## Hazard Sweep

```text
=== NRV Sensitivity Analysis (Hazard Base Sweep) ===

Hazard   | fixed (₹)  | aggressive | rules_only | oracle     | Top Ranked     
---------------------------------------------------------------------------
0.000    | 1662968.76 | 1641048.35 | 1662354.21 | 1731112.45 | fixed          
0.005    | 1577628.80 | 1547565.64 | 1573094.67 | 1706365.35 | fixed          
0.010    | 1494691.10 | 1456858.66 | 1486404.71 | 1681712.31 | fixed          
0.015    | 1414109.96 | 1368873.40 | 1402235.11 | 1657153.32 | fixed          
0.020    | 1335840.06 | 1283556.30 | 1320537.06 | 1632688.40 | fixed          
0.025    | 1259836.51 | 1200854.29 | 1241262.24 | 1608317.54 | fixed          
0.030    | 1186054.82 | 1120714.79 | 1164362.71 | 1584040.74 | fixed          
0.035    | 1114450.90 | 1043085.71 | 1089791.01 | 1559858.00 | fixed          
0.040    | 1044981.06 | 967915.44  | 1017500.10 | 1535769.32 | fixed          
0.045    | 977602.03  | 895152.85  | 947443.37  | 1511774.70 | fixed          
0.050    | 912270.94  | 824747.29  | 879574.67  | 1487874.14 | fixed          
0.055    | 848945.32  | 756648.62  | 813848.26  | 1464067.65 | fixed          
0.060    | 787583.10  | 690807.15  | 750218.85  | 1440355.21 | fixed          
0.065    | 728142.64  | 627173.71  | 688641.60  | 1416736.83 | fixed          
0.070    | 670582.68  | 565699.58  | 629072.09  | 1393212.51 | fixed          
0.075    | 614862.38  | 506336.55  | 571466.35  | 1369782.26 | fixed          
0.080    | 560941.29  | 449036.89  | 515780.83  | 1346446.06 | fixed          
```

## Where this analysis is uncertain
`CANCEL_HAZARD_BASE` is an ASSUMPTION with no authoritative public value. The exact probability that a customer cancels their mandate due to an additional pre-debit notification is unknown in the public domain. 

The sweep table above demonstrates the full range of mathematical outcomes across the declared plausible bounds of this hazard. 

**Break-even finding**: At hazard = 0, `fixed` has the highest NRV. At hazard = 0.08, `fixed` still has the highest NRV. The ordering NEVER changes across the entire range. Even if there was strictly zero churn cost for sending notifications, `fixed` remains the dominant strategy on this dataset due to its higher gross recovery.
