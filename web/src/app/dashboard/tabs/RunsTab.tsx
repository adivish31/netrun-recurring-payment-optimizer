/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import React from 'react';
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, ResponsiveContainer } from 'recharts';

export default function RunsTab({ results }: { results: any }) {
  // Use Horizon 6 by default for the runs tab
  const h6 = results['6'] || [];

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-sans font-bold mb-8">Simulation Runs (Horizon 6)</h2>
      
      <div className="grid lg:grid-cols-[1fr_2fr] gap-8 flex-1">
        <div className="border border-[#E2E8F0] bg-white p-6 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-6">Net Recovery Value Comparison</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={h6} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" tickFormatter={(v) => `₹${(v/100000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#64748B', fontFamily: 'monospace' }} />
                <YAxis dataKey="strategy" type="category" width={100} tick={{ fontSize: 12, fill: '#0F172A', fontFamily: 'monospace' }} />
                <Tooltip formatter={(v: any) => `₹${(v/100).toLocaleString()}`} cursor={{ fill: '#F8FAFC' }} />
                <Bar dataKey="nrv" fill="#0F172A" name="NRV" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[#E2E8F0] bg-white overflow-x-auto flex flex-col">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B] border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-4 font-normal border-r border-[#E2E8F0]">Strategy</th>
                <th className="px-4 py-4 font-normal border-r border-[#E2E8F0] text-right">NRV (₹)</th>
                <th className="px-4 py-4 font-normal text-right">Gross</th>
                <th className="px-4 py-4 font-normal text-right">Future</th>
                <th className="px-4 py-4 font-normal text-right">Interv</th>
                <th className="px-4 py-4 font-normal border-r border-[#E2E8F0] text-right">Churn</th>
                <th className="px-4 py-4 font-normal text-right">Att/Cyc</th>
                <th className="px-4 py-4 font-normal text-right">PDN/Cyc</th>
                <th className="px-4 py-4 font-normal text-right">Violations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-mono">
              {h6.map((r: any) => {
                const isNetRun = r.strategy.includes('netrun');
                return (
                  <tr key={r.strategy} className={`hover:bg-[#F8FAFC] ${isNetRun ? 'bg-[#EFF6FF]' : ''}`}>
                    <td className={`px-4 py-3 border-r border-[#E2E8F0] ${isNetRun ? 'font-bold text-[#1D4ED8]' : ''}`}>
                      {r.strategy}
                    </td>
                    <td className={`px-4 py-3 text-right border-r border-[#E2E8F0] ${isNetRun ? 'font-bold text-[#1D4ED8]' : 'font-semibold'}`}>
                      {(r.nrv / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right">{(r.gross / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{(r.future / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{(r.interv / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right border-r border-[#E2E8F0] text-[#DC2626]">{(r.churn / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{r.att_cyc.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{r.pdn_cyc.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{r.violations}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
