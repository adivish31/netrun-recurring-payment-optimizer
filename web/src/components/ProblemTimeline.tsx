'use client';

/**
 * NetRun — "The Problem", as a played-out timeline rather than a sentence.
 *
 * A playhead sweeps day 1 -> 30 under requestAnimationFrame. As it passes each
 * strategy's scheduled attempt, that attempt resolves: red if the account was
 * still empty, green once the salary has landed. The point lands visually —
 * the baselines burn their whole budget before the money exists; NetRun holds
 * its budget and spends one attempt after payday.
 *
 * PROVENANCE: this panel is a SCHEMATIC and says so on screen. The baseline
 * lanes are not measured — they are the definitions of those strategies
 * ("retry immediately", "T+1/3/7"). Payday is the scenario's premise. The
 * measured results are in section 3, which reads from the evaluation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { STRATEGY_LABELS } from '../lib/labels';
import { CalendarGlyph, MoneyGlyph } from './Glyphs';

const DAYS = 30;
const PAYDAY = 25;
/** ms of animation per simulated day */
const MS_PER_DAY = 95;

interface Lane {
  key: string;
  label: string;
  /** days on which this strategy attempts — definitional, not measured */
  attempts: number[];
  /** NetRun is the one that holds budget back */
  isNetrun?: boolean;
}

const LANES: Lane[] = [
  { key: 'aggressive', label: STRATEGY_LABELS.aggressive, attempts: [1, 2, 3] },
  { key: 'fixed', label: STRATEGY_LABELS.fixed, attempts: [1, 3, 7] },
  { key: 'netrun', label: 'NetRun', attempts: [PAYDAY + 1], isNetrun: true },
];

const GEO = {
  w: 900,
  labelW: 190,
  laneH: 62,
  topPad: 46,
  bottomPad: 44,
};
const trackW = GEO.w - GEO.labelW - 40;
const laneY = (i: number) => GEO.topPad + i * GEO.laneH;
const dayX = (d: number) => GEO.labelW + ((d - 1) / (DAYS - 1)) * trackW;
const HEIGHT = GEO.topPad + LANES.length * GEO.laneH + GEO.bottomPad;

export default function ProblemTimeline() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  /** Autoplay happens once, ever — the effect must not re-arm on re-render. */
  const autoplayedRef = useRef(false);

  /**
   * Starts at the END state, not at zero. With no JavaScript, a failed hydrate
   * or reduced motion, the panel still shows the completed timeline and reads
   * correctly — the animation resets it to day 0 and replays when the section
   * scrolls into view. Correct-when-static, animated when it can be.
   */
  const [day, setDay] = useState(DAYS);
  const [reduced, setReduced] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startRef.current = null;
  }, []);

  /**
   * The playhead loop. Elapsed time maps to a simulated day; the day drives
   * every marker's state, so a dropped frame costs smoothness, never
   * correctness. React holds `day`, and the loop only moves the playhead
   * group imperatively between day changes.
   */
  const tick = useCallback(
    (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const exact = 1 + elapsed / MS_PER_DAY;

      if (playheadRef.current) {
        const x = dayX(Math.min(exact, DAYS));
        playheadRef.current.setAttribute('transform', `translate(${x} 0)`);
      }

      const whole = Math.floor(exact);
      setDay((d) => (whole > d ? Math.min(whole, DAYS) : d));

      if (exact >= DAYS) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [stop]
  );

  const play = useCallback(() => {
    stop();
    setDay(0);
    setHasRun(true);
    if (reduced) {
      setDay(DAYS); // end state, no motion
      return;
    }
    startRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
  }, [reduced, stop, tick]);

  // Run once when scrolled into view.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || autoplayedRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !autoplayedRef.current) {
          autoplayedRef.current = true;
          io.disconnect();
          play();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(host);
    return () => io.disconnect();
  }, [play]);

  // Cancel the loop on unmount so it cannot leak.
  useEffect(() => stop, [stop]);

  const moneyHasLanded = day >= PAYDAY;

  const summary = useMemo(() => {
    const spentBeforePayday = LANES.filter((l) => !l.isNetrun).flatMap((l) =>
      l.attempts.filter((a) => a < PAYDAY)
    ).length;
    return { spentBeforePayday };
  }, []);

  return (
    <div ref={hostRef} className="border border-[#E2E8F0] bg-white overflow-x-auto">
      <div className="min-w-[768px]">
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <span className="uppercase tracking-widest font-bold text-[#B45309]">Schematic</span>
          <span className="hidden sm:inline">
            — baseline lanes are those strategies&apos; definitions, not measured output
          </span>
        </div>
        <button
          onClick={play}
          className="text-xs font-semibold text-[#1D4ED8] hover:text-blue-800 border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 transition-colors"
        >
          {hasRun ? '↺ Replay' : '▶ Play'}
        </button>
      </div>

      <svg viewBox={`0 0 ${GEO.w} ${HEIGHT}`} width="100%" role="img" aria-label="Attempts spent before the salary arrives">
        {/* day axis */}
        {[1, 10, 20, 30].map((d) => (
          <text key={d} x={dayX(d)} y={26} fontSize={12} fill="#64748B" textAnchor="middle">
            Day {d}
          </text>
        ))}
        <path
          d={`M ${GEO.labelW} 34 H ${GEO.labelW + trackW}`}
          stroke="#E2E8F0"
          strokeWidth={1}
        />

        {/* payday marker — the fact both baselines missed */}
        <path
          d={`M ${dayX(PAYDAY)} 34 V ${HEIGHT - 26}`}
          stroke={moneyHasLanded ? '#1D4ED8' : '#E2E8F0'}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <g
          transform={`translate(${dayX(PAYDAY) - 9} ${HEIGHT - 22})`}
          opacity={moneyHasLanded ? 1 : 0.35}
          style={{ transition: 'opacity 200ms ease-out' }}
        >
          <g color={moneyHasLanded ? '#1D4ED8' : '#94A3B8'}>
            <MoneyGlyph size={18} />
          </g>
        </g>
        <text
          x={dayX(PAYDAY) + 14}
          y={HEIGHT - 9}
          fontSize={11}
          fontWeight="bold"
          fill={moneyHasLanded ? '#1D4ED8' : '#94A3B8'}
        >
          Salary lands
        </text>

        {/* lanes */}
        {LANES.map((lane, i) => {
          const y = laneY(i);
          const reachedAttempts = lane.attempts.filter((a) => a <= day);
          const succeeded = lane.attempts.some((a) => a <= day && a > PAYDAY);
          const failedAll =
            lane.attempts.every((a) => a <= day) && !lane.attempts.some((a) => a > PAYDAY);

          return (
            <g key={lane.key}>
              <text
                x={0}
                y={y + 4}
                fontSize={13}
                fontWeight={lane.isNetrun ? 700 : 500}
                fill={lane.isNetrun ? '#1D4ED8' : '#0F172A'}
              >
                {lane.label}
              </text>

              {/* the track, drawn as far as the playhead has travelled */}
              <path d={`M ${GEO.labelW} ${y} H ${GEO.labelW + trackW}`} stroke="#F1F5F9" strokeWidth={3} />
              <path
                d={`M ${GEO.labelW} ${y} H ${dayX(Math.max(1, Math.min(day, DAYS)))}`}
                stroke={lane.isNetrun ? '#BFDBFE' : '#E2E8F0'}
                strokeWidth={3}
                opacity={day > 0 ? 1 : 0}
              />

              {/* NetRun's held budget reads as a deliberate wait, not inaction */}
              {lane.isNetrun && day > 0 && (
                <text x={GEO.labelW + 8} y={y - 10} fontSize={10.5} fill="#1D4ED8" fontWeight={600}>
                  holding budget…
                </text>
              )}

              {lane.attempts.map((a) => {
                const shown = a <= day;
                const good = a > PAYDAY;
                return (
                  <g
                    key={a}
                    transform={`translate(${dayX(a)} ${y})`}
                    opacity={shown ? 1 : 0}
                    style={{ transition: 'opacity 150ms ease-out' }}
                  >
                    <circle r={shown ? 6.5 : 3} fill={good ? '#059669' : '#DC2626'} />
                    {good ? (
                      <path
                        d="M -3 0 L -0.6 2.6 L 3.2 -2.4"
                        stroke="#FFFFFF"
                        strokeWidth={1.8}
                        fill="none"
                        strokeLinecap="round"
                      />
                    ) : (
                      <path
                        d="M -2.4 -2.4 L 2.4 2.4 M 2.4 -2.4 L -2.4 2.4"
                        stroke="#FFFFFF"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                );
              })}

              {/* verdict, once this lane has resolved */}
              {(failedAll || succeeded) && (
                <text
                  x={GEO.labelW + trackW + 8}
                  y={y + 4}
                  fontSize={11}
                  fontWeight="bold"
                  fill={succeeded ? '#059669' : '#DC2626'}
                >
                  {succeeded ? 'RECOVERED' : 'BUDGET GONE'}
                </text>
              )}
            </g>
          );
        })}

        {/* the playhead — the only thing RAF moves */}
        <g ref={playheadRef} transform={`translate(${GEO.labelW} 0)`} opacity={day > 0 && day < DAYS ? 1 : 0}>
          <path d={`M 0 34 V ${HEIGHT - 26}`} stroke="#0F172A" strokeWidth={1.5} />
          <circle cx={0} cy={34} r={3.5} fill="#0F172A" />
        </g>
      </svg>

      <div className="px-6 pb-5 pt-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#64748B]">
        <span className="flex items-center gap-1.5">
          <CalendarGlyph size={14} />
          Day {Math.max(0, Math.min(day, DAYS))} of {DAYS}
        </span>
        <span>
          {summary.spentBeforePayday} baseline attempts spent before the money existed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block" /> failed
          <span className="w-2.5 h-2.5 rounded-full bg-[#059669] inline-block ml-3" /> recovered
        </span>
      </div>
      </div>
    </div>
  );
}
