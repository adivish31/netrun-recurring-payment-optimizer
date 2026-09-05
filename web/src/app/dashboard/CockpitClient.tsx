/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { NetRunMark } from '../../components/Glyphs';

import AgentTab from './tabs/AgentTab';
import PipelineTab from './tabs/PipelineTab';
import DecisionTab from './tabs/DecisionTab';
import SensitivityTab from './tabs/SensitivityTab';
import ConstraintsTab from './tabs/ConstraintsTab';
import RunsTab from './tabs/RunsTab';

import {
  FLOW_LABELS,
  HEADER_LABELS,
  LIVE_AI_TAG,
  POLICY_LABELS,
  RAIL_LABELS,
  TAB_LABELS,
  formatPercent,
  formatRupees,
  stepWord,
  toolLabel,
  traceScenarioLabel,
} from '../../lib/labels';
import {
  cycleEconomics,
  defaultCycleId,
  diagnosisClassOf,
  fellBackToRulesPlanner,
  findTrace,
  reachedStage,
  stepSummary,
  usableTraces,
  type AgentTrace,
} from '../../lib/traceDerive';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

/** Replay clock. Simulated, and the header says so in words. */
const REPLAY_DAY = 12;
const REPLAY_OF_DAYS = 30;

function ruleValue(rules: any[], ruleId: string): any {
  return rules?.find((r) => r.rule_id === ruleId)?.value;
}

export default function CockpitClient({
  initialData,
  initialTab,
  initialCycleId,
}: {
  initialData: any;
  initialTab?: string;
  initialCycleId?: string;
}) {
  const rules: any[] = initialData.rules || [];
  const cycleTraces: Record<string, any> = initialData.cycleTraces || {};

  /** The attempt cap is a configured constraint, read from the rulebook. */
  const attemptCap: number = ruleValue(rules, 'RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE') ?? 0;
  const hazardBase: number = ruleValue(rules, 'CANCEL_HAZARD_BASE') ?? 0;
  const fatigue: number = ruleValue(rules, 'CANCEL_FATIGUE_MULTIPLIER') ?? 1;
  const attemptCost: number = ruleValue(rules, 'INTERVENTION_COST_PAISE') ?? 0;

  const [agentTraces, setAgentTraces] = useState<AgentTrace[]>(initialData.traces || []);
  const traces = useMemo(() => usableTraces(agentTraces), [agentTraces]);

  // ONE shared selection across Agent, Pipeline and Decision.
  // Initialised synchronously to the richest trace so nothing renders empty.
  const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
    const fallback = defaultCycleId(initialData.traces || []);
    if (!initialCycleId) return fallback;
    const requested = usableTraces(initialData.traces || []).find(
      (t) => t.cycleId === initialCycleId
    );
    return requested ? requested.cycleId : fallback;
  });

  const [activeTab, setActiveTab] = useState(() =>
    TAB_LABELS.some((t) => t.id === initialTab) ? (initialTab as string) : 'agent'
  );
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});
  const [railExpanded, setRailExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 10 | 100>(1);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isLiveRunning, setIsLiveRunning] = useState(false);

  const trace = useMemo(
    () => findTrace(agentTraces, selectedCycleId),
    [agentTraces, selectedCycleId]
  );
  const cycleTrace = cycleTraces[selectedCycleId] || null;
  const totalSteps = trace?.iterations?.length || 0;
  const stagesReached = reachedStage(cycleTrace, trace);
  const declineClass = diagnosisClassOf(cycleTrace, trace);
  const econ = cycleEconomics(cycleTrace, trace);

  /** The graph's synthetic "fell back to rules" leg, when the data supports it. */
  const fellBackToRules = fellBackToRulesPlanner(trace, econ?.attempts ?? 0);

  /** Journeys the graph draws: one per tool call, plus the two fallback legs. */
  const agentJourneyCount = totalSteps + (fellBackToRules ? 2 : 0);

  // Default: the whole run is already on screen, fallback legs included.
  //
  // `revealed` is what has been committed. `agentTarget` is what has been
  // requested. The flow graph animates the gap and calls back as each return
  // particle lands, which is what keeps graph and stream in step — the stream
  // never shows a step whose particle has not arrived.
  const [revealed, setRevealed] = useState<number>(agentJourneyCount);
  const [agentTarget, setAgentTarget] = useState<number>(agentJourneyCount);
  const [pipelineStep, setPipelineStep] = useState<number>(stagesReached);

  // When the shared selection changes, show the new trace in full.
  useEffect(() => {
    setRevealed(agentJourneyCount);
    setAgentTarget(agentJourneyCount);
    setPipelineStep(stagesReached);
    setIsPlaying(false);
  }, [selectedCycleId, agentJourneyCount, stagesReached]);

  // Pipeline keeps its own simple timed advance; the Agent tab is driven by the
  // graph's RAF loop instead, so it is deliberately not in this effect.
  useEffect(() => {
    if (!isPlaying || activeTab !== 'pipeline') return;
    if (pipelineStep >= stagesReached) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setPipelineStep((s) => s + 1), 600 / speed);
    return () => clearTimeout(timer);
  }, [isPlaying, activeTab, pipelineStep, stagesReached, speed]);

  const toggleDetail = useCallback((tab: string) => {
    setShowDetail((prev) => ({ ...prev, [tab]: !prev[tab] }));
  }, []);

  /** One particle journey. */
  const stepOnce = useCallback(() => {
    if (activeTab === 'pipeline') {
      setIsPlaying(false);
      setPipelineStep((s) => Math.min(s + 1, stagesReached));
    } else {
      setAgentTarget((t) => Math.min(t + 1, agentJourneyCount));
    }
  }, [activeTab, stagesReached, agentJourneyCount]);

  /** Auto-advance to the end. */
  const runAll = useCallback(() => {
    if (activeTab === 'pipeline') {
      if (pipelineStep >= stagesReached) setPipelineStep(0);
      setIsPlaying(true);
    } else {
      setAgentTarget(agentJourneyCount);
    }
  }, [activeTab, pipelineStep, stagesReached, agentJourneyCount]);

  /** Clear every edge and counter. */
  const resetAll = useCallback(() => {
    setIsPlaying(false);
    if (activeTab === 'pipeline') {
      setPipelineStep(0);
    } else {
      setRevealed(0);
      setAgentTarget(0);
    }
  }, [activeTab]);

  /** Called by the graph as each return particle lands. */
  const handleStepLanded = useCallback(() => {
    setRevealed((r) => r + 1);
  }, []);

  const runLiveAgent = useCallback(async () => {
    setLiveError(null);
    setIsLiveRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId: selectedCycleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLiveError(body.error || `Live run failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setAgentTraces((prev) => [
        { ...data, captured: 'live', type: data.type || 'standard' },
        ...prev.filter((t) => t.cycleId !== data.cycleId),
      ]);
      setSelectedCycleId(data.cycleId);
    } catch (e: any) {
      setLiveError(e.message);
    } finally {
      setIsLiveRunning(false);
    }
  }, [selectedCycleId]);

  // ------------------------------------------------------------------
  // Right rail values — all from the selected cycle, none hardcoded
  // ------------------------------------------------------------------

  // The rail describes the run that is on screen. The selected AGENT run is
  // authoritative for the verdict, because a run can be refused at execute on
  // a cycle whose evaluated plan was approved — reporting the evaluated plan's
  // "approved" against a refused run would be wrong.
  const agentPolicy = trace?.decision?.policy;
  const agentRefused = agentPolicy?.verdict === 'BLOCK';

  // A refused run committed nothing, whatever the evaluated plan scheduled.
  const attemptsUsed = agentRefused ? 0 : (econ?.attempts ?? 0);
  const noticesSent = attemptsUsed; // one pre-debit notice per attempt
  const cancelChance =
    noticesSent > 0
      ? 1 -
        Array.from({ length: noticesSent }).reduce<number>(
          (acc, _v, i) => acc * (1 - hazardBase * Math.pow(fatigue, i)),
          1
        )
      : 0;

  const policyRuleId = agentPolicy?.rule_id || cycleTrace?.ruleId || '';
  const policyVerdict =
    agentPolicy?.verdict || (cycleTrace?.policyVerdict || '').split(':')[0] || 'NONE';

  const traceLogLines = useMemo(() => {
    if (!trace?.iterations) return [] as string[];
    return trace.iterations
      .slice(0, revealed)
      .map((it) => `${toolLabel(it.toolCalled).label} — ${stepSummary(it)}`);
  }, [trace, revealed]);

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* HEADER */}
      <header className="min-h-16 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-4 px-6 py-3 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[#64748B] hover:text-[#0F172A] text-sm">
            {HEADER_LABELS.back}
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 font-bold text-lg tracking-tight">
              <NetRunMark size={20} className="text-[#1D4ED8]" />
              {HEADER_LABELS.productName}
            </span>
            <span className="font-mono text-xs border border-[#E2E8F0] px-2 py-0.5 rounded-sm bg-[#F8FAFC] text-[#64748B]">
              {HEADER_LABELS.surfaceName}
            </span>
          </div>
        </div>

        <div className="hidden xl:block text-sm font-medium text-[#475569]">
          {HEADER_LABELS.strapline}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <div className="text-xs text-[#0F172A] font-medium">
              {HEADER_LABELS.replayClock(REPLAY_DAY, REPLAY_OF_DAYS)}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-[#B45309] mt-1">
              {HEADER_LABELS.simulatedReplay}
            </div>
          </div>

          {/* THE SHARED TRACE SELECTOR — the value is always the cycleId */}
          <select
            aria-label="Recorded trace"
            className="text-sm border border-[#E2E8F0] bg-white px-2 py-2 focus:outline-none focus:border-[#1D4ED8] max-w-[420px]"
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
          >
            {traces.map((t) => (
              <option key={t.cycleId} value={t.cycleId}>
                {`${t.cycleId}   ${traceScenarioLabel(t.cycleId, t.type)}`}
                {t.captured === 'live' ? ` · ${LIVE_AI_TAG}` : ''}
                {` · ${stepWord(t.iterations.length)}`}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              onClick={stepOnce}
              className="border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold px-3 py-2 transition-colors"
            >
              {FLOW_LABELS.stepControl}
            </button>
            <button
              onClick={runAll}
              className="border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold px-3 py-2 transition-colors"
            >
              ▶▶ {FLOW_LABELS.runControl}
            </button>
            <button
              onClick={resetAll}
              className="border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold px-3 py-2 transition-colors"
            >
              ↺ {FLOW_LABELS.resetControl}
            </button>

            {/* Speed scales the RAF duration, it does not skip frames. */}
            <div
              className="flex ml-2 border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden"
              aria-label={FLOW_LABELS.speedControl}
            >
              {([1, 10, 100] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-2 text-xs font-mono transition-colors ${
                    speed === s ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <button
              onClick={runLiveAgent}
              disabled={isLiveRunning}
              className="border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold px-3 py-2 ml-2 transition-colors disabled:opacity-50"
            >
              {isLiveRunning ? 'Running…' : 'Run live AI'}
            </button>
          </div>
        </div>

        {liveError && <div className="w-full text-xs text-[#B45309] font-medium">{liveError}</div>}
      </header>

      {/* TABS */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 flex gap-8 text-sm font-semibold uppercase tracking-wider text-[#64748B] overflow-x-auto">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#1D4ED8] text-[#0F172A]'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'agent' && (
            <AgentTab
              trace={trace}
              revealed={revealed}
              target={agentTarget}
              speed={speed}
              fellBackToRules={fellBackToRules}
              onStepLanded={handleStepLanded}
              scheduledAttempts={econ?.attempts ?? 0}
              declineClass={declineClass}
              showDetail={!!showDetail.agent}
              onToggleDetail={() => toggleDetail('agent')}
            />
          )}
          {activeTab === 'pipeline' && (
            <PipelineTab
              cycleTrace={cycleTrace}
              agentTrace={trace}
              step={pipelineStep}
              stagesReached={stagesReached}
              attemptCap={attemptCap}
              showDetail={!!showDetail.pipeline}
              onToggleDetail={() => toggleDetail('pipeline')}
            />
          )}
          {activeTab === 'decision' && (
            <DecisionTab
              cycleId={selectedCycleId}
              cycleTraces={cycleTraces}
              agentTrace={trace}
              showDetail={!!showDetail.decision}
              onToggleDetail={() => toggleDetail('decision')}
            />
          )}
          {activeTab === 'sensitivity' && (
            <SensitivityTab
              grid={initialData.grid || []}
              hazardBase={hazardBase}
              showDetail={!!showDetail.sensitivity}
              onToggleDetail={() => toggleDetail('sensitivity')}
            />
          )}
          {activeTab === 'constraints' && (
            <ConstraintsTab
              rules={rules}
              showDetail={!!showDetail.constraints}
              onToggleDetail={() => toggleDetail('constraints')}
            />
          )}
          {activeTab === 'runs' && (
            <RunsTab
              results={initialData.results}
              attemptCostPaise={attemptCost}
              showDetail={!!showDetail.runs}
              onToggleDetail={() => toggleDetail('runs')}
            />
          )}
        </main>

        {/* RIGHT RAIL */}
        <aside className="w-[380px] border-l border-[#E2E8F0] bg-white flex flex-col shrink-0 overflow-y-auto">
          {/* 1. LATEST SIGNAL */}
          <div className="p-6 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-4">
              {RAIL_LABELS.latestSignal}
            </h3>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-sm leading-relaxed">
              <span
                className={`inline-block px-2 py-0.5 rounded-sm text-white text-[10px] font-bold uppercase tracking-wider mb-2 ${
                  policyVerdict === 'APPROVE' ? 'bg-[#059669]' : 'bg-[#B45309]'
                }`}
              >
                {POLICY_LABELS[policyVerdict] || policyVerdict}
              </span>
              <p>
                {POLICY_LABELS[policyRuleId] || policyRuleId || '—'}
                {attemptCap > 0 ? ` — ${attemptsUsed} of ${attemptCap} attempts used.` : ''}
              </p>
            </div>
          </div>

          {/* 2. ATTEMPTS USED */}
          <div className="p-6 border-b border-[#E2E8F0]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                {RAIL_LABELS.attemptsUsed}
              </h3>
              <span className="font-mono text-sm font-bold tabular-nums">
                {attemptsUsed} / {attemptCap}
              </span>
            </div>
            <div className="h-2 bg-[#F1F5F9] border border-[#E2E8F0] w-full">
              <div
                className="h-full bg-[#B45309] rail-bar"
                style={{
                  width:
                    attemptCap > 0
                      ? `${Math.min(100, (attemptsUsed / attemptCap) * 100)}%`
                      : '0%',
                }}
              />
            </div>

            <button
              onClick={() => setRailExpanded((v) => !v)}
              className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold mt-4 transition-colors"
            >
              {railExpanded ? `${RAIL_LABELS.less} ▾` : `${RAIL_LABELS.more} ▸`}
            </button>

            {railExpanded && (
              <div className="space-y-2 text-sm mt-3">
                <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                  <span className="text-[#64748B]">{RAIL_LABELS.noticesSent}</span>
                  <span className="font-mono tabular-nums">{noticesSent}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1 gap-4">
                  <span className="text-[#64748B]">{RAIL_LABELS.cancelChance}</span>
                  <span className="font-mono tabular-nums text-[#B45309]">
                    {formatPercent(cancelChance * 100)}
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[#64748B]">{RAIL_LABELS.valueAtRisk}</span>
                  <span className="font-mono tabular-nums">{formatRupees(econ?.churn ?? 0, 2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. TRACE LOG — last line only, expands to full */}
          <div className="p-6 flex-1 flex flex-col bg-[#0F172A] text-white">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">
                {RAIL_LABELS.traceLog}
              </h3>
              {traceLogLines.length > 1 && (
                <button
                  onClick={() => setLogExpanded((v) => !v)}
                  className="text-[#94A3B8] hover:text-white text-xs font-semibold"
                >
                  {logExpanded ? `${RAIL_LABELS.less} ▾` : `${RAIL_LABELS.more} ▸`}
                </button>
              )}
            </div>
            <div className="font-mono text-[11px] leading-relaxed space-y-2 overflow-y-auto text-[#94A3B8]">
              {traceLogLines.length === 0 && <div>waiting for the first tool call…</div>}
              {(logExpanded ? traceLogLines : traceLogLines.slice(-1)).map((line, i) => (
                <div key={`${line}-${i}`} className="log-append">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
