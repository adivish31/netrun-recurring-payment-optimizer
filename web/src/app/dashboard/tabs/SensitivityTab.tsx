/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  HIDE_DETAIL,
  ORACLE_KEY,
  SENSITIVITY_LABELS,
  SENSITIVITY_LEAD,
  SENSITIVITY_LEAD_QUALIFIED,
  SHOW_DETAIL,
  STRATEGY_LABELS,
  formatPercent,
  formatRupees,
  formatSignedPercent,
  formatSignedRupees,
  isNetrunStrategy,
} from '../../../lib/labels';

/** The baselines a real strategy has to beat. Derived, not hardcoded per point. */
const isBaseline = (strategy: string) =>
  strategy !== ORACLE_KEY && !isNetrunStrategy(strategy);

export default function SensitivityTab({
  grid,
  hazardBase,
  showDetail,
  onToggleDetail,
}: {
  grid: any[];
  hazardBase: number;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const [horizon, setHorizon] = useState<'3' | '6' | '12'>('6');
  const [hazard, setHazard] = useState<number>(hazardBase);

  const chartData = useMemo(
    () =>
      grid.map((g) => {
        const point: any = { hazard: g.hazard };
        for (const s of g.horizons[horizon] || []) point[s.strategy] = s.nrv;
        return point;
      }),
    [grid, horizon]
  );

  const selectedPoint = useMemo(() => {
    if (!grid.length) return null;
    return grid.reduce((prev, curr) =>
      Math.abs(curr.hazard - hazard) < Math.abs(prev.hazard - hazard) ? curr : prev
    );
  }, [grid, hazard]);

  const rows: any[] = selectedPoint?.horizons[horizon] || [];

  /** The oracle is the ceiling, not a competitor. It never enters the ranking. */
  const ranking = useMemo(
    () => rows.filter((r) => r.strategy !== ORACLE_KEY).slice().sort((a, b) => b.nrv - a.nrv),
    [rows]
  );

  const oracleNrv = rows.find((r) => r.strategy === ORACLE_KEY)?.nrv ?? null;

  /** Does the top real strategy beat every baseline at EVERY swept value? */
  const robustness = useMemo(() => {
    let failures = 0;
    let minImprovement = Infinity;
    let leader: string | null = null;

    for (const g of grid) {
      const pts: any[] = g.horizons[horizon] || [];
      const real = pts.filter((r) => r.strategy !== ORACLE_KEY);
      if (!real.length) continue;
      const best = real.reduce((a, b) => (b.nrv > a.nrv ? b : a));
      const baselines = pts.filter((r) => isBaseline(r.strategy));
      if (!baselines.length) continue;
      const bestBaseline = baselines.reduce((a, b) => (b.nrv > a.nrv ? b : a));
      if (best.nrv <= bestBaseline.nrv) failures++;
      const improvement = ((best.nrv - bestBaseline.nrv) / bestBaseline.nrv) * 100;
      if (improvement < minImprovement) minImprovement = improvement;
      leader = leader === null || leader === best.strategy ? best.strategy : leader;
    }

    return { failures, minImprovement, leader, points: grid.length };
  }, [grid, horizon]);

  /** Where a NetRun ablation is beaten by a baseline — published, not hidden. */
  const ablationLosses = useMemo(() => {
    const losses: { strategy: string; hazard: number; gapPaise: number }[] = [];
    for (const g of grid) {
      const pts: any[] = g.horizons[horizon] || [];
      const baselines = pts.filter((r) => isBaseline(r.strategy));
      if (!baselines.length) continue;
      const bestBaseline = baselines.reduce((a, b) => (b.nrv > a.nrv ? b : a));
      for (const r of pts.filter((x) => isNetrunStrategy(x.strategy))) {
        if (r.nrv <= bestBaseline.nrv) {
          losses.push({
            strategy: r.strategy,
            hazard: g.hazard,
            gapPaise: r.nrv - bestBaseline.nrv,
          });
        }
      }
    }
    return losses;
  }, [grid, horizon]);

  const lead =
    robustness.failures === 0
      ? SENSITIVITY_LEAD
      : SENSITIVITY_LEAD_QUALIFIED(robustness.failures);

  const netrunAtPoint = ranking[0];
  const retainedPct =
    oracleNrv && netrunAtPoint ? (netrunAtPoint.nrv / oracleNrv) * 100 : null;

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">{lead}</p>
          <div className="text-[#059669] font-bold mt-3 text-lg tabular-nums">
            {Number.isFinite(robustness.minImprovement)
              ? `${formatSignedPercent(robustness.minImprovement)} at its narrowest, over the best baseline`
              : 'no comparable points'}
          </div>
        </div>
        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? HIDE_DETAIL : SHOW_DETAIL}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            {SENSITIVITY_LABELS.horizonLabel}
          </span>
          <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-sm overflow-hidden">
            {(['3', '6', '12'] as const).map((h) => (
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
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        {/* CHART */}
        <div className="border border-[#E2E8F0] bg-white p-6 flex flex-col">
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 24, right: 16, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="hazard"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => formatPercent(v * 100, 1)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  label={{
                    value: SENSITIVITY_LABELS.axisX,
                    position: 'insideBottom',
                    offset: -14,
                    style: { fontSize: 12, fill: '#475569' },
                  }}
                />
                <YAxis
                  tickFormatter={(v) => formatRupees(v, 0)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  width={90}
                />
                <Tooltip
                  formatter={(v: any, name: any) => [
                    formatRupees(v, 0),
                    STRATEGY_LABELS[name] || name,
                  ]}
                  labelFormatter={(l) =>
                    `${SENSITIVITY_LABELS.axisX}: ${formatPercent(Number(l) * 100, 1)}`
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(name: any) =>
                    name === ORACLE_KEY
                      ? SENSITIVITY_LABELS.oracleReference
                      : STRATEGY_LABELS[name] || name
                  }
                />
                <ReferenceLine
                  x={selectedPoint?.hazard}
                  stroke="#0F172A"
                  strokeDasharray="2 2"
                />

                {/* The ceiling: dashed, labelled, and never ranked. */}
                <Line
                  type="monotone"
                  dataKey={ORACLE_KEY}
                  stroke="#0F172A"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="netrun_promise"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                  dot={false}
                />
                <Line type="monotone" dataKey="netrun" stroke="#7C3AED" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fixed" stroke="#64748B" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="rules_only"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="aggressive"
                  stroke="#B45309"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="hazard" className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                {SENSITIVITY_LABELS.axisX}
              </label>
              <span className="font-mono text-sm font-bold text-[#1D4ED8] tabular-nums">
                {formatPercent(hazard * 100, 1)}
              </span>
            </div>
            <input
              id="hazard"
              type="range"
              min={grid.length ? grid[0].hazard : 0}
              max={grid.length ? grid[grid.length - 1].hazard : 0}
              step={grid.length > 1 ? grid[1].hazard - grid[0].hazard : 0.005}
              value={hazard}
              onChange={(e) => setHazard(parseFloat(e.target.value))}
              className="w-full accent-[#1D4ED8]"
            />
          </div>
        </div>

        {/* RANKING — real strategies only */}
        <div className="border border-[#E2E8F0] bg-white flex flex-col">
          <div className="p-6 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-2">
              {SENSITIVITY_LABELS.rankingHeading}
            </h3>
            {retainedPct !== null && (
              <p className="text-sm text-[#64748B]">
                At {formatPercent(hazard * 100, 1)}, the best real strategy reaches{' '}
                <span className="font-mono font-bold text-[#1D4ED8]">
                  {formatPercent(retainedPct)}
                </span>{' '}
                of the theoretical ceiling.
              </p>
            )}
          </div>

          <div className="p-6 space-y-3">
            {ranking.map((row, i) => {
              const mine = isNetrunStrategy(row.strategy);
              const gap = netrunAtPoint ? row.nrv - netrunAtPoint.nrv : 0;
              return (
                <div
                  key={row.strategy}
                  className={`p-3 border rounded-sm flex items-start justify-between gap-3 ${
                    mine ? 'border-[#1D4ED8] bg-[#EFF6FF]' : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-semibold ${mine ? 'text-[#1D4ED8]' : 'text-[#0F172A]'}`}
                    >
                      {STRATEGY_LABELS[row.strategy] || row.strategy}
                    </div>
                    <div className="text-xs text-[#64748B] mt-0.5">Rank {i + 1}</div>
                    {showDetail && (
                      <div className="font-mono text-[10px] text-[#94A3B8] mt-0.5">
                        {row.strategy}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono font-bold tabular-nums ${
                        mine ? 'text-[#1D4ED8]' : 'text-[#0F172A]'
                      }`}
                    >
                      {formatRupees(row.nrv, 0)}
                    </div>
                    {i > 0 && (
                      <div className="text-xs text-[#64748B] font-mono tabular-nums mt-0.5">
                        {formatSignedRupees(gap, 0)} vs rank 1
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-6">
            <p className="text-xs text-[#64748B] leading-relaxed">
              {SENSITIVITY_LABELS.oracleExcludedNote}
            </p>
            {oracleNrv !== null && showDetail && (
              <div className="mt-3 flex items-center justify-between text-sm border-t border-dashed border-[#E2E8F0] pt-3">
                <span className="text-[#64748B]">{SENSITIVITY_LABELS.oracleReference}</span>
                <span className="font-mono tabular-nums">{formatRupees(oracleNrv, 0)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The break-even the rulebook demanded be published. */}
      {showDetail && ablationLosses.length > 0 && (
        <div className="border border-[#E2E8F0] bg-white p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B45309] mb-3">
            Where a NetRun variant is beaten by a baseline
          </h3>
          <ul className="text-sm space-y-2">
            {ablationLosses.map((l) => (
              <li key={`${l.strategy}-${l.hazard}`} className="flex justify-between gap-4">
                <span>
                  {STRATEGY_LABELS[l.strategy] || l.strategy}, at a cancellation chance of{' '}
                  {formatPercent(l.hazard * 100, 1)}
                </span>
                <span className="font-mono tabular-nums text-[#B45309]">
                  {formatSignedRupees(l.gapPaise, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
