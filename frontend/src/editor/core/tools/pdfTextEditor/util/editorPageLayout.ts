import type {
  ViewerLayoutPage,
  ViewerPageLayout,
} from "@editor/contexts/viewer/ViewerPageTool";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

function sameLayout(
  a: readonly ViewerLayoutPage[],
  b: readonly ViewerLayoutPage[] | null,
): boolean {
  return (
    !!b &&
    a.length === b.length &&
    a.every(
      (page, i) =>
        page.width === b[i].width &&
        page.height === b[i].height &&
        page.quarterTurns === b[i].quarterTurns,
    )
  );
}

export function editorPageLayout(store: EditorStore): ViewerPageLayout {
  let readFrom: PageSnapshot[] | null = null;
  let layout: ViewerLayoutPage[] | null = null;
  return {
    subscribe: (listener) => store.subscribe(() => listener()),
    pages: () => {
      const doc = store.document;
      if (!doc || !doc.pagesChanged()) return null;
      const snapshots = store.getState().pages;
      if (snapshots !== readFrom) {
        readFrom = snapshots;
        const next = snapshots.map((page) => ({
          width: page.width,
          height: page.height,
          quarterTurns: (page.display.rotate & 3) as 0 | 1 | 2 | 3,
        }));
        if (!sameLayout(next, layout)) layout = next;
      }
      return layout;
    },
  };
}
