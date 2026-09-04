import { generateWorld } from '../src/sim/generator';
import { extractPromisedDay } from '../src/prior/promise-regex';
import { extractPromise } from '../src/diagnose/llm';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const world = generateWorld({ seed: 42, mandateCount: 400, cycleCount: 6 });
  const total = world.replies.length;
  
  // 8. Model down test - simulate by unsetting API keys
  // No, actually wait, model-down test requires a fresh run. I'll just write it all.
}
run().catch(console.error);
