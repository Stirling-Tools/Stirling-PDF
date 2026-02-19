import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer } from '@app/contexts/ViewerContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

/**
 * A point anchored to a specific PDF page in PDF-unit space.
 * x and y are in PDF points (1/72 inch) relative to the page's top-left corner.
 *
 * This is the only truly zoom-invariant representation. Screen positions are
 * recovered at render time via getBoundingClientRect on the page element, so
 * scroll, zoom, and fixed page margins are all handled by the browser — we never
 * have to track them ourselves.
 */
interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  start: PagePoint;
  end: PagePoint;
}

export interface RulerOverlayHandle {
  clearAll: () => void;
}

interface RulerOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  pageMeasureScales?: PageMeasureScales | null;
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function perpUnit(a: Point, b: Point): { nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

/** Angle from horizontal 0°–90°. Computed from screen-space points (same angle as PDF space). */
function angleDeg(a: Point, b: Point): number {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * (180 / Math.PI);
}

function formatDist(pts: number): string {
  const mm = (pts / 72) * 25.4;
  if (mm < 100)  return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 1000).toFixed(2)} m`;
}

function formatInches(pts: number): string {
  const inches = pts / 72;
  if (inches < 12) return `${inches.toFixed(2)} in`;
  return `${(inches / 12).toFixed(2)} ft`;
}

export interface MeasureScale {
  /** real_world_value = pdf_points * factor */
  factor: number;
  /** e.g. "ft", "m" */
  unit: string;
  /** Human-readable ratio from PDF, e.g. "1 in = 10 ft" */
  ratioLabel: string;
}

export interface ViewportScale {
  /** BBox in PDF user space (bottom-left origin). null = entire page. */
  bbox: [number, number, number, number] | null;
  scale: MeasureScale;
}

export interface PageScaleInfo {
  viewports: ViewportScale[];
  /** Page height in PDF points — used to flip screen-y (top=0) to PDF-y (bottom=0). */
  pageHeight: number;
}

export type PageMeasureScales = Map<number, PageScaleInfo>;

/**
 * Given the start/end PagePoints of a measurement, find the scale from the
 * viewport whose BBox contains the midpoint. Falls back to the first viewport
 * if none contains it (handles whole-page viewports with bbox=null).
 */
function pickScale(
  start: PagePoint,
  end: PagePoint,
  pageMeasureScales: PageMeasureScales,
): MeasureScale | null {
  if (start.pageIndex !== end.pageIndex) return null;
  const info = pageMeasureScales.get(start.pageIndex);
  if (!info?.viewports.length) return null;

  // Midpoint in screen-space page coords (x left→right, y top→bottom, PDF points)
  const mx = (start.x + end.x) / 2;
  // Flip y: screen y=0 is page top; PDF user space y=0 is page bottom
  const my = info.pageHeight - (start.y + end.y) / 2;

  for (const { bbox, scale } of info.viewports) {
    if (!bbox) return scale; // whole-page viewport
    const [x0, y0, x1, y1] = bbox;
    if (mx >= Math.min(x0, x1) && mx <= Math.max(x0, x1) &&
        my >= Math.min(y0, y1) && my <= Math.max(y0, y1)) {
      return scale;
    }
  }
  return null;
}

function formatScaled(pts: number, scale: MeasureScale): string {
  const val = pts * scale.factor;
  if (val >= 1000) return `${val.toFixed(0)} ${scale.unit}`;
  if (val >= 100)  return `${val.toFixed(1)} ${scale.unit}`;
  if (val >= 10)   return `${val.toFixed(2)} ${scale.unit}`;
  return `${val.toFixed(3)} ${scale.unit}`;
}

// Conversion factors to metres for known units
const TO_METRES: Record<string, number> = {
  m: 1, cm: 0.01, mm: 0.001, km: 1000,
  ft: 0.3048, in: 0.0254, yd: 0.9144, mi: 1609.344,
};

function isImperialUnit(unit: string): boolean {
  return ['ft', 'in', 'yd', 'mi'].includes(unit.toLowerCase().trim());
}

function formatMetricFromMetres(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 1)    return `${m.toFixed(1)} m`;
  if (m >= 0.1)  return `${(m * 100).toFixed(1)} cm`;
  return `${(m * 1000).toFixed(1)} mm`;
}

function formatImperialFromFeet(ft: number): string {
  if (ft >= 1) return `${ft.toFixed(2)} ft`;
  return `${(ft * 12).toFixed(2)} in`;
}

/**
 * Returns the scaled real-world value in the *other* unit system, or null if
 * the unit is not a recognised metric/imperial unit.
 * e.g. 72 pts, scale {factor:0.138889, unit:"ft"} → "3.048 m"
 *      72 pts, scale {factor:0.352778, unit:"m"}  → "1.157 ft" (approx)
 */
function scaledCross(pts: number, scale: MeasureScale): string | null {
  const toM = TO_METRES[scale.unit.toLowerCase().trim()];
  if (!toM) return null;
  const metres = pts * scale.factor * toM;
  return isImperialUnit(scale.unit)
    ? formatMetricFromMetres(metres)
    : formatImperialFromFeet(metres / 0.3048);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function findScrollEl(root: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if (el === root) continue;
    const { overflow, overflowY, overflowX } = window.getComputedStyle(el);
    if ([overflow, overflowY, overflowX].some(v => v === 'auto' || v === 'scroll')) {
      return el;
    }
  }
  return null;
}

function isOverPage(e: MouseEvent): boolean {
  return !!(e.target as Element).closest?.('[data-page-index]');
}

/**
 * Find the nearest point on any page boundary and return it as both
 * an SVG screen coordinate and a PagePoint (page-relative PDF units).
 * Used to clamp the live line when the cursor drifts off the page.
 */
function nearestPageDocPt(
  cursor: Point,
  container: HTMLElement,
  zoom: number,
): { screenPt: Point; docPt: PagePoint } | null {
  const pages = container.querySelectorAll('[data-page-index]');
  if (!pages.length) return null;

  const cr = container.getBoundingClientRect();
  let bestDist = Infinity;
  let best: { screenPt: Point; docPt: PagePoint } | null = null;

  pages.forEach(pageNode => {
    const pageEl = pageNode as HTMLElement;
    const r = pageEl.getBoundingClientRect();
    const pageIndex = parseInt(pageEl.dataset.pageIndex ?? '0', 10);

    // Page bounds in SVG (container-relative) space
    const left   = r.left   - cr.left;
    const top    = r.top    - cr.top;
    const right  = r.right  - cr.left;
    const bottom = r.bottom - cr.top;

    // Nearest point on this rect to the cursor (SVG space)
    const cx = Math.max(left, Math.min(right,  cursor.x));
    const cy = Math.max(top,  Math.min(bottom, cursor.y));
    const d  = Math.sqrt((cursor.x - cx) ** 2 + (cursor.y - cy) ** 2);

    if (d < bestDist) {
      bestDist = d;
      // Convert SVG-space point (cx, cy) → page-relative viewport → PDF points:
      //   viewport position of cx = cr.left + cx
      //   page-relative position  = (cr.left + cx) - r.left
      //   PDF units               = page-relative / zoom
      best = {
        screenPt: { x: cx, y: cy },
        docPt: {
          pageIndex,
          x: (cr.left + cx - r.left) / zoom,
          y: (cr.top  + cy - r.top ) / zoom,
        },
      };
    }
  });

  return best;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TICK = 10;
const DOT_R = 5;
const LH  = 26;   // label height (normal — 1 line)
const LH2 = 44;   // label height (hovered, no scale — 2 lines)
const LH3 = 62;   // label height (hovered, with scale — 3 lines)
const LP  = 10;   // label horizontal padding
const DEL_R = 8;

interface MeasurementLineProps {
  id: string;
  startS: Point;
  endS: Point;
  /** Physical distance in PDF points (= screen pixel distance / zoom). */
  distPts: number;
  hovered: boolean;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
  measureScale?: MeasureScale | null;
}

function MeasurementLine({ id, startS, endS, distPts, hovered, onDelete, onHover, measureScale }: MeasurementLineProps) {
  const mid = midpoint(startS, endS);
  const { nx, ny } = perpUnit(startS, endS);
  const ang = angleDeg(startS, endS);
  const angLabel = `∠ ${ang.toFixed(1)}°`;

  // Whether the PDF's unit is imperial — determines display order (imperial-first vs metric-first)
  const imperialFirst = !!measureScale && isImperialUnit(measureScale.unit);

  // Idle: scaled primary if scale present, else physical metric
  const distLabel = measureScale ? formatScaled(distPts, measureScale) : formatDist(distPts);

  // Hover line 1 — both real-world values ordered by PDF unit system:
  //   imperial PDF: "10.000 ft / 3.048 m"
  //   metric PDF:   "142.5 m / 467.5 ft"
  //   no scale:     "25.4 mm / 1.00 in"  (metric first, default)
  const hoverLine1 = measureScale
    ? (() => {
        const primary  = formatScaled(distPts, measureScale);
        const cross    = scaledCross(distPts, measureScale);
        return cross ? `${primary} / ${cross}` : primary;
      })()
    : `${formatDist(distPts)} / ${formatInches(distPts)}`;

  // Hover line 2 — both physical paper values, same order as line 1:
  //   imperial PDF: "1.00 in / 25.4 mm"
  //   metric PDF or no scale: "25.4 mm / 1.00 in"
  const hoverLine2 = measureScale
    ? (imperialFirst
        ? `${formatInches(distPts)} / ${formatDist(distPts)}`
        : `${formatDist(distPts)} / ${formatInches(distPts)}`)
    : null;

  // Hover line 3 (scaled) / line 2 (no scale) — ratio label + angle
  const contextLabel = measureScale?.ratioLabel
    ? `${measureScale.ratioLabel}   ${angLabel}`
    : angLabel;

  const maxHoverLh = measureScale ? LH3 : LH2;
  const lh = hovered ? maxHoverLh : LH;

  const lwNormal = Math.max(distLabel.length * 8 + LP * 2, 80);
  const lwHover  = Math.max(
    hoverLine1.length * 8 + LP * 2,
    (hoverLine2?.length ?? 0) * 8 + LP * 2,
    contextLabel.length * 8 + LP * 2,
    80,
  );
  const lw = hovered ? lwHover : lwNormal;
  const sw = hovered ? 3 : 2;

  const delX = mid.x + lwHover / 2 + DEL_R + 4;
  const delY = mid.y;

  const hitLeft   = mid.x - lwHover / 2 - 4;
  const hitTop    = mid.y - maxHoverLh / 2 - 4;
  const hitWidth  = (delX + DEL_R + 4) - hitLeft;
  const hitHeight = maxHoverLh + 8;

  const mono = "'Roboto Mono','Consolas',monospace";

  return (
    <g
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      style={{ pointerEvents: 'all' }}
    >
      <rect x={hitLeft} y={hitTop} width={hitWidth} height={hitHeight}
        fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} />

      <line x1={startS.x} y1={startS.y} x2={endS.x} y2={endS.y}
        stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      <line x1={startS.x + nx * TICK / 2} y1={startS.y + ny * TICK / 2}
            x2={startS.x - nx * TICK / 2} y2={startS.y - ny * TICK / 2}
            stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      <line x1={endS.x + nx * TICK / 2} y1={endS.y + ny * TICK / 2}
            x2={endS.x - nx * TICK / 2} y2={endS.y - ny * TICK / 2}
            stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      <circle cx={startS.x} cy={startS.y} r={DOT_R} fill="#1e88e5" stroke="white" strokeWidth={2} />
      <circle cx={endS.x} cy={endS.y} r={DOT_R} fill="#1e88e5" stroke="white" strokeWidth={2} />

      <g style={{ pointerEvents: 'all', cursor: 'default' }}>
        <rect x={mid.x - lw / 2} y={mid.y - lh / 2} width={lw} height={lh}
          rx={5} fill="white" stroke="#1e88e5" strokeWidth={1.5} filter="url(#ruler-shadow)" />

        {hovered && measureScale ? (
          // 3-line scaled hover
          <>
            <text x={mid.x} y={mid.y - 17} textAnchor="middle" dominantBaseline="middle"
              fill="#1e88e5" fontSize={12} fontFamily={mono} fontWeight={600}
              style={{ userSelect: 'none' }}>{hoverLine1}</text>
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle"
              fill="#546e7a" fontSize={11} fontFamily={mono} fontWeight={500}
              style={{ userSelect: 'none' }}>{hoverLine2}</text>
            <text x={mid.x} y={mid.y + 17} textAnchor="middle" dominantBaseline="middle"
              fill="#5c6bc0" fontSize={10} fontFamily={mono} fontWeight={500}
              style={{ userSelect: 'none' }}>{contextLabel}</text>
          </>
        ) : hovered ? (
          // 2-line no-scale hover
          <>
            <text x={mid.x} y={mid.y - 6} textAnchor="middle" dominantBaseline="middle"
              fill="#1e88e5" fontSize={12} fontFamily={mono} fontWeight={600}
              style={{ userSelect: 'none' }}>{hoverLine1}</text>
            <text x={mid.x} y={mid.y + 13} textAnchor="middle" dominantBaseline="middle"
              fill="#5c6bc0" fontSize={11} fontFamily={mono} fontWeight={500}
              style={{ userSelect: 'none' }}>{contextLabel}</text>
          </>
        ) : (
          // Idle — single line
          <text x={mid.x} y={mid.y + 1} textAnchor="middle" dominantBaseline="middle"
            fill="#1e88e5" fontSize={12} fontFamily={mono} fontWeight={600}
            style={{ userSelect: 'none' }}>{distLabel}</text>
        )}

        <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onDelete(id); }}>
          <circle cx={delX} cy={delY} r={DEL_R} fill="#ef5350" stroke="white" strokeWidth={1.5} />
          <text x={delX} y={delY} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={12} fontWeight={700} style={{ userSelect: 'none' }}>×</text>
        </g>
      </g>
    </g>
  );
}

interface LiveLineProps {
  startS: Point;
  endS: Point;
  zoom: number;
  measureScale?: MeasureScale | null;
}

function LiveLine({ startS, endS, zoom, measureScale }: LiveLineProps) {
  const d = dist(startS, endS) / zoom; // PDF points from screen distance
  const mid = midpoint(startS, endS);
  const { nx, ny } = perpUnit(startS, endS);
  const ang = angleDeg(startS, endS);
  const distLabel = measureScale ? formatScaled(d, measureScale) : formatDist(d);
  const lw = Math.max(distLabel.length * 8 + LP * 2, 80);

  return (
    <g>
      <line x1={startS.x} y1={startS.y} x2={endS.x} y2={endS.y}
        stroke="#1e88e5" strokeWidth={2} strokeDasharray="7 4"
        strokeLinecap="round" opacity={0.85} />
      <line x1={startS.x + nx * TICK / 2} y1={startS.y + ny * TICK / 2}
            x2={startS.x - nx * TICK / 2} y2={startS.y - ny * TICK / 2}
            stroke="#1e88e5" strokeWidth={2} strokeLinecap="round" />
      {d > 4 && (
        <g>
          <rect x={mid.x - lw / 2} y={mid.y - LH2 / 2} width={lw} height={LH2}
            rx={5} fill="#1e88e5" stroke="white" strokeWidth={1} />
          <text x={mid.x} y={mid.y - 6}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={12}
            fontFamily="'Roboto Mono','Consolas',monospace" fontWeight={600}
            style={{ userSelect: 'none' }}>
            {distLabel}
          </text>
          <text x={mid.x} y={mid.y + 13}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.85)" fontSize={11}
            fontFamily="'Roboto Mono','Consolas',monospace" fontWeight={500}
            style={{ userSelect: 'none' }}>
            {`∠ ${ang.toFixed(1)}°`}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export const RulerOverlay = React.forwardRef<RulerOverlayHandle, RulerOverlayProps>(
  ({ containerRef, isActive, pageMeasureScales }, ref) => {
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [firstPt, setFirstPt] = useState<PagePoint | null>(null);
    /** Current cursor in SVG screen-space — for live crosshair and live line rendering. */
    const [cursorS, setCursorS] = useState<Point | null>(null);
    /** Current cursor in page-relative PDF units — for finalising off-page clicks. */
    const [cursorDoc, setCursorDoc] = useState<PagePoint | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    /**
     * Incremented on scroll to trigger re-renders.
     * We no longer store the scroll value — getBoundingClientRect handles that
     * automatically and is always accurate regardless of scroll position.
     */
    const [, setScrollVersion] = useState(0);

    const scrollElRef = useRef<HTMLElement | null>(null);
    const scrollCleanupRef = useRef<(() => void) | null>(null);
    const idCounter = useRef(0);

    const firstPtRef = useRef<PagePoint | null>(null);
    useEffect(() => { firstPtRef.current = firstPt; }, [firstPt]);

    const cursorDocRef = useRef<PagePoint | null>(null);

    // ── Zoom ──────────────────────────────────────────────────────────────────
    const viewer = useViewer();
    const { registerImmediateZoomUpdate } = viewer;

    const [zoom, setZoom] = useState<number>(() => {
      try { return ((viewer.getZoomState() as any)?.zoomPercent ?? 140) / 100; }
      catch { return 1.4; }
    });

    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
      return registerImmediateZoomUpdate((pct) => {
        const newZoom = pct / 100;
        zoomRef.current = newZoom; // immediate for event-listener closures
        setZoom(newZoom);          // re-render #1: zoom updated, but PDF.js DOM may not be yet
        // re-render #2: after PDF.js has updated page element dimensions in the DOM,
        // so getBoundingClientRect returns the correct positions for the new zoom level.
        requestAnimationFrame(() => setScrollVersion(n => n + 1));
      });
    }, [registerImmediateZoomUpdate]);

    // ── Scroll tracking ────────────────────────────────────────────────────────
    // We only need re-renders on scroll; getBoundingClientRect gives us accurate
    // positions without needing to know the scroll offset ourselves.

    const attachScrollEl = useCallback((el: HTMLElement) => {
      scrollCleanupRef.current?.();
      scrollElRef.current = el;
      const handler = () => setScrollVersion(n => n + 1);
      el.addEventListener('scroll', handler, { passive: true });
      scrollCleanupRef.current = () => el.removeEventListener('scroll', handler);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const tryAttach = () => {
        const el = findScrollEl(container);
        if (el) { attachScrollEl(el); return true; }
        return false;
      };

      if (!tryAttach()) {
        const timer = setTimeout(() => tryAttach(), 600);
        return () => { clearTimeout(timer); scrollCleanupRef.current?.(); };
      }
      return () => scrollCleanupRef.current?.();
    }, [containerRef, attachScrollEl]);

    // Re-find scroll element when zoom changes (PDF.js may recreate the scroll DOM).
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const el = findScrollEl(container);
      if (el && el !== scrollElRef.current) attachScrollEl(el);
    }, [zoom, containerRef, attachScrollEl]);

    // ── Imperative handle ──────────────────────────────────────────────────────
    React.useImperativeHandle(ref, () => ({
      clearAll: () => { setMeasurements([]); setFirstPt(null); setCursorS(null); setCursorDoc(null); },
    }));

    // ── Reset when deactivated ─────────────────────────────────────────────────
    useEffect(() => {
      if (!isActive) { setFirstPt(null); setCursorS(null); setCursorDoc(null); }
    }, [isActive]);

    // ── Mouse events ───────────────────────────────────────────────────────────
    useEffect(() => {
      const el = containerRef.current;
      if (!isActive || !el) return;

      const toScreenPt = (e: MouseEvent): Point => {
        const r = el.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      /**
       * Convert a mouse event to a page-relative PagePoint.
       * Returns null if the cursor is not directly over a page element.
       */
      const toDocPagePt = (e: MouseEvent): PagePoint | null => {
        const pageEl = (e.target as Element).closest?.('[data-page-index]') as HTMLElement | null;
        if (!pageEl) return null;
        const pageIndex = parseInt(pageEl.dataset.pageIndex ?? '0', 10);
        const r = pageEl.getBoundingClientRect();
        const z = zoomRef.current;
        return { pageIndex, x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
      };

      const clearCursor = () => {
        setCursorS(null);
        setCursorDoc(null);
        cursorDocRef.current = null;
      };

      const onMove = (e: MouseEvent) => {
        const screenPt = toScreenPt(e);

        if (isOverPage(e)) {
          el.style.cursor = 'crosshair';
          const docPt = toDocPagePt(e);
          setCursorS(screenPt);
          setCursorDoc(docPt);
          cursorDocRef.current = docPt;
        } else if (firstPtRef.current !== null) {
          // First point placed, cursor wandered off page — clamp to nearest edge
          el.style.cursor = 'crosshair';
          const result = nearestPageDocPt(screenPt, el, zoomRef.current);
          if (result) {
            setCursorS(result.screenPt);
            setCursorDoc(result.docPt);
            cursorDocRef.current = result.docPt;
          }
        } else {
          el.style.cursor = 'default';
          clearCursor();
        }
      };

      const onClick = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as Element).closest?.('[data-ruler-interactive]')) return;

        const overPage = isOverPage(e);
        if (!overPage && firstPtRef.current === null) return;
        e.preventDefault();

        const dp = overPage ? toDocPagePt(e) : cursorDocRef.current;
        if (!dp) return;

        setFirstPt(prev => {
          if (!prev) { firstPtRef.current = dp; return dp; }
          firstPtRef.current = null;
          const id = `ruler-${++idCounter.current}`;
          setMeasurements(m => [...m, { id, start: prev, end: dp }]);
          return null;
        });
      };

      const onLeave = () => {
        el.style.cursor = '';
        if (firstPtRef.current === null) clearCursor();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { setFirstPt(null); setCursorS(null); setCursorDoc(null); }
      };

      el.addEventListener('mousemove', onMove);
      el.addEventListener('click', onClick);
      el.addEventListener('mouseleave', onLeave);
      document.addEventListener('keydown', onKey);
      return () => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('click', onClick);
        el.removeEventListener('mouseleave', onLeave);
        document.removeEventListener('keydown', onKey);
        el.style.cursor = '';
      };
    }, [containerRef, isActive]);

    const deleteMeasurement = useCallback((id: string) => {
      setMeasurements(prev => prev.filter(m => m.id !== id));
    }, []);

    if (!isActive && measurements.length === 0) return null;

    // ── PagePoint → SVG screen coordinates ────────────────────────────────────
    /**
     * Convert a page-anchored point to SVG screen coordinates.
     *
     * Uses getBoundingClientRect so the browser computes the exact screen position
     * accounting for scroll, zoom, page margins, centering — everything. This is
     * why we no longer need to track scroll offsets.
     *
     * Returns null if the page element isn't in the DOM (shouldn't happen with
     * PDF.js placeholder divs, but guard anyway).
     */
    const pagePointToScreen = (pt: PagePoint): Point | null => {
      const container = containerRef.current;
      if (!container) return null;
      const pageEl = container.querySelector(`[data-page-index="${pt.pageIndex}"]`) as HTMLElement | null;
      if (!pageEl) return null;
      const pageRect = pageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x: pageRect.left - containerRect.left + pt.x * zoom,
        y: pageRect.top  - containerRect.top  + pt.y * zoom,
      };
    };

    const firstPtS = firstPt ? pagePointToScreen(firstPt) : null;

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
          zIndex: 100,
        }}
      >
        <defs>
          <filter id="ruler-shadow" x="-20%" y="-50%" width="140%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.22)" />
          </filter>
        </defs>

        {/* Completed measurements */}
        {measurements.map(m => {
          const startS = pagePointToScreen(m.start);
          const endS   = pagePointToScreen(m.end);
          if (!startS || !endS) return null;
          const mScale = pageMeasureScales ? pickScale(m.start, m.end, pageMeasureScales) : null;
          return (
            <MeasurementLine
              key={m.id}
              id={m.id}
              startS={startS}
              endS={endS}
              distPts={dist(startS, endS) / zoom}
              hovered={hoveredId === m.id}
              onDelete={deleteMeasurement}
              onHover={setHoveredId}
              measureScale={mScale}
            />
          );
        })}

        {/* Live line while drawing */}
        {isActive && firstPtS && cursorS && (
          <LiveLine
            startS={firstPtS} endS={cursorS} zoom={zoom}
            measureScale={pageMeasureScales && firstPt && cursorDoc
              ? pickScale(firstPt, cursorDoc, pageMeasureScales)
              : null}
          />
        )}

        {/* First-point anchor dot */}
        {isActive && firstPtS && (
          <circle cx={firstPtS.x} cy={firstPtS.y} r={DOT_R} fill="#1e88e5" stroke="white" strokeWidth={2} />
        )}

        {/* Crosshair */}
        {isActive && cursorS && (
          <g opacity={0.75}>
            <line x1={cursorS.x - 12} y1={cursorS.y} x2={cursorS.x + 12} y2={cursorS.y} stroke="#1e88e5" strokeWidth={1.5} />
            <line x1={cursorS.x} y1={cursorS.y - 12} x2={cursorS.x} y2={cursorS.y + 12} stroke="#1e88e5" strokeWidth={1.5} />
            <circle cx={cursorS.x} cy={cursorS.y} r={2} fill="#1e88e5" />
          </g>
        )}

        {/* Clear all */}
        {measurements.length > 0 && (
          <g data-ruler-interactive="true" style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); setMeasurements([]); }}>
            <rect x={8} y={8} width={88} height={26} rx={5}
              fill="rgba(239,83,80,0.9)" stroke="white" strokeWidth={1} />
            <text x={52} y={25} textAnchor="middle" fill="white" fontSize={12}
              fontFamily="sans-serif" fontWeight={600} style={{ userSelect: 'none' }}>
              Clear all
            </text>
          </g>
        )}
      </svg>
    );
  }
);

RulerOverlay.displayName = 'RulerOverlay';
