import type {
  ViewerLayoutPage,
  ViewerPageLayout,
} from "@editor/contexts/viewer/ViewerPageTool";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
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

async function imageToBlob(image: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas to draw the thumbnail on");
  context.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

export function editorPageLayout(store: EditorStore): ViewerPageLayout {
  let readFrom: PageSnapshot[] | null = null;
  let order: string | null = null;
  let layout: ViewerLayoutPage[] | null = null;
  return {
    subscribe: (listener) => store.subscribe(() => listener()),
    pages: () => {
      const doc = store.document;
      if (!doc || !doc.pagesChanged()) return null;
      const snapshots = store.getState().pages;
      if (snapshots !== readFrom) {
        readFrom = snapshots;
        const nextOrder = snapshots.map((page) => page.pageIndex).join();
        const next = snapshots.map((page) => ({
          width: page.width,
          height: page.height,
          quarterTurns: (page.display.rotate & 3) as 0 | 1 | 2 | 3,
        }));
        if (nextOrder !== order || !sameLayout(next, layout)) layout = next;
        order = nextOrder;
      }
      return layout;
    },
    renderThumbnail: async (pageIndex, widthPx) => {
      const doc = store.document;
      const snapshot = store.getState().pages[pageIndex];
      if (!doc || doc.disposed || !snapshot)
        throw new Error(`No page ${pageIndex + 1} to draw`);
      const page = doc.page(snapshot.pageIndex);
      const shownInViewer = page.shownInViewer;
      const drawn = PdfiumPageRenderer.render(doc, page, widthPx / page.width);
      page.shownInViewer = shownInViewer;
      return imageToBlob(await drawn);
    },
  };
}
