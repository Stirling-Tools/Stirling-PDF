import { useCallback, useMemo } from "react";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  headingOutline,
  type HeadingOutline,
} from "@editor/tools/pdfTextEditor/util/headingOutline";
import { locateHeading } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/**
 * The document's heading outline, null when its structure tree could not be
 * read or `shown` is false, and a way to select a heading on the page. The
 * outline is rebuilt on every page change, so it is left unbuilt while hidden.
 */
export function useHeadingOutline(
  store: EditorStore,
  state: EditorViewState,
  shown: boolean,
) {
  const outline = useMemo((): HeadingOutline | null => {
    const doc = shown ? store.document : null;
    const headings = doc?.headings();
    return doc && headings
      ? headingOutline(headings, state.pages, (h) => locateHeading(doc, h))
      : null;
  }, [store, state.pages, shown]);

  /** Selects the run showing heading `index`, reading its page first. */
  const selectHeading = useCallback(
    (index: number) => {
      const doc = store.document;
      const headings = doc?.headings();
      const pageIndex = headings?.[index]?.pageIndex;
      if (!doc || !headings || pageIndex == null) return;
      ensurePageRead(store, pageIndex);
      const { run, range } = headingOutline(
        headings,
        store.getState().pages,
        (h) => locateHeading(doc, h),
      ).entries[index];
      if (!run) return;
      store.selection.selectOne(run.id);
      if (range) store.selection.setTextRange(run.id, range);
      // A page read just now has no overlay until React commits it.
      window.requestAnimationFrame(() =>
        document
          .querySelector(`[data-testid="pdf-editor-run-${run.id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    },
    [store],
  );

  return { outline, selectHeading };
}
