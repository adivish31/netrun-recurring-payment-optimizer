'use client';

/**
 * NetRun — "The Method" as a moving pipeline.
 *
 * A token travels the five stages under requestAnimationFrame, pausing at each
 * one. The stage that consults the model is marked; the rest are marked as
 * ordinary code. That contrast is the argument, so it gets the visual weight
 * rather than a paragraph.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { PIPELINE_NODES, TRUST_BOUNDARY_LINE } from '../lib/labels';
import { BankGlyph, CalendarGlyph, CustomerGlyph, MoneyGlyph, ShieldGlyph } from './Glyphs';

/** Which stage reads a customer's words, and therefore uses the model. */
const MODEL_STAGE = 1; // "When will they have money?" consumes the extracted reply

// The decline comes from the bank; the reply comes from the customer; the rest
// is dates, the rulebook, and money. Generic glyphs, no third-party marks.
const STAGE_GLYPHS = [BankGlyph, CustomerGlyph, CalendarGlyph, ShieldGlyph, MoneyGlyph];
const STAGE_NOTES = [
  'Reads the decline code. A lookup table, no model.',
  "Reads the customer's reply to estimate a likely payday.",
  'Enumerates every legal schedule and scores it. Arithmetic.',
  'Checks the plan against the rulebook and mints a token.',
  'Runs only what the rulebook approved.',
];

const W = 900;
const H = 190;
const PAD = 46;
const STEP = (W - PAD * 2) / (PIPELINE_NODES.length - 1);
const stageX = (i: number) => PAD + i * STEP;
const RAIL_Y = 74;

const HOLD_MS = 520;
const TRAVEL_MS = 420;

export default function MethodFlow() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tokenRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  /** Autoplay happens once, ever — the effect must not re-arm on re-render. */
  const autoplayedRef = useRef(false);

  /**
   * Starts at the last stage, so the diagram is complete and readable with no
   * JavaScript, a failed hydrate, or reduced motion. play() rewinds to stage 0
   * and runs the token through when the section scrolls into view.
   */
  const [active, setActive] = useState(PIPELINE_NODES.length - 1);
  const [reduced, setReduced] = useState(false);
  const [done, setDone] = useState(true);

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

  /** Elapsed time -> which stage the token is at, and where between stages. */
  const tick = useCallback(
    (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const cycle = HOLD_MS + TRAVEL_MS;
      const idx = Math.floor(elapsed / cycle);

      if (idx >= PIPELINE_NODES.length) {
        setActive(PIPELINE_NODES.length - 1);
        setDone(true);
        if (tokenRef.current) {
          tokenRef.current.setAttribute(
            'transform',
            `translate(${stageX(PIPELINE_NODES.length - 1)} ${RAIL_Y})`
          );
        }
        stop();
        return;
      }

      const within = elapsed - idx * cycle;
      const travelling = within > HOLD_MS && idx < PIPELINE_NODES.length - 1;
      const p = travelling ? (within - HOLD_MS) / TRAVEL_MS : 0;
      // smoothstep between stage centres
      const eased = p * p * (3 - 2 * p);
      const x = stageX(idx) + eased * STEP;

      if (tokenRef.current) {
        tokenRef.current.setAttribute('transform', `translate(${x} ${RAIL_Y})`);
      }
      setActive(idx);

      rafRef.current = requestAnimationFrame(tick);
    },
    [stop]
  );

  const play = useCallback(() => {
    stop();
    setDone(false);
    if (reduced) {
      setActive(PIPELINE_NODES.length - 1);
      setDone(true);
      return;
    }
    setActive(0);
    startRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
  }, [reduced, stop, tick]);

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
      { threshold: 0.4 }
    );
    io.observe(host);
    return () => io.disconnect();
  }, [play]);

  useEffect(() => stop, [stop]);

  return (
    <div ref={hostRef} className="border border-[#E2E8F0] bg-white overflow-x-auto">
      <div className="min-w-[768px]">
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748B]">
          One payment through the pipeline
        </h3>
        <button
          onClick={play}
          className="text-xs font-semibold text-[#1D4ED8] hover:text-blue-800 border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 transition-colors"
        >
          {done ? '↺ Replay' : '▶ Play'}
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="The five pipeline stages">
        {/* rail */}
        <path d={`M ${PAD} ${RAIL_Y} H ${W - PAD}`} stroke="#E2E8F0" strokeWidth={2} />
        <path
          d={`M ${PAD} ${RAIL_Y} H ${active >= 0 ? stageX(Math.min(active, PIPELINE_NODES.length - 1)) : PAD}`}
          stroke="#1D4ED8"
          strokeWidth={2}
          style={{ transition: 'none' }}
        />

        {PIPELINE_NODES.map((node, i) => {
          const Glyph = STAGE_GLYPHS[i]!;
          const isActive = active === i;
          const passed = active > i;
          const isModel = i === MODEL_STAGE;
          const on = isActive || passed;

          return (
            <g key={node.internal}>
              {/* the AI / not-AI band above each stage */}
              <rect
                x={stageX(i) - 34}
                y={18}
                width={68}
                height={17}
                rx={3}
                fill={isModel ? '#F5F3FF' : '#F1F5F9'}
                stroke={isModel ? '#7C3AED' : '#CBD5E1'}
                strokeWidth={1}
              />
              <text
                x={stageX(i)}
                y={30}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill={isModel ? '#5B21B6' : '#64748B'}
              >
                {isModel ? 'USES AI' : 'NO AI'}
              </text>

              <circle
                cx={stageX(i)}
                cy={RAIL_Y}
                r={isActive ? 22 : 19}
                fill={on ? '#FFFFFF' : '#F8FAFC'}
                stroke={isActive ? '#1D4ED8' : isModel ? '#7C3AED' : on ? '#94A3B8' : '#E2E8F0'}
                strokeWidth={isActive ? 3 : 2}
                style={{ transition: 'r 120ms ease-out' }}
              />
              <g
                transform={`translate(${stageX(i) - 9} ${RAIL_Y - 9})`}
                color={on ? (isModel ? '#7C3AED' : '#1D4ED8') : '#CBD5E1'}
              >
                <Glyph size={18} />
              </g>

              <text
                x={stageX(i)}
                y={RAIL_Y + 40}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isActive ? 700 : 600}
                fill={on ? '#0F172A' : '#94A3B8'}
              >
                {node.n} · {node.label}
              </text>
            </g>
          );
        })}

        {/* the travelling token — moved only by RAF */}
        <g ref={tokenRef} transform={`translate(${PAD} ${RAIL_Y})`} opacity={active >= 0 ? 1 : 0}>
          <circle r={6} fill="#1D4ED8" />
          <circle r={11} fill="none" stroke="#1D4ED8" strokeWidth={1} opacity={0.35} />
        </g>
      </svg>

      <div className="px-6 pb-5">
        <p className="text-sm text-[#0F172A] min-h-[40px]">
          {active >= 0 ? STAGE_NOTES[Math.min(active, STAGE_NOTES.length - 1)] : STAGE_NOTES[0]}
        </p>
        <p className="text-xs text-[#64748B] mt-2 border-l-2 border-[#1D4ED8] pl-3">
          {TRUST_BOUNDARY_LINE} That is deterministic code, and every limit is either cited to a dated source or labelled an assumption.
        </p>
      </div>
      </div>
    </div>
  );
}
