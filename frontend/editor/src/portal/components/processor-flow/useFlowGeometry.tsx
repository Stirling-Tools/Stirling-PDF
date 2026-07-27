import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  coreEntryY,
  type Geo,
  type Rect,
} from "@portal/components/processor-flow/flowTypes";

/** Measures card edges into a wrapper-relative {@link Geo} and builds the SVG
 *  wires; returns the refs + wires. The particle loop reads the same `geoRef`. */
export function useFlowGeometry() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const srcRefs = useRef<(HTMLElement | null)[]>([]);
  const outRefs = useRef<(HTMLElement | null)[]>([]);
  const coreRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<Record<string, HTMLElement>>({});
  const geoRef = useRef<Geo | null>(null);
  const geoSigRef = useRef("");
  const [, setGeoTick] = useState(0);

  const measure = () => {
    const w = wrapRef.current;
    if (!w) return;
    const wr = w.getBoundingClientRect();
    if (!wr.width) return;
    const rel = (r: DOMRect): Rect => ({
      l: r.left - wr.left,
      r: r.right - wr.left,
      t: r.top - wr.top,
      b: r.bottom - wr.top,
      cy: r.top - wr.top + r.height / 2,
    });
    const g: Geo = {
      w: wr.width,
      h: wr.height,
      srcs: [],
      outs: [],
      core: null,
      lanes: [],
    };
    srcRefs.current.forEach((el, i) => {
      if (el) g.srcs[i] = rel(el.getBoundingClientRect());
    });
    outRefs.current.forEach((el, j) => {
      if (el) g.outs[j] = rel(el.getBoundingClientRect());
    });
    if (coreRef.current) g.core = rel(coreRef.current.getBoundingClientRect());
    Object.entries(laneRefs.current).forEach(([key, el]) => {
      if (el && el.isConnected)
        g.lanes.push({ key, cy: rel(el.getBoundingClientRect()).cy, el });
    });
    geoRef.current = g;

    let cySum = 0;
    g.srcs.forEach((s) => s && (cySum += s.cy));
    g.outs.forEach((o) => o && (cySum += o.cy));
    const sig = [
      Math.round(g.w),
      Math.round(g.h),
      g.srcs.length,
      g.outs.length,
      g.core ? Math.round(g.core.t) + ":" + Math.round(g.core.b) : 0,
      Math.round(cySum),
    ].join(":");
    if (sig !== geoSigRef.current) {
      geoSigRef.current = sig;
      setGeoTick((n) => n + 1);
    }
  };

  useLayoutEffect(measure);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Wires (SVG underlay); recomputed whenever the geometry signature changes.
  const g = geoRef.current;
  let wires: ReactNode = null;
  if (g && g.core) {
    const core = g.core;
    const paths: ReactNode[] = [];
    g.srcs.forEach((s, i) => {
      if (!s) return;
      const ty = coreEntryY(g, i);
      paths.push(
        <path
          key={"ws" + i}
          className="portal-pf__wire-path"
          d={`M ${s.r} ${s.cy} C ${s.r + 44} ${s.cy}, ${core.l - 44} ${ty}, ${core.l} ${ty}`}
        />,
      );
    });
    g.outs.forEach((o, j) => {
      if (!o) return;
      paths.push(
        <path
          key={"wo" + j}
          className="portal-pf__wire-path"
          d={`M ${core.r} ${o.cy} C ${core.r + 44} ${o.cy}, ${o.l - 44} ${o.cy}, ${o.l} ${o.cy}`}
        />,
      );
    });
    wires = paths;
  }

  return { wrapRef, srcRefs, outRefs, coreRef, laneRefs, geoRef, wires };
}
