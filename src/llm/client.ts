import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const cacheFilePath = path.join(process.cwd(), '.cache', 'llm_cache.json');
const cacheDir = path.dirname(cacheFilePath);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Where a response came from. This is not cosmetic: mock output must never be
 * consumable as model output, so provenance travels with the value and is
 * persisted alongside it in the cache.
 */
export type LlmProvenance = 'llm' | 'llm_cache' | 'mock';

/**
 * Cache entries are versioned and carry their provenance. Entries written by
 * an earlier build (bare, unversioned objects) are discarded on read rather
 * than trusted, because that format cannot prove it came from the model — and
 * some of it did not.
 */
const CACHE_VERSION = 2;

interface CacheEntry {
  v: number;
  provenance: LlmProvenance;
  data: unknown;
}

let diskCache: Record<string, CacheEntry> = {};
if (fs.existsSync(cacheFilePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    let discarded = 0;
    for (const [key, value] of Object.entries<any>(parsed)) {
      if (value && value.v === CACHE_VERSION && value.provenance === 'llm') {
        diskCache[key] = value as CacheEntry;
      } else {
        discarded++;
      }
    }
    if (discarded > 0) {
      console.warn(
        `LLM cache: discarded ${discarded} entr${discarded === 1 ? 'y' : 'ies'} that ` +
          `cannot be attributed to a real model call. They will be re-fetched.`
      );
    }
  } catch (e) {
    console.warn('Failed to read LLM cache, starting fresh.');
  }
}

function saveCache() {
  fs.writeFileSync(cacheFilePath, JSON.stringify(diskCache, null, 2));
}

const geminiApiKey = process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const geminiModelStr = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const geminiModel = genAI ? genAI.getGenerativeModel({ 
  model: geminiModelStr,
  generationConfig: { temperature: 0 } 
}) : null;

/**
 * A keyword matcher standing in for the model. It exists ONLY so the pipeline
 * can be exercised without an API key, it runs ONLY when ALLOW_MOCK_LLM=1, and
 * its output is tagged `provenance: 'mock'` so no caller can present it as
 * something the model said. It is never written to the cache.
 */
function mockExtraction(fullPrompt: string): string {
  // Match against the REPLY only. Scanning the whole prompt also scans the
  // schema template, whose "confidence": 0.9 made the day-of-month regex
  // return 0 — which then failed Zod, so this stub always errored instead of
  // returning anything. Keyed off the reply, it actually exercises the path.
  const replyMatch = fullPrompt.match(/Reply:\s*"([\s\S]*)"\s*$/);
  const prompt = replyMatch ? replyMatch[1]! : fullPrompt;

  let intent = 'unclear';
  let dayStr: string | null = null;
  if (prompt.includes('tight hai') || prompt.includes('skip karo') || prompt.includes('kuch dino se')) {
    intent = 'cannot_pay';
  } else if (prompt.includes('kal hi kar diya') || prompt.includes('apne end pe') || prompt.includes('tumhe nahi mila')) {
    intent = 'already_paid';
  } else if (
    prompt.includes('fraud') ||
    prompt.includes('kaunsa charge') ||
    prompt.includes('subscribe nahi kiya') ||
    prompt.includes('galat amount')
  ) {
    intent = 'dispute';
  } else {
    const match = prompt.match(/(\d{1,2})(?:st|nd|rd|th)?/);
    if (match) {
      intent = 'will_pay';
      dayStr = match[1]!;
    }
  }
  return JSON.stringify({
    intent,
    promised_day_of_month: dayStr ? parseInt(dayStr, 10) : null,
    promised_amount_rupees: null,
    confidence: 0.9,
  });
}

/** Models sometimes wrap JSON in a markdown fence. Strip it before parsing. */
function stripJsonFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1]! : raw).trim();
}

export async function callLlm<T>(
  prompt: string,
  schema: z.ZodType<T>,
  cacheKeyPrefix: string = 'llm'
): Promise<{ data: T | null; error: string | null; provenance: LlmProvenance | null }> {
  // Zod schemas do not serialise, so the cache key is the prompt plus prefix.
  const hash = crypto.createHash('sha256').update(prompt + cacheKeyPrefix).digest('hex');
  const cacheKey = `${cacheKeyPrefix}_${hash}`;

  const cached = diskCache[cacheKey];
  if (cached) {
    try {
      // Only 'llm' entries survive the load filter, so a hit here is a replay
      // of a real model response.
      return { data: schema.parse(cached.data), error: null, provenance: 'llm_cache' };
    } catch {
      delete diskCache[cacheKey];
    }
  }

  const mockAllowed = process.env.ALLOW_MOCK_LLM === '1';

  let raw: string;
  let provenance: LlmProvenance;

  if (geminiModel) {
    try {
      const result = await geminiModel.generateContent(prompt);
      raw = result.response.text();
      provenance = 'llm';
    } catch (e: any) {
      // A transport failure is reported, never silently mocked. The caller's
      // deterministic fallback is the correct response to this.
      return {
        data: null,
        error: `LLM call failed: ${e.message}`,
        provenance: null,
      };
    }
  } else if (mockAllowed) {
    raw = mockExtraction(prompt);
    provenance = 'mock';
  } else {
    // No key and no explicit opt-in to the mock. Refuse loudly rather than
    // return fabricated output that would be labelled as the model's.
    throw new Error(
      'LLM_UNAVAILABLE: GEMINI_API_KEY is not set. Set it to make real calls, ' +
        'or set ALLOW_MOCK_LLM=1 to run the keyword stub — whose output is ' +
        'tagged as a mock and must never be presented as model output.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return {
      data: null,
      error: `JSON parsing failed. Raw: ${raw.slice(0, 300)}`,
      provenance,
    };
  }

  try {
    const validated = schema.parse(parsed);
    // Only real model responses are persisted. Caching a mock would let it be
    // replayed later as though it had come from the model.
    if (provenance === 'llm') {
      diskCache[cacheKey] = { v: CACHE_VERSION, provenance: 'llm', data: validated };
      saveCache();
    }
    return { data: validated, error: null, provenance };
  } catch (e: any) {
    return { data: null, error: `Zod validation failed: ${e.message}`, provenance };
  }
}

export async function generateWithTools(
  prompt: string,
  tools: any[],
  history: any[] = []
): Promise<{ text: string, functionCalls: any[] }> {
  if (!geminiModel) {
    throw new Error('GEMINI_API_KEY is not set or model is unavailable.');
  }

  const modelWithTools = genAI!.getGenerativeModel({
    model: geminiModelStr,
    tools: [{ functionDeclarations: tools }],
    generationConfig: { temperature: 0 }
  });

  const chat = modelWithTools.startChat({ history });
  const result = await chat.sendMessage(prompt);
  
  const response = result.response;
  
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No candidates returned.');
  }

  const candidate = response.candidates[0]!;
  const finishReason = candidate.finishReason;

  if (finishReason !== 'STOP' && finishReason !== undefined && finishReason !== null) {
    throw new Error(`Execution blocked by finishReason: ${finishReason}`);
  }

  let text = '';
  const functionCalls: any[] = [];

  if (candidate.content && candidate.content.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        // push the whole part to retain thoughtSignature, id, etc.
        functionCalls.push(part);
      }
    }
  }

  if (finishReason === 'STOP' && !text && functionCalls.length === 0) {
    console.warn(`WARNING: LLM returned STOP but yielded no text and no function calls.`);
  }

  return { text, functionCalls };
}
