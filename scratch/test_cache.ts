import { callLlm } from '../src/llm/client';
import { PromiseOutputSchema } from '../src/diagnose/schemas';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const cachePath = path.join(process.cwd(), '.cache', 'llm_cache.json');
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  console.log('Testing cache on error...');
  // Pass an invalid API key to force an error
  process.env.GEMINI_API_KEY = 'invalid';
  process.env.GROQ_API_KEY = '';

  const { data, error } = await callLlm('test prompt', PromiseOutputSchema, 'test');
  
  if (error) {
    console.log(`Call failed as expected: ${error}`);
  }

  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Object.keys(cache).length > 0) {
      console.log('FAIL: cache contains items after error.');
      process.exit(1);
    }
  }
  
  console.log('PASS: Cache remains empty after error.');
}

run().catch(console.error);
