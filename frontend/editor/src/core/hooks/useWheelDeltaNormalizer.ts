import { useEffect, useRef } from "react";
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

// Hand the preview back even if the commit never re-lays-out the page wrapper
// (a clamped gesture, an unmount mid-gesture): a stuck transform is worse than
// the flicker this guard exists to hide.
const PREVIEW_HOLD_LIMIT_MS = 500;

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

function layoutSize(element: HTMLElement): string {
  return `${element.offsetWidth}x${element.offsetHeight}`;
}

/** Pull the `transform` declaration back out of a serialised style attribute. */
function transformFromStyleAttribute(style: string): string | null {
  const match = /(?:^|;)\s*transform\s*:\s*([^;]+)/.exec(style);
  const value = match?.[1]?.trim();
  return value && value !== "none" ? value : null;
}

interface HeldPreview {
  element: HTMLElement;
  transform: string;
  observer: ResizeObserver | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface HoldState {
  /** Between a gesture's first event and the zoom it commits. */
  gestureInFlight: boolean;
  /** Wrapper layout size when the gesture previewed; null outside a gesture. */
  gestureStartSize: string | null;
  /** A preview the library cleared before the committed zoom re-laid-out. */
  held: HeldPreview | null;
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
 * That same commit is also where the gesture looks like a reload: the library
 * clears its preview transform synchronously, but the committed zoom only
 * re-lays-out the page wrapper a frame later (longer when the new tiles are
 * expensive). The wrapper is painted at the pre-gesture size until then, so the
 * document visibly shrinks back and grows again. Holding the preview until the
 * wrapper's own layout changes keeps the contact point stable across the swap.
 *
 * Call from a component rendered inside `<Viewport>`.
 */
export function useWheelDeltaNormalizer(documentId: string): void {
  const { provides: zoom } = useZoom(documentId);
  const viewportRef = useViewportElement();
  // A gesture outlives a single effect run: committing the zoom re-renders the
  // viewer, which re-runs this effect while the commit is still landing.
  const holdRef = useRef<HoldState>({
    gestureInFlight: false,
    gestureStartSize: null,
    held: null,
  });
  const releaseRef = useRef<() => void>(() => {});

  useEffect(() => {
    const viewport = viewportRef?.current;
    const host = viewport?.parentElement ?? viewport;
    if (!viewport || !host) return;

    const state = holdRef.current;
    let burstStart = -Infinity;
    let projected = 1;
    let base = 1;

    const dropHeldPreview = (): void => {
      const held = state.held;
      state.held = null;
      if (!held) return;
      if (held.timer !== null) clearTimeout(held.timer);
      held.observer?.disconnect();
      // Only ever undo our own transform: the library may have written a newer
      // preview (a follow-up gesture) by the time the guard ends.
      if (held.element.style.transform === held.transform) {
        held.element.style.transform = "none";
      }
    };

    const endGesture = (): void => {
      state.gestureInFlight = false;
      state.gestureStartSize = null;
      dropHeldPreview();
    };
    releaseRef.current = endGesture;

    // Preview the commit's own zoom under the transform the library just
    // cleared, so the wrapper is never painted at the pre-gesture size.
    const holdPreview = (element: HTMLElement, transform: string): void => {
      const size = layoutSize(element);
      element.style.transform = transform;
      const held: HeldPreview = {
        element,
        transform,
        observer: null,
        timer: null,
      };
      state.held = held;
      if (typeof ResizeObserver !== "undefined") {
        held.observer = new ResizeObserver(() => {
          if (state.held === held && layoutSize(element) !== size) {
            endGesture();
          }
        });
        held.observer.observe(element);
      }
      held.timer = setTimeout(() => {
        if (state.held === held) endGesture();
      }, PREVIEW_HOLD_LIMIT_MS);
    };

    const previewObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName !== "style") continue;
        const target = record.target;
        if (!(target instanceof HTMLElement) || !state.gestureInFlight)
          continue;
        // Re-applying the preview is itself a style mutation; ignoring it is
        // what stops the hold from clearing and restoring itself forever.
        if (state.held && target.style.transform === state.held.transform) {
          continue;
        }

        if (target.style.transform !== "none") {
          // A live preview does not change layout, so whatever the wrapper
          // measures right now is the size the gesture started from.
          dropHeldPreview();
          state.gestureStartSize = layoutSize(target);
          continue;
        }

        if (state.held) continue;
        const transform = transformFromStyleAttribute(record.oldValue ?? "");
        if (!transform) continue;
        // Hold only while the wrapper still lays out at the size the gesture
        // started from. Once the commit has re-laid-out, the document on screen
        // is already correct and re-applying the preview would scale it again.
        if (
          state.gestureStartSize === null ||
          layoutSize(target) !== state.gestureStartSize
        ) {
          endGesture();
          continue;
        }
        holdPreview(target, transform);
      }
    });

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const now = performance.now();
      if (now - burstStart > WHEEL_IDLE_MS) {
        const current = zoom?.getState()?.currentZoomLevel ?? 1;
        base = Number.isFinite(current) && current > 0 ? current : 1;
        projected = 1;
        state.gestureStartSize = null;
      }
      burstStart = now;
      state.gestureInFlight = true;

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

    // Touch pinch commits through the same reset (no idle timer), and a
    // two-finger start is its only signal; see the library's handleTouchStart.
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      state.gestureInFlight = true;
      state.gestureStartSize = null;
    };

    previewObserver.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
    });
    host.addEventListener("wheel", onWheel, {
      capture: true,
      passive: true,
    });
    host.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    return () => {
      // A pending hold is deliberately left running: this cleanup also fires
      // when the commit re-renders the viewer, and dropping the preview there
      // would be the flicker the hold exists to prevent.
      previewObserver.disconnect();
      host.removeEventListener("wheel", onWheel, { capture: true });
      host.removeEventListener("touchstart", onTouchStart, { capture: true });
    };
  }, [viewportRef, zoom]);

  useEffect(() => () => releaseRef.current(), []);
}
