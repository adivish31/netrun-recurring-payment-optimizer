/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React, { useState } from 'react';

export default function ConstraintsTab({ 
  rules, showDetail, onToggleDetail 
}: { 
  rules: any[]; showDetail: boolean; onToggleDetail: () => void;
}) {
  const [filter, setFilter] = useState<'All' | 'VERIFIED' | 'COULD_NOT_VERIFY' | 'ASSUMPTION'>('All');

  const filteredRules = rules.filter(r => {
    if (filter === 'All') return true;
    if (filter === 'ASSUMPTION') return r.type === 'ASSUMPTION';
    return r.verification_status === filter;
  });

  const verifiedCount = rules.filter(r => r.verification_status === 'VERIFIED').length;
  const unverifiedCount = rules.filter(r => r.verification_status === 'COULD_NOT_VERIFY').length;
  const assumptionsCount = rules.filter(r => r.type === 'ASSUMPTION').length;
  const leadSentence = `${rules.length} limits govern this system. ${verifiedCount} are verified against dated NPCI sources, ${unverifiedCount} could not be verified, and ${assumptionsCount} are stated assumptions swept across their full range.`;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* PROGRESSIVE DISCLOSURE LEAD */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-6 shrink-0">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {leadSentence}
          </p>
          <div className="text-[#059669] font-bold mt-2">
            {rules.length} total constraints · {verifiedCount} verified
          </div>
        </div>
        <button 
          onClick={onToggleDetail}
          className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center transition-colors px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC]"
        >
          {showDetail ? 'Hide detail ▾' : 'Show detail ▸'}
        </button>
      </div>

      {showDetail && (
      <>
      <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-4 shrink-0">
        <h2 className="text-xl font-sans font-bold">Platform Constraints & Assumptions</h2>
        
        <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden">
          {['All', 'VERIFIED', 'COULD_NOT_VERIFY', 'ASSUMPTION'].map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1 text-sm font-semibold transition-colors ${filter === f ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'}`}
            >
              {f === 'COULD_NOT_VERIFY' ? 'Could not verify' : f === 'VERIFIED' ? 'Verified' : f === 'ASSUMPTION' ? 'Assumptions' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#E2E8F0] bg-white flex-1 overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#F8FAFC] sticky top-0 text-xs uppercase text-[#64748B] z-10 shadow-sm border-b border-[#E2E8F0]">
            <tr>
              <th className="px-6 py-4 font-normal border-r border-[#E2E8F0]">Rule ID</th>
              <th className="px-6 py-4 font-normal border-r border-[#E2E8F0]">Value</th>
              <th className="px-6 py-4 font-normal">Status & Provenance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filteredRules.map(r => (
              <tr key={r.rule_id} className="hover:bg-[#F8FAFC]">
                <td className="px-6 py-4 border-r border-[#E2E8F0]">
                  <div className="font-mono text-[#0F172A]">{r.rule_id}</div>
                  <div className="text-xs text-[#64748B] uppercase tracking-wider mt-1">{r.type}</div>
                </td>
                <td className="px-6 py-4 border-r border-[#E2E8F0] font-mono whitespace-pre-wrap text-xs text-[#1D4ED8]">
                  {JSON.stringify(r.value, null, 2)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    {r.verification_status === 'VERIFIED' && (
                      <span className="inline-block px-2 py-0.5 rounded-sm bg-[#059669] text-white text-[10px] font-bold uppercase tracking-wider">
                        VERIFIED
                      </span>
                    )}
                    {r.verification_status === 'COULD_NOT_VERIFY' && (
                      <span className="inline-block px-2 py-0.5 rounded-sm bg-[#B45309] text-white text-[10px] font-bold uppercase tracking-wider">
                        COULD_NOT_VERIFY
                      </span>
                    )}
                    {r.type === 'ASSUMPTION' && (
                      <span className="inline-block px-2 py-0.5 rounded-sm bg-[#E2E8F0] text-[#0F172A] text-[10px] font-bold uppercase tracking-wider border border-[#CBD5E1]">
                        ASSUMPTION
                      </span>
                    )}
                  </div>
                  {r.source ? (
                    <a href={r.source} target="_blank" rel="noreferrer" className="text-sm text-[#1D4ED8] hover:underline block truncate max-w-sm">
                      {r.source}
                    </a>
                  ) : r.sweep ? (
                    <div className="text-sm text-[#64748B]">
                      Sweep Range: <span className="font-mono">[{r.sweep[0]}, {r.sweep[1]}]</span>
                    </div>
                  ) : (
                    <div className="text-sm text-[#64748B] italic">No provenance data.</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}
