'use client';

/**
 * NetRun — the measured comparison, drawn.
 *
 * Bars grow to their real length under requestAnimationFrame when the section
 * scrolls into view. Every value comes from the evaluation passed in as props;
 * the animation only controls how much of each bar is painted, never the
 * number at the end of it. The printed figures are the final values from the
 * first frame, so a reader never sees a number that is not the real one — this
 * deliberately does NOT count up.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ORACLE_KEY,
  STRATEGY_LABELS,
  formatRupees,
  isNetrunStrategy,
} from '../lib/labels';

export interface Row {
  strategy: string;
  nrv: number;
  att_cyc: number;
}

const GROW_MS = 700;
const STAGGER_MS = 90;

export default function NumbersChart({ rows }: { rows: Row[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Array<SVGRectElement | null>>([]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const real = rows.filter((r) => r.strategy !== ORACLE_KEY);
  const ceiling = rows.find((r) => r.strategy === ORACLE_KEY);
  const ordered = [...real].sort((a, b) => b.nrv - a.nrv);
  const max = Math.max(...rows.map((r) => r.nrv), 1);

  const GEO = { w: 900, labelW: 210, rowH: 40, top: 34, valueW: 150 };
  const trackW = GEO.w - GEO.labelW - GEO.valueW;
  const height = GEO.top + ordered.length * GEO.rowH + 28;
  const barW = (nrv: number) => (nrv / max) * trackW;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startRef.current = null;
  }, []);

  // Final widths, kept in a ref so the RAF closure never reads a stale array
  // and the effect below does not need them as a dependency.
  const widthsRef = useRef<number[]>([]);
  widthsRef.current = ordered.map((r) => barW(r.nrv));

  /** Guards against re-arming: this animation plays once, ever. */
  const playedRef = useRef(false);

  const tick = useCallback(
    (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const widths = widthsRef.current;
      let allDone = true;

      widths.forEach((full, i) => {
        const local = elapsed - i * STAGGER_MS;
        if (local < GROW_MS) allDone = false;
        const p = Math.max(0, Math.min(1, local / GROW_MS));
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const el = barRefs.current[i];
        if (el) el.setAttribute('width', String(Math.max(0, full * eased)));
      });

      if (allDone) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [stop]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || playedRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || playedRef.current) return;
        playedRef.current = true;
        io.disconnect();
        // Bars are rendered at their FINAL width, so reduced motion needs no
        // action at all. Otherwise collapse them and grow them back.
        if (reduced) return;
        barRefs.current.forEach((el) => el?.setAttribute('width', '0'));
        startRef.current = null;
        rafRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    io.observe(host);
    return () => io.disconnect();
  }, [reduced, tick]);

  useEffect(() => stop, [stop]);

  if (!rows.length) {
    return <div className="text-sm text-[#64748B]">No evaluation results available.</div>;
  }

  return (
    <div ref={hostRef} className="border border-[#E2E8F0] bg-white overflow-x-auto">
      <div className="min-w-[768px]">
      <svg viewBox={`0 0 ${GEO.w} ${height}`} width="100%" role="img" aria-label="Net recurring value by strategy">
        {/* the ceiling, as a dashed reference — never a competitor */}
        {ceiling && (
          <>
            <path
              d={`M ${GEO.labelW + barW(ceiling.nrv)} 18 V ${height - 18}`}
              stroke="#0F172A"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={GEO.labelW + barW(ceiling.nrv) - 6}
              y={14}
              fontSize={10.5}
              fill="#0F172A"
              textAnchor="end"
              fontWeight="bold"
            >
              Theoretical ceiling (perfect foresight)
            </text>
          </>
        )}

        {ordered.map((r, i) => {
          const y = GEO.top + i * GEO.rowH;
          const mine = isNetrunStrategy(r.strategy);
          return (
            <g key={r.strategy}>
              <text x={0} y={y + 15} fontSize={12.5} fontWeight={mine ? 700 : 500} fill={mine ? '#1D4ED8' : '#0F172A'}>
                {STRATEGY_LABELS[r.strategy] || r.strategy}
              </text>
              <rect x={GEO.labelW} y={y + 3} width={trackW} height={16} fill="#F8FAFC" />
              <rect
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                x={GEO.labelW}
                y={y + 3}
                width={barW(r.nrv)}
                height={16}
                fill={mine ? '#1D4ED8' : '#94A3B8'}
              />
              <text
                x={GEO.labelW + trackW + 12}
                y={y + 16}
                fontSize={12.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={mine ? 700 : 500}
                fill={mine ? '#1D4ED8' : '#475569'}
              >
                {formatRupees(r.nrv, 0)}
              </text>
              <text
                x={GEO.labelW + trackW + 12}
                y={y + 29}
                fontSize={10}
                fill="#94A3B8"
              >
                {r.att_cyc.toFixed(2)} attempts/cycle
              </text>
            </g>
          );
        })}
      </svg>
      </div>
    </div>
  );
}
