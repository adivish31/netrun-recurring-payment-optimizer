import { generateWorld } from '../src/sim/generator';
import { extractPromisedDay } from '../src/prior/promise-regex';
import { extractPromise } from '../src/diagnose/llm';
import { callLlm } from '../src/llm/client';
import { PromiseOutputSchema } from '../src/diagnose/schemas';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('=== DIAGNOSTICS START ===');
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
  const cachePath = path.join(process.cwd(), '.cache', 'llm_cache.json');

  // 1. Source Distribution
  console.log('\n--- 1. Source Distribution (1467) ---');
  const sources: Record<string, number> = {};
  for (let i = 0; i < world.replies.length; i += 10) {
    const chunk = world.replies.slice(i, i + 10);
    await Promise.all(chunk.map(async (r) => {
      const p = await extractPromise(r.cycleId, r.text);
      sources[p.source] = (sources[p.source] || 0) + 1;
    }));
  }
  console.log(sources);

  // 2. Instrument LLM Client for ONE uncached reply
  console.log('\n--- 2. Instrument ONE uncached reply ---');
  const reply = world.replies[0]!;
  const prompt = `You are a pure extraction tool. 
Extract the intent and any promised date/amount from this reply.
Do not invent dates or amounts if they are not stated.
Respond strictly in JSON matching the requested schema.

Reply:
"${reply.text}"`;

  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey!);
  const modelString = 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({ model: modelString, generationConfig: { temperature: 0 }});
  
  console.log(`Model string sent: ${modelString}`);
  try {
    const result = await model.generateContent(prompt);
    // Since GoogleGenerativeAI SDK doesn't expose raw HTTP status directly easily, we just output the response body
    console.log(`HTTP Status: 200 OK (from SDK if it didn't throw)`);
    const rawJson = result.response.text();
    console.log(`Raw response body: ${rawJson}`);

    const match = rawJson.match(/```(?:json)?\n([\s\S]*?)\n```/);
    const cleanJson = match ? match[1]! : rawJson;
    let parsed = JSON.parse(cleanJson);
    
    try {
      PromiseOutputSchema.parse(parsed);
      console.log(`Zod validation: PASSED`);
    } catch (zErr: any) {
      console.log(`Zod validation: FAILED - ${zErr.message}`);
    }
  } catch (err: any) {
    console.log(`HTTP/Network Error: ${err.message}`);
  }

  // 4. Clear cache and run 20
  console.log('\n--- 4. Clear Cache & Run 20 ---');
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
  
  const t0 = Date.now();
  const chunk20 = world.replies.slice(0, 20);
  const sources20: Record<string, number> = {};
  await Promise.all(chunk20.map(async (r) => {
    const p = await extractPromise(r.cycleId, r.text);
    sources20[p.source] = (sources20[p.source] || 0) + 1;
  }));
  const t1 = Date.now();
  console.log(`Wall-clock time for 20: ${t1 - t0}ms`);
  console.log(`Source distribution for 20:`, sources20);

  // 5. Regex scoring mapping check
  console.log('\n--- 5. Regex Intent Scoring Example ---');
  const checkClasses = ['cannot_pay', 'already_paid', 'dispute'];
  for (const cls of checkClasses) {
    console.log(`\nExamples of trueIntent=${cls}:`);
    const examples = world.replies.filter(r => r.trueIntent === cls).slice(0, 5);
    for (const r of examples) {
      const rDay = extractPromisedDay(r.text);
      const rIntent = rDay ? 'will_pay' : 'unclear';
      const lPromise = await extractPromise(r.cycleId, r.text);
      console.log(`  Text: "${r.text}"`);
      console.log(`  Regex mapping -> ${rIntent}`);
      console.log(`  LLM mapping -> ${lPromise.intent} (source: ${lPromise.source})`);
    }
  }
}

run().catch(console.error);
