export const labelMap: Record<string, string> = {
  netrun: "NetRun (base)",
  netrun_shrinkage: "NetRun + customer history",
  netrun_promise: "NetRun + customer replies",
  rules_only: "Decline-code rules only",
  fixed: "Fixed schedule (T+1/3/7)",
  aggressive: "Retry immediately",
  oracle: "Theoretical ceiling",
  NRV: "Net recurring value",
  "att/cyc": "Attempts per cycle",
  "pdn/cyc": "Notices per cycle",
  interv: "Intervention cost",
  "P(succ)": "Chance of success",
  idemp: "Idempotency key",
  Alts: "Schedules evaluated"
};

export const getLabel = (key: string): string => labelMap[key] || key;
