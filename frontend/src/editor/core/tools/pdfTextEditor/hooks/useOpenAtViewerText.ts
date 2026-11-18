import { useEffect, useRef } from "react";
import { useViewerTextTarget } from "@editor/contexts/viewer/ViewerPageTool";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { TextRange } from "@editor/tools/pdfTextEditor/types";
import { revealOnPage } from "@editor/tools/pdfTextEditor/util/dom";
import { locateViewerText } from "@editor/tools/pdfTextEditor/util/locateViewerText";
import { plainDomRange } from "@editor/tools/pdfTextEditor/util/overlayPainter";

/** Frames to wait for the run's page to mount before leaving it selected only. */
const MOUNT_WAIT_FRAMES = 120;

/** Editors mounted now; the editor remounts once as it opens. */
let mountedEditors = 0;

/**
 * Opens the text the user picked in the viewer for editing, once its page has
 * been read: the run takes focus with that span selected, so typing replaces
 * it. A page without the text leaves the selection alone. A target the editor
 * closes without reaching is dropped, so no later open picks it up.
 */
export function useOpenAtViewerText(
  store: EditorStore,
  sourceFileId: string | null,
): void {
  const { textTarget, clearTextTarget } = useViewerTextTarget();
  // The wait for the run to mount outlives the effect below, which re-runs as
  // soon as the target is taken, so it stops only on unmount.
  const stopWaitRef = useRef<() => void>(() => {});
  useEffect(() => {
    mountedEditors++;
    return () => {
      mountedEditors--;
      stopWaitRef.current();
      // A remount takes over the target; only a real close drops it.
      setTimeout(() => {
        if (mountedEditors === 0) clearTextTarget();
      });
    };
  }, [clearTextTarget]);

  useEffect(() => {
    if (!textTarget) return undefined;
    const attempt = () => {
      if (textTarget.fileId !== sourceFileId) return;
      const state = store.getState();
      if (!state.hasDocument) return;
      const page = state.pages.find(
        (p) => p.pageIndex === textTarget.pageIndex,
      );
      // A page's annotations are filled in when it is read.
      if (!page?.annotations) return;
      clearTextTarget();
      const found = locateViewerText(page, textTarget.text, textTarget.rect);
      if (!found) return;
      store.selection.set({
        runIds: [found.runId],
        imageIds: [],
        shapeIds: [],
        formFieldId: null,
        caret: null,
        textRange: found.range,
      });
      const chosen = store.selection.value;
      revealOnPage(runElement(found.runId), page.pageIndex);
      let frame = 0;
      let waited = 0;
      const focusWhenMounted = () => {
        // The user has moved on; their selection stands.
        if (store.selection.value !== chosen) return;
        const el = runElement(found.runId);
        if (el) editRange(el, found.range);
        else if (waited++ < MOUNT_WAIT_FRAMES) {
          frame = requestAnimationFrame(focusWhenMounted);
        }
      };
      stopWaitRef.current = () => cancelAnimationFrame(frame);
      focusWhenMounted();
    };
    attempt();
    return store.subscribe(attempt);
  }, [store, sourceFileId, textTarget, clearTextTarget]);
}

function runElement(runId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="pdf-editor-run-${runId}"]`,
  );
}

/**
 * Focuses the run, then selects `range` in it. Focus repaints the run's text,
 * which drops any range already in it, so the range goes in after that frame.
 */
function editRange(el: HTMLElement, range: TextRange): void {
  el.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (document.activeElement !== el) return;
    const dom = plainDomRange(el, range);
    const selection = window.getSelection();
    if (!dom || !selection) return;
    selection.removeAllRanges();
    selection.addRange(dom);
  });
}
