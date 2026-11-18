import { useCallback, useMemo } from "react";
import { ensureAllPagesRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  nextNeedingAttention,
  reviewAccessibility,
  type AccessibilityReview,
} from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import { revealOnPage } from "@editor/tools/pdfTextEditor/util/dom";

/**
 * The images and text needing attention, and a way to select the next one.
 * `review` covers only pages read so far.
 */
export function useAccessibilityReview(
  store: EditorStore,
  state: EditorViewState,
) {
  const review = useMemo(
    (): AccessibilityReview =>
      store.document
        ? reviewAccessibility(store.document, state.pages)
        : { needsDescription: 0, untagged: 0, untaggable: 0 },
    [store, state.pages],
  );

  /** False when nothing needs attention, leaving the selection alone. */
  const selectNext = useCallback((): boolean => {
    // Content on a page not yet scrolled to would otherwise be skipped.
    ensureAllPagesRead(store);
    const doc = store.document;
    if (!doc) return false;
    const { imageIds, runIds } = store.selection.value;
    const next = nextNeedingAttention(
      doc,
      store.getState().pages,
      imageIds[0] ?? runIds[0] ?? null,
    );
    if (!next) return false;
    if (next.kind === "image") store.selection.selectImage(next.id);
    else store.selection.selectOne(next.id);
    const testId =
      next.kind === "image"
        ? `pdf-editor-image-${next.id}`
        : `pdf-editor-run-${next.id}`;
    // A page read just now has no overlay until React commits it.
    window.requestAnimationFrame(() =>
      revealOnPage(
        document.querySelector(`[data-testid="${testId}"]`),
        next.pageIndex,
      ),
    );
    return true;
  }, [store]);

  return { review, selectNext };
}
