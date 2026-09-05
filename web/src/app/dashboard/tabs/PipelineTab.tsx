/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React from 'react';

import {
  DECIDED_BY_LABELS,
  DECLINE_CLASS_LABELS,
  DECLINED_ZERO_ATTEMPTS,
  HIDE_DETAIL,
  NODE_FIELD_LABELS,
  NRV_FIRST_USE,
  PIPELINE_LEADS,
  PIPELINE_NODES,
  POLICY_LABELS,
  SHOW_DETAIL,
  WINDOW_LABELS,
  formatCount,
  formatDate,
  formatRupees,
  formatSignedRupees,
  nodeHeader,
} from '../../../lib/labels';
import {
  cycleEconomics,
  diagnosisClassOf,
  type AgentTrace,
  type CycleTrace,
} from '../../../lib/traceDerive';

export default function PipelineTab({
  cycleTrace,
  agentTrace,
  step,
  stagesReached,
  attemptCap,
  showDetail,
  onToggleDetail,
}: {
  cycleTrace: CycleTrace | null;
  agentTrace: AgentTrace | undefined;
  step: number;
  stagesReached: number;
  attemptCap: number;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const econ = cycleEconomics(cycleTrace, agentTrace);
  const cls = diagnosisClassOf(cycleTrace, agentTrace);
  const lead = PIPELINE_LEADS[cls] || PIPELINE_LEADS.UNKNOWN;

  if (!econ) {
    return (
      <div className="text-sm text-[#64748B]">
        This cycle has no evaluated decision, so the pipeline has nothing to show.
      </div>
    );
  }

  const verdictWord = (cycleTrace?.policyVerdict || '').split(':')[0];
  const ruleId = cycleTrace?.ruleId || agentTrace?.decision?.policy?.rule_id || '';
  const zeroAttempts = econ.attempts === 0;

  /** One line per node when inactive. Expands when active. No raw JSON. */
  const nodeLines: Record<string, { summary: string; rows: [string, string][] }> = {
    DIAGNOSE: {
      summary: DECLINE_CLASS_LABELS[cls] || cls,
      rows: [
        [NODE_FIELD_LABELS.Class, DECLINE_CLASS_LABELS[cls] || cls],
        [
          NODE_FIELD_LABELS.Source,
          DECIDED_BY_LABELS[cycleTrace?.diagnosisSource || ''] ||
            cycleTrace?.diagnosisSource ||
            '—',
        ],
      ],
    },
    ESTIMATE: {
      summary: DECIDED_BY_LABELS.shrinkage,
      rows: [[NODE_FIELD_LABELS.Estimator, DECIDED_BY_LABELS.shrinkage]],
    },
    OPTIMISE: {
      summary: `${formatCount(econ.alternatives)} schedules evaluated`,
      rows: [
        [NODE_FIELD_LABELS.Alts, formatCount(econ.alternatives)],
        [NODE_FIELD_LABELS['Chosen NRV'], formatRupees(econ.total, 2)],
        [
          NODE_FIELD_LABELS.Delta,
          econ.deltaPaise === null ? 'no alternative to compare' : formatSignedRupees(econ.deltaPaise),
        ],
      ],
    },
    'CHECK POLICY': {
      summary: POLICY_LABELS[ruleId] || POLICY_LABELS[verdictWord] || verdictWord || '—',
      rows: [
        [NODE_FIELD_LABELS.Verdict, POLICY_LABELS[verdictWord] || verdictWord || '—'],
        ['Rule', POLICY_LABELS[ruleId] || ruleId || '—'],
      ],
    },
    EXECUTE: {
      summary: zeroAttempts
        ? DECLINED_ZERO_ATTEMPTS
        : `${econ.attempts} of ${attemptCap} attempts used`,
      rows: [
        [NODE_FIELD_LABELS.Slots, `${econ.attempts} of ${attemptCap}`],
        ...(cycleTrace?.chosenSchedule || []).map(
          (s) =>
            [formatDate(s.date), WINDOW_LABELS[s.window] || s.window] as [string, string]
        ),
      ],
    },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* LEAD: one plain sentence, one number */}
      <div className="flex items-start justify-between gap-8 border-b border-[#E2E8F0] pb-6">
        <div className="max-w-3xl">
          <p className="text-xl text-[#0F172A] leading-relaxed">{lead}</p>
          <div className="text-[#059669] font-bold mt-3 text-lg">
            {formatRupees(econ.total)} {NRV_FIRST_USE} ·{' '}
            <span className="tabular-nums">
              {econ.attempts} of {attemptCap} attempts used
            </span>
          </div>
        </div>
        <button
          onClick={onToggleDetail}
          className="shrink-0 text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold px-4 py-2 border border-[#E2E8F0] bg-[#F8FAFC] transition-colors"
        >
          {showDetail ? HIDE_DETAIL : SHOW_DETAIL}
        </button>
      </div>

      {zeroAttempts && (
        <div className="border-l-4 border-[#B45309] bg-[#FFFBEB] px-6 py-4">
          <div className="text-lg font-bold text-[#92400E]">{DECLINED_ZERO_ATTEMPTS}</div>
        </div>
      )}

      {/* NODES */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-4">
        {PIPELINE_NODES.map((node, i) => {
          const reached = step >= node.n;
          const lit = node.n <= stagesReached;
          const isActive = step === node.n;
          const data = nodeLines[node.internal]!;

          let borderClass = 'border-[#E2E8F0]';
          if (isActive && lit) borderClass = 'border-[#1D4ED8]';
          else if (reached && lit) borderClass = 'border-[#E2E8F0] border-l-4 border-l-[#059669]';

          return (
            <React.Fragment key={node.internal}>
              <div
                className={`flex-1 min-w-[210px] border bg-white p-4 transition-colors duration-200 ${borderClass} ${
                  isActive && lit ? 'node-active' : ''
                } ${!lit ? 'opacity-40' : ''}`}
              >
                <h4
                  className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                    isActive && lit ? 'text-[#1D4ED8]' : 'text-[#64748B]'
                  }`}
                >
                  {nodeHeader(node)}
                </h4>
                {showDetail && (
                  <div className="font-mono text-[10px] text-[#94A3B8] mb-2">{node.internal}</div>
                )}

                {!lit ? (
                  <div className="text-sm text-[#94A3B8]">not reached</div>
                ) : !reached ? (
                  <div className="text-sm text-[#94A3B8]">waiting</div>
                ) : isActive || showDetail ? (
                  <div className="space-y-2 text-sm mt-2">
                    {data.rows.map(([k, v]) => (
                      <div
                        key={`${k}-${v}`}
                        className="flex justify-between gap-3 border-b border-dashed border-[#E2E8F0] pb-1"
                      >
                        <span className="text-[#64748B]">{k}</span>
                        <span className="font-medium text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#0F172A]">{data.summary}</div>
                )}
              </div>

              {i < PIPELINE_NODES.length - 1 && (
                <div className="w-8 shrink-0 flex items-center">
                  <div className="w-full h-[2px] bg-[#E2E8F0] relative overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 bg-[#1D4ED8] connector ${
                        step > node.n && node.n < stagesReached ? 'connector-drawn' : ''
                      }`}
                    />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
