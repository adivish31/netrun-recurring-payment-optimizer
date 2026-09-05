/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * NetRun — Agent tab flow graph.
 *
 * Six tool nodes on a vertical arc, a central agent node, and one particle per
 * tool call travelling a cubic bezier out and back. Driven by
 * requestAnimationFrame with an elapsed-time parameterisation of the path — no
 * CSS keyframes, no animation library.
 *
 * DIVISION OF LABOUR, which is what makes this safe to ship:
 *   React renders the COMMITTED state declaratively — every edge that has been
 *   traversed, every call counter, every dimmed node. That state is a pure
 *   function of `committed`, so it is correct with no frames ever drawn.
 *   RAF only animates the TRANSIENT layer: the in-flight particle and the
 *   arrival pulse. If the graph fails, or motion is suppressed, the committed
 *   layer is already right and the step list beside it is the record either way.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FLOW_LABELS, TOOL_ORDER, toolLabel } from '../../../lib/labels';
import type { AgentTrace, Iteration } from '../../../lib/traceDerive';
import { isRejectedStep } from '../../../lib/traceDerive';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const W = 430;
const H = 470;
const NODE_R = 15;
const PULSE_SCALE = 1.15; // radius scales up ~15% on arrival
const AGENT = { x: 52, y: H / 2 };

const ARC_X = 196; // spine of the arc
const ARC_BOW = 42; // how far the middle nodes bulge out
const TOP_Y = 46;
const ROW_GAP = (H - TOP_Y * 2) / (TOOL_ORDER.length - 1);

export interface Point {
  x: number;
  y: number;
}

/** A cubic bezier as four control points. */
export type Cubic = [Point, Point, Point, Point];

function nodeCentre(i: number): Point {
  const y = TOP_Y + i * ROW_GAP;
  // sin() bows the middle of the column outward, so paths fan instead of overlap
  const x = ARC_X + ARC_BOW * Math.sin((i / (TOOL_ORDER.length - 1)) * Math.PI);
  return { x, y };
}

/** The normal agent -> tool path. */
function callPath(i: number): Cubic {
  const n = nodeCentre(i);
  return [
    AGENT,
    { x: AGENT.x + (n.x - AGENT.x) * 0.1, y: AGENT.y + (n.y - AGENT.y) * 0.7 },
    { x: AGENT.x + (n.x - AGENT.x) * 0.55, y: n.y },
    n,
  ];
}

/**
 * A visibly DIFFERENT route, used for the rule-based fallback so a viewer can
 * see it is not the path the model took.
 */
function fallbackPath(i: number): Cubic {
  const n = nodeCentre(i);
  return [
    AGENT,
    { x: AGENT.x - 26, y: AGENT.y + (n.y - AGENT.y) * 0.15 },
    { x: n.x - 130, y: n.y + 74 },
    n,
  ];
}

const cubicToD = ([p0, p1, p2, p3]: Cubic) =>
  `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

// ---------------------------------------------------------------------------
// Path parameterisation — the position along the curve at parameter t
// ---------------------------------------------------------------------------

/**
 * Point on a cubic bezier at t in [0,1] (De Casteljau, expanded).
 *
 *   B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
 *
 * The RAF loop converts elapsed milliseconds into t, so motion is tied to the
 * clock rather than to frame count — it looks identical on a 60Hz and a 144Hz
 * display, and a dropped frame costs position, not duration.
 */
export function cubicPointAt(curve: Cubic, t: number): Point {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Symmetric ease-in-out, so particles leave and arrive gently. */
export function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Journeys — one per tool call, derived from the trace
// ---------------------------------------------------------------------------

type JourneyKind = 'call' | 'rejected' | 'lost' | 'fallback';

interface Journey {
  /** index into the trace's iterations, or -1 for a synthetic fallback leg */
  step: number;
  toolIndex: number;
  kind: JourneyKind;
  curve: Cubic;
}

const OUT_MS = 380;
const PULSE_MS = 200;
const BACK_MS = 320; // ~700ms of travel per step, plus the pulse

function buildJourneys(
  trace: AgentTrace | undefined,
  fellBackToRules: boolean
): Journey[] {
  if (!trace?.iterations) return [];
  const out: Journey[] = trace.iterations.map((it: Iteration, idx: number) => {
    const toolIndex = TOOL_ORDER.indexOf(it.toolCalled);
    return {
      step: idx,
      toolIndex: toolIndex < 0 ? 0 : toolIndex,
      kind: isRejectedStep(it, trace) ? 'rejected' : 'call',
      curve: callPath(toolIndex < 0 ? 0 : toolIndex),
    };
  });

  if (fellBackToRules) {
    // The model call died in flight, then deterministic code produced the
    // schedule. Two legs: one that never arrives, one on a different route.
    const planner = TOOL_ORDER.indexOf('propose_schedule');
    out.push({ step: -1, toolIndex: planner, kind: 'lost', curve: callPath(planner) });
    out.push({
      step: -1,
      toolIndex: planner,
      kind: 'fallback',
      curve: fallbackPath(planner),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export default function AgentFlowGraph({
  trace,
  committed,
  target,
  speed,
  fellBackToRules,
  onStepLanded,
}: {
  trace: AgentTrace | undefined;
  /** journeys already finished — the committed layer React draws */
  committed: number;
  /** journeys that should end up finished; the graph animates the difference */
  target: number;
  /** 1 / 10 / 100 — scales the RAF duration */
  speed: number;
  fellBackToRules: boolean;
  onStepLanded: (journey: { step: number; kind: JourneyKind }) => void;
}) {
  const journeys = useMemo(() => buildJourneys(trace, fellBackToRules), [trace, fellBackToRules]);

  const [reduced, setReduced] = useState(false);
  const [failed, setFailed] = useState(false);

  // Transient layer, mutated by RAF outside React
  const particleRef = useRef<SVGCircleElement | null>(null);
  const nodeRefs = useRef<Array<SVGCircleElement | null>>([]);
  const flashRefs = useRef<Array<SVGCircleElement | null>>([]);
  const fallbackLabelRef = useRef<SVGTextElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  // Latest values for the RAF closure, so the loop never reads stale props
  const stateRef = useRef({ committed, target, speed, journeys, onStepLanded });
  stateRef.current = { committed, target, speed, journeys, onStepLanded };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    runningRef.current = false;
    startedRef.current = null;
  }, []);

  /**
   * THE RAF LOOP.
   *
   * One journey at a time. `elapsed` drives a three-phase timeline
   * (outbound -> pulse -> return); phase progress becomes the bezier
   * parameter t via easeInOut, and cubicPointAt turns t into a position.
   * When the return leg lands, the step is committed to the reasoning stream
   * and the next journey starts on the following frame.
   */
  const tick = useCallback(
    (now: number) => {
      const { committed: done, target: want, speed: mult, journeys: js, onStepLanded: land } =
        stateRef.current;

      if (done >= want || done >= js.length) {
        stopRaf();
        return;
      }

      const journey = js[done]!;
      const scale = Math.max(1, mult);
      const outMs = OUT_MS / scale;
      const pulseMs = PULSE_MS / scale;
      const backMs = BACK_MS / scale;

      if (startedRef.current === null) startedRef.current = now;
      const elapsed = now - startedRef.current;

      const particle = particleRef.current;
      const node = nodeRefs.current[journey.toolIndex];
      const flash = flashRefs.current[journey.toolIndex];

      // A lost leg never arrives: it fades out partway along the curve.
      const isLost = journey.kind === 'lost';
      const lostAt = 0.55;

      if (elapsed < outMs) {
        // ---- phase 1: outbound
        const p = elapsed / outMs;
        const t = easeInOut(isLost ? p * lostAt : p);
        const pt = cubicPointAt(journey.curve, t);
        if (particle) {
          particle.setAttribute('cx', String(pt.x));
          particle.setAttribute('cy', String(pt.y));
          particle.setAttribute('opacity', isLost ? String(1 - p) : '1');
          particle.setAttribute('fill', journey.kind === 'fallback' ? '#B45309' : '#1D4ED8');
        }
        if (journey.kind === 'fallback' && fallbackLabelRef.current) {
          fallbackLabelRef.current.setAttribute('opacity', String(Math.min(1, p * 2)));
        }
      } else if (isLost) {
        // A lost leg is finished the moment it has faded — no pulse, no return.
        if (particle) particle.setAttribute('opacity', '0');
        stopRaf();
        land({ step: journey.step, kind: journey.kind });
        return;
      } else if (elapsed < outMs + pulseMs) {
        // ---- phase 2: arrival pulse, radius up ~15% and back
        const p = (elapsed - outMs) / pulseMs;
        const bump = Math.sin(p * Math.PI); // 0 -> 1 -> 0
        if (node) node.setAttribute('r', String(NODE_R * (1 + (PULSE_SCALE - 1) * bump)));
        if (particle) particle.setAttribute('opacity', '0');
        if (journey.kind === 'rejected' && flash) {
          // Rejected: the node flashes danger red once, on arrival.
          flash.setAttribute('opacity', String(bump));
        }
      } else if (elapsed < outMs + pulseMs + backMs) {
        // ---- phase 3: the result travels back along the same path
        const p = (elapsed - outMs - pulseMs) / backMs;
        if (node) node.setAttribute('r', String(NODE_R));
        if (journey.kind === 'rejected') {
          // Rejected: reverse and dissipate. No result comes back, so no edge.
          const t = easeInOut(1 - p * 0.45);
          const pt = cubicPointAt(journey.curve, t);
          if (particle) {
            particle.setAttribute('cx', String(pt.x));
            particle.setAttribute('cy', String(pt.y));
            particle.setAttribute('fill', '#DC2626');
            particle.setAttribute('opacity', String(1 - p));
          }
          if (flash) flash.setAttribute('opacity', String(Math.max(0, 1 - p) * 0.55));
        } else {
          const t = easeInOut(1 - p);
          const pt = cubicPointAt(journey.curve, t);
          if (particle) {
            particle.setAttribute('cx', String(pt.x));
            particle.setAttribute('cy', String(pt.y));
            particle.setAttribute('fill', journey.kind === 'fallback' ? '#B45309' : '#059669');
            particle.setAttribute('opacity', '1');
          }
        }
      } else {
        // ---- landed: commit the step, reset the transient layer, next journey
        if (particle) particle.setAttribute('opacity', '0');
        if (node) node.setAttribute('r', String(NODE_R));
        if (flash) flash.setAttribute('opacity', '0');
        startedRef.current = null;
        land({ step: journey.step, kind: journey.kind });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [stopRaf]
  );

  // Start / stop the loop as the target moves. Reduced motion and a failed
  // graph both commit the outstanding steps at once, with no frames.
  useEffect(() => {
    if (committed >= target) {
      stopRaf();
      return;
    }
    if (reduced || failed) {
      const j = journeys[committed];
      if (j) onStepLanded({ step: j.step, kind: j.kind });
      return;
    }
    if (runningRef.current) return;
    try {
      runningRef.current = true;
      startedRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setFailed(true);
      stopRaf();
    }
  }, [committed, target, reduced, failed, journeys, onStepLanded, tick, stopRaf]);

  // Cancel on unmount AND on tab switch — this component is unmounted when the
  // active tab changes, so one cleanup covers both and the loop cannot leak.
  useEffect(() => stopRaf, [stopRaf]);

  // ------------------------------------------------------------------
  // COMMITTED LAYER — pure function of `committed`, drawn with no frames
  // ------------------------------------------------------------------
  const drawn = useMemo(() => {
    const counts = new Map<number, number>();
    const kinds = new Map<number, JourneyKind>();
    for (let i = 0; i < Math.min(committed, journeys.length); i++) {
      const j = journeys[i]!;
      // A rejected call and a lost leg return no result, so they draw no edge.
      if (j.kind === 'rejected' || j.kind === 'lost') {
        kinds.set(j.toolIndex, j.kind);
        continue;
      }
      counts.set(j.toolIndex, (counts.get(j.toolIndex) || 0) + 1);
      if (!kinds.has(j.toolIndex)) kinds.set(j.toolIndex, j.kind);
    }
    return { counts, kinds };
  }, [committed, journeys]);

  /** A node never reached stays dim. For a zero-budget decline that is most of them. */
  const reachedTools = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < Math.min(committed, journeys.length); i++) {
      s.add(journeys[i]!.toolIndex);
    }
    return s;
  }, [committed, journeys]);

  const fallbackCommitted = useMemo(
    () =>
      journeys
        .slice(0, committed)
        .some((j) => j.kind === 'fallback'),
    [journeys, committed]
  );

  if (failed) {
    return (
      <div className="w-[430px] shrink-0 border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm text-[#64748B]">
        {FLOW_LABELS.unavailable}
      </div>
    );
  }

  const planner = TOOL_ORDER.indexOf('propose_schedule');

  return (
    <div className="w-[430px] shrink-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Agent tool-call flow"
        style={{ overflow: 'visible' }}
      >
        {/* faint routes, so the shape of the graph reads before anything fires */}
        {TOOL_ORDER.map((name, i) => (
          <path
            key={`route-${name}`}
            d={cubicToD(callPath(i))}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={1}
          />
        ))}

        {/* the fallback route, only once it has been taken */}
        {fallbackCommitted && (
          <path
            d={cubicToD(fallbackPath(planner))}
            fill="none"
            stroke="#B45309"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* COMMITTED EDGES — thicker with each repeat call */}
        {TOOL_ORDER.map((name, i) => {
          const count = drawn.counts.get(i) || 0;
          if (count === 0) return null;
          return (
            <path
              key={`edge-${name}`}
              d={cubicToD(callPath(i))}
              fill="none"
              stroke="#1D4ED8"
              strokeWidth={1 + count * 0.9}
              opacity={0.85}
            />
          );
        })}

        {/* AGENT NODE */}
        <circle cx={AGENT.x} cy={AGENT.y} r={22} fill="#0F172A" />
        <text
          x={AGENT.x}
          y={AGENT.y + 4}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={10}
          fontWeight="bold"
        >
          {FLOW_LABELS.agentNode}
        </text>

        {/* the in-flight particle, the only thing RAF moves */}
        <circle ref={particleRef} r={5} cx={AGENT.x} cy={AGENT.y} fill="#1D4ED8" opacity={0} />

        {/* fallback caption, revealed as that particle travels */}
        <text
          ref={fallbackLabelRef}
          x={AGENT.x + 6}
          y={H - 12}
          fontSize={10}
          fill="#B45309"
          fontWeight="bold"
          opacity={fallbackCommitted ? 1 : 0}
        >
          {FLOW_LABELS.fellBack}
        </text>

        {/* TOOL NODES */}
        {TOOL_ORDER.map((name, i) => {
          const t = toolLabel(name);
          const c = nodeCentre(i);
          const count = drawn.counts.get(i) || 0;
          const kind = drawn.kinds.get(i);
          const reached = reachedTools.has(i);
          const isModel = t.kind === 'model';
          const rejected = kind === 'rejected';

          return (
            <g key={name} opacity={reached ? 1 : 0.3}>
              {/* danger flash sits under the node and is driven by RAF */}
              <circle
                ref={(el) => {
                  flashRefs.current[i] = el;
                }}
                cx={c.x}
                cy={c.y}
                r={NODE_R + 7}
                fill="#DC2626"
                opacity={0}
              />
              <circle
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                cx={c.x}
                cy={c.y}
                r={NODE_R}
                fill={reached ? (rejected ? '#FEE2E2' : '#FFFFFF') : '#F8FAFC'}
                stroke={rejected ? '#DC2626' : isModel ? '#7C3AED' : reached ? '#1D4ED8' : '#CBD5E1'}
                strokeWidth={2}
              />

              {/* The model node is the only one that carries an AI badge. It sits
                  outside the circle so it does not crowd the glyph, and the
                  every-node sub-label below carries the "not AI" for the rest. */}
              {isModel ? (
                <>
                  <rect
                    x={c.x - 43}
                    y={c.y - 8}
                    width={22}
                    height={16}
                    rx={3}
                    fill="#7C3AED"
                  />
                  <text
                    x={c.x - 32}
                    y={c.y + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="bold"
                    fill="#FFFFFF"
                  >
                    {FLOW_LABELS.aiBadge}
                  </text>
                  <circle cx={c.x} cy={c.y} r={5} fill="#7C3AED" />
                </>
              ) : (
                // A plain hollow glyph: ordinary code, no model involved.
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={5}
                  fill="none"
                  stroke={reached ? '#64748B' : '#CBD5E1'}
                  strokeWidth={1.5}
                />
              )}

              {/* call-count badge, only once a tool has been called twice */}
              {count > 1 && (
                <>
                  <circle cx={c.x + 13} cy={c.y - 13} r={9} fill="#1D4ED8" />
                  <text
                    x={c.x + 13}
                    y={c.y - 10}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="bold"
                    fill="#FFFFFF"
                  >
                    {count}
                  </text>
                </>
              )}

              <text x={c.x + 30} y={c.y - 1} fontSize={11} fill="#0F172A" fontWeight={600}>
                {t.label}
              </text>
              <text x={c.x + 30} y={c.y + 12} fontSize={9} fill="#64748B">
                {t.subLabel}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-xs text-[#64748B] mt-2 leading-relaxed">{FLOW_LABELS.caption}</p>
    </div>
  );
}
