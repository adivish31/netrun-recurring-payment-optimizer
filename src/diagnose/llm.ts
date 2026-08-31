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
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');
const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash', generationConfig: { temperature: 0 } });

/** TODO(step 9). Regex baseline lives beside it in tests for comparison. */
export async function extractPromise(
  _cycleId: string,
  _replyText: string
): Promise<PromiseToPay> {
  throw new Error('not implemented — build order step 9');
}

/** TODO(step 10, CUTTABLE). Only called for UNKNOWN codes. */
export async function diagnoseByLlm(
  _cycleId: string,
  _messyContext: string
): Promise<Diagnosis> {
  throw new Error('not implemented — build order step 10, cuttable');
}
