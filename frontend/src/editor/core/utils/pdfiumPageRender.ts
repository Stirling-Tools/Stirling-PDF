/**
 * Main-thread entry points to the shared PDFium render core, bound to the
 * page's own PDFium module. Used when rendering cannot move to a worker.
 */
import { getPdfiumModule } from "@editor/services/pdfiumService";
import {
  renderFirstPage,
  renderPageDataUrl,
  type FirstPageRender,
  type RenderPdfiumPageOptions,
} from "@editor/utils/pdfiumRenderCore";

export type { RenderPdfiumPageOptions };

/**
 * Render a single page (0-indexed) of an open PDFium document into a data URL.
 *
 * The caller is responsible for opening and closing the document pointer.
 */
export async function renderPdfiumPageDataUrl(
  docPtr: number,
  pageIndex: number,
  scale: number,
  options: RenderPdfiumPageOptions = {},
): Promise<string | null> {
  return renderPageDataUrl(
    await getPdfiumModule(),
    docPtr,
    pageIndex,
    scale,
    options,
  );
}

/** Page 1 plus page metadata from an open document; see {@link renderFirstPage}. */
export async function renderPdfiumFirstPage(
  docPtr: number,
  ...args: Parameters<typeof renderFirstPage> extends [
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
): Promise<FirstPageRender> {
  return renderFirstPage(await getPdfiumModule(), docPtr, ...args);
}
