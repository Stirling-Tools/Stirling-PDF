import type { FlowOutcomeKey } from "@portal/api/processorFlow";

/** Which lens the visualiser is showing. */
export type Lens = "flow" | "sankey";

/**
 * DEV ONLY: force the flow animation on even when nothing is set up / no
 * activity has taken place, using synthetic rates. Off by design — an idle
 * machine shows no animated dots; flip to true only to preview the motion
 * while iterating on an empty workspace.
 */
export const DEV_KEEP_FLOWING = false;

export const EDITOR_TYPE = "editor";

/** Emission tuning: particles/sec for a source ≈ rate / 86400 × SPEED. */
export const SPEED = 300;
/** Synthetic per-source rate used only while DEV_KEEP_FLOWING forces the flow. */
export const DEV_SYNTH_RATE = 320;
/** Hard cap on live particles (matches the reference). */
export const MAX_PARTICLES = 36;
/** No two dots leave the same source within this window (ms). */
export const MIN_EMIT_GAP = 200;

export const ICON_SIZE = "1.125rem";

/** SVG `fill` (a CSS property, so var() resolves per-theme) for each outcome. */
export const OUTCOME_FILL: Record<FlowOutcomeKey, string> = {
  success: "var(--color-green)",
  failed: "var(--color-red)",
};

/* ── Measured geometry ──────────────────────────────────────────────────── */

export interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
  cy: number;
}

export interface Lane {
  key: string;
  cy: number;
  el: HTMLElement;
}

export interface Geo {
  w: number;
  h: number;
  srcs: (Rect | undefined)[];
  outs: (Rect | undefined)[];
  core: Rect | null;
  lanes: Lane[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Particle {
  el: SVGCircleElement;
  src: number;
  out: number;
  lane: string | null;
  phase: 0 | 1 | 2;
  t: number;
  d0: number;
  d1: number;
  d2: number;
  pulsed: boolean;
}

/** Cubic bézier point at t. */
export function cbez(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const m = 1 - t;
  return {
    x:
      m * m * m * a.x +
      3 * m * m * t * b.x +
      3 * m * t * t * c.x +
      t * t * t * d.x,
    y:
      m * m * m * a.y +
      3 * m * m * t * b.y +
      3 * m * t * t * c.y +
      t * t * t * d.y,
  };
}

/** Smoothstep easing used for the in-card lane glide. */
export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Where each source's wire enters the core (spread across its height). */
export function coreEntryY(g: Geo, i: number): number {
  if (!g.core) return 0;
  const n = Math.max(g.srcs.length, 2);
  return g.core.t + 34 + (g.core.b - g.core.t - 68) * (i / (n - 1));
}
