import { useEffect } from "react";
import { useViewerTextTarget } from "@editor/contexts/viewer/ViewerPageTool";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { locateViewerText } from "@editor/tools/pdfTextEditor/util/locateViewerText";

/**
 * Selects the text the user picked in the viewer before opening the editor,
 * once its page has been read. A page without it leaves the selection alone.
 */
export function useOpenAtViewerText(
  store: EditorStore,
  sourceFileId: string | null,
): void {
  const { textTarget, clearTextTarget } = useViewerTextTarget();
  useEffect(() => {
    if (!textTarget) return undefined;
    const attempt = () => {
      if (textTarget.fileId && textTarget.fileId !== sourceFileId) return;
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
        caret: null,
        textRange: found.range,
      });
    };
    attempt();
    return store.subscribe(attempt);
  }, [store, sourceFileId, textTarget, clearTextTarget]);
}
