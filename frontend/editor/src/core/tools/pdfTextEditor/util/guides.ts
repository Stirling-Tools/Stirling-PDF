// Ruler ticks and per-page guides. Pure and DOM-free so the geometry is
// testable; positions are RAW PDF points, so they survive crop and rotation.

export type GuideAxis = "x" | "y";

/** A guide before it has been assigned an id by the store. */
export interface GuideSeed {
  axis: GuideAxis;
  /** Raw PDF page-space coordinate (points) the guide holds constant. */
  position: number;
}

export interface Guide extends GuideSeed {
  id: string;
}

export interface GuideSnap {
  value: number;
  guide: Guide | null;
}

/** Orientation of a guide once drawn on the rendered (rotated) page. */
export type GuideOrientation = "vertical" | "horizontal";

export interface GuideLine {
  orientation: GuideOrientation;
  /** Display-PDF coordinate (points, y-up, origin at the page's lower-left). */
  position: number;
}

/** Structural slice of `DisplayTransform`, so this module stays model-free. */
export interface GuideTransform {
  apply(x: number, y: number): { x: number; y: number };
  invert(x: number, y: number): { x: number; y: number };
}

/** Smallest on-screen gap between neighbouring ticks, in CSS pixels. */
export const MIN_TICK_SPACING_PX = 6;
/** Smallest on-screen gap between labelled (major) ticks, in CSS pixels. */
export const MIN_LABEL_SPACING_PX = 48;

const AXIS_EPSILON = 1e-6;
const MULTIPLE_EPSILON = 1e-6;
/** Upper bound on ticks per ruler; a huge page at huge zoom widens the step. */
const MAX_TICKS = 4000;
const STEP_LADDER = buildStepLadder();

export interface RulerTick {
  /** Offset along the ruler from the page origin, in PDF points. */
  position: number;
  major: boolean;
  /** Set only on major ticks. */
  label: string | null;
}

export interface RulerScale {
  minorStep: number;
  majorStep: number;
  ticks: RulerTick[];
}

// Ruler ticks at `scale` CSS px per point. The interval climbs a 1/2/5 ladder
// so ticks and labels never crowd below their minimum spacing.
export function rulerTicks(lengthInPoints: number, scale: number): RulerScale {
  if (
    !Number.isFinite(lengthInPoints) ||
    !Number.isFinite(scale) ||
    lengthInPoints <= 0 ||
    scale <= 0
  ) {
    return { minorStep: 0, majorStep: 0, ticks: [] };
  }
  // Floor the step by the tick budget too, so an extreme zoom widens the
  // interval instead of truncating the ruler part-way down the page.
  const budget = lengthInPoints / MAX_TICKS;
  const minorStep = pickStep(scale, MIN_TICK_SPACING_PX, 0, budget);
  const majorStep = pickStep(scale, MIN_LABEL_SPACING_PX, minorStep, budget);
  const decimals = labelDecimals(majorStep);
  const last = Math.floor(lengthInPoints / minorStep + MULTIPLE_EPSILON);
  const ticks: RulerTick[] = [];
  for (let i = 0; i <= last; i += 1) {
    const position = roundStep(i * minorStep);
    const major = isMultipleOf(position, majorStep);
    ticks.push({
      position,
      major,
      label: major ? formatTickLabel(position, decimals) : null,
    });
  }
  return { minorStep, majorStep, ticks };
}

// Snap to the nearest guide within tolerance; ties take the lower id so a drag
// hovering exactly between two guides never flickers.
export function snapToGuides(
  value: number,
  guides: readonly Guide[],
  toleranceInPoints: number,
): GuideSnap {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(toleranceInPoints) ||
    toleranceInPoints < 0
  ) {
    return { value, guide: null };
  }
  let best: Guide | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const guide of guides) {
    if (!Number.isFinite(guide.position)) continue;
    const distance = Math.abs(guide.position - value);
    if (distance > toleranceInPoints) continue;
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && guide.id < best.id)
    ) {
      best = guide;
      bestDistance = distance;
    }
  }
  return best ? { value: best.position, guide: best } : { value, guide: null };
}

/** Where a raw-PDF guide lands on the rendered (cropped/rotated) page. */
export function guideToLine(
  guide: GuideSeed,
  transform: GuideTransform,
): GuideLine {
  const a =
    guide.axis === "x"
      ? transform.apply(guide.position, 0)
      : transform.apply(0, guide.position);
  const b =
    guide.axis === "x"
      ? transform.apply(guide.position, 1)
      : transform.apply(1, guide.position);
  // The linear part is a quarter-turn rotation, so exactly one display
  // coordinate stays constant along the line; that one names the orientation.
  return Math.abs(a.x - b.x) <= AXIS_EPSILON
    ? { orientation: "vertical", position: a.x }
    : { orientation: "horizontal", position: a.y };
}

/** Inverse of `guideToLine`: the raw-PDF guide a drawn line represents. */
export function lineToGuide(
  line: GuideLine,
  transform: GuideTransform,
): GuideSeed {
  const a =
    line.orientation === "vertical"
      ? transform.invert(line.position, 0)
      : transform.invert(0, line.position);
  const b =
    line.orientation === "vertical"
      ? transform.invert(line.position, 1)
      : transform.invert(1, line.position);
  return Math.abs(a.x - b.x) <= AXIS_EPSILON
    ? { axis: "x", position: a.x }
    : { axis: "y", position: a.y };
}

const NO_GUIDES: Guide[] = [];

type GuideListener = (pageIndex: number, guides: Guide[]) => void;

// Per-page guide state with a subscribe channel, shaped like `Selection`.
// Arrays are replaced, never mutated, so subscribers can compare identities.
export class GuideStore {
  private byPage: Map<number, Guide[]> = new Map();
  private listeners: Set<GuideListener> = new Set();
  private counter = 0;

  get(pageIndex: number): Guide[] {
    return this.byPage.get(pageIndex) ?? NO_GUIDES;
  }

  add(pageIndex: number, axis: GuideAxis, position: number): Guide | null {
    if (!Number.isFinite(position)) return null;
    this.counter += 1;
    // Zero-padded so lexicographic id order matches creation order, which is
    // what `snapToGuides` leans on for its tie-break.
    const id = `guide-${String(this.counter).padStart(6, "0")}`;
    const guide: Guide = { id, axis, position };
    this.byPage.set(pageIndex, [...this.get(pageIndex), guide]);
    this.notify(pageIndex);
    return guide;
  }

  move(pageIndex: number, id: string, position: number): void {
    if (!Number.isFinite(position)) return;
    const current = this.get(pageIndex);
    const index = current.findIndex((g) => g.id === id);
    if (index < 0 || current[index].position === position) return;
    const next = current.slice();
    next[index] = { ...current[index], position };
    this.byPage.set(pageIndex, next);
    this.notify(pageIndex);
  }

  remove(pageIndex: number, id: string): void {
    const current = this.get(pageIndex);
    const next = current.filter((g) => g.id !== id);
    if (next.length === current.length) return;
    this.byPage.set(pageIndex, next);
    this.notify(pageIndex);
  }

  clear(pageIndex?: number): void {
    if (pageIndex === undefined) {
      const pages = Array.from(this.byPage.keys());
      this.byPage.clear();
      for (const page of pages) this.notify(page);
      return;
    }
    if (this.get(pageIndex).length === 0) return;
    this.byPage.delete(pageIndex);
    this.notify(pageIndex);
  }

  subscribe(listener: GuideListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(pageIndex: number): void {
    // Snapshot + guard: a subscriber may synchronously unsubscribe others
    // or throw; iterating the live Set would skip listeners or abort early.
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(pageIndex, this.get(pageIndex));
      } catch {
        /* one listener throwing must not stop the rest */
      }
    }
  }
}

/** Shared guide state for the open document; `clear()` on document swap. */
export const pageGuides = new GuideStore();

function buildStepLadder(): number[] {
  const steps: number[] = [];
  for (let exponent = -3; exponent <= 6; exponent += 1) {
    for (const mantissa of [1, 2, 5]) {
      steps.push(roundStep(mantissa * Math.pow(10, exponent)));
    }
  }
  return steps;
}

function pickStep(
  scale: number,
  minPx: number,
  multipleOf: number,
  minStep: number,
): number {
  for (const step of STEP_LADDER) {
    if (step < minStep || step * scale < minPx) continue;
    if (multipleOf > 0 && !isMultipleOf(step, multipleOf)) continue;
    return step;
  }
  return STEP_LADDER[STEP_LADDER.length - 1];
}

function isMultipleOf(value: number, step: number): boolean {
  if (step <= 0) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < MULTIPLE_EPSILON;
}

/** Trim the float noise from `mantissa * 10^e` so ticks compare exactly. */
function roundStep(value: number): number {
  return Number(value.toPrecision(12));
}

function labelDecimals(step: number): number {
  if (step <= 0) return 0;
  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step))));
}

function formatTickLabel(value: number, decimals: number): string {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}
