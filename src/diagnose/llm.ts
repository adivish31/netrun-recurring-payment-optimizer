/**
 * NetRun — src/diagnose/llm.ts   (spec §11, §18)
 *
 * The ONLY module that talks to the model. Two calls, both pure functions of
 * text -> typed struct. No tools. Temperature 0. Strict schema validation.
 *
 * The LLM CANNOT: choose a schedule, do arithmetic, alter a policy limit,
 * call a payment API, write to the database, or override the policy engine.
 * It has no credentials for any of those things — not by policy, by wiring.
 *
 * PROMISE EXTRACTION IS ON THE NEVER-CUT LIST. Decline-code fallback is
 * cuttable (spec §49). Build promise extraction first.
 *
 * Every call needs a measured deterministic baseline (regex for promises,
 * lookup for diagnosis). "I measured the LLM's marginal value and here it is"
 * is the whole answer to "why is there AI in this at all?".
 */

import type { Diagnosis, PromiseToPay } from '../types';
import { PromiseOutputSchema } from './schemas';
import { callLlm } from '../llm/client';
import { extractPromisedDay } from '../prior/promise-regex';

import { REGEX_FALLBACK_CONFIDENCE_CAP } from '../config/rules';

export async function extractPromise(
  cycleId: string,
  replyText: string
): Promise<PromiseToPay> {
  const prompt = `You are a pure extraction tool. 
Extract the intent and any promised date/amount from this reply.
Do not invent dates or amounts if they are not stated.
Respond strictly in JSON matching exactly this schema and nothing else:
{
  "intent": "will_pay" | "cannot_pay" | "already_paid" | "dispute" | "unclear",
  "promised_day_of_month": null,
  "promised_amount_rupees": null,
  "confidence": 0.9
}
You MUST use EXACTLY one of the 5 intent strings above. Use null for dates/amounts if not stated.

Reply:
"${replyText}"`;

  let result = await callLlm(prompt, PromiseOutputSchema, 'extract_promise');

  if (result.error && result.error.includes('Zod validation failed')) {
    result = await callLlm(prompt, PromiseOutputSchema, 'extract_promise');
  }

  if (result.error || !result.data) {
    const day = extractPromisedDay(replyText);
    return {
      cycleId,
      promisedDate: day ? `2000-01-${day.toString().padStart(2, '0')}` : null,
      promisedAmountPaise: null,
      confidence: day ? REGEX_FALLBACK_CONFIDENCE_CAP.value : 0.0,
      intent: day ? 'will_pay' : 'unclear',
      source: 'llm_rejected_fallback_regex',
      sourceText: replyText,
    };
  }

  return { 
    cycleId, 
    promisedDate: result.data.promised_day_of_month ? `2000-01-${result.data.promised_day_of_month.toString().padStart(2, '0')}` : null,
    promisedAmountPaise: result.data.promised_amount_rupees ? result.data.promised_amount_rupees * 100 : null,
    confidence: result.data.confidence,
    intent: result.data.intent,
    source: 'llm',
    sourceText: replyText
  };
}

/** TODO(step 10, CUTTABLE). Only called for UNKNOWN codes. */
export async function diagnoseByLlm(
  _cycleId: string,
  _messyContext: string
): Promise<Diagnosis> {
  throw new Error('not implemented — build order step 10, cuttable');
}

