import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer } from '@app/contexts/ViewerContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  /**
   * Both endpoints in *PDF point space*:
   *   pt = (screenX + scrollLeft) / zoom
   *
   * This is zoom-invariant — the values don't change when the user zooms or
   * scrolls, so measurements always stay anchored to the correct PDF position.
   */
  start: Point;
  end: Point;
}

export interface RulerOverlayHandle {
  clearAll: () => void;
}

interface RulerOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
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

/** Angle from horizontal 0°–90° (0° = flat, 90° = vertical). */
function angleDeg(a: Point, b: Point): number {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * (180 / Math.PI);
}

/**
 * PDF point distance → human-readable mm/cm string.
 * 1 PDF point = 1/72 inch (no zoom factor — we store in point space already).
 */
function formatDist(pts: number): string {
  const mm = (pts / 72) * 25.4;
  if (mm < 100) return `${mm.toFixed(1)} mm`;
  return `${(mm / 10).toFixed(1)} cm`;
}

/** PDF point distance → inches string. */
function formatInches(pts: number): string {
  const inches = pts / 72;
  return `${inches.toFixed(2)} in`;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/** Find the first scrollable descendant of root (the EmbedPDF Viewport div). */
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

/** Returns true when the mouse is over an actual PDF page (not the grey margin). */
function isOverPage(e: MouseEvent): boolean {
  return !!(e.target as Element).closest?.('[data-page-index]');
}

/**
 * Given a cursor position in container-relative screen space, find the nearest
 * point on any visible page boundary. Used to clamp the live line when the
 * cursor drifts off the page after the first anchor is placed.
 */
function nearestPageEdgePoint(cursor: Point, container: HTMLElement): Point | null {
  const pages = container.querySelectorAll('[data-page-index]');
  if (!pages.length) return null;

  const cr = container.getBoundingClientRect();
  let bestDist = Infinity;
  let best: Point | null = null;

  pages.forEach(page => {
    const r = page.getBoundingClientRect();
    // Page rect relative to container
    const left = r.left - cr.left;
    const top = r.top - cr.top;
    const right = r.right - cr.left;
    const bottom = r.bottom - cr.top;

    // Nearest point on this rect to cursor
    const cx = Math.max(left, Math.min(right, cursor.x));
    const cy = Math.max(top, Math.min(bottom, cursor.y));
    const d = Math.sqrt((cursor.x - cx) ** 2 + (cursor.y - cy) ** 2);

    if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
  });

  return best;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TICK = 10;
const DOT_R = 5;
const LH = 26;       // label height (normal)
const LH2 = 44;      // label height (hovered — shows angle too)
const LP = 10;       // label horizontal padding
const DEL_R = 8;

interface MeasurementLineProps {
  measurement: Measurement;
  startS: Point;   // screen-space (already converted)
  endS: Point;
  hovered: boolean;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
}

function MeasurementLine({ measurement, startS, endS, hovered, onDelete, onHover }: MeasurementLineProps) {
  const d = dist(measurement.start, measurement.end); // PDF points — accurate regardless of zoom
  const mid = midpoint(startS, endS);
  const { nx, ny } = perpUnit(startS, endS);
  const ang = angleDeg(measurement.start, measurement.end);
  const distLabel = formatDist(d);
  // On hover show "33.2 mm / 1.31 in" combined, otherwise just mm/cm
  const distHoverLabel = `${formatDist(d)} / ${formatInches(d)}`;
  const angLabel = `∠ ${ang.toFixed(1)}°`;
  const lh = hovered ? LH2 : LH;
  const lw = Math.max(
    hovered
      ? Math.max(distHoverLabel.length, angLabel.length) * 8 + LP * 2
      : distLabel.length * 8 + LP * 2,
    80
  );
  const sw = hovered ? 3 : 2;
  const delX = mid.x + lw / 2 + DEL_R * 0.6;
  const delY = mid.y - lh / 2 - DEL_R * 0.6;

  return (
    <g
      onMouseEnter={() => onHover(measurement.id)}
      onMouseLeave={() => onHover(null)}
      style={{ pointerEvents: 'all' }}
    >
      <line x1={startS.x} y1={startS.y} x2={endS.x} y2={endS.y}
        stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      {/* Tick marks */}
      <line x1={startS.x + nx * TICK / 2} y1={startS.y + ny * TICK / 2}
            x2={startS.x - nx * TICK / 2} y2={startS.y - ny * TICK / 2}
            stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      <line x1={endS.x + nx * TICK / 2} y1={endS.y + ny * TICK / 2}
            x2={endS.x - nx * TICK / 2} y2={endS.y - ny * TICK / 2}
            stroke="#1e88e5" strokeWidth={sw} strokeLinecap="round" />
      {/* Dots */}
      <circle cx={startS.x} cy={startS.y} r={DOT_R} fill="#1e88e5" stroke="white" strokeWidth={2} />
      <circle cx={endS.x} cy={endS.y} r={DOT_R} fill="#1e88e5" stroke="white" strokeWidth={2} />

      {/* Label */}
      <g style={{ pointerEvents: 'all', cursor: 'default' }}>
        <rect x={mid.x - lw / 2} y={mid.y - lh / 2} width={lw} height={lh}
          rx={5} fill="white" stroke="#1e88e5" strokeWidth={1.5} filter="url(#ruler-shadow)" />
        <text x={mid.x} y={hovered ? mid.y - 6 : mid.y + 1}
          textAnchor="middle" dominantBaseline="middle"
          fill="#1e88e5" fontSize={12}
          fontFamily="'Roboto Mono','Consolas',monospace" fontWeight={600}
          style={{ userSelect: 'none' }}>
          {hovered ? distHoverLabel : distLabel}
        </text>
        {hovered && (
          <text x={mid.x} y={mid.y + 13}
            textAnchor="middle" dominantBaseline="middle"
            fill="#5c6bc0" fontSize={11}
            fontFamily="'Roboto Mono','Consolas',monospace" fontWeight={500}
            style={{ userSelect: 'none' }}>
            {angLabel}
          </text>
        )}
        {/* Delete button */}
        <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onDelete(measurement.id); }}>
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
  startDoc: Point;
  endDoc: Point;
}

function LiveLine({ startS, endS, startDoc, endDoc }: LiveLineProps) {
  const d = dist(startDoc, endDoc); // PDF points
  const mid = midpoint(startS, endS);
  const { nx, ny } = perpUnit(startS, endS);
  const ang = angleDeg(startDoc, endDoc);
  const distLabel = formatDist(d);
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
  ({ containerRef, isActive }, ref) => {
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    /** First anchor in PDF point space. */
    const [firstPt, setFirstPt] = useState<Point | null>(null);
    /** Current cursor in *screen space* (container-relative px) — for live crosshair. */
    const [cursorS, setCursorS] = useState<Point | null>(null);
    /** Current cursor in *PDF point space* — for live distance label. */
    const [cursorDoc, setCursorDoc] = useState<Point | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [scrollOffset, setScrollOffset] = useState<Point>({ x: 0, y: 0 });

    const scrollElRef = useRef<HTMLElement | null>(null);
    const idCounter = useRef(0);

    // Refs so event-listener closures always read current values without re-attaching
    const firstPtRef = useRef<Point | null>(null);
    useEffect(() => { firstPtRef.current = firstPt; }, [firstPt]);

    // Latest cursor position in PDF point space (updated in onMove, read in onClick)
    const cursorDocRef = useRef<Point | null>(null);

    // ── Zoom as reactive state ─────────────────────────────────────────────────
    const viewer = useViewer();
    const { registerImmediateZoomUpdate } = viewer;

    const [zoom, setZoom] = useState<number>(() => {
      try { return ((viewer.getZoomState() as any)?.zoomPercent ?? 140) / 100; }
      catch { return 1.4; }
    });

    // Keep a ref so event-listener closures always see the latest zoom
    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
      return registerImmediateZoomUpdate((pct) => setZoom(pct / 100));
    }, [registerImmediateZoomUpdate]);

    // ── Scroll tracking ────────────────────────────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const attach = (el: HTMLElement) => {
        scrollElRef.current = el;
        setScrollOffset({ x: el.scrollLeft, y: el.scrollTop });
        const onScroll = () => setScrollOffset({ x: el.scrollLeft, y: el.scrollTop });
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
      };

      const el = findScrollEl(container);
      if (el) return attach(el);

      // PDF viewer may not be mounted yet — retry once
      const timer = setTimeout(() => {
        const found = findScrollEl(container);
        if (found) attach(found);
      }, 600);
      return () => clearTimeout(timer);
    }, [containerRef]);

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

      /** Screen position relative to the container (matches SVG coordinate space). */
      const toScreenPt = (e: MouseEvent): Point => {
        const r = el.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      /** Convert to PDF point space: add scroll, divide by zoom. */
      const toDocPt = (e: MouseEvent): Point => {
        const r = el.getBoundingClientRect();
        const s = scrollElRef.current;
        const z = zoomRef.current;
        return {
          x: (e.clientX - r.left + (s?.scrollLeft ?? 0)) / z,
          y: (e.clientY - r.top + (s?.scrollTop ?? 0)) / z,
        };
      };

      const setCursorFromDocPt = (screenPt: Point, docPt: Point) => {
        setCursorS(screenPt);
        setCursorDoc(docPt);
        cursorDocRef.current = docPt;
      };

      const clearCursor = () => {
        setCursorS(null);
        setCursorDoc(null);
        cursorDocRef.current = null;
      };

      const onMove = (e: MouseEvent) => {
        const screenPt = toScreenPt(e);

        if (isOverPage(e)) {
          // Normal: cursor is over a page
          el.style.cursor = 'crosshair';
          setCursorFromDocPt(screenPt, toDocPt(e));
        } else if (firstPtRef.current !== null) {
          // First point placed, cursor wandered off page — clamp to nearest edge
          el.style.cursor = 'crosshair';
          const clamped = nearestPageEdgePoint(screenPt, el);
          if (clamped) {
            const s = scrollElRef.current;
            const z = zoomRef.current;
            setCursorFromDocPt(clamped, {
              x: (clamped.x + (s?.scrollLeft ?? 0)) / z,
              y: (clamped.y + (s?.scrollTop ?? 0)) / z,
            });
          }
        } else {
          // No first point and off page — hide cursor indicator
          el.style.cursor = 'default';
          clearCursor();
        }
      };

      const onClick = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as Element).closest?.('[data-ruler-interactive]')) return;

        const overPage = isOverPage(e);
        // Allow placement only on-page, OR when finalising a measurement at a clamped edge
        if (!overPage && firstPtRef.current === null) return;
        e.preventDefault();

        // Use actual position when over page, clamped doc position when off-page
        const dp = overPage ? toDocPt(e) : cursorDocRef.current;
        if (!dp) return;

        setFirstPt(prev => {
          if (!prev) { firstPtRef.current = dp; return dp; }
          firstPtRef.current = null;
          const id = `ruler-${++idCounter.current}`;
          setMeasurements(m => [...m, { id, start: prev, end: dp }]);
          return null;
        });
      };

      // When cursor leaves the container: only clear if no first point is placed
      // (if measuring, keep the live line at the last clamped edge position)
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

    // ── PDF point → screen conversion ─────────────────────────────────────────
    /**
     * Convert a PDF-point-space coordinate to screen space (SVG pixels).
     * screen = pt * zoom − scroll
     */
    const toScreen = (pt: Point): Point => ({
      x: pt.x * zoom - scrollOffset.x,
      y: pt.y * zoom - scrollOffset.y,
    });

    const firstPtS = firstPt ? toScreen(firstPt) : null;

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
        {measurements.map(m => (
          <MeasurementLine
            key={m.id}
            measurement={m}
            startS={toScreen(m.start)}
            endS={toScreen(m.end)}
            hovered={hoveredId === m.id}
            onDelete={deleteMeasurement}
            onHover={setHoveredId}
          />
        ))}

        {/* Live line while drawing */}
        {isActive && firstPtS && cursorS && cursorDoc && firstPt && (
          <LiveLine startS={firstPtS} endS={cursorS} startDoc={firstPt} endDoc={cursorDoc} />
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
