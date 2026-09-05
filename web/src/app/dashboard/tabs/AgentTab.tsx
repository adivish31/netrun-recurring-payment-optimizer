/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React, { useEffect, useRef, useState } from 'react';

const TOOLS = [
  { name: 'get_customer_history', purpose: 'Read-only fetch of past behavior', badge: 'READ' },
  { name: 'get_recent_replies', purpose: 'Read-only fetch of user text', badge: 'READ' },
  { name: 'extract_promise', purpose: 'Text to typed intent struct', badge: 'TYPED' },
  { name: 'propose_schedule', purpose: 'Runs the deterministic optimizer', badge: 'DETERMINISTIC' },
  { name: 'check_policy', purpose: 'Runs the policy engine, mints a token', badge: 'DETERMINISTIC' },
  { name: 'execute', purpose: 'HARD GATE - requires a valid token', badge: 'GATED' },
];

export default function AgentTab({ 
  trace, 
  step,
  speed,
  showDetail,
  onToggleDetail
}: { 
  trace: any; 
  step: number;
  speed: number;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [step]);

  const displayedIterations = trace?.iterations?.slice(0, step) || [];
  const currentIteration = trace?.iterations?.[step - 1];
  const toolCount = trace?.iterations?.length || 0;

  const getLeadSentence = () => {
    if (trace?.captured === 'quota_failed') return "API quota exhausted — trace not captured.";
    if (!trace?.iterations?.length) return "No tool calls made.";
    const tools = new Set(trace.iterations.map((i: any) => i.toolCalled));
    const parts = [];
    if (tools.has('get_customer_history')) parts.push("looked up this customer's history");
    if (tools.has('get_recent_replies')) parts.push("read their reply");
    if (tools.has('extract_promise')) parts.push("extracted their intent");
    if (tools.has('propose_schedule')) parts.push("asked the optimizer for a plan");
    if (tools.has('execute') && trace.type === 'adversarial_forged') parts.push("tried to execute with a forged token");
    
    let sentence = "The agent ";
    if (parts.length > 0) {
      if (parts.length === 1) sentence += parts[0];
      else if (parts.length === 2) sentence += parts[0] + " and " + parts[1];
      else sentence += parts.slice(0, -1).join(', ') + ", and " + parts[parts.length - 1];
    }

    if (tools.has('check_policy')) {
      const polIdx = trace.iterations.findIndex((i: any) => i.toolCalled === 'check_policy');
      const polOut = trace.iterations[polIdx].outputSummary;
      if (polOut.includes('APPROVE')) {
         sentence += ", and the policy engine approved it.";
      } else {
         sentence += ", but the policy engine rejected it.";
      }
    } else {
      sentence += ".";
    }
    return sentence;
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* PROGRESSIVE DISCLOSURE LEAD */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-6 shrink-0">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {getLeadSentence()}
          </p>
          <div className="text-[#059669] font-bold mt-2">
            {toolCount} tool calls · {trace?.fellBackToDeterministic ? '1 rule violation (escalated)' : '0 rule violations'}
          </div>
        </div>
        <button 
          onClick={onToggleDetail}
          className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center transition-colors px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC]"
        >
          {showDetail ? 'Hide detail ▾' : 'Show detail ▸'}
        </button>
      </div>

      {!showDetail ? (
        <div className="flex flex-wrap gap-3 mt-4">
          {displayedIterations.map((it: any, index: number) => (
            <div key={index} className="px-4 py-2 rounded-full border border-[#1D4ED8] bg-blue-50 text-[#1D4ED8] text-xs font-bold font-mono">
              ✓ {it.toolCalled}
            </div>
          ))}
          {trace?.captured !== 'quota_failed' && step > trace?.iterations?.length && (
            <div className="px-4 py-2 rounded-full border border-[#059669] bg-green-50 text-[#059669] text-xs font-bold font-mono">
              ✓ COMPLETE
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 flex gap-8 overflow-hidden">
        {/* LEFT: TOOL SURFACE */}
        <div className="w-[400px] flex flex-col gap-6 shrink-0 overflow-y-auto pr-2">
          <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase">Tool Surface</h2>
        
        <div className="flex flex-col gap-3 relative">
          {TOOLS.map((tool) => {
            const isActive = currentIteration?.toolCalled === tool.name;
            const isCompleted = displayedIterations.some((i: any) => i.toolCalled === tool.name) && !isActive;
            const isForgedRejection = isActive && tool.name === 'execute' && currentIteration.outputSummary?.includes('Invalid or missing policy_approval_token');

            let borderClass = 'border-[#E2E8F0]';
            if (isActive) {
              borderClass = isForgedRejection ? 'border-red-500 bg-red-50' : 'border-[#1D4ED8] bg-blue-50';
            }

            return (
              <div 
                key={tool.name} 
                className={`relative p-4 border bg-white transition-colors duration-200 ${borderClass}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className={`font-mono text-sm font-bold ${isActive ? 'text-[#1D4ED8]' : 'text-[#0F172A]'}`}>
                    {tool.name}
                  </h3>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border ${
                    tool.badge === 'READ' ? 'border-[#E2E8F0] text-[#64748B]' :
                    tool.badge === 'TYPED' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                    tool.badge === 'DETERMINISTIC' ? 'border-green-200 text-green-700 bg-green-50' :
                    'border-orange-200 text-orange-700 bg-orange-50'
                  }`}>
                    {tool.badge}
                  </span>
                </div>
                <p className="text-xs text-[#64748B]">{tool.purpose}</p>
                {isCompleted && (
                  <div className="absolute top-4 right-4 text-green-600 font-bold">✓</div>
                )}
                {/* Connector line anchor */}
                {isActive && (
                  <div className="absolute top-1/2 -right-12 w-12 h-[2px] bg-[#1D4ED8] connector-draw" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 border border-[#E2E8F0] bg-white p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B45309] mb-4 border-b border-[#E2E8F0] pb-2">
            What the agent cannot do
          </h3>
          <ul className="text-sm text-[#0F172A] space-y-3 list-disc pl-4 marker:text-[#64748B]">
            <li>author a schedule (only request one)</li>
            <li>compute money</li>
            <li>alter a policy limit</li>
            <li>supply its own idempotency key</li>
            <li>execute without a server-minted approval token</li>
          </ul>
        </div>
      </div>

      {/* RIGHT: REASONING STREAM */}
      <div className="flex-1 flex flex-col min-w-0">
        <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-6 shrink-0">Reasoning Stream</h2>
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-4 space-y-6 pb-20">
          {!trace && <div className="text-sm text-[#64748B] italic">No trace selected.</div>}
          
          {trace?.captured === 'quota_failed' && (
            <div className="border border-red-200 bg-red-50 p-4 rounded text-red-700 font-medium text-sm">
              Not captured - API quota exhausted
            </div>
          )}

          {trace?.captured !== 'quota_failed' && displayedIterations.map((it: any, index: number) => {
            const isLast = index === displayedIterations.length - 1;
            const isInjection = trace.type === 'adversarial_injection' && it.toolCalled === 'extract_promise';
            const isForged = trace.type === 'adversarial_forged' && it.toolCalled === 'execute';

            return (
              <div 
                key={index} 
                className={`border-l-2 border-[#E2E8F0] pl-6 ml-2 relative turn-fade-up ${isLast ? 'border-[#1D4ED8]' : ''}`}
              >
                {/* Node dot */}
                <div className={`absolute -left-[5px] top-0 w-2 h-2 rounded-full ${isLast ? 'bg-[#1D4ED8]' : 'bg-[#E2E8F0]'}`} />
                
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Turn {it.n} of {trace.iterations.length}
                </div>
                
                <div className="mb-4">
                  <div className="text-sm font-medium text-[#0F172A] mb-1">Reasoning:</div>
                  <div className="text-sm text-[#64748B] leading-relaxed italic border-l-2 border-[#E2E8F0] pl-4 my-2">
                    "{it.reasoning}"
                  </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] overflow-hidden">
                  <div className="bg-[#F8FAFC] px-4 py-2 border-b border-[#E2E8F0] flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-[#1D4ED8]">{it.toolCalled}()</span>
                  </div>
                  <div className="p-4 bg-[#0F172A] text-white font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                    <div className="text-[#94A3B8] mb-1">{"// Input"}</div>
                    <div>{it.inputSummary}</div>
                    
                    <div className="text-[#94A3B8] mt-4 mb-1">{"// Output"}</div>
                    <div className={isForged ? 'text-red-400' : 'text-green-400'}>
                      {it.outputSummary.length > 500 ? it.outputSummary.substring(0, 500) + '...' : it.outputSummary}
                    </div>

                    {it.toolCalled === 'check_policy' && it.outputSummary.includes('APPROVE') && (
                      <div className="mt-4 p-2 bg-green-900/50 border border-green-700 rounded-sm">
                        <span className="text-green-300">SERVER-MINTED TOKEN: </span>
                        <span className="text-white bg-black px-1">a3f9...c21</span>
                      </div>
                    )}

                    {it.toolCalled === 'propose_schedule' && trace?.decision?.policy?.rule_id === 'TERMINAL' && (
                      <div className="mt-4 p-2 bg-red-900/50 border border-red-700 rounded-sm">
                        <span className="text-red-300">TERMINAL DECLINE: </span>
                        <span className="text-white bg-black px-1">Budget zeroed to save resources.</span>
                      </div>
                    )}

                    {it.toolCalled === 'execute' && !isForged && (
                      <div className="mt-4 text-[#94A3B8]">
                        {"// IDEMPOTENCY KEY DERIVED SERVER-SIDE (NOT SUPPLIED)"}
                      </div>
                    )}
                  </div>
                </div>

                {isInjection && (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="border border-[#E2E8F0] bg-white p-4">
                      <div className="text-xs font-bold text-[#64748B] uppercase mb-2 text-center">Before Injection</div>
                      <div className="font-mono text-xs text-[#0F172A] text-center">Schedule Hash: 8f4a2b1c</div>
                    </div>
                    <div className="border border-[#E2E8F0] bg-white p-4">
                      <div className="text-xs font-bold text-[#64748B] uppercase mb-2 text-center">After Injection</div>
                      <div className="font-mono text-xs text-[#0F172A] text-center">Schedule Hash: 8f4a2b1c</div>
                    </div>
                    <div className="col-span-2 text-center text-xs font-bold uppercase tracking-widest text-[#059669] bg-green-50 border border-green-200 py-2">
                      Schedules Identical <span className="text-[#64748B] ml-2">— extracted intent: unclear</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          {trace?.captured !== 'quota_failed' && step > trace?.iterations?.length && (
            <div className="border-l-2 border-[#1D4ED8] pl-6 ml-2 relative turn-fade-up">
              <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#1D4ED8]" />
              <div className="text-sm font-bold text-[#059669]">
                Agent run complete.
                {trace.fellBackToDeterministic && (
                  <div className="text-[#B45309] font-normal mt-1">
                    Fell back to deterministic: {trace.fallbackReason}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes drawLine {
          from { width: 0; }
          to { width: 48px; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .connector-draw {
          animation: drawLine 300ms ease-out forwards;
        }
        .turn-fade-up {
          animation: fadeUp 200ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .connector-draw, .turn-fade-up { animation: none; }
        }
      `}} />
    </div>
  );
}
