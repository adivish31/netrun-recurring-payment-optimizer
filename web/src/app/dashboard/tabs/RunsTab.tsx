/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  HIDE_DETAIL,
  NRV_FIRST_USE,
  ORACLE_KEY,
  RUNS_COLUMN_LABELS,
  RUNS_LEAD,
  SHOW_DETAIL,
  STRATEGY_LABELS,
  formatCount,
  formatPercent,
  formatRupees,
  isNetrunStrategy,
} from '../../../lib/labels';

const HORIZONS = ['3', '6', '12'] as const;

/** Per-bar colour without the deprecated <Cell>. NetRun rows are highlighted. */
function StrategyBar(props: any) {
  const { x, y, width, height, payload } = props;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={isNetrunStrategy(payload?.strategy || '') ? '#1D4ED8' : '#94A3B8'}
    />
  );
}

export default function RunsTab({
  results,
  attemptCostPaise,
  showDetail,
  onToggleDetail,
}: {
  results: any;
  attemptCostPaise: number;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>('6');
  const rows: any[] = results?.[horizon] || [];

  /**
   * The cycle count is recovered from the evaluation itself. The intervention
   * cost is attempts x cost-per-attempt, and attempts is att_cyc x cycles, so
   * interv / att_cyc / cost gives the number of cycles. The cost comes from
   * the rulebook, so nothing here is guessed or written in by hand.
   */
  const cycleCount = useMemo(() => {
    if (!attemptCostPaise) return null;
    const row = rows.find((r) => r.att_cyc > 0 && r.interv > 0);
    if (!row) return null;
    const n = row.interv / row.att_cyc / attemptCostPaise;
    return Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
  }, [rows, attemptCostPaise]);

  const real = useMemo(() => rows.filter((r) => r.strategy !== ORACLE_KEY), [rows]);
  const best = useMemo(
    () => (real.length ? real.reduce((a, b) => (b.nrv > a.nrv ? b : a)) : null),
    [real]
  );
  const bestBaseline = useMemo(() => {
    const baselines = real.filter((r) => !isNetrunStrategy(r.strategy));
    return baselines.length ? baselines.reduce((a, b) => (b.nrv > a.nrv ? b : a)) : null;
  }, [real]);

  const attemptRatio =
    best && bestBaseline && bestBaseline.att_cyc > 0 ? best.att_cyc / bestBaseline.att_cyc : null;

  if (!rows.length) {
    return <div className="text-sm text-[#64748B]">No evaluation results available.</div>;
  }

  const chartData = real.map((r) => ({
    label: STRATEGY_LABELS[r.strategy] || r.strategy,
    strategy: r.strategy,
    nrv: r.nrv,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">
            {RUNS_LEAD(cycleCount === null ? 'the simulated' : formatCount(cycleCount))}
          </p>
          {best && (
            <div className="text-[#059669] font-bold mt-3 text-lg tabular-nums">
              {formatRupees(best.nrv, 0)} {NRV_FIRST_USE}
              {attemptRatio !== null && (
                <span className="font-normal text-[#475569]">
                  {' '}
                  · {formatPercent(attemptRatio * 100, 0)} of the attempts the best baseline made
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? HIDE_DETAIL : SHOW_DETAIL}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
          Months of future value counted
        </span>
        <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1 text-sm font-mono transition-colors ${
                horizon === h ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#E2E8F0] bg-white p-6">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
              <XAxis
                type="number"
                tickFormatter={(v) => formatRupees(v, 0)}
                tick={{ fontSize: 11, fill: '#64748B' }}
              />
              <YAxis
                dataKey="label"
                type="category"
                width={200}
                tick={{ fontSize: 11, fill: '#0F172A' }}
              />
              <Tooltip
                formatter={(v: any) => formatRupees(v, 0)}
                cursor={{ fill: '#F8FAFC' }}
              />
              {/* NetRun rows are highlighted. `shape` replaces the deprecated Cell. */}
              <Bar dataKey="nrv" name="Net recurring value" shape={StrategyBar} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {showDetail && (
        <div className="border border-[#E2E8F0] bg-white overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B] border-b border-[#E2E8F0]">
              <tr>
                {RUNS_COLUMN_LABELS.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 font-normal ${
                      c.key === 'strategy' ? 'border-r border-[#E2E8F0]' : 'text-right'
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.map((r) => {
                const mine = isNetrunStrategy(r.strategy);
                const isOracle = r.strategy === ORACLE_KEY;
                return (
                  <tr
                    key={r.strategy}
                    className={`hover:bg-[#F8FAFC] ${mine ? 'bg-[#EFF6FF]' : ''} ${
                      isOracle ? 'text-[#64748B] italic' : ''
                    }`}
                  >
                    <td
                      className={`px-4 py-3 border-r border-[#E2E8F0] ${
                        mine ? 'font-bold text-[#1D4ED8]' : ''
                      }`}
                    >
                      {STRATEGY_LABELS[r.strategy] || r.strategy}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums ${
                        mine ? 'font-bold text-[#1D4ED8]' : 'font-semibold'
                      }`}
                    >
                      {formatRupees(r.nrv, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatRupees(r.gross, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatRupees(r.future, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatRupees(r.interv, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#B45309]">
                      {formatRupees(r.churn, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.att_cyc.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.pdn_cyc.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{r.violations}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
