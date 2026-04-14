import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pixelmatch from "pixelmatch";

import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import type { ComparePixelPageResult, CompareResultPixelData } from "@app/types/compare";

const CSS_DPI = 72;

interface ReusableCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const createCanvas = (width: number, height: number): ReusableCanvas => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to acquire 2D canvas context.");
  return { canvas, ctx };
};

const ensureSize = (rc: ReusableCanvas, width: number, height: number) => {
  if (rc.canvas.width !== width) rc.canvas.width = width;
  if (rc.canvas.height !== height) rc.canvas.height = height;
};

const releaseCanvas = (rc: ReusableCanvas) => {
  rc.canvas.width = 0;
  rc.canvas.height = 0;
};

const renderPageOntoTarget = async (
  page: PDFPageProxy,
  scale: number,
  target: ReusableCanvas,
  targetWidth: number,
  targetHeight: number,
): Promise<void> => {
  const viewport = page.getViewport({ scale });
  const renderedW = Math.max(1, Math.round(viewport.width));
  const renderedH = Math.max(1, Math.round(viewport.height));

  ensureSize(target, targetWidth, targetHeight);
  target.ctx.fillStyle = "#ffffff";
  target.ctx.fillRect(0, 0, targetWidth, targetHeight);

  const offsetX = Math.round((targetWidth - renderedW) / 2);
  const offsetY = Math.round((targetHeight - renderedH) / 2);

  target.ctx.save();
  target.ctx.translate(offsetX, offsetY);
  await page.render({ canvas: target.canvas, canvasContext: target.ctx, viewport }).promise;
  target.ctx.restore();
};

const canvasToBlobUrl = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode canvas to PNG."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });

export const revokePixelResult = (result: CompareResultPixelData | null | undefined): void => {
  if (!result) return;
  for (const page of result.pages) {
    URL.revokeObjectURL(page.baseImageUrl);
    URL.revokeObjectURL(page.comparisonImageUrl);
    URL.revokeObjectURL(page.diffImageUrl);
  }
};

export interface RunPixelCompareArgs {
  baseFile: File;
  comparisonFile: File;
  baseFileId: string;
  comparisonFileId: string;
  dpi: number;
  threshold: number;
  onProgress?: (pageNumber: number, totalPages: number) => void;
  signal?: { cancelled: boolean };
}

export const runPixelCompare = async ({
  baseFile,
  comparisonFile,
  baseFileId,
  comparisonFileId,
  dpi,
  threshold,
  onProgress,
  signal,
}: RunPixelCompareArgs): Promise<CompareResultPixelData> => {
  const start = performance.now();
  const warnings: string[] = [];
  const scale = Math.max(0.5, dpi / CSS_DPI);

  const [baseBuffer, comparisonBuffer] = await Promise.all([baseFile.arrayBuffer(), comparisonFile.arrayBuffer()]);

  let baseDoc: PDFDocumentProxy | null = null;
  let compDoc: PDFDocumentProxy | null = null;

  const baseCanvas = createCanvas(1, 1);
  const compCanvas = createCanvas(1, 1);
  const diffCanvas = createCanvas(1, 1);
  const emittedUrls: string[] = [];

  const cleanupOnFailure = () => {
    for (const url of emittedUrls) URL.revokeObjectURL(url);
  };

  try {
    [baseDoc, compDoc] = await Promise.all([
      pdfWorkerManager.createDocument(baseBuffer),
      pdfWorkerManager.createDocument(comparisonBuffer),
    ]);

    const basePages = baseDoc.numPages;
    const compPages = compDoc.numPages;
    const sharedPages = Math.min(basePages, compPages);

    if (basePages !== compPages) {
      warnings.push(
        `Page count mismatch: base has ${basePages} page(s), comparison has ${compPages}. Comparing first ${sharedPages}.`,
      );
    }
    if (sharedPages === 0) throw new Error("One or both documents have no pages.");

    const pages: ComparePixelPageResult[] = [];
    let totalDiffPixels = 0;
    let totalPixelsCount = 0;
    let pagesWithChanges = 0;

    for (let pageNumber = 1; pageNumber <= sharedPages; pageNumber += 1) {
      if (signal?.cancelled) throw new Error("CANCELLED");
      onProgress?.(pageNumber, sharedPages);

      const [basePage, compPage] = await Promise.all([baseDoc.getPage(pageNumber), compDoc.getPage(pageNumber)]);
      try {
        const baseViewport = basePage.getViewport({ scale });
        const compViewport = compPage.getViewport({ scale });

        const targetWidth = Math.max(1, Math.round(Math.max(baseViewport.width, compViewport.width)));
        const targetHeight = Math.max(1, Math.round(Math.max(baseViewport.height, compViewport.height)));
        const sizeMismatch =
          Math.round(baseViewport.width) !== Math.round(compViewport.width) ||
          Math.round(baseViewport.height) !== Math.round(compViewport.height);

        await renderPageOntoTarget(basePage, scale, baseCanvas, targetWidth, targetHeight);
        await renderPageOntoTarget(compPage, scale, compCanvas, targetWidth, targetHeight);

        const baseImage = baseCanvas.ctx.getImageData(0, 0, targetWidth, targetHeight);
        const compImage = compCanvas.ctx.getImageData(0, 0, targetWidth, targetHeight);

        ensureSize(diffCanvas, targetWidth, targetHeight);
        diffCanvas.ctx.fillStyle = "#ffffff";
        diffCanvas.ctx.fillRect(0, 0, targetWidth, targetHeight);
        const diffImage = diffCanvas.ctx.getImageData(0, 0, targetWidth, targetHeight);

        const diffCount = pixelmatch(
          baseImage.data,
          compImage.data,
          diffImage.data,
          targetWidth,
          targetHeight,
          { threshold, includeAA: true, alpha: 0.3 },
        );

        diffCanvas.ctx.putImageData(diffImage, 0, 0);

        const [baseUrl, compUrl, diffUrl] = await Promise.all([
          canvasToBlobUrl(baseCanvas.canvas),
          canvasToBlobUrl(compCanvas.canvas),
          canvasToBlobUrl(diffCanvas.canvas),
        ]);
        emittedUrls.push(baseUrl, compUrl, diffUrl);

        const totalPixels = targetWidth * targetHeight;
        totalDiffPixels += diffCount;
        totalPixelsCount += totalPixels;
        if (diffCount > 0) pagesWithChanges += 1;

        pages.push({
          pageNumber,
          width: targetWidth,
          height: targetHeight,
          baseImageUrl: baseUrl,
          comparisonImageUrl: compUrl,
          diffImageUrl: diffUrl,
          diffPixels: diffCount,
          totalPixels,
          diffRatio: totalPixels > 0 ? diffCount / totalPixels : 0,
          sizeMismatch,
        });
      } finally {
        basePage.cleanup();
        compPage.cleanup();
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return {
      mode: "pixel",
      base: { fileId: baseFileId, fileName: baseFile.name },
      comparison: { fileId: comparisonFileId, fileName: comparisonFile.name },
      pages,
      totals: {
        diffPixels: totalDiffPixels,
        totalPixels: totalPixelsCount,
        diffRatio: totalPixelsCount > 0 ? totalDiffPixels / totalPixelsCount : 0,
        pagesWithChanges,
        durationMs: performance.now() - start,
        processedAt: Date.now(),
      },
      warnings,
      settings: { dpi, threshold },
    };
  } catch (err) {
    cleanupOnFailure();
    throw err;
  } finally {
    releaseCanvas(baseCanvas);
    releaseCanvas(compCanvas);
    releaseCanvas(diffCanvas);
    if (baseDoc) pdfWorkerManager.destroyDocument(baseDoc);
    if (compDoc) pdfWorkerManager.destroyDocument(compDoc);
  }
};
