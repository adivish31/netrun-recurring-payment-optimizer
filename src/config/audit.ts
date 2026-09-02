/**
 * NetRun — src/config/audit.ts
 *
 * Prints every constraint in the system with its provenance, and exits non-zero
 * if any VERIFIED_RULE is still UNVERIFIED.
 *
 * Two reasons this exists:
 *   1. It is a 20-second demo moment. "Here is every number in my system and
 *      where it came from" is not something other submissions can show.
 *   2. It stops you shipping an unverified citation, which is fatal in a panel.
 *
 * COULD_NOT_VERIFY is an allowed terminal state and does NOT fail the audit.
 * Saying "I could not verify this, so I treated it as an assumption and swept
 * it" is a strong answer. A wrong citation is not.
 */

import { ALL_RULES, unverifiedRules, couldNotVerify } from './rules';

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s.padEnd(n));
const fmt = (v: unknown): string =>
  typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);

console.log('');
console.log('NetRun \u2014 constraint provenance audit');
console.log('='.repeat(118));
console.log(pad('RULE ID', 40) + pad('VALUE', 26) + pad('TYPE', 15) + 'PROVENANCE');
console.log('-'.repeat(118));

for (const r of ALL_RULES) {
  const detail =
    r.type === 'VERIFIED_RULE'
      ? `[${r.verification_status}] ${r.source}`
      : `sweep [${r.sweep[0]}, ${r.sweep[1]}] \u2014 ${r.rationale.slice(0, 58)}\u2026`;
  console.log(pad(r.rule_id, 40) + pad(fmt(r.value), 26) + pad(r.type, 15) + detail);
}

console.log('-'.repeat(118));

const verified = ALL_RULES.filter((r) => r.type === 'VERIFIED_RULE').length;
const assumptions = ALL_RULES.length - verified;
const pending = unverifiedRules();
const abandoned = couldNotVerify();

console.log(
  `${ALL_RULES.length} constraints \u2014 ${verified} rules, ${assumptions} assumptions` +
    (abandoned.length ? `, ${abandoned.length} could not be verified` : '')
);

if (abandoned.length) {
  console.log('');
  console.log('COULD_NOT_VERIFY (state this openly in README + video):');
  for (const id of abandoned) console.log(`  - ${id}`);
}

if (pending.length > 0) {
  console.error('');
  console.error(`FAIL: ${pending.length} rule(s) not yet verified against a primary source:`);
  for (const id of pending) console.error(`  - ${id}`);
  console.error('');
  console.error('Open the NPCI/RBI circular, paste the exact URL into `source`, and set');
  console.error("verification_status: 'VERIFIED'. If you cannot verify it before the");
  console.error("deadline, set 'COULD_NOT_VERIFY' and say so on camera.");
  process.exit(1);
}

if (abandoned.length === 0) {
  console.log('All rules verified.');
} else {
  console.log('Audit complete (some rules could not be verified).');
}
