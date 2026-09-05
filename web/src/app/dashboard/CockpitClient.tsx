/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

// Dummy placeholder tabs
import AgentTab from './tabs/AgentTab';
import PipelineTab from './tabs/PipelineTab';
import DecisionTab from './tabs/DecisionTab';
import SensitivityTab from './tabs/SensitivityTab';
import ConstraintsTab from './tabs/ConstraintsTab';
import RunsTab from './tabs/RunsTab';

export default function CockpitClient({ initialData }: { initialData: any }) {
  const [activeTab, setActiveTab] = useState('agent');
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 10 | 100>(1);
  const [selectedCycleId, setSelectedCycleId] = useState(
    'mdt_0002_c1'
  );
  
  // App state
  const [pipelineStep, setPipelineStep] = useState(0); // 0 to 5
  const [agentStep, setAgentStep] = useState(0);
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});

  const toggleDetail = (tab: string) => {
    setShowDetail(prev => ({ ...prev, [tab]: !prev[tab] }));
  };

  // Agent states
  const [agentMode, setAgentMode] = useState<'LIVE' | 'RECORDED'>('RECORDED');
  const [agentTraces, setAgentTraces] = useState<any[]>([]);
  const [liveApiKeyMissing, setLiveApiKeyMissing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/agent/traces`)
      .then(res => res.json())
      .then(data => setAgentTraces(data.traces || []))
      .catch(err => console.error(err));
  }, []);

  const runLiveAgent = async () => {
    if (agentMode !== 'LIVE') return;
    setAgentStep(0);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/agent/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId: selectedCycleId, mandateId: activeCycle?.mandateId, amountPaise: 50000 })
    });
    if (res.status === 403) {
      setLiveApiKeyMissing(true);
      return;
    }
    const data = await res.json();
    setAgentTraces(prev => {
      const existing = prev.filter(t => t.cycleId !== selectedCycleId);
      return [...existing, { ...data, type: 'live' }];
    });
  };

  const handleModeToggle = (mode: 'LIVE' | 'RECORDED') => {
    setAgentMode(mode);
    setLiveApiKeyMissing(false);
  };

  const currentAgentTrace = agentMode === 'RECORDED' 
    ? agentTraces.find(t => t.cycleId === selectedCycleId) || agentTraces[0]
    : agentTraces.find(t => t.cycleId === selectedCycleId && t.type === 'live');

  useEffect(() => {
    if (!isPlaying) return;
    if (activeTab === 'agent' && currentAgentTrace) {
      const maxSteps = currentAgentTrace.iterations?.length + 1 || 0;
      if (agentStep >= maxSteps) {
        setIsPlaying(false);
        return;
      }
      const timer = setTimeout(() => setAgentStep(s => s + 1), 1000 / playbackSpeed);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, activeTab, currentAgentTrace, agentStep, playbackSpeed]);

  const activeCycle = initialData.cycles.find((c: any) => c.id === selectedCycleId);
  const traceData = activeCycle;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* PERSISTENT HEADER */}
      <header className="h-16 border-b border-[#E2E8F0] bg-white flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[#64748B] hover:text-[#0F172A] text-sm">← Back</Link>
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg tracking-tight">NetRun</span>
            <span className="font-mono text-xs border border-[#E2E8F0] px-2 py-0.5 rounded-sm bg-[#F8FAFC] text-[#64748B]">COCKPIT</span>
          </div>
        </div>
        
        <div className="hidden lg:block text-sm font-medium">
          Recovery Operator Surface — bounded retries under NPCI constraints
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <div className="font-mono text-xs flex gap-6 text-[#0F172A]">
              <span>sim <span className="font-semibold">Day 12</span></span>
              <span>replay <span className="font-semibold">0:41</span></span>
              <span>budget <span className="font-semibold">4 attempts</span></span>
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-[#64748B] mt-1">
              SIMULATED REPLAY
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeTab === 'agent' && (
              <div className="flex flex-col gap-2 mr-4">
                <div className="flex items-center gap-2 border border-[#E2E8F0] p-1 bg-[#F8FAFC]">
                  <button 
                    onClick={() => handleModeToggle('LIVE')}
                    className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${agentMode === 'LIVE' ? 'bg-[#1D4ED8] text-white' : 'text-[#64748B] hover:bg-[#E2E8F0]'} ${liveApiKeyMissing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    LIVE
                  </button>
                  <button 
                    onClick={() => handleModeToggle('RECORDED')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${agentMode === 'RECORDED' ? 'bg-white border shadow-sm text-[#0F172A]' : 'text-[#64748B] hover:bg-[#E2E8F0]'}`}
                  >
                    RECORDED TRACE &mdash; captured {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </button>
                </div>
                {liveApiKeyMissing && <span className="text-[10px] text-red-500 font-bold uppercase">No API Key / 429</span>}
              </div>
            )}
            
            <select 
              className="text-sm border border-[#E2E8F0] bg-white px-2 py-1 focus:outline-none font-mono"
              value={activeTab === 'agent' ? selectedCycleId : playbackSpeed}
              onChange={e => {
                if (activeTab === 'agent') {
                  setSelectedCycleId(e.target.value);
                  setAgentStep(0);
                } else {
                  setPlaybackSpeed(Number(e.target.value) as any);
                }
              }}
            >
              {activeTab === 'agent' ? (
                <>
                  <optgroup label="Standard Trace (Recorded)">
                    {agentTraces.filter(t => t.type === 'standard').map((t, i) => (
                      <option key={t.cycleId} value={t.cycleId}>Cycle {t.cycleId}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Adversarial (Demo)">
                    <option value="adv_injection">Prompt injection</option>
                    <option value="adv_forged">Forged token</option>
                    <option value="adv_unavailable">Model unavailable</option>
                  </optgroup>
                </>
              ) : (
                <>
                  <option value={1}>1× speed</option>
                  <option value={10}>10× speed</option>
                  <option value={100}>100× speed</option>
                </>
              )}
            </select>

            <div className="flex items-center gap-1">
              <button 
                onClick={() => activeTab === 'agent' ? setAgentStep(s => Math.max(0, s - 1)) : setPipelineStep(0)}
                className="bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[#0F172A] text-xs font-semibold px-3 py-2 transition-colors"
              >
                ↺
              </button>
              <button 
                onClick={() => {
                  if (activeTab === 'agent') {
                    if (agentMode === 'LIVE') runLiveAgent();
                    else setAgentStep(s => Math.min(s + 1, currentAgentTrace?.iterations?.length + 1 || 0));
                  }
                }}
                className="bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[#0F172A] text-xs font-semibold px-3 py-2 transition-colors"
              >
                ▶ Step
              </button>
            </div>

            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-[#1D4ED8] hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              {isPlaying ? '⏸ Pause' : '▶▶ Run'}
            </button>

            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#059669]">
              <span>● READY</span>
            </div>
          </div>
        </div>
      </header>

      {/* TAB STRIP */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 flex gap-8 text-sm font-semibold uppercase tracking-wider text-[#64748B]">
        {[
          { id: 'agent', label: 'Agent' },
          { id: 'pipeline', label: 'Pipeline' },
          { id: 'decision', label: 'Decision' },
          { id: 'sensitivity', label: 'Sensitivity' },
          { id: 'constraints', label: 'Constraints' },
          { id: 'runs', label: 'Runs' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 border-b-2 transition-colors ${activeTab === tab.id ? 'border-[#1D4ED8] text-[#0F172A]' : 'border-transparent hover:text-[#0F172A]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* MAIN WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          {activeTab === 'agent' && <AgentTab 
            trace={currentAgentTrace}
            step={agentStep}
            speed={playbackSpeed}
            showDetail={!!showDetail['agent']}
            onToggleDetail={() => toggleDetail('agent')}
          />}
          {activeTab === 'pipeline' && <PipelineTab 
            cycle={activeCycle} trace={traceData} 
            step={pipelineStep} setStep={setPipelineStep} 
            speed={playbackSpeed} cycles={initialData.cycles}
            onSelectCycle={setSelectedCycleId}
            showDetail={!!showDetail['pipeline']}
            onToggleDetail={() => toggleDetail('pipeline')}
          />}
          {activeTab === 'decision' && <DecisionTab 
            trace={traceData} 
            showDetail={!!showDetail['decision']}
            onToggleDetail={() => toggleDetail('decision')}
          />}
          {activeTab === 'sensitivity' && <SensitivityTab 
            grid={initialData.grid} 
            showDetail={!!showDetail['sensitivity']}
            onToggleDetail={() => toggleDetail('sensitivity')}
          />}
          {activeTab === 'constraints' && <ConstraintsTab 
            rules={initialData.rules} 
            showDetail={!!showDetail['constraints']}
            onToggleDetail={() => toggleDetail('constraints')}
          />}
          {activeTab === 'runs' && <RunsTab results={initialData.results} />}
        </main>

        {/* RIGHT RAIL */}
        <aside className="w-[400px] border-l border-[#E2E8F0] bg-white flex flex-col shrink-0 overflow-y-auto">
          {/* 1. LATEST SIGNAL */}
          <div className="p-6 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-4">1. Latest Signal</h3>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-sm leading-relaxed">
              <span className="inline-block px-2 py-0.5 rounded-sm bg-[#059669] text-white text-[10px] font-bold uppercase tracking-wider mb-2">APPROVED</span>
              <p>Schedule approved under RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE — 3 of 4 attempts committed.</p>
            </div>
          </div>

          {/* 2. BUDGET AT RISK */}
          <div className="p-6 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-4">2. Budget At Risk</h3>
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2 text-[#0F172A]">
              <span>Attempts Committed</span>
              <span>3 / 4 cap</span>
            </div>
            <div className="h-2 bg-[#F1F5F9] border border-[#E2E8F0] w-full mb-4">
              <div className="h-full bg-[#B45309] w-[75%] transition-all duration-500"></div>
            </div>
            
            <button 
              onClick={() => toggleDetail('rail')}
              className="text-[#1D4ED8] hover:text-blue-800 text-sm font-semibold flex items-center mb-4 transition-colors"
            >
              {showDetail['rail'] ? 'Hide detail ▾' : 'Show detail ▸'}
            </button>

            {showDetail['rail'] && (
              <div className="space-y-2 text-sm mt-2">
                <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                  <span className="text-[#64748B]">Notifications sent</span>
                  <span className="font-mono">3</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-[#E2E8F0] pb-1">
                  <span className="text-[#64748B]">Churn probability</span>
                  <span className="font-mono text-[#DC2626]">4.8%</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[#64748B]">Future value at risk</span>
                  <span className="font-mono">₹42,180</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. TRACE LOG */}
          {showDetail['rail'] && (
            <div className="p-6 flex-1 flex flex-col overflow-hidden bg-[#0F172A] text-white">
              <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-4 shrink-0">3. Trace Log</h3>
              <div className="font-mono text-xs leading-relaxed space-y-2 overflow-y-auto pb-4 text-[#94A3B8]">
                {pipelineStep >= 1 && <div><span className="text-white">netrun &gt; diagnose</span>      cycle {selectedCycleId} -&gt; BALANCE (lookup)</div>}
                {pipelineStep >= 2 && <div><span className="text-white">netrun &gt; estimate</span>      shrinkage prior, 4 cycles history</div>}
                {pipelineStep >= 3 && <div><span className="text-white">netrun &gt; optimise</span>      {traceData?.alternativesConsidered?.toLocaleString()} schedules evaluated -&gt; best NRV ₹{((traceData?.nrvBreakdown?.gross || 0)/100).toFixed(0)}</div>}
                {pipelineStep >= 4 && <div><span className="text-white">netrun &gt; check_policy</span>  APPROVE (auto-approved)</div>}
                {pipelineStep >= 5 && <div className="text-[#059669]"><span className="text-white">netrun &gt; execute</span>       3 attempts committed, idempotency key a3f9...</div>}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
