/**
 * NetRun — src/diagnose/lookup.ts   (spec §17)
 *
 * Deterministic mapping FIRST. This resolves most volume, and it is also the
 * baseline the LLM fallback is measured against. Build it before llm.ts.
 */

import type { Diagnosis } from '../types';

/** Returns UNKNOWN for codes absent from DECLINE_CODE_TO_CLASS. Only UNKNOWN
 *  reaches the LLM. Unresolved UNKNOWN -> ESCALATE, never a silent attempt. */
export function diagnoseByLookup(_cycleId: string, _declineCode: string | null): Diagnosis {
  throw new Error('not implemented — build order step 10 prerequisite');
}
