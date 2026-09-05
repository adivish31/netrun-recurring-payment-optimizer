/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import Link from 'next/link';
import { AnimatedSection } from '../components/AnimatedSection';
import { NetRunMark } from '../components/Glyphs';
import MethodFlow from '../components/MethodFlow';
import NumbersChart from '../components/NumbersChart';
import ProblemTimeline from '../components/ProblemTimeline';
import {
  HEADER_LABELS,
  METRIC_LABELS,
  STRATEGY_LABELS,
  TRUST_BOUNDARY_LINE,
  RULE_STATUS_LABELS,
  RULE_STATUS_SHORT,
  formatCount,
  formatPercent,
  formatRupees,
  isNetrunStrategy,
} from '../lib/labels';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

async function getJson(endpoint: string) {
  const res = await fetch(`${API_BASE}/api/${endpoint}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
  return res.json();
}

export default async function LandingPage() {
  let results: any = { '6': [] };
  let rules: any[] = [];
  try {
    [results, rules] = await Promise.all([getJson('results'), getJson('rules')]);
  } catch {
    // Rendered below as empty states rather than invented numbers.
  }

  const h6 = results['6'] || [];
  const pick = (s: string) => h6.find((r: any) => r.strategy === s) || {};
  const oracle = pick('oracle');

  // The headline strategy is whichever real strategy actually scores highest.
  const real = h6.filter((r: any) => r.strategy !== 'oracle');
  const best = real.length
    ? real.reduce((a: any, b: any) => (b.nrv > a.nrv ? b : a))
    : {};
  const baselines = real.filter((r: any) => !isNetrunStrategy(r.strategy));
  const bestBaseline = baselines.length
    ? baselines.reduce((a: any, b: any) => (b.nrv > a.nrv ? b : a))
    : {};

  const pctOracle = oracle.nrv ? formatPercent((best.nrv / oracle.nrv) * 100) : null;
  const attemptsCycle = best.att_cyc ? best.att_cyc.toFixed(2) : null;
  const baselineAttempts = bestBaseline.att_cyc ? bestBaseline.att_cyc.toFixed(2) : null;
  const churnCost = best.churn !== undefined ? formatRupees(best.churn, 0) : null;
  const baselineChurn =
    bestBaseline.churn !== undefined ? formatRupees(bestBaseline.churn, 0) : null;
  const violations = real.reduce((sum: number, r: any) => sum + (r.violations || 0), 0);

  // Cycle count is recovered from the evaluation itself: the intervention cost
  // is attempts x cost, and attempts is att_cyc x cycles, so interv / att_cyc
  // is cost x cycles. Two strategies agreeing on that product confirm it.
  const costTimesCycles = best.att_cyc ? best.interv / best.att_cyc : null;
  const attemptCost = rules.find((r) => r.rule_id === 'INTERVENTION_COST_PAISE')?.value;
  const attemptCap = rules.find(
    (r) => r.rule_id === 'RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE'
  )?.value;
  const pdnLeadHours = rules.find(
    (r) => r.rule_id === 'UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS'
  )?.value;
  const cycleCount =
    costTimesCycles && attemptCost ? Math.round(costTimesCycles / attemptCost) : null;

  // Provenance counts, computed from the rulebook the API serves.
  const statusOf = (r: any) =>
    r.type === 'ASSUMPTION' ? 'ASSUMPTION' : r.verification_status;
  const provenance = (['VERIFIED', 'COULD_NOT_VERIFY', 'ASSUMPTION'] as const).map(
    (status) => ({
      status,
      count: rules.filter((r) => statusOf(r) === status).length,
    })
  );

  return (
    <div className="bg-grid-pattern min-h-screen">
      {/* STICKY NAV */}
      <nav className="sticky top-0 z-50 bg-[#F8FAFC]/95 border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-bold text-lg tracking-tight text-[#0F172A]">
              <NetRunMark size={22} className="text-[#1D4ED8]" />
              NetRun
            </span>
            {/* Factual attribution only. No bank or card-network marks anywhere. */}
            <span className="font-mono text-[10px] uppercase text-[#64748B] tracking-widest hidden md:inline-block">
              {HEADER_LABELS.attribution}
            </span>
          </div>
          <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#64748B]">
            <a href="#problem" className="hover:text-[#0F172A] transition-colors">The Problem</a>
            <a href="#method" className="hover:text-[#0F172A] transition-colors">The Method</a>
            <a href="#numbers" className="hover:text-[#0F172A] transition-colors">The Numbers</a>
          </div>
          <div>
            <Link 
              href="/dashboard" 
              className="bg-[#1D4ED8] text-white text-sm font-semibold px-4 py-2 hover:bg-[#1E40AF] transition-colors"
            >
              Open Cockpit →
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pb-32">
        {/* HERO */}
        <section className="pt-32 pb-24 flex flex-col items-center text-center">
          <div className="flex flex-col items-center gap-3 mb-10">
            <div className="flex gap-3">
              <span className="font-mono text-xs border border-[#E2E8F0] bg-white px-3 py-1 text-[#64748B]">
                ● {HEADER_LABELS.attribution}
              </span>
              <span className="font-mono text-xs border border-[#E2E8F0] bg-[#0F172A] text-white px-3 py-1 font-semibold tracking-wide uppercase">
                AI Revenue Recovery
              </span>
            </div>
            {cycleCount !== null && (
              <div>
                <span className="font-mono text-xs border border-[#E2E8F0] bg-white px-3 py-1 text-[#1D4ED8]">
                  ✓ {violations} policy violations across {formatCount(cycleCount)} cycles
                </span>
              </div>
            )}
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-8 max-w-5xl">
            AI that stops <span className="animate-strike"><span className="opacity-90">retrying harder</span></span> and starts <span className="text-[#1D4ED8]">waiting for payday</span>, proves it against a <span className="text-[#7C3AED]">known ceiling</span>, and never moves money on its own.
          </h1>

          <p className="text-lg md:text-xl text-[#64748B] max-w-3xl mb-12 leading-relaxed">
            Under UPI AutoPay you get {attemptCap ?? 'a fixed number of'} attempts per cycle, each
            needs {pdnLeadHours ?? 'advance'} hours&apos; notice, and every notice is a chance for
            the customer to cancel the mandate. NetRun treats retries as a{' '}
            <strong className="text-[#0F172A] font-semibold">scarce budget with a churn cost</strong>
            , and decides when to spend them.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Link href="/dashboard" className="bg-[#1D4ED8] text-white font-semibold px-6 py-3 hover:bg-[#1E40AF] transition-colors">
              Open Cockpit →
            </Link>
            <Link href="/dashboard" className="border border-[#E2E8F0] bg-white font-semibold px-6 py-3 hover:bg-[#F1F5F9] transition-colors">
              Watch the pipeline run
            </Link>
            <a href="#method" className="text-[#64748B] font-medium hover:text-[#0F172A] underline underline-offset-4 transition-colors">
              Read the method
            </a>
          </div>
        </section>

        {/* 1. THE PROBLEM */}
        <AnimatedSection className="pt-24 border-t border-[#E2E8F0]" id="problem">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">1. The Problem</h2>
            <p className="text-lg font-medium text-[#0F172A]">
              The money existed. Both strategies had already spent their attempts before it arrived.
            </p>
          </div>
          
          <ProblemTimeline />

        </AnimatedSection>

        {/* 2. THE METHOD */}
        <AnimatedSection className="pt-32" id="method">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">2. The Method</h2>
          </div>
          
          <MethodFlow />

        </AnimatedSection>

        {/* 3. THE NUMBERS */}
        <AnimatedSection className="pt-32" id="numbers">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">3. The Numbers</h2>
            <p className="text-lg font-medium text-[#0F172A]">
              Measured across {cycleCount ? formatCount(cycleCount) : 'the'} simulated cycles
              against a known-optimal ceiling.
            </p>
          </div>

          {/* Measured comparison, drawn from the evaluation. */}
          <div className="mb-8">
            <NumbersChart rows={h6} />
          </div>

          <div className="overflow-x-auto border-t border-l border-[#E2E8F0] bg-white">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 min-w-[768px]">
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">
                Share of the ceiling
              </div>
              <div className="text-4xl font-bold font-mono text-[#1D4ED8] mb-1 tabular-nums">
                {pctOracle ?? '—'}
              </div>
              <div className="text-sm text-[#64748B]">of what perfect foresight would score</div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">
                {METRIC_LABELS.att_cyc}
              </div>
              <div className="text-4xl font-bold font-mono mb-1 tabular-nums">
                {attemptsCycle ?? '—'}
              </div>
              <div className="text-sm text-[#64748B]">
                {baselineAttempts ? `vs ${baselineAttempts} for the best baseline` : ''}
              </div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">
                {METRIC_LABELS.churn}
              </div>
              <div className="text-4xl font-bold font-mono mb-1 tabular-nums">
                {churnCost ?? '—'}
              </div>
              <div className="text-sm text-[#64748B]">
                {baselineChurn ? `vs ${baselineChurn} for the best baseline` : ''}
              </div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">
                Policy violations
              </div>
              <div className="text-4xl font-bold font-mono mb-1 tabular-nums">{violations}</div>
              <div className="text-sm text-[#64748B]">
                {cycleCount ? `across ${formatCount(cycleCount)} cycles` : ''}
              </div>
            </div>
            </div>
          </div>
        </AnimatedSection>

        {/* 4. WHAT WE COULD NOT VERIFY */}
        <AnimatedSection className="pt-32">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">4. What We Could Not Verify</h2>
          </div>
          
          {/* Counts computed from the rulebook. A rule we could not verify and a
              stated assumption are different claims and stay separate. */}
          <div className="grid md:grid-cols-3 gap-8">
            {provenance.map(({ status, count }) => (
              <div
                key={status}
                className={`border border-[#E2E8F0] bg-white p-8 border-t-4 ${
                  status === 'VERIFIED'
                    ? 'border-t-[#059669]'
                    : status === 'COULD_NOT_VERIFY'
                      ? 'border-t-[#B45309]'
                      : 'border-t-[#CBD5E1]'
                }`}
              >
                <h3 className="font-semibold text-[#0F172A] mb-4 tabular-nums">
                  {count} {RULE_STATUS_SHORT[status]}
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  {status === 'ASSUMPTION'
                    ? `${RULE_STATUS_LABELS[status]} — swept across its full range, and the ranking does not change.`
                    : `${RULE_STATUS_LABELS[status]}.`}
                </p>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </main>
    </div>
  );
}
