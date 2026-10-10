import { useEffect } from "react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";

// Mirrors the LocalEmbedPDF ZoomPluginPackage bounds.
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
// Wheel delta -> scale sensitivity. A mouse notch (~100px) lands near x1.16 or
// x0.86, while trackpad deltas are small and compound smoothly across events.
const WHEEL_SENSITIVITY = 0.0015;
const MIN_STEP = 0.8;
const MAX_STEP = 1.25;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// deltaMode: 0 = pixels, 1 = lines (~16px), 2 = pages (one viewport height).
function normalizeWheelDelta(
  event: WheelEvent,
  viewportHeight: number,
): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * viewportHeight;
  return event.deltaY;
}

/**
 * Cursor-anchored Ctrl/Cmd + wheel zoom for the EmbedPDF viewport.
 *
 * The library's built-in wheel gesture scales by `1 - deltaY * 0.01`, which
 * assumes the small deltas a trackpad emits. A real mouse notch (deltaY +-100)
 * jumps a factor of 2 in one step, so `ZoomGestureWrapper` is rendered with
 * `enableWheel={false}` and this listener owns the wheel instead: it normalizes
 * the delta and keeps the point under the cursor fixed. Touch pinch is left to
 * the wrapper.
 *
 * Call from a component rendered inside `<Viewport>` so `useViewportElement()`
 * resolves the scroll container.
 */
export function useFocalWheelZoom(documentId: string): void {
  const { provides: zoom } = useZoom(documentId);
  const viewportRef = useViewportElement();

  useEffect(() => {
    const viewport = viewportRef?.current;
    if (!viewport || !zoom) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const delta = normalizeWheelDelta(event, viewport.clientHeight);
      const step = clamp(
        Math.exp(-delta * WHEEL_SENSITIVITY),
        MIN_STEP,
        MAX_STEP,
      );
      const current = zoom.getState()?.currentZoomLevel ?? 1;
      const next = clamp(current * step, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(next - current) < 1e-4) return;

      const rect = viewport.getBoundingClientRect();
      zoom.requestZoom(next, {
        vx: event.clientX - rect.left,
        vy: event.clientY - rect.top,
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoom, viewportRef]);
}
