import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface OverlayAnchorRect {
  top: number;
  left: number;
}

/** Which side of the anchor the overlay sits on. */
export type OverlayPlacement = "below" | "above";

interface UseAnchoredOverlayOptions {
  /** Element the overlay points at. Usually the plugin's invisible menu wrapper. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /**
   * Whether the overlay should exist. Deliberately *not* combined with an anchor
   * ref check by the caller: a ref read during render still holds the previous
   * commit's node, so the overlay would never mount on first selection.
   */
  enabled: boolean;
  /** Gap between the anchor and the overlay. */
  offset?: number;
  /** Defaults to "below". "above" anchors to the anchor's top edge. */
  placement?: OverlayPlacement;
  /** Notified whenever the resolved position actually changes. */
  onPosition?: (position: OverlayAnchorRect) => void;
}

/**
 * Positions one anchored overlay under an element without re-rendering it to do
 * so.
 *
 * Callers must not declare `top`/`left` on the overlay's `style`: React
 * re-applies style objects on every render and would overwrite the writes made
 * here, which is what leaves the menu stranded off-screen.
 */
export function useAnchoredOverlay({
  anchorRef,
  enabled,
  offset = 8,
  placement = "below",
  onPosition,
}: UseAnchoredOverlayOptions) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastPositionRef = useRef<OverlayAnchorRect | null>(null);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  // Whether the overlay exists. Separate from the position so that moving it
  // never touches React state.
  const [mounted, setMounted] = useState(false);

  const cancelPendingFrame = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    const overlay = overlayRef.current;
    if (!anchor || !overlay) return;

    const rect = anchor.getBoundingClientRect();
    const next: OverlayAnchorRect = {
      top: placement === "above" ? rect.top - offset : rect.bottom + offset,
      left: rect.left + rect.width / 2,
    };
    const previous = lastPositionRef.current;
    if (previous && previous.top === next.top && previous.left === next.left) {
      return;
    }
    lastPositionRef.current = next;

    // Rounded to whole pixels: sub-pixel writes are invisible but still cost a
    // style recalc.
    overlay.style.top = `${Math.round(next.top)}px`;
    overlay.style.left = `${Math.round(next.left)}px`;
    onPositionRef.current?.(next);
  }, [anchorRef, offset, placement]);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    if (!enabled) {
      // Drop queued work before the overlay unmounts, or a frame captured while
      // it was open can write a position back after it has gone.
      cancelPendingFrame();
      lastPositionRef.current = null;
      setMounted(false);
      return;
    }

    setMounted(true);
    measure();

    window.addEventListener("scroll", scheduleMeasure, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", scheduleMeasure, { passive: true });

    return () => {
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      cancelPendingFrame();
    };
  }, [enabled, anchorRef, measure, scheduleMeasure, cancelPendingFrame]);

  // Both refs are only populated after commit, so the mount decision and the
  // first measurement happen here rather than in the effect that runs first.
  useLayoutEffect(() => {
    const ready = enabled && anchorRef.current !== null;
    setMounted(ready);
    if (ready) measure();
    // `mounted` is a dependency because the overlay node only exists on the
    // commit after it flips true, so the first measure has to run again then.
  }, [enabled, anchorRef, measure, mounted]);

  return { overlayRef, mounted, measure };
}
