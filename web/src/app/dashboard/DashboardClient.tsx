/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function DashboardClient({ initialResults, initialSensitivity, initialRules, initialCycles }: any) {
  const [selectedCycleId, setSelectedCycleId] = useState<string>(initialCycles[0]?.id || '');
  const [traceData, setTraceData] = useState<any>(null);
  
  // Strategy data formatting
  const h6 = initialResults['6'] || [];
  
  // Fetch trace dynamically
  React.useEffect(() => {
    if (selectedCycleId) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/cycle/${selectedCycleId}`)
        .then(r => r.json())
        .then(d => setTraceData(d))
        .catch(console.error);
    }
  }, [selectedCycleId]);

  return (
    <div className="space-y-16">
      
      {/* 1. STRATEGY COMPARISON */}
      <section>
        <h2 className="text-xl font-sans mb-6 uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-2">1. Strategy Comparison (Horizon 6)</h2>
        <div className="grid lg:grid-cols-2 gap-10">
          <div className="h-[400px] border border-[#E2E8F0] bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={h6} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E5E5" />
                <XAxis type="number" tickFormatter={(v) => `₹${(v/100000).toFixed(0)}k`} />
                <YAxis dataKey="strategy" type="category" width={100} tick={{ fontSize: 12, fill: '#666' }} />
                <Tooltip formatter={(v: any) => `₹${(v/100).toLocaleString()}`} />
                <Bar dataKey="nrv" fill="#1A1A1A" name="NRV" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="overflow-x-auto border border-[#E2E8F0]">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]">
                <tr>
                  <th className="px-4 py-3 font-normal border-b border-[#E2E8F0]">Strategy</th>
                  <th className="px-4 py-3 font-normal border-b border-[#E2E8F0] text-right">NRV (₹)</th>
                  <th className="px-4 py-3 font-normal border-b border-[#E2E8F0] text-right">Gross (₹)</th>
                  <th className="px-4 py-3 font-normal border-b border-[#E2E8F0] text-right">Att/Cyc</th>
                  <th className="px-4 py-3 font-normal border-b border-[#E2E8F0] text-right">Violations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5] bg-white tabular-data">
                {h6.map((r: any) => (
                  <tr key={r.strategy} className={r.strategy === 'netrun' ? 'bg-[#EFF6FF]' : ''}>
                    <td className="px-4 py-3 font-semibold">{r.strategy}</td>
                    <td className="px-4 py-3 text-right text-[#1D4ED8] font-medium">{(r.nrv / 100).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(r.gross / 100).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{r.att_cyc.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{r.violations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 2. DECISION TRACE */}
      <section>
        <h2 className="text-xl font-sans mb-6 uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-2">2. Decision Trace</h2>
        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm font-semibold uppercase tracking-wide">Select Cycle ID:</label>
          <select 
            value={selectedCycleId} 
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="border border-[#E2E8F0] bg-white px-3 py-2 text-sm tabular-data focus:outline-none"
          >
            {initialCycles.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.diagnosisClass} — {c.alternativesConsidered > 0 ? `${c.alternativesConsidered.toLocaleString()} alternatives` : 'Correctly declined (0 budget spent)'}
              </option>
            ))}
          </select>
        </div>

        {traceData && (
          <div className="border border-[#E2E8F0] bg-white divide-y divide-[#E5E5E5]">
            <div className="p-4 flex gap-8 items-center bg-[#F8FAFC]">
              <div>
                <div className="text-xs text-[#64748B] uppercase">Diagnosis</div>
                <div className="font-semibold">{traceData.diagnosisClass} <span className="text-gray-400 font-normal">({traceData.diagnosisSource})</span></div>
              </div>
              <div>
                <div className="text-xs text-[#64748B] uppercase">Policy Verdict</div>
                <div className="font-semibold"><span className={traceData.policyVerdict.startsWith('BLOCK') ? 'text-red-600' : 'text-green-600'}>{traceData.policyVerdict}</span></div>
              </div>
              <div>
                <div className="text-xs text-[#64748B] uppercase">Rule ID</div>
                <div className="rule-id text-sm">{traceData.ruleId}</div>
              </div>
              <div>
                <div className="text-xs text-[#64748B] uppercase">Alternatives Computed</div>
                <div className="tabular-data">{traceData.alternativesConsidered}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-[1fr_auto_1fr]">
              {/* CHOSEN SCHEDULE */}
              <div className="p-6 border-r border-[#E2E8F0]">
                <h3 className="text-sm font-semibold uppercase mb-4 text-gray-400">Chosen Schedule</h3>
                {traceData.chosenSchedule?.length > 0 ? (
                  <>
                    <ul className="space-y-2 tabular-data text-sm mb-4">
                      {traceData.chosenSchedule.map((slot: any, idx: number) => (
                        <li key={idx} className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                          <span>{slot.date} [{slot.window}]</span>
                          <span className="text-[#64748B]">P(succ) = {slot.pSuccess.toFixed(4)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-sm tabular-data font-semibold">
                      Total NRV: {( (traceData.nrvBreakdown?.gross + traceData.nrvBreakdown?.future - traceData.nrvBreakdown?.interv - traceData.nrvBreakdown?.churn) / 100 ).toFixed(2)}<br/>
                      <span className="text-[#64748B] font-normal">Notifications: {traceData.chosenSchedule.length}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic">No schedule (Policy blocked or Zero budget)</div>
                )}
              </div>
              
              {/* DELTA */}
              <div className="p-8 flex flex-col items-center justify-center border-r border-[#E2E8F0] bg-[#FAFAF8]">
                <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">NRV Delta</div>
                <div className="text-4xl font-sans font-bold text-[#1D4ED8] tabular-data">
                  + {traceData.chosenSchedule?.length > 0 && traceData.runnerUpSchedule?.length > 0 
                      ? (((traceData.nrvBreakdown?.gross + traceData.nrvBreakdown?.future - traceData.nrvBreakdown?.interv - traceData.nrvBreakdown?.churn) - traceData.runnerUpNrv) / 100).toFixed(2)
                      : "0.00"}
                </div>
              </div>

              {/* RUNNER UP */}
              <div className="p-6">
                <h3 className="text-sm font-semibold uppercase mb-4 text-gray-400">Runner-Up Schedule</h3>
                {traceData.runnerUpSchedule?.length > 0 ? (
                  <>
                    <ul className="space-y-2 tabular-data text-sm mb-4">
                      {traceData.runnerUpSchedule.map((slot: any, idx: number) => (
                        <li key={idx} className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1 text-[#64748B]">
                          <span>{slot.date} [{slot.window}]</span>
                          <span>P(succ) = {slot.pSuccess.toFixed(4)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-sm tabular-data text-[#64748B]">
                      Total NRV: {(traceData.runnerUpNrv / 100).toFixed(2)}<br/>
                      Notifications: {traceData.runnerUpSchedule.length}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic">No viable alternative found</div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. SENSITIVITY & RULES */}
      <section>
        <h2 className="text-xl font-sans mb-6 uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-2">3. Sensitivity & Provenance</h2>
        <div className="grid lg:grid-cols-2 gap-10">
          <div>
            <h3 className="text-sm font-semibold uppercase mb-4 text-gray-400">NRV vs Hazard Rate</h3>
            <div className="h-[300px] border border-[#E2E8F0] bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={initialSensitivity} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                  <XAxis dataKey="hazard" tickFormatter={(v) => v.toFixed(3)} type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `₹${(v/100000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(v: any) => `Hazard: ${Number(v).toFixed(3)}`} formatter={(v: any) => `₹${(v/100).toLocaleString()}`} />
                  <Line type="monotone" dataKey="oracle" stroke="#D1D5DB" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netrun" stroke="#E53E3E" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fixed" stroke="#1A1A1A" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="aggressive" stroke="#6B7280" strokeWidth={2} dot={false} />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold uppercase mb-4 text-gray-400">Platform Constraints (16 Rules)</h3>
            <div className="border border-[#E2E8F0] h-[300px] overflow-y-auto bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#F8FAFC] sticky top-0 text-xs uppercase text-[#64748B]">
                  <tr>
                    <th className="px-4 py-2 font-normal border-b border-[#E2E8F0]">Rule ID</th>
                    <th className="px-4 py-2 font-normal border-b border-[#E2E8F0]">Value</th>
                    <th className="px-4 py-2 font-normal border-b border-[#E2E8F0]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] tabular-data">
                  {initialRules.map((rule: any) => (
                    <tr key={rule.rule_id}>
                      <td className="px-4 py-2 text-gray-600 truncate max-w-[150px]" title={rule.rule_id}>
                        <div className="font-semibold text-xs">{rule.rule_id}</div>
                        {rule.type === 'ASSUMPTION' && rule.sweep && (
                          <div className="text-[10px] text-gray-400 mt-1 font-sans">
                            Sweep: {JSON.stringify(rule.sweep)}
                          </div>
                        )}
                        {rule.verification_status === 'VERIFIED' && rule.source && (
                          <div className="text-[10px] mt-1 font-sans">
                            <a href={rule.source} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Source</a>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 truncate max-w-[150px]" title={JSON.stringify(rule.value)}>{JSON.stringify(rule.value)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                          rule.verification_status === 'VERIFIED' ? 'bg-green-100 text-green-800' :
                          'bg-[#FEF3C7] text-[#B45309]' /* warning color for ASSUMPTION/COULD_NOT_VERIFY */
                        }`}>
                          {rule.verification_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      
    </div>
  );
}
