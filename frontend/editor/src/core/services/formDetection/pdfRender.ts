// Render each PDF page to an RGBA bitmap via PDF.js, at a DPI chosen so the long side is about the
// model input size. Mirrors the backend PageRasterizer: pages render in display space (rotation
// applied, crop box anchored at 0,0), and each page carries the rotation + crop-box geometry the
// coordinate mapper needs to get back to unrotated user space.

import { pdfWorkerManager } from "@app/services/pdfWorkerManager";

export interface RasterPage {
  pageIndex: number;
  rgba: Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  userWidthPt: number;
  userHeightPt: number;
  cropLlxPt: number;
  cropLlyPt: number;
}

function normalizeRotation(degrees: number): number {
  const r = ((Math.round(degrees) % 360) + 360) % 360;
  return (Math.floor(r / 90) * 90) % 360;
}

/**
 * Render each page and hand it straight to `onPage`. Pages are streamed rather than returned as an
 * array because one page is several megabytes of RGBA, and holding a long document worth of them at
 * once is enough to crash the tab.
 *
 * `maxPages` is checked before anything is rendered, so an over-long document costs nothing.
 * Returns the page count.
 */
export async function renderPages(
  pdfBytes: ArrayBuffer | Uint8Array,
  inputSize: number,
  maxPages: number,
  onPage: (page: RasterPage, pageCount: number) => Promise<void> | void,
  onPageStart?: (page: number, pageCount: number) => void,
): Promise<number> {
  const data =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const pdf = await pdfWorkerManager.createDocument(data);
  try {
    if (pdf.numPages > maxPages) {
      throw new Error(
        `PDF has ${pdf.numPages} pages; the limit is ${maxPages}`,
      );
    }
    for (let i = 1; i <= pdf.numPages; i++) {
      onPageStart?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      // Display-space dims (rotation applied); the crop box is page.view in user space.
      const base = page.getViewport({ scale: 1 });
      const pageWidthPt = base.width;
      const pageHeightPt = base.height;
      const [llx, lly, urx, ury] = page.view;
      const maxSide = Math.max(pageWidthPt, pageHeightPt);
      let dpi = maxSide <= 0 ? 150 : Math.round((72 * inputSize) / maxSide);
      dpi = Math.max(36, Math.min(dpi, 300));
      const scale = dpi / 72;
      const vp = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(vp.width));
      canvas.height = Math.max(1, Math.ceil(vp.height));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2D canvas context unavailable");
      // Forms render on white; PDF.js does not paint a background.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      await onPage(
        {
          pageIndex: i - 1,
          rgba,
          widthPx: canvas.width,
          heightPx: canvas.height,
          pageWidthPt,
          pageHeightPt,
          scaleX: pageWidthPt > 0 ? canvas.width / pageWidthPt : scale,
          scaleY: pageHeightPt > 0 ? canvas.height / pageHeightPt : scale,
          rotationDegrees: normalizeRotation(page.rotate ?? 0),
          userWidthPt: urx - llx,
          userHeightPt: ury - lly,
          cropLlxPt: llx,
          cropLlyPt: lly,
        },
        pdf.numPages,
      );
      // Drop the backing bitmap now rather than waiting on GC to notice the canvas.
      canvas.width = 0;
      canvas.height = 0;
    }
    return pdf.numPages;
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
}
