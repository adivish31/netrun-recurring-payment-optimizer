import { TOOL_NAMES } from './tools';
import { ToolExecutor } from './tool_impls';
import { generateWithTools } from '../llm/client';
import * as crypto from 'crypto';
import type { Decision, EstimationContext } from '../types';
import type { GeneratedWorld } from '../sim/generator';
import { z } from 'zod';

export interface AgentRunTrace {
  cycleId: string;
  iterations: Array<{
    n: number;
    toolCalled: string;
    inputSummary: string;
    outputSummary: string;
    reasoning: string;
  }>;
  decision: Decision | null;
  fellBackToDeterministic: boolean;
  fallbackReason: string | null;
  llmCalls: number;
  elapsedMs: number;
}

export const MAX_AGENT_ITERATIONS = 6;

// Minimal tool schemas for Gemini
const geminiTools = [
  {
    name: 'get_customer_history',
    description: 'Fetch observable customer history. Returns success and failure days, past cycles.',
    parameters: { type: 'OBJECT', properties: { customer_id: { type: 'STRING' } }, required: ['customer_id'] }
  },
  {
    name: 'get_recent_replies',
    description: 'Fetch raw user text from recent SMS/WhatsApp replies for this cycle.',
    parameters: { type: 'OBJECT', properties: { cycle_id: { type: 'STRING' } }, required: ['cycle_id'] }
  },
  {
    name: 'extract_promise',
    description: 'Extract intent and promised date/amount from text.',
    parameters: { type: 'OBJECT', properties: { cycle_id: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['cycle_id', 'text'] }
  },
  {
    name: 'propose_schedule',
    description: 'Run the deterministic optimizer to propose a schedule. Pass promised_day_of_month if a promise was extracted.',
    parameters: { 
      type: 'OBJECT', 
      properties: { 
        cycle_id: { type: 'STRING' }, 
        promised_day_of_month: { type: 'NUMBER' } 
      }, 
      required: ['cycle_id'] 
    }
  },
  {
    name: 'check_policy',
    description: 'Check the proposed schedule against policy rules. Returns verdict and a token if APPROVED.',
    parameters: { 
      type: 'OBJECT', 
      properties: { cycle_id: { type: 'STRING' }, schedule_hash: { type: 'STRING' } }, 
      required: ['cycle_id', 'schedule_hash'] 
    }
  },
  {
    name: 'execute',
    description: 'HARD GATE. Execute the schedule using the policy_approval_token.',
    parameters: { 
      type: 'OBJECT', 
      properties: { 
        cycle_id: { type: 'STRING' }, 
        schedule_hash: { type: 'STRING' }, 
        policy_approval_token: { type: 'STRING' } 
      }, 
      required: ['cycle_id', 'schedule_hash', 'policy_approval_token'] 
    }
  }
];

export async function runAgent(
  world: GeneratedWorld,
  ctxBase: EstimationContext,
  maxBudget: number,
  attemptsUsed: number,
  historyCache: any,
  repliesCache: any
): Promise<AgentRunTrace> {
  const runId = crypto.randomUUID();
  const executor = new ToolExecutor(world, runId, ctxBase, maxBudget, attemptsUsed, historyCache, repliesCache);

  const trace: AgentRunTrace = {
    cycleId: ctxBase.cycleId,
    iterations: [],
    decision: null,
    fellBackToDeterministic: false,
    fallbackReason: null,
    llmCalls: 0,
    elapsedMs: 0
  };

  const startTime = Date.now();
  let history: any[] = [];
  
  let prompt = `You are a recovery agent. You must decide whether and when to retry a failed payment for cycle ${ctxBase.cycleId} and customer ${ctxBase.customerId}.
Diagnosis: ${ctxBase.diagnosis.class}
Amount: ${ctxBase.amountPaise} paise.
You MUST eventually call "execute" with a valid schedule and policy approval token, OR you can stop if no recovery is possible or allowed.
Use your tools to gather history, check replies, extract promises, propose a schedule, check policy, and then execute.
Only execute if the policy engine APPROVED it and gave you a token. If the policy ESCALATEs or BLOCKs, you may propose an alternative or stop.`;

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    let result: { text: string, functionCalls: any[] };
    trace.llmCalls++;
    try {
      result = await generateWithTools(prompt, geminiTools, history);
    } catch (e: any) {
      trace.fellBackToDeterministic = true;
      trace.fallbackReason = `LLM call failed or unavailable: ${e.message}`;
      break;
    }
    
    const { text, functionCalls } = result;

    if (functionCalls.length === 0) {
      trace.fellBackToDeterministic = true;
      trace.fallbackReason = `Agent stopped without executing. Last text: ${text}`;
      break;
    }

    const modelParts: any[] = [];
    const functionResponses: any[] = [];
    let shouldBreak = false;

    for (const part of functionCalls) {
      const functionCall = part.functionCall;
      const { name, args } = functionCall;

      modelParts.push(part); // Retain original thoughtSignature etc.

      if (!TOOL_NAMES.includes(name as any)) {
        functionResponses.push({ functionResponse: { name, response: { error: `Hallucinated tool ${name}` } } });
        continue;
      }
      
      let outputSummary = '';
      let toolOutput = {};
      let blockedError = null;

      try {
        toolOutput = await (executor as any)[name](args);
        outputSummary = JSON.stringify(toolOutput);
      } catch (e: any) {
        if (e.message.includes('EXECUTION_BLOCKED')) {
          blockedError = e.message;
        } else {
          toolOutput = { error: e.message };
          outputSummary = JSON.stringify(toolOutput);
        }
      }
      
      trace.iterations.push({
        n: trace.iterations.length + 1,
        toolCalled: name,
        inputSummary: JSON.stringify(args),
        outputSummary: outputSummary,
        reasoning: "LLM decided to call " + name,
      });

      if (blockedError) {
        trace.fellBackToDeterministic = true;
        trace.fallbackReason = blockedError;
        trace.decision = {
          decisionId: crypto.randomUUID(),
          cycleId: ctxBase.cycleId,
          chosenSchedule: null,
          action: 'STOP',
          policy: { verdict: 'BLOCK', rule_id: 'EXECUTION_BLOCKED', reason: blockedError },
          alternativesConsidered: 0,
          createdAt: new Date().toISOString()
        };
        trace.elapsedMs = Date.now() - startTime;
        return trace;
      }

      // Send function response as text to avoid role mismatch issues between SDK and API
      functionResponses.push({ text: `Function Response for ${name}:\n${JSON.stringify(toolOutput)}` });

      if (name === 'execute') {
        trace.decision = {
          decisionId: crypto.randomUUID(),
          cycleId: ctxBase.cycleId,
          chosenSchedule: { slots: [], expectedNrvPaise: 0, breakdown: { expectedCurrentRecoveryPaise: 0, expectedFutureValuePaise: 0, expectedInterventionCostPaise: 0, expectedChurnCostPaise: 0 }, pRecoverThisCycle: 0, pMandateSurvives: 0 }, // We don't have full schedule details here without fetching it back, mock for now
          action: 'SCHEDULE_ATTEMPT',
          policy: { verdict: 'APPROVE', rule_id: 'auto-approved' },
          alternativesConsidered: 0,
          createdAt: new Date().toISOString()
        };
        shouldBreak = true;
        break; // Stop executing further tools this turn
      }
    }

    if (shouldBreak) break;

    // Add model response to history
    history.push({ role: 'model', parts: modelParts });
    
    // Send tool outputs as the next user prompt to maintain alternating roles
    prompt = functionResponses.map(r => r.text).join('\n\n') + '\n\nProceed with the next step.';
  }

  if (!trace.decision && !trace.fallbackReason) {
    trace.fellBackToDeterministic = true;
    trace.fallbackReason = 'Iteration cap reached (ESCALATE)';
  }

  trace.elapsedMs = Date.now() - startTime;
  return trace;
}

export async function narrateDecision(trace: AgentRunTrace): Promise<string> {
  const prompt = `You are a finance manager explaining a recovery agent's decision trace. Explain what was considered, the steps taken, and why the final schedule was chosen or blocked. 
Trace: ${JSON.stringify(trace, null, 2)}`;
  
  try {
    const result = await generateWithTools(prompt, [], []);
    return result.text || 'Could not generate narrative.';
  } catch (e: any) {
    return `Narrative generation failed: ${e.message}`;
  }
}
