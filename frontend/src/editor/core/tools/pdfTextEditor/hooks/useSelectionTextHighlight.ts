import { useEffect } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  highlightTextRanges,
  plainDomRange,
} from "@editor/tools/pdfTextEditor/util/overlayPainter";

/** Frames to wait for a page's runs to mount before giving up on the rest. */
const MOUNT_WAIT_FRAMES = 120;

/**
 * Paints the exact spans of a selection that covers several runs. The editor's
 * own text range only describes one run, so without this a multi-run selection
 * showed its first cluster text-selected and every other run merely outlined.
 * Typing repaints the focused run and takes over from the stored ranges.
 */
export function useSelectionTextHighlight(store: EditorStore): void {
  useEffect(() => {
    let stop = () => {};
    let frame = 0;

    const clear = () => {
      stop();
      stop = () => {};
    };

    const paint = (waited = 0) => {
      clear();
      const spans = store.selection.spans;
      // One run keeps the overlay's own range painting.
      if (!spans || spans.length < 2) return;
      const ranges: Range[] = [];
      for (const span of spans) {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="pdf-editor-run-${span.runId}"]`,
        );
        const range = el ? plainDomRange(el, span.range) : null;
        if (range) ranges.push(range);
      }
      if (ranges.length > 0) stop = highlightTextRanges(ranges);
      // The overlays mount a frame after the selection reaches React, so a
      // first paint can catch only the first run. Repaint until every run's
      // range is in, or give up on pages that are not mounted at all.
      if (ranges.length < spans.length && waited < MOUNT_WAIT_FRAMES) {
        frame = requestAnimationFrame(() => paint(waited + 1));
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint());
    };

    schedule();
    const unsubscribe = store.selection.subscribe(schedule);
    // Typing replaces the focused run's glyphs, so the stored ranges no longer
    // describe what is on screen; the browser's own selection takes over.
    const onBeforeInput = () => clear();
    window.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener("beforeinput", onBeforeInput, true);
      clear();
    };
  }, [store]);
}
