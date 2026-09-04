import { generateWorld } from '../src/sim/generator';
import { runAgent } from '../src/agent/loop';
import { evaluatePolicy } from '../src/policy/policy-engine';
import { MAX_ATTEMPTS_PER_CYCLE, getAfaThresholdPaise } from '../src/config/rules';
import { makePopulationEstimator } from '../src/prior/estimator';
import { makeNetrunStrategy } from '../src/eval/baselines';
import type { EstimationContext } from '../src/types';

async function buildBaseContext(world: any, event: any): Promise<EstimationContext> {
  const mandate = world.mandates.find((m: any) => m.mandateId === event.mandateId)!;
  return {
    cycleId: event.cycleId,
    customerId: mandate.customerId,
    amountPaise: mandate.amountPaise,
    mcc: mandate.mcc,
    dueDate: event.dueDate,
    diagnosis: { cycleId: event.cycleId, class: event.firstAttempt.trueClass || 'UNKNOWN', confidence: 1, source: 'lookup', rawCode: 'TEST', evidence: '' },
    promise: null,
    history: { successDays: [], failureDays: [], pastCycles: 0, pastPromisesMade: 0, pastPromisesKept: 0 },
  };
}

async function diagnose() {
  const world = generateWorld({ seed: 42, mandateCount: 50, cycleCount: 6 });
  
  let cBalance, cTransient, cTerminal, cAfa, cReply;
  for (const event of world.cycleEvents) {
    const mandate = world.mandates.find((m: any) => m.mandateId === event.mandateId)!;
    if (!cBalance && event.firstAttempt.trueClass === 'BALANCE') cBalance = event;
    if (!cTransient && event.firstAttempt.trueClass === 'TRANSIENT') cTransient = event;
    if (!cTerminal && event.firstAttempt.trueClass === 'TERMINAL') cTerminal = event;
    if (!cAfa && mandate.amountPaise > getAfaThresholdPaise(mandate.mcc)) cAfa = event;
  }
  cReply = world.cycleEvents.find((e: any) => world.replies.some((r: any) => r.cycleId === e.cycleId)) || world.cycleEvents[5];

  const sample = [cBalance, cTransient, cTerminal, cAfa].map((event, cycleIdx) => ({ event, cycleIdx })).filter(x => x.event);
  
  const popEst = makePopulationEstimator(world);
  const detStrategy = makeNetrunStrategy(popEst);

  for (const c of sample) {
    console.log(`\n======================================================`);
    console.log(`CYCLE ${c.cycleIdx + 1} (${c.event!.firstAttempt.trueClass || 'UNKNOWN'}, cycleId: ${c.event!.cycleId})`);
    console.log(`======================================================`);

    const ctx = await buildBaseContext(world, c.event);
    
    // DELAY REMOVED
    
    console.log(`\n--- AGENT PIPELINE ---`);
    const trace = await runAgent(world, ctx, MAX_ATTEMPTS_PER_CYCLE.value, new Map(), new Map());

    let proposedHash = null;
    let checkedHash = null;
    let verdict = null;
    let ruleId = null;
    let mintedToken = null;
    let executeCalled = false;

    console.log(`\n1. FULL TRACE:`);
    for (let j = 0; j < trace.iterations.length; j++) {
      const iter = trace.iterations[j] as any;
      console.log(`\n  Iteration ${j + 1}: Tool -> ${iter.toolCalled}`);
      console.log(`    Args: ${iter.inputSummary}`);
      console.log(`    Result: ${iter.outputSummary}`);

      let argsObj: any = {};
      try { argsObj = JSON.parse(iter.inputSummary || "{}"); } catch (e) {}

      let resObj: any = {};
      try { resObj = JSON.parse(iter.outputSummary || "{}"); } catch (e) {}
      
      try { resObj = JSON.parse(resObj.text || iter.outputSummary || "{}"); } catch(e) {}

      if (iter.toolCalled === 'propose_schedule') {
        const match = (iter.outputSummary || '').match(/"schedule_hash":\s*"([^"]+)"/);
        if (match) proposedHash = match[1];
      }
      if (iter.toolCalled === 'check_policy' && argsObj.schedule_hash) {
        checkedHash = argsObj.schedule_hash;
      }
      if (iter.toolCalled === 'check_policy') {
        const matchVerdict = (iter.outputSummary || '').match(/"verdict":\s*"([^"]+)"/);
        const matchRuleId = (iter.outputSummary || '').match(/"rule_id":\s*"([^"]+)"/);
        const matchToken = (iter.outputSummary || '').match(/"policy_approval_token":\s*"([^"]+)"/);
        
        if (matchVerdict) verdict = matchVerdict[1];
        if (matchRuleId) ruleId = matchRuleId[1];
        if (matchToken) mintedToken = matchToken[1];
      }
      if (iter.toolCalled === 'execute') {
        executeCalled = true;
      }
    }

    console.log(`\n2. HASH COMPARISON:`);
    console.log(`   Hash from propose_schedule: ${proposedHash}`);
    console.log(`   Hash passed to check_policy: ${checkedHash}`);
    console.log(`   Identical strings? ${proposedHash === checkedHash}`);

    console.log(`\n3. EXACT VERDICT AND RULE_ID:`);
    console.log(`   Verdict: ${verdict}`);
    console.log(`   Rule ID: ${ruleId}`);

    console.log(`\n4. POLICY APPROVAL TOKEN:`);
    console.log(`   Token minted? ${mintedToken !== null ? mintedToken : 'No'}`);
    console.log(`   Did agent call execute? ${executeCalled}`);

    console.log(`\n5. ITERATIONS:`);
    console.log(`   Iterations used: ${trace.iterations.length} / MAX_AGENT_ITERATIONS (${MAX_ATTEMPTS_PER_CYCLE.value})`);
    console.log(`   Hit cap? ${trace.iterations.length >= 8}`);
    console.log(`   Agent Fallback? ${trace.fellBackToDeterministic}`);
    console.log(`   Fallback Reason: ${trace.fallbackReason}`);

    console.log(`\n6. DETERMINISTIC PIPELINE COMPARISON:`);
    const detSchedule = detStrategy.plan(ctx, MAX_ATTEMPTS_PER_CYCLE.value - 1);
    const slots = detSchedule?.slots || [];
    const detVerdict = evaluatePolicy(ctx, slots, 0);
    
    console.log(`   Deterministic proposed ${slots.length} attempts.`);
    console.log(`   Deterministic Policy Verdict: ${detVerdict.verdict}`);
    console.log(`   Deterministic Policy Rule ID: ${detVerdict.rule_id || 'none'}`);
  }
}

diagnose().catch(console.error);
