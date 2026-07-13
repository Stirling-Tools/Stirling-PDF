import { useEffect, useRef, type RefObject } from "react";
import type { FlowOutcomeKey } from "@portal/api/processorFlow";
import {
  cbez,
  coreEntryY,
  smooth,
  MAX_PARTICLES,
  MIN_EMIT_GAP,
  OUTCOME_FILL,
  SPEED,
  type Geo,
  type Lens,
  type Particle,
  type Point,
} from "@portal/components/processor-flow/flowTypes";

interface FlowParticlesOptions {
  geoRef: RefObject<Geo | null>;
  animate: boolean;
  lens: Lens;
  /** Per-source emission rate (docs/24h, or synthetic while dev-forcing). */
  rates: number[];
  /** Outcome share for the weighted round-robin destination picker. */
  weights: number[];
  /** Policy lane keys a dot may thread through the core. */
  laneKeys: string[];
  /** Outcome keys, index-aligned with `weights`, for recolouring on arrival. */
  outcomeKeys: FlowOutcomeKey[];
}

/**
 * Drives the rAF particle loop: emits dots per source on a jittered schedule
 * (min-gap floored), routes each to an outcome via a weighted round-robin so
 * the split matches the counts, threads it through a policy lane (blinking that
 * row's LED), and recolours it to the outcome on arrival. Reads geometry live
 * from `geoRef`, so it tracks card movement without restarting.
 *
 * Returns the `<g>` ref the caller mounts inside the particle overlay `<svg>`.
 * The loop only runs on the flow lens, when `animate` is set, and outside
 * reduced-motion; browsers pause rAF for hidden tabs (desirable).
 */
export function useFlowParticles({
  geoRef,
  animate,
  lens,
  rates,
  weights,
  laneKeys,
  outcomeKeys,
}: FlowParticlesOptions): RefObject<SVGGElement | null> {
  const pGroupRef = useRef<SVGGElement>(null);

  // Restart the loop only when the meaningful inputs change.
  const flowSig = [
    animate,
    lens,
    rates.join(","),
    laneKeys.join(","),
    weights.map((w) => w.toFixed(3)).join(","),
    outcomeKeys.join(","),
  ].join("|");

  useEffect(() => {
    if (!animate || lens !== "flow") return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const pg = pGroupRef.current;
    if (!pg) return;
    const NS = "http://www.w3.org/2000/svg";

    const particles: Particle[] = [];
    let last = performance.now();
    let raf = 0;
    const glowTimers: Record<string, ReturnType<typeof setTimeout>> = {};

    // Per-source emission schedule. Mean interval keeps each source's share of
    // the flow proportional to its rate; the scheduled model (vs. a steady
    // accumulator) is what lets us jitter departures and floor the gap.
    const meanInterval = rates.map((r) => {
      const perSec = (r / 86400) * SPEED;
      return perSec > 0 ? 1000 / perSec : Infinity;
    });
    // Stagger the first emission so sources don't all fire together at t=0.
    const nextEmit = meanInterval.map((mi) =>
      Number.isFinite(mi) ? last + Math.random() * mi : Infinity,
    );
    // Random departure within [0.5×, 1.5×] the mean, but never closer than the
    // minimum gap — a random flow with no two dots out at once per source.
    const scheduleNext = (i: number, now: number): number =>
      now + Math.max(MIN_EMIT_GAP, meanInterval[i] * (0.5 + Math.random()));

    // Weighted round-robin so the outcome split visibly matches the counts
    // (e.g. 3 failed / 30 delivered → ~1 in 11 dots to Failed), interleaved
    // rather than clustered like independent random draws.
    const outAcc = weights.map(() => 0);
    const pickOut = (): number => {
      if (!weights.length) return 0;
      for (let j = 0; j < weights.length; j++) outAcc[j] += weights[j];
      let best = 0;
      for (let j = 1; j < weights.length; j++) {
        if (outAcc[j] > outAcc[best]) best = j;
      }
      outAcc[best] -= 1;
      return best;
    };
    const pickLane = (): string | null => {
      if (!laneKeys.length) return null;
      return laneKeys[Math.floor(Math.random() * laneKeys.length)];
    };
    const laneY = (g: Geo, key: string | null): number | null => {
      if (!key) return null;
      const l = g.lanes.find((x) => x.key === key);
      return l ? l.cy : null;
    };
    // Blink the row's leading LED (its icon) for 150ms as a particle threads it.
    const pulseLane = (g: Geo, key: string | null) => {
      if (!key) return;
      const lane = g.lanes.find((x) => x.key === key);
      const led = lane?.el.firstElementChild;
      if (!led || !led.classList.contains("portal-pf__policy-icon")) return;
      led.classList.add("is-pulse");
      if (glowTimers[key]) clearTimeout(glowTimers[key]);
      glowTimers[key] = setTimeout(() => led.classList.remove("is-pulse"), 150);
    };

    const frame = (now: number) => {
      const g = geoRef.current;
      const dt = Math.min(now - last, 200);
      last = now;
      if (g && g.core) {
        // At most one dot per source per frame, once its scheduled (jittered)
        // departure time is reached — guarantees the per-source minimum gap.
        for (let i = 0; i < meanInterval.length; i++) {
          if (!Number.isFinite(meanInterval[i]) || !g.srcs[i]) continue;
          if (now >= nextEmit[i] && particles.length < MAX_PARTICLES) {
            const c = document.createElementNS(
              NS,
              "circle",
            ) as SVGCircleElement;
            c.setAttribute("r", "2.5");
            c.setAttribute("opacity", "0.75");
            c.style.fill = "var(--color-blue)";
            pg.appendChild(c);
            particles.push({
              el: c,
              src: i,
              out: pickOut(),
              lane: pickLane(),
              phase: 0,
              t: 0,
              d0: 900 + Math.random() * 300,
              d1: 760,
              d2: 780 + Math.random() * 200,
              pulsed: false,
            });
            nextEmit[i] = scheduleNext(i, now);
          }
        }

        for (let k = particles.length - 1; k >= 0; k--) {
          const p = particles[k];
          p.t += dt;
          const s = g.srcs[p.src];
          if (!s) {
            p.el.remove();
            particles.splice(k, 1);
            continue;
          }
          let pos: Point;
          if (p.phase === 0) {
            const ey = coreEntryY(g, p.src);
            const f0 = Math.min(1, p.t / p.d0);
            pos = cbez(
              { x: s.r, y: s.cy },
              { x: s.r + 44, y: s.cy },
              { x: g.core.l - 44, y: ey },
              { x: g.core.l, y: ey },
              f0,
            );
            if (f0 >= 1) {
              p.phase = 1;
              p.t = 0;
              p.pulsed = false;
              p.el.setAttribute("r", "2");
              p.el.setAttribute("opacity", "0.45");
            }
          } else if (p.phase === 1) {
            const o1 = g.outs[p.out];
            if (!o1) {
              p.el.remove();
              particles.splice(k, 1);
              continue;
            }
            const f1 = Math.min(1, p.t / p.d1);
            const entY = coreEntryY(g, p.src);
            const exitY = o1.cy;
            const ly1 = laneY(g, p.lane);
            let yy: number;
            if (ly1 == null) {
              yy = entY + (exitY - entY) * f1;
            } else if (f1 < 0.25) {
              yy = entY + (ly1 - entY) * smooth(f1 / 0.25);
            } else if (f1 < 0.75) {
              yy = ly1;
              if (!p.pulsed) {
                p.pulsed = true;
                pulseLane(g, p.lane);
              }
            } else {
              yy = ly1 + (exitY - ly1) * smooth((f1 - 0.75) / 0.25);
            }
            pos = { x: g.core.l + (g.core.r - g.core.l) * f1, y: yy };
            if (f1 >= 1) {
              p.phase = 2;
              p.t = 0;
              p.el.style.fill =
                OUTCOME_FILL[outcomeKeys[p.out]] ?? "var(--color-blue)";
              p.el.setAttribute("r", "2.5");
              p.el.setAttribute("opacity", "0.75");
            }
          } else {
            const o2 = g.outs[p.out];
            if (!o2) {
              p.el.remove();
              particles.splice(k, 1);
              continue;
            }
            const f2 = Math.min(1, p.t / p.d2);
            pos = cbez(
              { x: g.core.r, y: o2.cy },
              { x: g.core.r + 44, y: o2.cy },
              { x: o2.l - 44, y: o2.cy },
              { x: o2.l, y: o2.cy },
              f2,
            );
            if (f2 >= 1) {
              p.el.remove();
              particles.splice(k, 1);
              continue;
            }
          }
          p.el.setAttribute("cx", String(pos.x));
          p.el.setAttribute("cy", String(pos.y));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      Object.values(glowTimers).forEach(clearTimeout);
      while (pg.firstChild) pg.removeChild(pg.firstChild);
    };
  }, [flowSig, geoRef]);

  return pGroupRef;
}
