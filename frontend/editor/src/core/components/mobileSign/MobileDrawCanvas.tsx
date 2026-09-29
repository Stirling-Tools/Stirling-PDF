import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

/**
 * Touch-first signature canvas for the phone `/mobile-sign` page.
 *
 * Pointer events (finger / stylus / mouse) with `touch-action: none`, sized to
 * its container at device-pixel-ratio resolution so strokes land exactly under
 * the finger — a fixed-size canvas stretched by CSS would offset them. Strokes
 * are kept as point lists in CSS-pixel space, so undo and resize redraw
 * losslessly, and export can crop to the inked region.
 */

export interface MobileDrawCanvasHandle {
  /** Trimmed, transparent-background PNG of the ink, or null when empty. */
  exportPng: () => string | null;
  undo: () => void;
  clear: () => void;
}

interface Stroke {
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

interface MobileDrawCanvasProps {
  penColor: string;
  penSize: number;
  /** Fired when the canvas goes between empty and inked (gates Send/Undo). */
  onHasInkChange: (hasInk: boolean) => void;
}

/** Padding kept around the ink when cropping the export, in CSS pixels. */
const EXPORT_PADDING = 12;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke;
  if (points.length === 0) return;

  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    // A tap: render a dot, which a zero-length stroke would not show.
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Quadratic midpoint smoothing: each point becomes the control point of a
  // curve to the midpoint of the next segment, turning jagged pointer samples
  // into a pen-like line.
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export const MobileDrawCanvas = forwardRef<
  MobileDrawCanvasHandle,
  MobileDrawCanvasProps
>(function MobileDrawCanvas({ penColor, penSize, onHasInkChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  // Live styling for the stroke currently being drawn, without re-rendering
  const penRef = useRef({ color: penColor, size: penSize });
  penRef.current = { color: penColor, size: penSize };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    if (activeStrokeRef.current) drawStroke(ctx, activeStrokeRef.current);
  }, []);

  // Match the backing store to the element's CSS size × devicePixelRatio, and
  // re-match on resize/rotation. Strokes are CSS-space, so a redraw restores
  // them at the new size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      redraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // One stroke at a time: a second touch while drawing would scribble.
    if (activeStrokeRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activeStrokeRef.current = {
      color: penRef.current.color,
      size: penRef.current.size,
      points: [pointFromEvent(e)],
    };
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    // Coalesced events give the full sample train on high-rate digitizers,
    // where the per-frame synthetic event alone would drop curvature.
    const events =
      "getCoalescedEvents" in e.nativeEvent
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent as PointerEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const ev of events) {
      stroke.points.push({
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
      });
    }
    redraw();
  };

  const endStroke = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    strokesRef.current = [...strokesRef.current, stroke];
    redraw();
    onHasInkChange(true);
  };

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const strokes = strokesRef.current;
      const canvas = canvasRef.current;
      if (strokes.length === 0 || !canvas) return null;

      // Crop to the inked region so the signature stamps tightly, clamped to
      // what was actually visible.
      const rect = canvas.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const stroke of strokes) {
        const reach = stroke.size / 2 + EXPORT_PADDING;
        for (const p of stroke.points) {
          minX = Math.min(minX, p.x - reach);
          minY = Math.min(minY, p.y - reach);
          maxX = Math.max(maxX, p.x + reach);
          maxY = Math.max(maxY, p.y + reach);
        }
      }
      minX = Math.max(0, minX);
      minY = Math.max(0, minY);
      maxX = Math.min(rect.width, maxX);
      maxY = Math.min(rect.height, maxY);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      const dpr = window.devicePixelRatio || 1;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.round(width * dpr);
      exportCanvas.height = Math.round(height * dpr);
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;
      // Translate args are device pixels; scale args map stroke space to them.
      ctx.setTransform(dpr, 0, 0, dpr, -minX * dpr, -minY * dpr);
      for (const stroke of strokes) drawStroke(ctx, stroke);
      return exportCanvas.toDataURL("image/png");
    },
    undo: () => {
      strokesRef.current = strokesRef.current.slice(0, -1);
      redraw();
      onHasInkChange(strokesRef.current.length > 0);
    },
    clear: () => {
      strokesRef.current = [];
      activeStrokeRef.current = null;
      redraw();
      onHasInkChange(false);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        cursor: "crosshair",
      }}
      aria-label="Signature drawing area"
    />
  );
});
