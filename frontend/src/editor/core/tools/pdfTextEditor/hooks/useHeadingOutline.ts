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
    const headings = shown ? store.document?.headings() : null;
    return headings ? headingOutline(headings, state.pages) : null;
  }, [store, state.pages, shown]);

  /** Selects the run showing heading `index`, reading its page first. */
  const selectHeading = useCallback(
    (index: number) => {
      const headings = store.document?.headings();
      const pageIndex = headings?.[index]?.pageIndex;
      if (!headings || pageIndex == null) return;
      ensurePageRead(store, pageIndex);
      const { run } = headingOutline(headings, store.getState().pages).entries[
        index
      ];
      if (!run) return;
      store.selection.selectOne(run.id);
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
