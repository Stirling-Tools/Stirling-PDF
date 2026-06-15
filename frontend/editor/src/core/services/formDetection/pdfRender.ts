// Render each PDF page to an RGBA bitmap via PDF.js, at a DPI chosen so the long side is about the
// model input size. Mirrors the backend PageRasterizer: the px-per-point scale is taken from the
// rendered canvas so coordinate mapping does not depend on how the DPI rounds.

export interface RasterPage {
  pageIndex: number;
  rgba: Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
  scaleX: number;
  scaleY: number;
}

declare global {
  interface Window {
    pdfjsLib?: {
      getDocument: (src: { data: ArrayBuffer | Uint8Array }) => {
        promise: Promise<PdfDocumentProxy>;
      };
    };
  }
}

interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPageProxy {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
}
interface PdfDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
}

export async function renderPages(
  pdfBytes: ArrayBuffer | Uint8Array,
  inputSize: number,
): Promise<RasterPage[]> {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("PDF.js is not available in this build");

  const data =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: RasterPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const pageWidthPt = base.width;
    const pageHeightPt = base.height;
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
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    pages.push({
      pageIndex: i - 1,
      rgba,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt,
      pageHeightPt,
      scaleX: pageWidthPt > 0 ? canvas.width / pageWidthPt : scale,
      scaleY: pageHeightPt > 0 ? canvas.height / pageHeightPt : scale,
    });
  }
  return pages;
}
