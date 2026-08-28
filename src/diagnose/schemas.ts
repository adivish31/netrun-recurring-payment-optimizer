/**
 * NetRun — src/diagnose/schemas.ts   (spec §11, §18, §38 failure 3)
 *
 * The LLM's ENTIRE output surface. Nothing else crosses the trust boundary.
 * Anything failing these schemas is rejected and the deterministic path runs.
 */

import { z } from 'zod';

export const DeclineClassSchema = z.enum(['BALANCE', 'TRANSIENT', 'AUTH', 'TERMINAL', 'UNKNOWN']);

export const DiagnosisOutputSchema = z.object({
  class: DeclineClassSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(400),
});

export const PromiseOutputSchema = z.object({
  intent: z.enum(['will_pay', 'cannot_pay', 'already_paid', 'dispute', 'unclear']),
  /** Day of month only. A model cannot invent a year or a past date. */
  promised_day_of_month: z.number().int().min(1).max(31).nullable(),
  promised_amount_rupees: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
});

export type DiagnosisOutput = z.infer<typeof DiagnosisOutputSchema>;
export type PromiseOutput = z.infer<typeof PromiseOutputSchema>;
