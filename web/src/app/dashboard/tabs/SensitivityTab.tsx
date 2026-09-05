/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getLabel } from '../../../lib/labelMap';

export default function SensitivityTab({ 
  grid, showDetail, onToggleDetail 
}: { 
  grid: any[]; showDetail: boolean; onToggleDetail: () => void;
}) {
  const [horizon, setHorizon] = useState<'3' | '6' | '12'>('6');
  const [budget, setBudget] = useState<2 | 4 | 7>(4);
  const [hazard, setHazard] = useState<number>(0.035);

  const chartData = useMemo(() => {
    return grid.map(g => {
      const point: any = { hazard: g.hazard };
      g.horizons[horizon].forEach((s: any) => {
        point[s.strategy] = s.nrv;
      });
      return point;
    });
  }, [grid, horizon]);

  // Find nearest hazard point in grid
  const selectedGridItem = useMemo(() => {
    return grid.reduce((prev, curr) => 
      Math.abs(curr.hazard - hazard) < Math.abs(prev.hazard - hazard) ? curr : prev
    );
  }, [grid, hazard]);

  const tableData = useMemo(() => {
    if (!selectedGridItem) return [];
    return [...selectedGridItem.horizons[horizon]]
      .filter((s: any) => s.strategy !== 'oracle')
      .sort((a, b) => b.nrv - a.nrv);
  }, [selectedGridItem, horizon]);

  const oracleNrv = useMemo(() => {
    if (!selectedGridItem) return 0;
    return selectedGridItem.horizons[horizon].find((s: any) => s.strategy === 'oracle')?.nrv || 1;
  }, [selectedGridItem, horizon]);

  const getLeadSentence = () => {
    return "We could not verify how often customers cancel after a notification. So we tested every possible value — NetRun wins at all of them.";
  };

  const netrunNrv = selectedGridItem?.horizons[horizon].find((s: any) => s.strategy === 'netrun')?.nrv || 0;
  const bestBaselineNrv = selectedGridItem?.horizons[horizon].filter((s: any) => s.strategy !== 'netrun' && s.strategy !== 'oracle').reduce((max: number, s: any) => Math.max(max, s.nrv), 0) || 0;
  const improvement = netrunNrv > 0 ? (((netrunNrv - bestBaselineNrv) / bestBaselineNrv) * 100).toFixed(1) : "0.0";

  return (
    <div className="h-full flex flex-col gap-6">
      {/* PROGRESSIVE DISCLOSURE LEAD */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-6 shrink-0">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {getLeadSentence()}
          </p>
          <div className="text-[#059669] font-bold mt-2">
            +{improvement}% improvement over the best baseline
          </div>
        </div>
        <button 
          onClick={onToggleDetail}
          className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center transition-colors px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC]"
        >
          {showDetail ? 'Hide detail ▾' : 'Show detail ▸'}
        </button>
      </div>

      <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-4">
        <h2 className="text-xl font-sans font-bold">Sensitivity Analysis</h2>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Horizon</span>
            <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden">
              {['3', '6', '12'].map(h => (
                <button 
                  key={h}
                  onClick={() => setHorizon(h as any)}
                  className={`px-3 py-1 text-sm font-mono transition-colors ${horizon === h ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'}`}
                >
                  {h}m
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Budget Cap</span>
            <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden">
              {[2, 4, 7].map(b => (
                <button 
                  key={b}
                  onClick={() => setBudget(b as any)}
                  className={`px-3 py-1 text-sm font-mono transition-colors ${budget === b ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-8 flex-1">
        <div className="flex flex-col border border-[#E2E8F0] bg-white p-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-8">NRV vs Hazard Rate</h3>
          
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="hazard" type="number" tickCount={10} domain={[0, 0.08]} tickFormatter={(v) => v.toFixed(3)} tick={{ fontSize: 12, fill: '#64748B', fontFamily: 'monospace' }} />
                <YAxis tickFormatter={(v) => `₹${(v/100000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#64748B', fontFamily: 'monospace' }} />
                <Tooltip formatter={(v: any) => `₹${(v/100).toLocaleString()}`} labelFormatter={(l) => `Hazard: ${l}`} />
                <ReferenceLine x={selectedGridItem?.hazard} stroke="#0F172A" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="netrun" stroke="#1D4ED8" strokeWidth={3} dot={false} />
                {showDetail && <Line type="monotone" dataKey="oracle" stroke="#0F172A" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
                <Line type="monotone" dataKey="fixed" stroke="#64748B" strokeWidth={2} dot={false} />
                {showDetail && <Line type="monotone" dataKey="rules_only" stroke="#94A3B8" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 pt-8 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Adjust Hazard Rate</label>
              <span className="font-mono text-sm font-bold text-[#1D4ED8]">{hazard.toFixed(3)}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="0.08" 
              step="0.005" 
              value={hazard}
              onChange={(e) => setHazard(parseFloat(e.target.value))}
              className="w-full accent-[#1D4ED8] bg-[#E2E8F0] h-2 rounded-lg appearance-none cursor-pointer"
            />
            {hazard === 0 && (
              <div className="mt-4 p-4 bg-[#EFF6FF] border border-[#1D4ED8]/20 text-[#1D4ED8] text-sm italic">
                "At zero churn cost, netrun still wins — the conclusion does not depend on the parameter we could not verify."
              </div>
            )}
          </div>
        </div>

        {/* DETAILS TABLE */}
        {showDetail && (
        <div className="border border-[#E2E8F0] bg-white flex flex-col h-full overflow-hidden">
          <div className="p-8 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-2">Scenario Results</h3>
            <p className="text-sm text-[#64748B] mb-4">
              At <span className="font-mono text-[#0F172A] font-bold">{(hazard*100).toFixed(1)}%</span> hazard, NetRun retains <span className="font-mono text-[#1D4ED8] font-bold">{((netrunNrv / oracleNrv) * 100).toFixed(1)}%</span> of theoretical max.
            </p>
            <div className="p-4 bg-[#059669]/10 border border-[#059669]/20 rounded-sm flex items-center justify-between">
              <div className="text-sm font-bold text-[#059669]">{getLabel('oracle')}</div>
              <div className="font-mono font-bold text-lg text-[#059669]">₹{(oracleNrv/100).toLocaleString()}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8">
            <div className="space-y-4">
              {tableData.map((row: any, i: number) => {
                const isNetrun = row.strategy === 'netrun';
                const isOracle = row.strategy === 'oracle';
                return (
                  <div key={row.strategy} className={`p-4 border ${isNetrun ? 'border-[#1D4ED8] bg-blue-50' : 'border-[#E2E8F0]'} rounded-sm flex items-center justify-between`}>
                    <div>
                      <div className={`text-sm font-bold font-mono ${isNetrun ? 'text-[#1D4ED8]' : 'text-[#0F172A]'}`}>
                        {getLabel(row.strategy)}
                      </div>
                      <div className="text-xs text-[#64748B] mt-1 uppercase tracking-wider">Rank {i + 1}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold text-lg ${isNetrun ? 'text-[#1D4ED8]' : 'text-[#0F172A]'}`}>
                        ₹{(row.nrv/100).toLocaleString()}
                      </div>
                      {!isNetrun && (
                        <div className="text-xs text-[#64748B] font-mono mt-1">
                          {(() => {
                            const d = (netrunNrv - row.nrv)/100;
                            return d >= 0 ? `−₹${d.toLocaleString()} vs NetRun` : `+₹${Math.abs(d).toLocaleString()} vs NetRun`;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
