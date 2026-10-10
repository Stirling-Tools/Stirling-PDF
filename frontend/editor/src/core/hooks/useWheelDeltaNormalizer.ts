import { useEffect } from "react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";

// A trackpad reports single-digit pixel deltas; a mouse notch reports around
// +-100. The library's gesture scales by `1 - deltaY * 0.01`, so one unclamped
// notch is a x2 jump.
const MAX_WHEEL_PIXELS = 16;

// deltaMode: 0 = pixels, 1 = lines (~16px), 2 = pages (one viewport height).
const LINE_HEIGHT_PX = 16;

function deltaPixels(event: WheelEvent, viewportHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PX;
  if (event.deltaMode === 2) return event.deltaY * viewportHeight;
  return event.deltaY;
}

/**
 * Clamp Ctrl/Cmd + wheel deltas before the EmbedPDF zoom gesture reads them.
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
 * Call from a component rendered inside `<Viewport>`.
 */
export function useWheelDeltaNormalizer(): void {
  const viewportRef = useViewportElement();

  useEffect(() => {
    const viewport = viewportRef?.current;
    const host = viewport?.parentElement ?? viewport;
    if (!viewport || !host) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const pixels = deltaPixels(event, viewport.clientHeight);
      const clamped = Math.min(
        Math.max(pixels, -MAX_WHEEL_PIXELS),
        MAX_WHEEL_PIXELS,
      );
      // Only touch the event when it needs normalizing, so the trackpad path
      // (deltaMode 0, small deltas) is left exactly as the browser sent it.
      if (clamped === pixels && event.deltaMode === 0) return;
      Object.defineProperty(event, "deltaY", {
        value: clamped,
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
  }, [viewportRef]);
}
