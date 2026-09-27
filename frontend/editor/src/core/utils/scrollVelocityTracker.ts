/**
 * Tracks scroll velocity across the viewport to adapt tile buffer rings.
 * During high-speed scroll scrubs, additional tile rings are buffered ahead
 * to prevent checkerboarding; when scroll settles or idles, rings drop back
 * to minimize tile heap footprint.
 *
 * State is per scroll container: sharing one last-position across the file
 * list, the sidebar, and the viewer corrupts the velocity of all three, and
 * a fast scrub in one must not skew another's reading.
 */

// Untuned starting points, not measurements: sweep them against the
// scroll-churn harness (tile count, bytes, checkerboarding) before treating
// any value as load-bearing.
const VELOCITY_BOOST_PX_PER_S = 1500;
const BOOST_WINDOW_MS = 350;
const MIN_SAMPLE_DT_MS = 10;
const MAX_SAMPLE_DT_MS = 250;

interface ScrollSample {
  top: number;
  time: number;
}

const samples = new WeakMap<EventTarget, ScrollSample>();
let boostUntil = 0;
let listenerAttached = false;

function onScrollCapture(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const top = target.scrollTop;
  const now = performance.now();
  const prev = samples.get(target);
  samples.set(target, { top, time: now });
  if (!prev) return;
  const dt = now - prev.time;
  if (dt > MIN_SAMPLE_DT_MS && dt < MAX_SAMPLE_DT_MS) {
    const velocity = (Math.abs(top - prev.top) / dt) * 1000;
    if (velocity > VELOCITY_BOOST_PX_PER_S) {
      boostUntil = now + BOOST_WINDOW_MS;
    }
  }
}

export function initScrollVelocityTracker(): void {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("scroll", onScrollCapture, {
    capture: true,
    passive: true,
  });
}

export function getVelocityAdaptiveExtraRings(baseRings: number): number {
  if (baseRings <= 0) return 0;
  if (typeof performance !== "undefined" && performance.now() < boostUntil) {
    return Math.min(2, baseRings + 1);
  }
  return baseRings;
}
