/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useMemo } from 'react';

import {
  DECISION_LEADS,
  HIDE_DETAIL,
  METRIC_LABELS,
  NRV_EQUATION_LABELS,
  NRV_FIRST_USE,
  SHOW_DETAIL,
  WINDOW_LABELS,
  formatCount,
  formatDate,
  formatPercent,
  formatRupees,
  formatSignedRupees,
} from '../../../lib/labels';
import {
  cycleEconomics,
  deltaDistribution,
  largestDeltaCycleId,
  type AgentTrace,
  type CycleTrace,
} from '../../../lib/traceDerive';

export default function DecisionTab({
  cycleId,
  cycleTraces,
  agentTrace,
  showDetail,
  onToggleDetail,
}: {
  cycleId: string;
  cycleTraces: Record<string, CycleTrace>;
  agentTrace: AgentTrace | undefined;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const distribution = useMemo(() => deltaDistribution(cycleTraces), [cycleTraces]);
  const largestId = useMemo(() => largestDeltaCycleId(cycleTraces), [cycleTraces]);

  const selected = cycleTraces[cycleId];
  const selectedComparable =
    (selected?.chosenSchedule?.length || 0) > 0 && (selected?.runnerUpSchedule?.length || 0) > 0;

  // The shared selection drives this tab. When the selected cycle has no
  // alternative to compare against, fall back to the largest real delta and
  // say so, rather than printing +₹0.00 and hoping nobody looks.
  const shownId = selectedComparable ? cycleId : largestId || cycleId;
  const shown = cycleTraces[shownId];
  const substituted = shownId !== cycleId;

  const econ = cycleEconomics(shown, agentTrace);

  if (!econ || !shown) {
    return <div className="text-sm text-[#64748B]">{DECISION_LEADS.noSchedule}</div>;
  }

  const delta = econ.deltaPaise;
  const lead =
    delta === null
      ? DECISION_LEADS.noSchedule
      : delta === 0
        ? DECISION_LEADS.identical
        : DECISION_LEADS.positive(formatRupees(Math.abs(delta), 2));

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">{lead}</p>
          <div className="text-[#059669] font-bold mt-3 text-lg">
            {formatRupees(econ.total, 2)} {NRV_FIRST_USE}
          </div>
          {substituted && (
            <p className="text-sm text-[#B45309] mt-2">{DECISION_LEADS.substituted(shownId)}</p>
          )}
        </div>
        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? HIDE_DETAIL : SHOW_DETAIL}
        </button>
      </div>

      {/* NRV IN PLAIN WORDS */}
      <div className="border border-[#E2E8F0] bg-white p-6">
        <div className="flex flex-wrap items-stretch gap-3 text-sm">
          <Cell label={NRV_EQUATION_LABELS.gross} value={formatRupees(econ.gross, 2)} />
          <Op>+</Op>
          <Cell label={NRV_EQUATION_LABELS.future} value={formatRupees(econ.future, 2)} />
          <Op>−</Op>
          <Cell label={NRV_EQUATION_LABELS.interv} value={formatRupees(econ.interv, 2)} />
          <Op>−</Op>
          <Cell
            label={NRV_EQUATION_LABELS.churn}
            value={formatRupees(econ.churn, 2)}
            tone="warn"
          />
          <Op>=</Op>
          <Cell label={NRV_EQUATION_LABELS.total} value={formatRupees(econ.total, 2)} tone="total" />
        </div>
      </div>

      {/* CHOSEN vs RUNNER-UP */}
      <div className="grid lg:grid-cols-[1fr_auto_1fr] border border-[#E2E8F0] bg-white">
        <SchedulePanel
          heading="Chosen plan"
          slots={shown.chosenSchedule}
          nrvPaise={econ.total}
          accent="text-[#059669]"
        />

        <div className="flex flex-col items-center justify-center px-8 py-6 border-y lg:border-y-0 lg:border-x border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="text-xs font-bold uppercase tracking-widest text-[#64748B] mb-2 text-center">
            Better than next best by
          </div>
          <div className="text-4xl font-bold text-[#1D4ED8] tracking-tight tabular-nums">
            {delta === null ? '—' : formatSignedRupees(delta)}
          </div>
        </div>

        <SchedulePanel
          heading="Next best plan"
          slots={shown.runnerUpSchedule}
          nrvPaise={econ.runnerUpNrv}
          accent="text-[#64748B]"
        />
      </div>

      {showDetail && (
        <div className="border border-[#E2E8F0] bg-white p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-4">
            How the alternatives were distributed
          </h3>
          <div className="grid sm:grid-cols-3 gap-6 mb-6 text-sm">
            <Stat
              label={METRIC_LABELS.alternativesConsidered}
              value={formatCount(econ.alternatives)}
            />
            <Stat
              label="Cycles with a comparable alternative"
              value={formatCount(distribution.comparable)}
            />
            <Stat
              label="Of those, with a non-zero difference"
              value={formatCount(distribution.nonZero)}
            />
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase text-[#64748B] border-b border-[#E2E8F0]">
              <tr>
                <th className="py-2 font-normal">Difference from next best</th>
                <th className="py-2 font-normal text-right">Cycles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-mono tabular-nums">
              {distribution.buckets.map(([paise, count]) => (
                <tr key={paise}>
                  <td className="py-2">{formatSignedRupees(paise)}</td>
                  <td className="py-2 text-right">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-[#64748B] mt-4 leading-relaxed max-w-2xl">
            {distribution.windowShiftOnly} of {distribution.comparable} runner-ups fall on the same
            dates as the chosen plan and differ only by execution window, which is why their
            difference is negligible. The optimizer returns the best alternative that lands on a
            different set of dates.
          </p>
          <div className="font-mono text-[10px] text-[#94A3B8] mt-3">cycle {shownId}</div>
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'total';
}) {
  const base = 'flex-1 min-w-[140px] p-4 border rounded-sm';
  const style =
    tone === 'total'
      ? 'bg-[#0F172A] border-[#0F172A] text-white'
      : 'bg-[#F8FAFC] border-[#E2E8F0]';
  return (
    <div className={`${base} ${style}`}>
      <div className={`text-xs mb-1 ${tone === 'total' ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
        {label}
      </div>
      <div
        className={`text-lg font-mono tabular-nums ${
          tone === 'warn' ? 'text-[#B45309]' : tone === 'total' ? 'font-bold' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

const Op = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center text-[#64748B] font-bold px-1">{children}</div>
);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#64748B] mb-1">{label}</div>
      <div className="text-2xl font-mono font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SchedulePanel({
  heading,
  slots,
  nrvPaise,
  accent,
}: {
  heading: string;
  slots: { date: string; window: string; pSuccess: number }[];
  nrvPaise: number | null;
  accent: string;
}) {
  return (
    <div className="p-6">
      <h3
        className={`text-xs font-bold uppercase tracking-wider mb-4 border-b border-[#E2E8F0] pb-2 ${accent}`}
      >
        {heading}
      </h3>
      {slots?.length > 0 ? (
        <>
          <ul className="space-y-2 text-sm">
            {slots.map((s, i) => (
              <li
                key={`${s.date}-${s.window}-${i}`}
                className="flex justify-between gap-3 border-b border-dashed border-[#E2E8F0] pb-1"
              >
                <span className="text-[#0F172A]">
                  {formatDate(s.date)} · {WINDOW_LABELS[s.window] || s.window}
                </span>
                <span className="text-[#64748B] tabular-nums">
                  {METRIC_LABELS['P(succ)']} {formatPercent((s.pSuccess || 0) * 100)}
                </span>
              </li>
            ))}
          </ul>
          {nrvPaise !== null && (
            <div className="text-sm text-[#64748B] pt-4 tabular-nums">
              {formatRupees(nrvPaise, 2)}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-[#64748B]">No schedule — nothing was attempted.</div>
      )}
    </div>
  );
}
