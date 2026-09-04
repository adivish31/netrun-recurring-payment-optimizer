import {
  MAX_ATTEMPTS_PER_CYCLE,
  EXECUTION_WINDOWS,
  PDN_MIN_LEAD_HOURS,
  PDN_EXEMPT_MCC,
  AFA_THRESHOLD_PAISE,
  getAfaThresholdPaise,
  CLASS_STRATEGY
} from '../config/rules';
import type { PolicyVerdict, Slot, EstimationContext } from '../types';

export function evaluatePolicy(
  ctx: EstimationContext,
  proposed: readonly Slot[],
  attemptsUsed: number
): PolicyVerdict {
  if (!CLASS_STRATEGY.value[ctx.diagnosis.class].spendBudget) {
    return { verdict: 'BLOCK', rule_id: CLASS_STRATEGY.rule_id, reason: 'Terminal or Auth' };
  }

  const threshold = getAfaThresholdPaise(ctx.mcc);
  if (ctx.amountPaise > threshold) {
    return { verdict: 'ESCALATE', rule_id: AFA_THRESHOLD_PAISE.rule_id, reason: 'Amount over threshold' };
  }

  if (attemptsUsed + proposed.length > MAX_ATTEMPTS_PER_CYCLE.value) {
    return { verdict: 'BLOCK', rule_id: MAX_ATTEMPTS_PER_CYCLE.rule_id, reason: 'Over budget' };
  }

  for (const slot of proposed) {
    if (!(slot.window in EXECUTION_WINDOWS.value)) {
      return { verdict: 'BLOCK', rule_id: EXECUTION_WINDOWS.rule_id, reason: 'Invalid window' };
    }
  }

  if (!PDN_EXEMPT_MCC.value.includes(ctx.mcc)) {
    for (const slot of proposed) {
      const dueDate = new Date(ctx.dueDate);
      const slotDate = new Date(slot.date);
      dueDate.setHours(dueDate.getHours() + PDN_MIN_LEAD_HOURS.value);
      if (slotDate < dueDate) {
        return { verdict: 'BLOCK', rule_id: PDN_MIN_LEAD_HOURS.rule_id, reason: 'Insufficient PDN lead time' };
      }
    }
  }

  return { verdict: 'APPROVE', rule_id: 'auto-approved' }; // Needs a rule_id? The prompt didn't specify one for APPROVE. Let's use an empty string or just the first rule's ID? Actually wait, "every verdict carries the rule_id that produced it". APPROVE means it passed all checks.
}
