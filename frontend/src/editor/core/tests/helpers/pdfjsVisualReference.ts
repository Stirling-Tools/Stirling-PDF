import type { Page } from "@playwright/test";
import path from "node:path";

/**
 * Differential render oracle for the viewer corpus.
 *
 * PDF.js is an independent renderer already shipped with the app. The viewer
 * draws with PDFium, so the two disagree on colour management and
 * anti-aliasing; the comparison therefore uses blurred grayscale correlation
 * and ink coverage rather than per-pixel equality. Blank, clipped, shifted or
 * wrong-page renders still fail those bounds.
 */
export interface VisualComparison {
  correlation: number;
  referenceInk: number;
  viewerInk: number;
}

interface PdfjsWindow {
  __corpusDocument?: Promise<unknown>;
}

const PDFJS_BUILD_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../node_modules/pdfjs-dist/build",
);

/**
 * Serves the corpus PDF, the PDF.js modules and a same-origin blank page.
 * Playwright fulfils the module routes, so the spec works under either the
 * Vite dev server or the preview server.
 */
export async function installReferencePage(
  page: Page,
  pdfPath: string,
): Promise<void> {
  await page.route("**/reference.html", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body></body></html>",
    }),
  );
  await page.route("**/corpus.pdf", (route) =>
    route.fulfill({ path: pdfPath, contentType: "application/pdf" }),
  );
  await page.route("**/pdfjs/pdf.mjs", (route) =>
    route.fulfill({
      path: path.join(PDFJS_BUILD_DIR, "pdf.mjs"),
      contentType: "text/javascript",
    }),
  );
  await page.route("**/pdfjs/pdf.worker.mjs", (route) =>
    route.fulfill({
      path: path.join(PDFJS_BUILD_DIR, "pdf.worker.min.mjs"),
      contentType: "text/javascript",
    }),
  );
  await page.goto("/reference.html", { waitUntil: "domcontentloaded" });
}

export async function referencePageCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const pdfjs =
      (await import("/pdfjs/pdf.mjs")) as typeof import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
    const cache = globalThis as typeof globalThis & PdfjsWindow;
    cache.__corpusDocument ??= pdfjs.getDocument({ url: "/corpus.pdf" })
      .promise as Promise<unknown>;
    const pdfDocument = (await cache.__corpusDocument) as Awaited<
      ReturnType<typeof pdfjs.getDocument>["promise"]
    >;
    return pdfDocument.numPages;
  });
}

/**
 * Composites the viewer's page tiles into one PNG. Element screenshots cannot
 * be used for pages taller than the viewport: off-screen tiles are not painted
 * into the capture and the fixed toolbar overlays the result.
 */
export async function captureViewerPageBitmap(
  page: Page,
  index: number,
): Promise<Buffer> {
  const base64 = await page
    .locator(`[data-page-index="${index}"]`)
    .first()
    .evaluate(async (node) => {
      const images = Array.from(node.querySelectorAll("img"));
      await Promise.all(images.map((image) => image.decode().catch(() => {})));
      const pageRect = node.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(pageRect.width));
      canvas.height = Math.max(1, Math.round(pageRect.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context for the page bitmap");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const image of images) {
        const rect = image.getBoundingClientRect();
        context.drawImage(
          image,
          rect.left - pageRect.left,
          rect.top - pageRect.top,
          rect.width,
          rect.height,
        );
      }
      return canvas.toDataURL("image/png").split(",")[1];
    });
  return Buffer.from(base64, "base64");
}

/**
 * Ink coverage of a decoded PNG, used for corpus pages too large for a PDF.js
 * reference. A blank or clipped page falls far below the ink a rendered corpus
 * page carries.
 */
export async function measurePngInk(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (screenshot) => {
    const image = new Image();
    image.src = `data:image/png;base64,${screenshot}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2d context for the ink measurement");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const value =
        0.299 * data[offset] +
        0.587 * data[offset + 1] +
        0.114 * data[offset + 2];
      if (value < 245) ink++;
    }
    return ink / (canvas.width * canvas.height);
  }, png.toString("base64"));
}

export async function compareViewerPageToPdfjs(
  page: Page,
  viewerPng: Buffer,
  pageNumber: number,
  targetWidth = 900,
): Promise<VisualComparison> {
  return page.evaluate(
    async ({ screenshot, page: pdfPageNumber, width }) => {
      const pdfjs =
        (await import("/pdfjs/pdf.mjs")) as typeof import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
      const cache = globalThis as typeof globalThis & PdfjsWindow;
      cache.__corpusDocument ??= pdfjs.getDocument({ url: "/corpus.pdf" })
        .promise as Promise<unknown>;
      const pdfDocument = (await cache.__corpusDocument) as Awaited<
        ReturnType<typeof pdfjs.getDocument>["promise"]
      >;
      const page = await pdfDocument.getPage(pdfPageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / baseViewport.width });
      const referenceCanvas = document.createElement("canvas");
      referenceCanvas.width = Math.floor(viewport.width);
      referenceCanvas.height = Math.floor(viewport.height);
      const referenceContext = referenceCanvas.getContext("2d");
      if (!referenceContext) throw new Error("no 2d context for the reference");
      referenceContext.fillStyle = "#fff";
      referenceContext.fillRect(
        0,
        0,
        referenceCanvas.width,
        referenceCanvas.height,
      );
      await page.render({ canvas: referenceCanvas, viewport }).promise;

      const viewerImage = new Image();
      viewerImage.src = `data:image/png;base64,${screenshot}`;
      await viewerImage.decode();

      const compareWidth = 600;
      const compareHeight = Math.round(
        (compareWidth * referenceCanvas.height) / referenceCanvas.width,
      );
      const comparison = document.createElement("canvas");
      comparison.width = compareWidth;
      comparison.height = compareHeight;
      const context = comparison.getContext("2d", {
        willReadFrequently: true,
      });
      if (!context) throw new Error("no 2d context for the comparison");
      // Blurring absorbs the rasterizer and resampling differences without
      // hiding a missing page region, which is much larger than the kernel.
      context.filter = "blur(2px)";
      context.drawImage(referenceCanvas, 0, 0, compareWidth, compareHeight);
      const reference = context.getImageData(
        0,
        0,
        compareWidth,
        compareHeight,
      ).data;
      context.clearRect(0, 0, compareWidth, compareHeight);
      context.drawImage(viewerImage, 0, 0, compareWidth, compareHeight);
      const viewer = context.getImageData(
        0,
        0,
        compareWidth,
        compareHeight,
      ).data;

      const marginX = Math.round(compareWidth * 0.02);
      const marginY = Math.round(compareHeight * 0.02);
      const referenceGray: number[] = [];
      const viewerGray: number[] = [];
      let referenceInk = 0;
      let viewerInk = 0;
      for (let y = marginY; y < compareHeight - marginY; y++) {
        for (let x = marginX; x < compareWidth - marginX; x++) {
          const offset = (y * compareWidth + x) * 4;
          const referenceValue =
            0.299 * reference[offset] +
            0.587 * reference[offset + 1] +
            0.114 * reference[offset + 2];
          const viewerValue =
            0.299 * viewer[offset] +
            0.587 * viewer[offset + 1] +
            0.114 * viewer[offset + 2];
          referenceGray.push(referenceValue);
          viewerGray.push(viewerValue);
          if (referenceValue < 245) referenceInk++;
          if (viewerValue < 245) viewerInk++;
        }
      }

      const mean = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const referenceMean = mean(referenceGray);
      const viewerMean = mean(viewerGray);
      let covariance = 0;
      let referenceVariance = 0;
      let viewerVariance = 0;
      for (let index = 0; index < referenceGray.length; index++) {
        const referenceDelta = referenceGray[index] - referenceMean;
        const viewerDelta = viewerGray[index] - viewerMean;
        covariance += referenceDelta * viewerDelta;
        referenceVariance += referenceDelta * referenceDelta;
        viewerVariance += viewerDelta * viewerDelta;
      }
      const pixels = referenceGray.length;
      return {
        correlation: covariance / Math.sqrt(referenceVariance * viewerVariance),
        referenceInk: referenceInk / pixels,
        viewerInk: viewerInk / pixels,
      };
    },
    {
      screenshot: viewerPng.toString("base64"),
      page: pageNumber,
      width: targetWidth,
    },
  );
}
