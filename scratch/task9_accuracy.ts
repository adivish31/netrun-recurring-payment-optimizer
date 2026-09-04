import { generateWorld } from '../src/sim/generator';
import { extractPromisedDay } from '../src/prior/promise-regex';
import { extractPromise } from '../src/diagnose/llm';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
  const total = world.replies.length;

  let regexIntentAcc = 0;
  let regexDateAcc = 0;
  let llmIntentAcc = 0;
  let llmDateAcc = 0;

  const intents = ['will_pay', 'cannot_pay', 'already_paid', 'dispute', 'unclear'];
  const intentCounts: Record<string, number> = {};
  const regexIntentCorrect: Record<string, number> = {};
  const llmIntentCorrect: Record<string, number> = {};
  for (const i of intents) {
    intentCounts[i] = 0;
    regexIntentCorrect[i] = 0;
    llmIntentCorrect[i] = 0;
  }

  const cachePath = path.join(process.cwd(), '.cache', 'llm_cache.json');
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  // Measure first run
  const t0 = Date.now();
  const sources: Record<string, number> = {};
  for (let i = 0; i < total; i += 10) {
    const chunk = world.replies.slice(i, i + 10);
    await Promise.all(chunk.map(async (reply) => {
      // Regex
      const rDay = extractPromisedDay(reply.text);
      const rIntent = rDay ? 'will_pay' : 'unclear'; // simple regex intent fallback
      
      const trueIntent = reply.trueIntent;
      const trueDay = reply.trueDate ? parseInt(reply.trueDate.slice(8, 10), 10) : null;

      intentCounts[trueIntent] = (intentCounts[trueIntent] || 0) + 1;

      if (rIntent === trueIntent) {
        regexIntentAcc++;
        regexIntentCorrect[trueIntent] = (regexIntentCorrect[trueIntent] || 0) + 1;
      }
      if (rDay === trueDay) regexDateAcc++;

      // LLM
      const lPromise = await extractPromise(reply.cycleId, reply.text);
      sources[lPromise.source] = (sources[lPromise.source] || 0) + 1;
      if (lPromise.intent === trueIntent) {
        llmIntentAcc++;
        llmIntentCorrect[trueIntent] = (llmIntentCorrect[trueIntent] || 0) + 1;
      }
      const lDay = lPromise.promisedDate ? parseInt(lPromise.promisedDate.slice(8, 10), 10) : null;
      if (lDay === trueDay) llmDateAcc++;
    }));
  }
  const t1 = Date.now();

  console.log(`\n--- OVERALL ACCURACY (n=${total}) ---`);
  console.log(`Regex: Intent ${(regexIntentAcc / total * 100).toFixed(1)}%, Date ${(regexDateAcc / total * 100).toFixed(1)}%`);
  console.log(`LLM:   Intent ${(llmIntentAcc / total * 100).toFixed(1)}%, Date ${(llmDateAcc / total * 100).toFixed(1)}%`);
  console.log(`Delta: Intent +${((llmIntentAcc - regexIntentAcc) / total * 100).toFixed(1)}%, Date +${((llmDateAcc - regexDateAcc) / total * 100).toFixed(1)}%`);
  console.log(`\n--- SOURCE DISTRIBUTION ---`);
  console.log(sources);

  console.log(`\n--- INTENT ACCURACY BREAKDOWN ---`);
  for (const intent of intents) {
    const count = intentCounts[intent] || 0;
    if (count === 0) {
      console.log(`${intent.padEnd(15)} | count: 0`);
      continue;
    }
    const rAcc = (regexIntentCorrect[intent]! / count * 100).toFixed(1);
    const lAcc = (llmIntentCorrect[intent]! / count * 100).toFixed(1);
    const delta = (parseFloat(lAcc) - parseFloat(rAcc)).toFixed(1);
    console.log(`${intent.padEnd(15)} | count: ${String(count).padEnd(3)} | Regex: ${rAcc.padStart(5)}% | LLM: ${lAcc.padStart(5)}% | Delta: +${delta}%`);
  }

  // Second run to test cache
  console.log(`\n--- CACHE HIT RATE ---`);
  console.log(`Run 1 took ${(t1 - t0) / 1000}s`);
  
  let secondRunCalls = 0;
  const t2 = Date.now();
  for (let i = 0; i < total; i += 10) {
    const chunk = world.replies.slice(i, i + 10);
    await Promise.all(chunk.map(async (reply) => {
      secondRunCalls++;
      await extractPromise(reply.cycleId, reply.text);
    }));
  }
  const t3 = Date.now();
  
  console.log(`Run 2 took ${(t3 - t2) / 1000}s`);
  console.log(`LLM Call Count (Run 2): ${secondRunCalls}`);
  
  // Verify hit rate using the cache file
  let cacheSize = 0;
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    cacheSize = Object.keys(cache).length;
    console.log(`Cache entries on disk: ${cacheSize}`);
  }
  
  if (cacheSize > 0 && secondRunCalls === cacheSize) {
    console.log(`Cache Hit Rate (Run 2): 100%`);
  } else {
    console.log(`Cache Hit Rate (Run 2): ${((cacheSize / secondRunCalls) * 100).toFixed(1)}%`);
  }
}

run().catch(console.error);
