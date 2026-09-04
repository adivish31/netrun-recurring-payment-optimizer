import { callLlm } from '../src/llm/client';
import { PromiseOutputSchema } from '../src/diagnose/schemas';

async function run() {
  const prompt = `You are a pure extraction tool. 
Extract the intent and any promised date/amount from this reply.
Do not invent dates or amounts if they are not stated.
Respond strictly in JSON matching the requested schema.

Reply:
"I will pay on 5th"`;
  process.env.GEMINI_MODEL = 'gemini-3.5-flash';
  const result = await callLlm(prompt, PromiseOutputSchema, 'test2');
  console.log(result);
}
run().catch(console.error);
