/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useMemo } from 'react';

import {
  CONSTRAINTS_LABELS,
  CONSTRAINTS_LEAD,
  RULE_STATUS_LABELS,
  RULE_STATUS_SHORT,
  formatCount,
} from '../../../lib/labels';

/**
 * COULD_NOT_VERIFY and ASSUMPTION are different claims, and keeping them
 * apart is a strength. A rule we could not verify has a real-world referent we
 * failed to confirm; an assumption has no authoritative value to confirm and
 * is swept across its full range instead. Never collapse one into the other.
 */
type Status = 'VERIFIED' | 'COULD_NOT_VERIFY' | 'ASSUMPTION';

const statusOf = (r: any): Status =>
  r.type === 'ASSUMPTION' ? 'ASSUMPTION' : (r.verification_status as Status);

const PILL_STYLES: Record<Status, string> = {
  VERIFIED: 'bg-[#059669] text-white',
  COULD_NOT_VERIFY: 'bg-[#B45309] text-white',
  ASSUMPTION: 'bg-[#E2E8F0] text-[#0F172A] border border-[#CBD5E1]',
};

const ORDER: Status[] = ['VERIFIED', 'COULD_NOT_VERIFY', 'ASSUMPTION'];

export default function ConstraintsTab({
  rules,
  showDetail,
  onToggleDetail,
}: {
  rules: any[];
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      VERIFIED: 0,
      COULD_NOT_VERIFY: 0,
      ASSUMPTION: 0,
    };
    for (const r of rules || []) {
      const s = statusOf(r);
      if (c[s] !== undefined) c[s] += 1;
    }
    return c;
  }, [rules]);

  const total = rules?.length || 0;

  // Computed from the rulebook the API serves. Never a written-in number.
  const lead = CONSTRAINTS_LEAD(
    total,
    counts.VERIFIED,
    counts.COULD_NOT_VERIFY,
    counts.ASSUMPTION
  );

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">{lead}</p>
          <div className="text-[#059669] font-bold mt-3 text-lg tabular-nums">
            {formatCount(total)} limits
          </div>
        </div>
        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? CONSTRAINTS_LABELS.hideAll : CONSTRAINTS_LABELS.showAll}
        </button>
      </div>

      {/* DEFAULT VIEW: three counts as large numbers with status pills */}
      <div className="grid sm:grid-cols-3 gap-6">
        {ORDER.map((status) => (
          <div key={status} className="border border-[#E2E8F0] bg-white p-6">
            <div className="text-5xl font-bold tabular-nums text-[#0F172A]">
              {formatCount(counts[status])}
            </div>
            <span
              className={`inline-block mt-3 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${PILL_STYLES[status]}`}
            >
              {RULE_STATUS_SHORT[status]}
            </span>
            <p className="text-sm text-[#64748B] mt-3 leading-relaxed">
              {RULE_STATUS_LABELS[status]}
            </p>
          </div>
        ))}
      </div>

      {/* FULL TABLE behind the toggle. Rule IDs stay verbatim — provenance. */}
      {showDetail && (
        <div className="border border-[#E2E8F0] bg-white overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B] border-b border-[#E2E8F0]">
              <tr>
                <th className="px-6 py-3 font-normal border-r border-[#E2E8F0]">
                  {CONSTRAINTS_LABELS.ruleId}
                </th>
                <th className="px-6 py-3 font-normal border-r border-[#E2E8F0]">
                  {CONSTRAINTS_LABELS.value}
                </th>
                <th className="px-6 py-3 font-normal">{CONSTRAINTS_LABELS.provenance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {(rules || []).map((r) => {
                const status = statusOf(r);
                return (
                  <tr key={r.rule_id} className="hover:bg-[#F8FAFC] align-top">
                    <td className="px-6 py-4 border-r border-[#E2E8F0]">
                      <div className="font-mono text-[#0F172A] text-xs">{r.rule_id}</div>
                    </td>
                    <td className="px-6 py-4 border-r border-[#E2E8F0] font-mono text-xs text-[#1D4ED8] whitespace-pre-wrap max-w-sm">
                      {JSON.stringify(r.value, null, 2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${PILL_STYLES[status]}`}
                      >
                        {RULE_STATUS_SHORT[status]}
                      </span>
                      <div className="mt-2">
                        {r.source && !r.source.startsWith('TODO') ? (
                          <a
                            href={r.source}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#1D4ED8] hover:underline block truncate max-w-sm"
                          >
                            {r.source}
                          </a>
                        ) : r.sweep ? (
                          <div className="text-sm text-[#64748B]">
                            {CONSTRAINTS_LABELS.sweepRange}{' '}
                            <span className="font-mono">
                              {r.sweep[0]} to {r.sweep[1]}
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm text-[#64748B]">
                            {CONSTRAINTS_LABELS.noProvenance}
                          </div>
                        )}
                      </div>
                    </td>
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
