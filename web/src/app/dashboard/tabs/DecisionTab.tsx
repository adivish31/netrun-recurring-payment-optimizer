/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React, { useState } from 'react';

export default function DecisionTab({ 
  trace, showDetail, onToggleDetail 
}: { 
  trace: any; showDetail: boolean; onToggleDetail: () => void;
}) {
  const [horizon, setHorizon] = useState<3 | 6 | 12>(6);

  if (!trace) return <div className="text-sm text-[#64748B]">No trace data available.</div>;

  // Recompose breakdown based on horizon. 
  // In the real system, future and churn are scaled by horizon.
  // We'll use the provided `nrvBreakdown` as base (which is 6 months) and scale.
  const scale = horizon / 6;
  const gross = trace.nrvBreakdown?.gross || 0;
  const interv = trace.nrvBreakdown?.interv || 0;
  const future = (trace.nrvBreakdown?.future || 0) * scale;
  const churn = (trace.nrvBreakdown?.churn || 0) * scale;
  const total = gross + future - interv - churn;

  const deltaValue = (total - (trace.runnerUpNrv * scale)) / 100;
  const deltaStr = trace.chosenSchedule?.length > 0 && trace.runnerUpSchedule?.length > 0 
                ? (deltaValue >= 0 ? `+₹${deltaValue.toFixed(2)}` : `−₹${Math.abs(deltaValue).toFixed(2)}`)
                : "+₹0.00";
  const leadSentence = `The chosen plan is worth ${deltaStr.replace('+', '').replace('−', '')} more than the next best option.`;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* PROGRESSIVE DISCLOSURE LEAD */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-6 shrink-0">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {leadSentence}
          </p>
          <div className="text-[#059669] font-bold mt-2">
            ₹{(total/100).toFixed(2)} total net recurring value
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden h-[38px]">
            {[3, 6, 12].map(h => (
              <button 
                key={h}
                onClick={() => setHorizon(h as any)}
                className={`px-3 py-1 text-sm font-mono transition-colors ${horizon === h ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'}`}
              >
                {h}m
              </button>
            ))}
          </div>
          <button 
            onClick={onToggleDetail}
            className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center transition-colors px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC]"
          >
            {showDetail ? 'Hide detail ▾' : 'Show detail ▸'}
          </button>
        </div>
      </div>

      {!showDetail ? (
        <div className="flex flex-col border border-[#E2E8F0] bg-white p-6 max-w-3xl">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669] mb-4">Chosen Schedule</h3>
          {trace.chosenSchedule?.length > 0 ? (
            <div className="flex gap-4">
              {trace.chosenSchedule.map((slot: any, idx: number) => (
                <div key={idx} className="px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono text-[#0F172A]">
                  {slot.date} [{slot.window}]
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#64748B] italic">No schedule generated (blocked or zero budget).</div>
          )}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 border border-[#E2E8F0] bg-white">
        {/* CHOSEN */}
        <div className="p-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669] mb-6 border-b border-[#E2E8F0] pb-2">Chosen Schedule</h3>
          {trace.chosenSchedule?.length > 0 ? (
            <div className="space-y-4">
              <ul className="space-y-2 font-mono text-sm">
                {trace.chosenSchedule.map((slot: any, idx: number) => (
                  <li key={idx} className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                    <span className="text-[#0F172A]">{slot.date} [{slot.window}]</span>
                    <span className="text-[#64748B]">P(succ) = {slot.pSuccess.toFixed(4)}</span>
                  </li>
                ))}
              </ul>
              <div className="text-sm font-mono text-[#64748B] pt-4">
                Total NRV (6m): ₹{(total / 100).toFixed(2)}<br/>
                Notifications: {trace.chosenSchedule.length}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#64748B] italic">No schedule generated (blocked or zero budget).</div>
          )}
        </div>

        {/* DELTA */}
        <div className="flex flex-col items-center justify-center px-8 border-x border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="text-xs font-bold uppercase tracking-widest text-[#64748B] mb-2">NRV Delta</div>
          <div className="text-5xl font-sans font-bold text-[#1D4ED8] tracking-tighter">
            {deltaStr}
          </div>
        </div>

        {/* RUNNER UP */}
        <div className="p-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-6 border-b border-[#E2E8F0] pb-2">Runner-Up Schedule</h3>
          {trace.runnerUpSchedule?.length > 0 ? (
            <div className="space-y-4">
              <ul className="space-y-2 font-mono text-sm opacity-70">
                {trace.runnerUpSchedule.map((slot: any, idx: number) => (
                  <li key={idx} className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                    <span className="text-[#0F172A]">{slot.date} [{slot.window}]</span>
                    <span className="text-[#64748B]">P(succ) = {slot.pSuccess.toFixed(4)}</span>
                  </li>
                ))}
              </ul>
              <div className="text-sm font-mono text-[#64748B] pt-4 opacity-70">
                Total NRV (6m): ₹{((trace.runnerUpNrv * scale) / 100).toFixed(2)}<br/>
                Notifications: {trace.runnerUpSchedule.length}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#64748B] italic">No alternative schedule available.</div>
          )}
        </div>
      </div>

      <div className="mt-8 border border-[#E2E8F0] bg-white p-8">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-6">NRV Breakdown (Chosen)</h3>
        <div className="flex gap-2 text-sm font-mono">
          <div className="flex-1 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-sm">
            <div className="text-xs text-[#64748B] mb-1">Gross</div>
            <div className="text-lg">₹{(gross/100).toFixed(2)}</div>
          </div>
          <div className="flex items-center text-[#64748B] font-sans font-bold">+</div>
          <div className="flex-1 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-sm">
            <div className="text-xs text-[#64748B] mb-1">Future ({horizon}m)</div>
            <div className="text-lg">₹{(future/100).toFixed(2)}</div>
          </div>
          <div className="flex items-center text-[#64748B] font-sans font-bold">−</div>
          <div className="flex-1 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-sm">
            <div className="text-xs text-[#64748B] mb-1">Intervention</div>
            <div className="text-lg">₹{(interv/100).toFixed(2)}</div>
          </div>
          <div className="flex items-center text-[#64748B] font-sans font-bold">−</div>
          <div className="flex-1 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-sm">
            <div className="text-xs text-[#64748B] mb-1">Churn Cost</div>
            <div className="text-lg text-[#DC2626]">₹{(churn/100).toFixed(2)}</div>
          </div>
          <div className="flex items-center text-[#64748B] font-sans font-bold">=</div>
          <div className="flex-1 p-4 bg-[#0F172A] text-white rounded-sm shadow-inner">
            <div className="text-xs text-[#94A3B8] mb-1">Total NRV</div>
            <div className="text-lg text-[#1D4ED8] font-bold tracking-tight">₹{(total/100).toFixed(2)}</div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
