/// <reference lib="webworker" />

import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pixelmatch from "pixelmatch";

import type {
  PixelCompareWorkerPagePayload,
  PixelCompareWorkerRequest,
  PixelCompareWorkerResponse,
  PixelCompareWorkerWarnings,
} from "@app/types/compare";

declare const self: DedicatedWorkerGlobalScope;

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

// PDF.js' default canvas factory assumes a DOM (`document.createElement('canvas')`).
// Inside a Web Worker there's no DOM, so we provide an OffscreenCanvas-based factory.
interface CanvasAndContext {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
}

interface ErrorStrings {
  canvasContextUnavailable: string;
}

const DEFAULT_ERRORS: ErrorStrings = {
  canvasContextUnavailable: "Unable to acquire 2D canvas context.",
};

// pdfjs-dist 5.x expects CanvasFactory and FilterFactory to be **class constructors**
// (it does `new CanvasFactory({ ownerDocument, enableHWA })` internally), so we build
// the class on demand with request-scoped error strings captured in its closure.
const createOffscreenCanvasFactory = (errorStrings: ErrorStrings) =>
  class OffscreenCanvasFactory {
    constructor(_opts?: { ownerDocument?: unknown; enableHWA?: boolean }) {
      /* ownerDocument/enableHWA ignored — we always use OffscreenCanvas */
    }

    create(width: number, height: number): CanvasAndContext {
      const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error(errorStrings.canvasContextUnavailable);
      return { canvas, context };
    }

    reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
      canvasAndContext.canvas.width = Math.max(1, width);
      canvasAndContext.canvas.height = Math.max(1, height);
    }

    destroy(canvasAndContext: CanvasAndContext): void {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      (canvasAndContext as { canvas: OffscreenCanvas | null }).canvas = null;
      (canvasAndContext as { context: OffscreenCanvasRenderingContext2D | null }).context = null;
    }
  };

// BaseFilterFactory's defaults already return "none" for every filter, which is what
// we want in a worker (no DOM, no SVG). Re-declare the same no-op class so pdfjs can
// instantiate it without hitting DOMFilterFactory's document.createElementNS calls.
class NoopFilterFactory {
  constructor(_opts?: { docId?: string; ownerDocument?: unknown }) {
    /* noop */
  }
  addFilter() {
    return "none";
  }
  addHCMFilter() {
    return "none";
  }
  addAlphaFilter() {
    return "none";
  }
  addLuminosityFilter() {
    return "none";
  }
  addHighlightHCMFilter() {
    return "none";
  }
  destroy(_keepHCM?: boolean) {
    /* noop */
  }
}

const CSS_DPI = 72;

const post = (message: PixelCompareWorkerResponse, transfer: Transferable[] = []) => {
  self.postMessage(message, transfer);
};

const formatWarning = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(values[key] ?? ""));

const renderPageToBitmap = async (
  page: PDFPageProxy,
  scale: number,
  targetWidth: number,
  targetHeight: number,
  errorStrings: ErrorStrings,
): Promise<{ imageData: ImageData; bitmap: ImageBitmap }> => {
  const viewport = page.getViewport({ scale });
  const renderedW = Math.max(1, Math.round(viewport.width));
  const renderedH = Math.max(1, Math.round(viewport.height));

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const offsetX = Math.round((targetWidth - renderedW) / 2);
  const offsetY = Math.round((targetHeight - renderedH) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  // pdfjs accepts OffscreenCanvas via canvas option
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const bitmap = canvas.transferToImageBitmap();
  return { imageData, bitmap };
};

const ENCODE_OPTS: ImageEncodeOptions = { type: "image/webp", quality: 0.85 };

const bitmapToBlob = async (bitmap: ImageBitmap, width: number, height: number, errorStrings: ErrorStrings): Promise<Blob> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await canvas.convertToBlob(ENCODE_OPTS);
};

const diffDataToBlob = async (diff: ImageData, width: number, height: number, errorStrings: ErrorStrings): Promise<Blob> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.putImageData(diff, 0, 0);
  return await canvas.convertToBlob(ENCODE_OPTS);
};

interface PageTotals {
  diffPixels: number;
  totalPixels: number;
  hasChanges: boolean;
}

interface PixelMatchColours {
  diffColor: [number, number, number];
  diffColorAlt?: [number, number, number];
}

// Produce a fully-white ImageData + matching ImageBitmap for use when one side of the
// comparison has no corresponding page (the other PDF was shorter).
const createBlankRender = async (
  width: number,
  height: number,
  errorStrings: ErrorStrings,
): Promise<{ imageData: ImageData; bitmap: ImageBitmap }> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const bitmap = canvas.transferToImageBitmap();
  return { imageData, bitmap };
};

const processPage = async (
  baseDoc: PDFDocumentProxy,
  compDoc: PDFDocumentProxy,
  pageNumber: number,
  basePages: number,
  compPages: number,
  scale: number,
  threshold: number,
  colours: PixelMatchColours,
  errorStrings: ErrorStrings,
): Promise<{ payload: PixelCompareWorkerPagePayload; totals: PageTotals }> => {
  const missingBase = pageNumber > basePages;
  const missingComparison = pageNumber > compPages;

  const basePage = missingBase ? null : await baseDoc.getPage(pageNumber);
  const compPage = missingComparison ? null : await compDoc.getPage(pageNumber);
  try {
    // Determine target dimensions from whichever side(s) exist. When only one side has
    // this page, the blank side is rendered at the same canvas size so pixelmatch can
    // flag every non-white pixel as a diff.
    const baseViewport = basePage ? basePage.getViewport({ scale }) : null;
    const compViewport = compPage ? compPage.getViewport({ scale }) : null;

    const refWidth = baseViewport?.width ?? compViewport?.width ?? 1;
    const refHeight = baseViewport?.height ?? compViewport?.height ?? 1;
    const targetWidth = Math.max(1, Math.round(Math.max(baseViewport?.width ?? refWidth, compViewport?.width ?? refWidth)));
    const targetHeight = Math.max(
      1,
      Math.round(Math.max(baseViewport?.height ?? refHeight, compViewport?.height ?? refHeight)),
    );
    const sizeMismatch =
      baseViewport && compViewport
        ? Math.round(baseViewport.width) !== Math.round(compViewport.width) ||
          Math.round(baseViewport.height) !== Math.round(compViewport.height)
        : false;

    const [base, comp] = await Promise.all([
      basePage && baseViewport
        ? renderPageToBitmap(basePage, scale, targetWidth, targetHeight, errorStrings)
        : createBlankRender(targetWidth, targetHeight, errorStrings),
      compPage && compViewport
        ? renderPageToBitmap(compPage, scale, targetWidth, targetHeight, errorStrings)
        : createBlankRender(targetWidth, targetHeight, errorStrings),
    ]);

    const diffImage = new ImageData(targetWidth, targetHeight);
    const diffCount = pixelmatch(base.imageData.data, comp.imageData.data, diffImage.data, targetWidth, targetHeight, {
      threshold,
      includeAA: true,
      alpha: 0.3,
      diffColor: colours.diffColor,
      ...(colours.diffColorAlt ? { diffColorAlt: colours.diffColorAlt } : {}),
    });

    const [baseBlob, comparisonBlob, diffBlob] = await Promise.all([
      bitmapToBlob(base.bitmap, targetWidth, targetHeight, errorStrings),
      bitmapToBlob(comp.bitmap, targetWidth, targetHeight, errorStrings),
      diffDataToBlob(diffImage, targetWidth, targetHeight, errorStrings),
    ]);

    const totalPixels = targetWidth * targetHeight;

    const payload: PixelCompareWorkerPagePayload = {
      pageNumber,
      width: targetWidth,
      height: targetHeight,
      baseBlob,
      comparisonBlob,
      diffBlob,
      diffPixels: diffCount,
      totalPixels,
      diffRatio: totalPixels > 0 ? diffCount / totalPixels : 0,
      sizeMismatch,
      ...(missingBase ? { missingBase: true } : {}),
      ...(missingComparison ? { missingComparison: true } : {}),
    };

    return {
      payload,
      totals: {
        diffPixels: diffCount,
        totalPixels,
        hasChanges: diffCount > 0,
      },
    };
  } finally {
    basePage?.cleanup();
    compPage?.cleanup();
  }
};

const runPool = async <T>(
  items: number[],
  concurrency: number,
  worker: (pageNumber: number) => Promise<T>,
  onResult: (pageNumber: number, value: T) => void,
): Promise<void> => {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < limit; i += 1) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const idx = cursor;
          cursor += 1;
          const pageNumber = items[idx];
          const value = await worker(pageNumber);
          onResult(pageNumber, value);
        }
      })(),
    );
  }
  await Promise.all(runners);
};

self.addEventListener("message", async (event: MessageEvent<PixelCompareWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== "pixel-compare") return;

  const {
    baseFile,
    comparisonFile,
    dpi,
    threshold,
    concurrency,
    warnings: warningTemplates,
    errors: errorTemplates,
    diffColor,
    diffColorAlt,
  } = message.payload;
  const errorStrings: ErrorStrings = { ...DEFAULT_ERRORS, ...errorTemplates };
  const OffscreenCanvasFactory = createOffscreenCanvasFactory(errorStrings);
  const colours: PixelMatchColours = { diffColor, diffColorAlt };
  const warnings: string[] = [];
  const scale = Math.max(0.5, dpi / CSS_DPI);
  const startedAt = performance.now();

  let baseDoc: PDFDocumentProxy | null = null;
  let compDoc: PDFDocumentProxy | null = null;

  try {
    // `CanvasFactory`/`FilterFactory` are supported at runtime but not declared on legacy types.
    // pdfjs-dist 5.x renamed the option to `CanvasFactory` (capital C); without a FilterFactory
    // the default DOMFilterFactory crashes in a worker calling document.createElementNS.
    // Resolve CMap/standard-font URLs against the worker's own origin. Vite copies these
    // directories from pdfjs-dist at build time via viteStaticCopy (see vite.config.ts).
    const assetsBase = new URL("/pdfjs/", self.location.origin).toString();
    const loaderOpts = (data: ArrayBuffer) =>
      ({
        data,
        CanvasFactory: OffscreenCanvasFactory,
        FilterFactory: NoopFilterFactory,
        cMapUrl: `${assetsBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetsBase}standard_fonts/`,
        // Force glyph-path rendering. The default path uses the FontFace / document.fonts
        // APIs which reference `globalThis.document` — undefined in a DedicatedWorker, so
        // text either silently fails to install or renders as placeholder glyphs.
        disableFontFace: true,
        useSystemFonts: false,
        isEvalSupported: false,
      }) as unknown as Parameters<typeof getDocument>[0];

    const [baseBuffer, comparisonBuffer] = await Promise.all([baseFile.arrayBuffer(), comparisonFile.arrayBuffer()]);

    [baseDoc, compDoc] = await Promise.all([
      getDocument(loaderOpts(baseBuffer)).promise,
      getDocument(loaderOpts(comparisonBuffer)).promise,
    ]);

    const basePages = baseDoc.numPages;
    const compPages = compDoc.numPages;
    const sharedPages = Math.min(basePages, compPages);

    if (basePages !== compPages) {
      warnings.push(
        formatWarning(warningTemplates.pageCountMismatch, {
          base: basePages,
          comparison: compPages,
          shared: sharedPages,
        }),
      );
    }
    if (Math.max(basePages, compPages) === 0) {
      throw new Error(warningTemplates.noPages);
    }

    // Walk every page in the longer document. Pages past the shorter document's length
    // are processed one-sided: the missing side is rendered blank and the whole present
    // side is treated as a diff.
    const totalPages = Math.max(basePages, compPages);
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    const hwThreads = self.navigator?.hardwareConcurrency ?? 4;
    const defaultConcurrency = Math.max(2, Math.min(8, hwThreads - 1));
    const poolSize = Math.max(1, Math.min(concurrency ?? defaultConcurrency, totalPages));

    let totalDiffPixels = 0;
    let totalPixelsCount = 0;
    let pagesWithChanges = 0;

    await runPool(
      pageNumbers,
      poolSize,
      async (pageNumber) => {
        post({ type: "progress", pageNumber, totalPages });
        return await processPage(
          baseDoc as PDFDocumentProxy,
          compDoc as PDFDocumentProxy,
          pageNumber,
          basePages,
          compPages,
          scale,
          threshold,
          colours,
          errorStrings,
        );
      },
      (_pageNumber, value) => {
        totalDiffPixels += value.totals.diffPixels;
        totalPixelsCount += value.totals.totalPixels;
        if (value.totals.hasChanges) pagesWithChanges += 1;
        post({ type: "page", page: value.payload });
      },
    );

    post({
      type: "success",
      totals: {
        diffPixels: totalDiffPixels,
        totalPixels: totalPixelsCount,
        diffRatio: totalPixelsCount > 0 ? totalDiffPixels / totalPixelsCount : 0,
        pagesWithChanges,
        durationMs: performance.now() - startedAt,
      },
      warnings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    post({ type: "error", message });
  } finally {
    try {
      if (baseDoc) await baseDoc.destroy();
    } catch {
      /* swallow */
    }
    try {
      if (compDoc) await compDoc.destroy();
    } catch {
      /* swallow */
    }
  }
});

// Re-export for type consumers so the import is not dropped.
export type { PixelCompareWorkerWarnings };
