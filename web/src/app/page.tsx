/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import Link from 'next/link';
import { AnimatedSection, AnimatedTimelineRow } from '../components/AnimatedSection';

async function getResults() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/results`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch results');
  return res.json();
}

export default async function LandingPage() {
  let results;
  try {
    results = await getResults();
  } catch (e) {
    results = { '6': [] };
  }

  const h6 = results['6'] || [];
  const netrun = h6.find((r: any) => r.strategy === 'netrun') || {};
  const oracle = h6.find((r: any) => r.strategy === 'oracle') || {};

  const pctOracle = oracle.nrv ? ((netrun.nrv / oracle.nrv) * 100).toFixed(1) : '0.0';
  const attemptsCycle = netrun.att_cyc ? netrun.att_cyc.toFixed(2) : '0.00';
  const churnCost = netrun.churn ? `₹${(netrun.churn / 100).toLocaleString()}` : '₹0';
  
  return (
    <div className="bg-grid-pattern min-h-screen">
      {/* STICKY NAV */}
      <nav className="sticky top-0 z-50 bg-[#F8FAFC]/95 border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <span className="font-bold text-lg tracking-tight">NetRun</span>
            <span className="font-mono text-[10px] uppercase text-[#64748B] tracking-widest hidden md:inline-block">
              Razorpay Buildathon · Track 03
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
                ● Razorpay AI Buildathon · Track 03
              </span>
              <span className="font-mono text-xs border border-[#E2E8F0] bg-[#0F172A] text-white px-3 py-1 font-semibold tracking-wide uppercase">
                AI Revenue Recovery
              </span>
            </div>
            <div>
              <span className="font-mono text-xs border border-[#E2E8F0] bg-white px-3 py-1 text-[#1D4ED8]">
                ✓ 0 policy violations across 2,400 cycles
              </span>
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-8 max-w-5xl">
            AI that stops <span className="animate-strike"><span className="opacity-90">retrying harder</span></span> and starts <span className="font-serif italic text-[#1D4ED8] font-normal tracking-normal pr-1">waiting for payday</span>, proves it against a <span className="font-serif italic text-[#7C3AED] font-normal tracking-normal pr-1">known ceiling</span>, and never moves money on its own.
          </h1>

          <p className="text-lg md:text-xl text-[#64748B] max-w-3xl mb-12 leading-relaxed">
            Under UPI AutoPay you get four attempts per cycle, each needs 24 hours' notice, and every notice is a chance for the customer to cancel the mandate. NetRun treats retries as a <strong className="text-[#0F172A] font-semibold">scarce budget with a churn cost</strong>, and decides when to spend them.
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
          
          <div className="bg-white border border-[#E2E8F0] p-8 pb-12 relative overflow-hidden">
            {/* Axis */}
            <div className="flex justify-between text-xs font-mono text-[#64748B] mb-8 border-b border-[#E2E8F0] pb-2">
              <span>Day 1</span>
              <span>Day 10</span>
              <span>Day 20</span>
              <span>Day 30</span>
            </div>

            <div className="space-y-12">
              <AnimatedTimelineRow delayMs={0}>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-32 text-sm font-medium">Retry immediately</div>
                  <div className="flex-1 relative h-6">
                    <div className="timeline-line"></div>
                    {/* Clustered on Day 1 */}
                    <div className="timeline-marker absolute left-[3%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="timeline-marker absolute left-[6%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="timeline-marker absolute left-[9%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold text-[#DC2626] bg-white px-2">FAILED</div>
                  </div>
                </div>
              </AnimatedTimelineRow>

              <AnimatedTimelineRow delayMs={600}>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-32 text-sm font-medium">Fixed schedule</div>
                  <div className="flex-1 relative h-6">
                    <div className="timeline-line"></div>
                    {/* Days 1, 3, 7 */}
                    <div className="timeline-marker absolute left-[3%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="timeline-marker absolute left-[10%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="timeline-marker absolute left-[23%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#DC2626]"></div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold text-[#DC2626] bg-white px-2">FAILED</div>
                  </div>
                </div>
              </AnimatedTimelineRow>

              <AnimatedTimelineRow delayMs={1200}>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-32 text-sm font-medium">Money arrives</div>
                  <div className="flex-1 relative h-6">
                    <div className="timeline-line bg-transparent"></div> {/* No line for money */}
                    {/* Day 25 */}
                    <div className="timeline-marker absolute left-[83%] top-1/2 -translate-y-1/2 w-4 h-4 bg-[#1D4ED8] rotate-45 border-2 border-white shadow-sm"></div>
                  </div>
                </div>
              </AnimatedTimelineRow>
            </div>
          </div>
        </AnimatedSection>

        {/* 2. THE METHOD */}
        <AnimatedSection className="pt-32" id="method">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">2. The Method</h2>
          </div>
          
          <div className="grid md:grid-cols-5 gap-0 border border-[#E2E8F0] bg-white divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0] mb-8">
            {[
              { id: '01', title: 'Diagnose', desc: 'Why did it fail? No balance, bank outage, or a dead mandate?' },
              { id: '02', title: 'Estimate', desc: 'When is this specific customer likely to have money?' },
              { id: '03', title: 'Optimise', desc: 'Which combination of days is worth most over six months?' },
              { id: '04', title: 'Check', desc: 'Is that plan allowed under NPCI and RBI rules?' },
              { id: '05', title: 'Execute', desc: 'Run only what the rules approved.' },
            ].map((stage) => (
              <div key={stage.id} className="p-6 flex flex-col h-full">
                <div className="font-mono text-xs text-[#64748B] mb-2">{stage.id}</div>
                <h3 className="font-semibold text-[#0F172A] mb-3">{stage.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{stage.desc}</p>
              </div>
            ))}
          </div>
          
          <div className="bg-[#0F172A] text-white p-6 border-l-4 border-[#1D4ED8]">
            <p className="text-sm font-medium leading-relaxed max-w-4xl">
              The AI reads messy customer replies and decides what to look up. It never picks the dates and never moves money — that is deterministic code, and every limit is either cited to a regulator or labelled an assumption.
            </p>
          </div>
        </AnimatedSection>

        {/* 3. THE NUMBERS */}
        <AnimatedSection className="pt-32" id="numbers">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">3. The Numbers</h2>
            <p className="text-lg font-medium text-[#0F172A]">
              Measured across 2,400 simulated cycles against a known-optimal ceiling.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border-t border-l border-[#E2E8F0] bg-white">
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">NRV vs Oracle</div>
              <div className="text-4xl font-bold font-mono text-[#1D4ED8] mb-1">{pctOracle}%</div>
              <div className="text-sm text-[#64748B]">of the theoretical maximum</div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">Attempts/Cycle</div>
              <div className="text-4xl font-bold font-mono mb-1">{attemptsCycle}</div>
              <div className="text-sm text-[#64748B]">vs 2.81 baseline</div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">Churn Cost</div>
              <div className="text-4xl font-bold font-mono mb-1">{churnCost}</div>
              <div className="text-sm text-[#64748B]">vs ₹1,63,564 baseline</div>
            </div>
            <div className="p-8 border-r border-b border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">Policy Violations</div>
              <div className="text-4xl font-bold font-mono mb-1">0</div>
              <div className="text-sm text-[#64748B]">across 2,400 cycles</div>
            </div>
          </div>
        </AnimatedSection>

        {/* 4. WHAT WE COULD NOT VERIFY */}
        <AnimatedSection className="pt-32">
          <div className="mb-12">
            <h2 className="text-sm font-semibold tracking-widest text-[#64748B] uppercase mb-4">4. What We Could Not Verify</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="border border-[#E2E8F0] bg-white p-8 border-t-4 border-t-green-500">
              <h3 className="font-semibold text-[#0F172A] mb-4">3 Verified</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">
                3 constants verified against dated NPCI/RBI sources.
              </p>
            </div>
            <div className="border border-[#E2E8F0] bg-white p-8 border-t-4 border-t-[#B45309]">
              <h3 className="font-semibold text-[#0F172A] mb-4">3 Unverified</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">
                3 could not be verified, treated as assumptions.
              </p>
            </div>
            <div className="border border-[#E2E8F0] bg-white p-8 border-t-4 border-t-[#E2E8F0]">
              <h3 className="font-semibold text-[#0F172A] mb-4">10 Assumptions</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">
                10 parameters swept across full range, ranking never changes.
              </p>
            </div>
          </div>
        </AnimatedSection>
      </main>
    </div>
  );
}
