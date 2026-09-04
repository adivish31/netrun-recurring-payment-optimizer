import { DECLINE_CODE_CLASS } from '../config/rules';
import type { Diagnosis, DeclineClass } from '../types';

export function diagnoseByLookup(cycleId: string, declineCode: string | null): Diagnosis {
  let cls: DeclineClass = 'UNKNOWN';
  if (declineCode && declineCode in DECLINE_CODE_CLASS.value) {
    cls = DECLINE_CODE_CLASS.value[declineCode]!;
  }
  return {
    cycleId,
    class: cls,
    confidence: Number(true),
    source: 'lookup',
    rawCode: declineCode,
    evidence: `Decline code: ${declineCode || 'none'}`
  };
}
