import { useEffect, useRef, type RefObject } from "react";
import type { FlowOutcomeKey } from "@portal/api/processorFlow";
import {
  cbez,
  coreEntryY,
  smooth,
  EMIT_DIVISOR,
  EMIT_SPREAD_CAP,
  MAX_EMIT_PER_SEC,
  MAX_PARTICLES,
  MIN_EMIT_GAP,
  OUTCOME_FILL,
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

/** rAF particle loop: emits jittered dots per source, routes each to an outcome by
 *  weighted round-robin through a policy lane. Returns the overlay `<g>` ref. */
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

    // Per-source dots/sec: ~linear with volume, capped at MAX_EMIT_PER_SEC.
    // Scheduled (not accumulated) so we can jitter departures and floor the gap.
    const rawPerSec = rates.map((r) =>
      r > 0 ? Math.min(MAX_EMIT_PER_SEC, r / EMIT_DIVISOR) : 0,
    );
    // Bound the spread: the busiest source emits at most EMIT_SPREAD_CAP× the
    // quietest, so a dominant source can't starve the others.
    const busiest = Math.max(0, ...rawPerSec);
    const floorPerSec = busiest / EMIT_SPREAD_CAP;
    const meanInterval = rawPerSec.map((p) =>
      p > 0 ? 1000 / Math.max(p, floorPerSec) : Infinity,
    );
    // Stagger the first emission so sources don't all fire together at t=0.
    const nextEmit = meanInterval.map((mi) =>
      Number.isFinite(mi) ? last + Math.random() * mi : Infinity,
    );
    // Random departure within [0.4×, 1.7×] the mean, but never closer than the
    // minimum gap — a scattered flow with no two dots out at once per source.
    const scheduleNext = (i: number, now: number): number =>
      now +
      Math.max(MIN_EMIT_GAP, meanInterval[i] * (0.4 + Math.random() * 1.3));

    // Weighted round-robin so the outcome split matches the counts, evenly
    // interleaved (e.g. 3 failed / 30 delivered → ~1 in 11 dots to Failed).
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
            c.style.fill = "var(--c-primary)";
            pg.appendChild(c);
            particles.push({
              el: c,
              src: i,
              out: pickOut(),
              lane: pickLane(),
              phase: 0,
              t: 0,
              // Faster travel than before (~2× quicker) so the flow reads lively.
              d0: 460 + Math.random() * 220,
              d1: 380,
              d2: 400 + Math.random() * 200,
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
            } else {
              // Pulse once on reaching the lane — even if a slow frame overshoots
              // the 0.25–0.75 window straight into the glide-out segment.
              if (!p.pulsed) {
                p.pulsed = true;
                pulseLane(g, p.lane);
              }
              yy =
                f1 < 0.75
                  ? ly1
                  : ly1 + (exitY - ly1) * smooth((f1 - 0.75) / 0.25);
            }
            pos = { x: g.core.l + (g.core.r - g.core.l) * f1, y: yy };
            if (f1 >= 1) {
              p.phase = 2;
              p.t = 0;
              p.el.style.fill =
                OUTCOME_FILL[outcomeKeys[p.out]] ?? "var(--c-primary)";
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
