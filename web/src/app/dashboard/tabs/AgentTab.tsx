/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';

import AgentFlowGraph from './AgentFlowGraph';
import {
  AGENT_CANNOT_DO,
  DECLINED_ZERO_ATTEMPTS,
  HIDE_DETAIL,
  INJECTION_GUARDRAILS,
  NO_MODEL_TEXT_NOTE,
  OVER_CALL_LINE,
  SHOW_DETAIL,
  SUMMARY_PROVENANCE_NOTE,
  TRUST_BOUNDARY_LINE,
  captureLabel,
  extractSourceLabel,
  formatDate,
  stepWord,
  toolLabel,
} from '../../../lib/labels';
import {
  agentLead,
  isRejectedStep,
  injectionExtractStep,
  overCallInfo,
  parseJson,
  stepSummary,
  traceOutcome,
  type AgentTrace,
  type Iteration,
} from '../../../lib/traceDerive';

export default function AgentTab({
  trace,
  revealed,
  target,
  speed,
  fellBackToRules,
  onStepLanded,
  scheduledAttempts,
  declineClass,
  showDetail,
  onToggleDetail,
}: {
  trace: AgentTrace | undefined;
  /** steps committed to the stream — the graph's committed layer matches this */
  revealed: number;
  /** steps requested; the graph animates the difference and commits each */
  target: number;
  speed: number;
  fellBackToRules: boolean;
  onStepLanded: () => void;
  /** attempts the evaluated plan committed, so no lead over-claims an outcome */
  scheduledAttempts: number;
  /** the cycle's decline class, so a zero-budget decline is stated here too */
  declineClass: string;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const [openStep, setOpenStep] = useState<number | null>(null);

  if (!trace || !trace.iterations?.length) {
    return (
      <div className="text-sm text-[#64748B]">
        This trace recorded no tool calls, so there is nothing to show.
      </div>
    );
  }

  const lead = agentLead(trace, scheduledAttempts);
  const outcome = traceOutcome(trace, scheduledAttempts);
  const steps = trace.iterations.slice(0, revealed);
  const total = trace.iterations.length;
  const overCall = overCallInfo(trace);
  const injectionStep = injectionExtractStep(trace);
  // A class that spends no budget is a decline whether or not the agent run
  // reached that conclusion itself — say it plainly either way.
  const zeroBudgetClass = declineClass === 'TERMINAL' || declineClass === 'AUTH';
  const terminalDecline =
    outcome === 'declined_terminal' || (zeroBudgetClass && scheduledAttempts === 0);

  const capturedOn = trace.captured === 'live' ? formatDate(trace.decision?.createdAt) : null;
  const capture = captureLabel(trace.captured, capturedOn);

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">{lead}</p>

          <div className="text-[#059669] font-bold mt-3 text-lg tabular-nums">
            {stepWord(total)}
          </div>

          {/* Volunteered, computed from the trace itself. */}
          {overCall && (
            <p className="text-sm text-[#B45309] mt-2 leading-relaxed max-w-2xl">
              {OVER_CALL_LINE(
                overCall.toolCalls,
                overCall.modelTurns,
                overCall.stages,
                overCall.repeats
              )}
            </p>
          )}

          <div className="text-xs mt-3 text-[#64748B] leading-relaxed max-w-2xl">{capture}</div>
        </div>

        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? HIDE_DETAIL : SHOW_DETAIL}
        </button>
      </div>

      {/* TERMINAL decline gets said plainly and prominently. */}
      {terminalDecline && (
        <div className="border-l-4 border-[#B45309] bg-[#FFFBEB] px-6 py-4">
          <div className="text-lg font-bold text-[#92400E]">{DECLINED_ZERO_ATTEMPTS}</div>
        </div>
      )}

      {/* TRUST BOUNDARY — always visible, above the graph */}
      <p className="text-sm font-semibold text-[#0F172A] border-l-4 border-[#1D4ED8] pl-4 py-1">
        {TRUST_BOUNDARY_LINE}
      </p>

      <div className="flex gap-8 items-start relative">
        {/* LEFT: the flow graph. An aid — never the record. */}
        <div className="sticky top-0 shrink-0">
          <AgentFlowGraph
            trace={trace}
            committed={revealed}
            target={target}
            speed={speed}
            fellBackToRules={fellBackToRules}
            onStepLanded={onStepLanded}
          />
        </div>

        {/* RIGHT: the reasoning stream, plain HTML, the source of truth */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4 border-b border-[#E2E8F0] pb-2">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase">
              What happened, step by step
            </h2>
            {/* Said once per trace, not once per step. */}
            <span className="text-xs text-[#64748B] italic text-right">
              {SUMMARY_PROVENANCE_NOTE}
            </span>
          </div>

          {/* INJECTION — two guardrails, in the order they fired */}
          {injectionStep && (
            <div className="border border-[#E2E8F0] bg-white p-4 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
                {INJECTION_GUARDRAILS.heading}
              </h3>
              <ol className="space-y-3 text-sm leading-relaxed">
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#059669] shrink-0">1</span>
                  <span>
                    {INJECTION_GUARDRAILS.first(
                      extractSourceLabel(parseJson(injectionStep.outputSummary)?.source)
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#059669] shrink-0">2</span>
                  <span>{INJECTION_GUARDRAILS.second}</span>
                </li>
              </ol>
              <p className="text-xs text-[#64748B] mt-3 italic">{INJECTION_GUARDRAILS.note}</p>
            </div>
          )}

          {steps.map((it: Iteration) => {
            const t = toolLabel(it.toolCalled);
            const rejected = isRejectedStep(it, trace);
            const isOpen = openStep === it.n;

            return (
              <div
                key={it.n}
                className={`step-append border-b border-dashed border-[#E2E8F0] py-3 ${
                  rejected ? 'bg-[#FEF2F2]' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="font-mono text-xs text-[#64748B] w-16 shrink-0 pt-1">
                    Step {it.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#0F172A]">{t.label}</span>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-[#64748B]">
                        {t.subLabel}
                      </span>
                    </div>
                    <div
                      className={`text-sm mt-1 leading-relaxed ${
                        rejected ? 'text-[#B91C1C] font-medium' : 'text-[#475569]'
                      }`}
                    >
                      {stepSummary(it)}
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenStep(isOpen ? null : it.n)}
                    aria-label={isOpen ? 'Hide raw call' : 'Show raw call'}
                    className="shrink-0 text-[#64748B] hover:text-[#0F172A] font-mono text-sm px-2 border border-[#E2E8F0] bg-white"
                  >
                    {isOpen ? '▾' : '…'}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 ml-20 bg-[#0F172A] text-white font-mono text-[11px] p-4 overflow-x-auto whitespace-pre-wrap">
                    <div className="text-[#94A3B8]">{`// tool`}</div>
                    <div className="mb-3">{it.toolCalled}</div>
                    <div className="text-[#94A3B8]">{`// arguments`}</div>
                    <div className="mb-3">{it.inputSummary}</div>
                    <div className="text-[#94A3B8]">{`// result`}</div>
                    <div className={rejected ? 'text-red-400' : 'text-green-400'}>
                      {it.outputSummary || '(no output — the call was refused before it ran)'}
                    </div>
                    <div className="text-[#94A3B8] mt-3">{`// model text`}</div>
                    <div className="text-[#CBD5E1]">{it.reasoning}</div>
                  </div>
                )}
              </div>
            );
          })}

          {/* The diagnosis about model text, stated once. */}
          {trace.captured === 'live' && (
            <p className="text-xs text-[#64748B] italic mt-2">{NO_MODEL_TEXT_NOTE}</p>
          )}

          {trace.fellBackToDeterministic && trace.fallbackReason && revealed >= total && (
            <div className="mt-4 border-l-4 border-[#B45309] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
              <span className="font-semibold">Run ended early: </span>
              {trace.fallbackReason}
            </div>
          )}
        </div>
      </div>

      {/* WHAT THE AGENT CANNOT DO */}
      {showDetail && (
        <div className="border border-[#E2E8F0] bg-white p-6 max-w-2xl">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B45309] mb-4 border-b border-[#E2E8F0] pb-2">
            What the agent cannot do
          </h3>
          <ul className="text-sm text-[#0F172A] space-y-2 list-disc pl-4 marker:text-[#64748B]">
            {AGENT_CANNOT_DO.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
