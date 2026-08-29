/**
 * NetRun — src/eval/run.ts
 * Entry point: `npm run eval`
 *
 * Prints the results table. This output IS the project — paste it into
 * README.md and METRICS.md.
 *
 * Required columns (spec §30):
 *   strategy | gross recovered | incremental | NRV (headline) | % of oracle
 *           | attempts spent | notifications sent | mandates cancelled
 *           | terminal correctly skipped | rule violations (MUST be 0)
 *
 * Rows: fixed, aggressive, rules_only, netrun, oracle.
 *
 * The point of the table is that GROSS RECOVERY AND NRV RANK THE STRATEGIES
 * DIFFERENTLY. If they don't, report that honestly — it means the churn model
 * is inert at the default hazard, and the sensitivity sweep will show where it
 * stops being inert.
 */

throw new Error('not implemented — build order step 4 onward');
