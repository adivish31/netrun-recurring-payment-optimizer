/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React, { useEffect, useState } from 'react';
import { getLabel } from '../../../lib/labelMap';

export default function PipelineTab({ 
  cycle, trace, step, setStep, speed, cycles, onSelectCycle, showDetail, onToggleDetail 
}: { 
  cycle: any; trace: any; step: number; setStep: (s: number) => void; speed: number; cycles: any[]; onSelectCycle: (id: string) => void;
  showDetail: boolean; onToggleDetail: () => void;
}) {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isRunning && step < 5) {
      const timer = setTimeout(() => {
        setStep(step + 1);
      }, 1000 / speed);
      return () => clearTimeout(timer);
    } else if (step === 5) {
      setIsRunning(false);
    }
  }, [isRunning, step, speed, setStep]);

  // Node UI helpers
  const NodeCard = ({ title, nodeStep, isActive, isComplete, children }: any) => {
    let borderClass = 'border-[#E2E8F0]';
    if (isActive) borderClass = 'border-[#1D4ED8] -translate-y-[1px] shadow-sm';
    else if (isComplete) borderClass = 'border-l-4 border-l-[#059669] border-[#E2E8F0]';

    return (
      <div className={`flex-1 min-w-[200px] border bg-white p-4 transition-all duration-300 ${borderClass}`}>
        <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isActive ? 'text-[#1D4ED8]' : 'text-[#64748B]'}`}>
          {title}
        </h4>
        <div className="text-sm">
          {children}
        </div>
      </div>
    );
  };

  const Connector = ({ isComplete }: { isComplete: boolean }) => (
    <div className="w-8 h-[2px] bg-[#E2E8F0] relative overflow-hidden shrink-0 mt-8">
      <div className={`absolute top-0 left-0 bottom-0 bg-[#1D4ED8] transition-all duration-400 ease-out ${isComplete ? 'w-full' : 'w-0'}`}></div>
    </div>
  );

  const getLeadSentence = () => {
    if (!trace) return "No data available.";
    let reason = trace.diagnosisClass === 'BALANCE' ? "lack of balance" : 
                 trace.diagnosisClass === 'TRANSIENT' ? "a transient bank error" : 
                 trace.diagnosisClass === 'TERMINAL' ? "a revoked mandate" : 
                 trace.diagnosisClass === 'AFA' ? "exceeding the authentication limit" : "unknown reasons";
                 
    let action = "NetRun optimised a recovery schedule";
    if (trace.diagnosisClass === 'TERMINAL') action = "NetRun halted attempts immediately to save budget";
    else if (trace.diagnosisClass === 'TRANSIENT') action = "NetRun scheduled retries during non-peak windows";
    else if (trace.diagnosisClass === 'BALANCE') action = "NetRun evaluated historical behaviour to find the optimal retry timing";
    
    return `This payment failed for ${reason}. ${action}.`;
  };

  const gross = trace?.nrvBreakdown?.gross || 0;
  const interv = trace?.nrvBreakdown?.interv || 0;
  const future = trace?.nrvBreakdown?.future || 0;
  const churn = trace?.nrvBreakdown?.churn || 0;
  const total = gross + future - interv - churn;
  const nrvVal = (total / 100).toFixed(0);
  const attempts = trace?.chosenSchedule?.length || 0;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* PROGRESSIVE DISCLOSURE LEAD */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-6 shrink-0">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {getLeadSentence()}
          </p>
          <div className="text-[#059669] font-bold mt-2">
            ₹{nrvVal} net recurring value · {attempts} of 4 attempts used
          </div>
        </div>
        <button 
          onClick={onToggleDetail}
          className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center transition-colors px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC]"
        >
          {showDetail ? 'Hide detail ▾' : 'Show detail ▸'}
        </button>
      </div>

      {/* Controls (Only show if detail is open, or maybe keep them visible) */}
      <div className="mb-4 border-b border-[#E2E8F0] pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <select 
              value={cycle?.id || ''}
              onChange={e => { onSelectCycle(e.target.value); setStep(0); setIsRunning(false); }}
              className="border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono focus:outline-none"
            >
              {cycles.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.diagnosisClass}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => { setIsRunning(false); setStep(0); }}
              className="px-4 py-2 border border-[#E2E8F0] text-sm font-semibold hover:bg-[#F8FAFC]"
            >
              ↺ Reset
            </button>
            <button 
              onClick={() => { setIsRunning(false); setStep(Math.min(5, step + 1)); }}
              disabled={step >= 5 || isRunning}
              className="px-4 py-2 border border-[#E2E8F0] text-sm font-semibold hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              ▶ Step
            </button>
            <button 
              onClick={() => { if(step===5)setStep(0); setIsRunning(true); }}
              disabled={isRunning}
              className="px-4 py-2 bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50"
            >
              ▶▶ Run
            </button>
          </div>
        </div>
      </div>

      {/* Nodes Flow */}
      {!showDetail ? (
        <div className="flex items-center gap-2 mt-4">
          {['01 Diagnose', '02 Estimate', '03 Optimise', '04 Check Policy', '05 Execute'].map((title, i) => {
             const nodeStep = i + 1;
             const isActive = step === nodeStep;
             const isComplete = step > nodeStep;
             let style = "text-[#64748B] border-[#E2E8F0] bg-white";
             if (isActive) style = "text-[#1D4ED8] border-[#1D4ED8] bg-blue-50";
             else if (isComplete) style = "text-[#059669] border-[#059669] bg-green-50";
             return (
               <div key={title} className="flex items-center">
                 <div className={`px-4 py-2 text-xs font-bold uppercase border rounded-full ${style}`}>
                   {isComplete ? '✓ ' : ''}{title}
                 </div>
                 {i < 4 && <div className={`w-8 h-[2px] mx-1 ${isComplete ? 'bg-[#059669]' : 'bg-[#E2E8F0]'}`} />}
               </div>
             )
          })}
        </div>
      ) : (
      <div className="flex items-start overflow-x-auto pb-8 pt-2">
        <NodeCard title="01 Diagnose" isActive={step === 1} isComplete={step > 1}>
          {step >= 1 ? (
            <div className="space-y-2">
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">Class</span>
                <span className="font-semibold">{trace?.diagnosisClass}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">Source</span>
                <span className="font-mono">{trace?.diagnosisSource}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-[#64748B]">Confidence</span>
                <span className="font-mono">1.00</span>
              </div>
            </div>
          ) : <div className="text-[#64748B] italic">Waiting...</div>}
        </NodeCard>
        
        <Connector isComplete={step > 1} />

        <NodeCard title="02 Estimate" isActive={step === 2} isComplete={step > 2}>
          {step >= 2 ? (
            <div className="space-y-2">
              <div className="h-16 flex items-end gap-1 mb-2">
                {/* Mock mini bar chart */}
                {[0.1, 0.2, 0.5, 0.8, 0.4, 0.3, 0.1].map((v, i) => (
                  <div key={i} className="flex-1 bg-[#1D4ED8] opacity-50" style={{ height: `${v * 100}%` }}></div>
                ))}
              </div>
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">Estimator</span>
                <span className="font-mono">shrinkage</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-[#64748B]">Promise</span>
                <span className="font-mono">None</span>
              </div>
            </div>
          ) : <div className="text-[#64748B] italic">Waiting...</div>}
        </NodeCard>

        <Connector isComplete={step > 2} />

        <NodeCard title="03 Optimise" isActive={step === 3} isComplete={step > 3}>
          {step >= 3 ? (
            <div className="space-y-2">
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">{getLabel('Alts')}</span>
                <span className="font-mono tabular-nums">{trace?.alternativesConsidered?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">Chosen NRV</span>
                <span className="font-mono">₹{(total/100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-[#64748B]">Delta</span>
                <span className="font-mono text-[#1D4ED8] font-bold">
                  {(() => {
                    const d = (total - (trace?.runnerUpNrv || 0))/100;
                    return d >= 0 ? `+₹${d.toFixed(2)}` : `−₹${Math.abs(d).toFixed(2)}`;
                  })()}
                </span>
              </div>
            </div>
          ) : <div className="text-[#64748B] italic">Waiting...</div>}
        </NodeCard>

        <Connector isComplete={step > 3} />

        <NodeCard title="04 Check Policy" isActive={step === 4} isComplete={step > 4}>
          {step >= 4 ? (
            <div className="space-y-4">
              <div className="inline-block px-2 py-0.5 rounded-sm bg-[#059669] text-white text-[10px] font-bold uppercase tracking-wider">
                {trace?.policyVerdict}
              </div>
              <div className="text-xs font-mono text-[#64748B]">{trace?.ruleId}</div>
              {trace?.policyVerdict?.includes('APPROVE') && (
                <div className="text-xs font-bold text-[#059669]">token minted ✓</div>
              )}
            </div>
          ) : <div className="text-[#64748B] italic">Waiting...</div>}
        </NodeCard>

        <Connector isComplete={step > 4} />

        <NodeCard title="05 Execute" isActive={step === 5} isComplete={step > 5}>
          {step >= 5 ? (
            <div className="space-y-2">
              <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                <span className="text-[#64748B]">Slots</span>
                <span className="font-mono">{trace?.chosenSchedule?.length || 0}</span>
              </div>
              <div className="text-xs font-mono text-[#0F172A] pt-2 break-all">
                {getLabel('idemp')}: a3f9b2...
              </div>
            </div>
          ) : <div className="text-[#64748B] italic">Waiting...</div>}
        </NodeCard>
      </div>
      )}
    </div>
  );
}
