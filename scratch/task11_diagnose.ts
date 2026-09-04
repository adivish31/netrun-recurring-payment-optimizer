import { runAgent } from '../src/agent/loop';
import { MAX_ATTEMPTS_PER_CYCLE } from '../src/config/rules';
import { generateWorld } from '../src/sim/generator';

async function buildBaseContext(world: any, event: any) {
  const mandate = world.mandates.find((m: any) => m.mandateId === event.mandateId)!;
  return {
    cycleId: event.cycleId,
    customerId: mandate.customerId,
    amountPaise: mandate.amountPaise,
    mcc: mandate.mcc,
    dueDate: event.dueDate,
    diagnosis: { cycleId: event.cycleId, class: event.firstAttempt.trueClass || 'UNKNOWN', confidence: 1, source: 'lookup' as const, rawCode: 'TEST', evidence: '' },
    promise: null,
    history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
  };
}

const originalFetch = global.fetch;

(global as any).fetch = async (url: string, options: any) => {
  if (url.includes('generativelanguage.googleapis.com')) {
    console.log('\n--- FETCH INTERCEPTED ---');
    console.log(`URL: ${url}`);
    
    // Exact request body
    const reqBody = options.body ? JSON.parse(options.body as string) : null;
    
    // Tools included?
    const hasTools = reqBody?.tools !== undefined;
    console.log(`Tools included in request payload: ${hasTools}`);
    
    // Redact key in URL or just print body
    console.log(`Request body:`, JSON.stringify(reqBody, null, 2));

    const response = await originalFetch(url, options);
    console.log(`\nHTTP Status: ${response.status} ${response.statusText}`);
    
    // We must clone the response to read its body without consuming it for the SDK
    const clone = response.clone();
    const rawBody = await clone.text();
    console.log(`Raw response body:`, rawBody);
    
    console.log('-------------------------\n');
    return response;
  }
  return originalFetch(url, options);
};

async function run() {
  console.log(`Exact model string sent: ${process.env.GEMINI_MODEL || 'gemini-3.6-flash'}`);
  const world = generateWorld({ seed: 42, mandateCount: 50, cycleCount: 6 });
  const event = world.cycleEvents[0]; // BALANCE
  const ctx = await buildBaseContext(world, event);
  
  await runAgent(world, ctx, MAX_ATTEMPTS_PER_CYCLE.value, new Map(), new Map());
}

run().catch(console.error);
