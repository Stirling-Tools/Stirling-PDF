import { useEffect } from "react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";

// A trackpad reports single-digit pixel deltas; a mouse notch reports around
// +-100. The library's gesture scales by `1 - deltaY * 0.01`, so one unclamped
// notch is a x2 jump.
const MAX_WHEEL_PIXELS = 16;

// deltaMode: 0 = pixels, 1 = lines (~16px), 2 = pages (one viewport height).
const LINE_HEIGHT_PX = 16;

// The library previews a gesture with a CSS transform and commits one zoom
// request 150ms after the last wheel event; mirror that window so the preview
// total tracked here lines up with the one it will commit.
const WHEEL_IDLE_MS = 150;

// Mirror LocalEmbedPDF's ZoomPluginPackage bounds.
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function deltaPixels(event: WheelEvent, viewportHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PX;
  if (event.deltaMode === 2) return event.deltaY * viewportHeight;
  return event.deltaY;
}

/**
 * Rewrite Ctrl/Cmd + wheel deltas before the EmbedPDF zoom gesture reads them.
 *
 * The library's wheel handler previews and commits a single zoom step per
 * gesture, which is what keeps the tile layer from blanking mid-gesture. Its
 * scaling assumes the small deltas a trackpad emits though, so a mouse notch
 * (deltaY +-100) would jump a factor of 2. This capture-phase listener on the
 * viewport's parent rewrites an oversized notch to a single notch's worth of
 * pixels; the transport is still the library's, so preview, focal anchoring
 * and the 150ms commit debounce are preserved. Deltas a trackpad already emits
 * pass through untouched.
 *
 * The library accumulates the preview into `accumulatedWheelScale` and clamps
 * it only to [0.1, 10], so a fast gesture can preview past the viewer's own
 * 0.2-5 range and then snap back when it commits. Tracking the same product
 * here lets us stop feeding deltas once the preview would leave that range.
 *
 * Call from a component rendered inside `<Viewport>`.
 */
export function useWheelDeltaNormalizer(documentId: string): void {
  const { provides: zoom } = useZoom(documentId);
  const viewportRef = useViewportElement();

  useEffect(() => {
    const viewport = viewportRef?.current;
    const host = viewport?.parentElement ?? viewport;
    if (!viewport || !host) return;

    // Preview state for the current gesture, reset when it has been idle long
    // enough for the library to have committed.
    let burstStart = -Infinity;
    let projected = 1;
    let base = 1;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const now = performance.now();
      if (now - burstStart > WHEEL_IDLE_MS) {
        const current = zoom?.getState()?.currentZoomLevel ?? 1;
        base = Number.isFinite(current) && current > 0 ? current : 1;
        projected = 1;
      }
      burstStart = now;

      const pixels = deltaPixels(event, viewport.clientHeight);
      const clampedPixels = clamp(pixels, -MAX_WHEEL_PIXELS, MAX_WHEEL_PIXELS);

      const rawFactor = 1 - clampedPixels * 0.01;
      const targetProjected = projected * rawFactor;
      const nextProjected = clamp(
        targetProjected,
        MIN_ZOOM / base,
        MAX_ZOOM / base,
      );
      // When the range clamp bites, recompute a delta that lands the preview
      // exactly on the bound; otherwise keep the normalised delta verbatim so
      // the round-trip never leaks float error into the event.
      const effectivePixels =
        nextProjected === targetProjected
          ? clampedPixels
          : (1 - nextProjected / projected) * 100;
      projected = nextProjected;

      // Only touch the event when it needs normalizing, so the trackpad path
      // (deltaMode 0, small deltas) is left exactly as the browser sent it.
      if (Math.abs(effectivePixels - pixels) < 1e-3 && event.deltaMode === 0) {
        return;
      }
      Object.defineProperty(event, "deltaY", {
        value: effectivePixels,
        configurable: true,
      });
      if (event.deltaMode !== 0) {
        Object.defineProperty(event, "deltaMode", {
          value: 0,
          configurable: true,
        });
      }
    };

    host.addEventListener("wheel", onWheel, {
      capture: true,
      passive: true,
    });
    return () => host.removeEventListener("wheel", onWheel, { capture: true });
  }, [viewportRef, zoom]);
}
