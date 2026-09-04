import { z } from 'zod';
import * as crypto from 'crypto';
import { extractPromise } from '../diagnose/llm';
import { evaluatePolicy } from '../policy/policy-engine';
import { idempotencyKey } from '../execute/idempotency';
import { optimize } from '../schedule/optimizer';
import { makeShrinkageEstimator, makePromiseEstimator } from '../prior/estimator';
import type { GeneratedWorld } from '../sim/generator';
import type { EstimationContext, Slot, ObservedHistory } from '../types';

export class ToolExecutor {
  private approvalTokens = new Map<string, string>(); // 'runId:scheduleHash' -> token

  constructor(
    private world: GeneratedWorld,
    private runId: string,
    private ctxBase: EstimationContext,
    private maxBudget: number,
    private attemptsUsed: number,
    private historyCache: Map<string, ObservedHistory>,
    private repliesCache: Map<string, string>,
    private proposedSchedules = new Map<string, Slot[]>()
  ) {}

  async get_customer_history(args: { customer_id: string }) {
    if (args.customer_id !== this.ctxBase.customerId) {
      throw new Error(`Unauthorized to access history for other customers.`);
    }
    const history = this.historyCache.get(this.ctxBase.customerId) || {
      successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0
    };
    return history;
  }

  async get_recent_replies(args: { cycle_id: string }) {
    if (args.cycle_id !== this.ctxBase.cycleId) throw new Error('Unauthorized');
    const text = this.repliesCache.get(args.cycle_id) || '';
    return { text: text ? `Customer replied: "${text}"` : 'No recent replies.' };
  }

  async extract_promise(args: { cycle_id: string; text: string }) {
    if (args.cycle_id !== this.ctxBase.cycleId) throw new Error('Unauthorized');
    const promise = await extractPromise(args.cycle_id, args.text);
    return promise;
  }

  async propose_schedule(args: { cycle_id: string; promised_day_of_month?: number | null }) {
    if (args.cycle_id !== this.ctxBase.cycleId) throw new Error('Unauthorized');
    
    // Inject promise if provided
    let promiseObj = null;
    if (args.promised_day_of_month) {
      promiseObj = {
        cycleId: args.cycle_id,
        promisedDate: `2000-01-${String(args.promised_day_of_month).padStart(2, '0')}`,
        promisedAmountPaise: null,
        confidence: 0.9,
        intent: 'will_pay' as const,
        source: 'llm' as const,
        sourceText: 'Injected by agent'
      };
    }
    
    const ctx = { ...this.ctxBase, promise: promiseObj };
    
    let estimator = makeShrinkageEstimator(this.world);
    if (promiseObj) {
      estimator = makePromiseEstimator(this.world); // use promise estimator if promised
    }
    
    const attemptsLeft = this.maxBudget - this.attemptsUsed;
    const result = optimize(ctx, estimator, attemptsLeft);
    
    if (!result.chosen) return { error: 'Optimizer failed to find a valid schedule.' };

    const scheduleHash = crypto.createHash('sha256').update(JSON.stringify(result.chosen.slots)).digest('hex').substring(0, 8);
    this.proposedSchedules.set(scheduleHash, result.chosen.slots);

    return {
      schedule_hash: scheduleHash,
      schedule: result.chosen.slots,
      nrv: result.chosen.expectedNrvPaise,
      breakdown: result.chosen.breakdown,
      alternativesConsidered: result.alternativesConsidered,
      runnerUpNrv: result.runnerUp?.expectedNrvPaise || null,
    };
  }

  async check_policy(args: { cycle_id: string; schedule_hash: string }) {
    if (args.cycle_id !== this.ctxBase.cycleId) throw new Error('Unauthorized');
    
    const slots = this.proposedSchedules.get(args.schedule_hash);
    if (!slots) throw new Error(`Unknown schedule_hash: ${args.schedule_hash}`);

    const verdict = evaluatePolicy(this.ctxBase, slots, this.attemptsUsed);
    
    let token = null;
    if (verdict.verdict === 'APPROVE') {
      token = crypto.randomBytes(16).toString('hex');
      this.approvalTokens.set(`${this.runId}:${args.schedule_hash}`, token);
    }
    
    return { verdict: verdict.verdict, rule_id: verdict.rule_id, token };
  }

  async execute(args: { cycle_id: string; schedule_hash: string; policy_approval_token: string }) {
    if (args.cycle_id !== this.ctxBase.cycleId) throw new Error('Unauthorized');
    
    const expectedToken = this.approvalTokens.get(`${this.runId}:${args.schedule_hash}`);
    if (!expectedToken || expectedToken !== args.policy_approval_token) {
      // Fail closed
      throw new Error(`EXECUTION_BLOCKED: Invalid or missing policy_approval_token for schedule_hash ${args.schedule_hash}. Tokens cannot be forged.`);
    }

    const slots = this.proposedSchedules.get(args.schedule_hash);
    if (!slots) throw new Error(`Unknown schedule_hash: ${args.schedule_hash}`);

    // Derive idempotency key itself, NEVER accept from agent
    const idempKey = idempotencyKey(args.cycle_id, this.attemptsUsed + 1, 'SCHEDULE_ATTEMPT');

    return {
      success: true,
      message: `Executed schedule ${args.schedule_hash} with idempotency key ${idempKey}`,
      idempotency_key: idempKey,
    };
  }
}
