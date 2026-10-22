/// <reference lib="webworker" />

import pixelmatch from "pixelmatch";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  getRawPageCount,
  getRawPageSize,
  openRawDocumentSafe,
  renderPageBitmapFromDoc,
} from "@app/services/pdfiumService";

import type {
  PixelCompareWorkerPagePayload,
  PixelCompareWorkerRequest,
  PixelCompareWorkerResponse,
  PixelCompareWorkerWarnings,
} from "@app/types/compare";
import { lossyEncodeOptions } from "@app/utils/canvasImageEncoding";
import { getDocumentBytes } from "@app/services/documentBytesCache";

declare const self: DedicatedWorkerGlobalScope;

interface ErrorStrings {
  canvasContextUnavailable: string;
}

const DEFAULT_ERRORS: ErrorStrings = {
  canvasContextUnavailable: "Unable to acquire 2D canvas context.",
};

const CSS_DPI = 72;

const post = (
  message: PixelCompareWorkerResponse,
  transfer: Transferable[] = [],
) => {
  self.postMessage(message, transfer);
};

const formatWarning = (
  template: string,
  values: Record<string, string | number>,
): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    String(values[key] ?? ""),
  );

const renderPageToBitmap = async (
  docPtr: number,
  pageIndex: number,
  scale: number,
  targetWidth: number,
  targetHeight: number,
  errorStrings: ErrorStrings,
): Promise<{ imageData: ImageData; bitmap: ImageBitmap }> => {
  const rendered = await renderPageBitmapFromDoc(docPtr, pageIndex, scale);

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.putImageData(
    rendered,
    Math.round((targetWidth - rendered.width) / 2),
    Math.round((targetHeight - rendered.height) / 2),
  );

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const bitmap = canvas.transferToImageBitmap();
  return { imageData, bitmap };
};

const ENCODE_QUALITY = 0.85;

const bitmapToBlob = async (
  bitmap: ImageBitmap,
  width: number,
  height: number,
  errorStrings: ErrorStrings,
): Promise<Blob> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await canvas.convertToBlob(await lossyEncodeOptions(ENCODE_QUALITY));
};

const diffDataToBlob = async (
  diff: ImageData,
  width: number,
  height: number,
  errorStrings: ErrorStrings,
): Promise<Blob> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(errorStrings.canvasContextUnavailable);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.putImageData(diff, 0, 0);
  return await canvas.convertToBlob(await lossyEncodeOptions(ENCODE_QUALITY));
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
  basePtr: number,
  compPtr: number,
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

  // Points at scale 1; the /Rotate-aware box matches what the old viewport gave us.
  const baseSize = missingBase
    ? null
    : await getRawPageSize(basePtr, pageNumber - 1);
  const compSize = missingComparison
    ? null
    : await getRawPageSize(compPtr, pageNumber - 1);

  const baseViewport = baseSize
    ? { width: baseSize.width * scale, height: baseSize.height * scale }
    : null;
  const compViewport = compSize
    ? { width: compSize.width * scale, height: compSize.height * scale }
    : null;

  // Determine target dimensions from whichever side(s) exist. When only one side has
  // this page, the blank side is rendered at the same canvas size so pixelmatch can
  // flag every non-white pixel as a diff.
  const refWidth = baseViewport?.width ?? compViewport?.width ?? 1;
  const refHeight = baseViewport?.height ?? compViewport?.height ?? 1;
  const targetWidth = Math.max(
    1,
    Math.round(
      Math.max(
        baseViewport?.width ?? refWidth,
        compViewport?.width ?? refWidth,
      ),
    ),
  );
  const targetHeight = Math.max(
    1,
    Math.round(
      Math.max(
        baseViewport?.height ?? refHeight,
        compViewport?.height ?? refHeight,
      ),
    ),
  );
  const sizeMismatch =
    baseViewport && compViewport
      ? Math.round(baseViewport.width) !== Math.round(compViewport.width) ||
        Math.round(baseViewport.height) !== Math.round(compViewport.height)
      : false;

  const [base, comp] = await Promise.all([
    baseViewport
      ? renderPageToBitmap(
          basePtr,
          pageNumber - 1,
          scale,
          targetWidth,
          targetHeight,
          errorStrings,
        )
      : createBlankRender(targetWidth, targetHeight, errorStrings),
    compViewport
      ? renderPageToBitmap(
          compPtr,
          pageNumber - 1,
          scale,
          targetWidth,
          targetHeight,
          errorStrings,
        )
      : createBlankRender(targetWidth, targetHeight, errorStrings),
  ]);

  const diffImage = new ImageData(targetWidth, targetHeight);
  const diffCount = pixelmatch(
    base.imageData.data,
    comp.imageData.data,
    diffImage.data,
    targetWidth,
    targetHeight,
    {
      threshold,
      includeAA: true,
      alpha: 0.3,
      diffColor: colours.diffColor,
      ...(colours.diffColorAlt ? { diffColorAlt: colours.diffColorAlt } : {}),
    },
  );

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

self.addEventListener(
  "message",
  async (event: MessageEvent<PixelCompareWorkerRequest>) => {
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
    const colours: PixelMatchColours = { diffColor, diffColorAlt };
    const warnings: string[] = [];
    const scale = Math.max(0.5, dpi / CSS_DPI);
    const startedAt = performance.now();

    let basePtr: number | null = null;
    let compPtr: number | null = null;
    let pdfium: Awaited<ReturnType<typeof getPdfiumModule>> | null = null;

    try {
      const [baseBuffer, comparisonBuffer] = await Promise.all([
        getDocumentBytes(baseFile),
        getDocumentBytes(comparisonFile),
      ]);

      pdfium = await getPdfiumModule();
      [basePtr, compPtr] = await Promise.all([
        openRawDocumentSafe(baseBuffer),
        openRawDocumentSafe(comparisonBuffer),
      ]);

      const basePages = await getRawPageCount(basePtr);
      const compPages = await getRawPageCount(compPtr);
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
      const poolSize = Math.max(
        1,
        Math.min(concurrency ?? defaultConcurrency, totalPages),
      );

      let totalDiffPixels = 0;
      let totalPixelsCount = 0;
      let pagesWithChanges = 0;

      await runPool(
        pageNumbers,
        poolSize,
        async (pageNumber) => {
          post({ type: "progress", pageNumber, totalPages });
          return await processPage(
            basePtr as number,
            compPtr as number,
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
          diffRatio:
            totalPixelsCount > 0 ? totalDiffPixels / totalPixelsCount : 0,
          pagesWithChanges,
          durationMs: performance.now() - startedAt,
        },
        warnings,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown error");
      post({ type: "error", message });
    } finally {
      if (pdfium) {
        if (basePtr !== null) closeDocAndFreeBuffer(pdfium, basePtr);
        if (compPtr !== null) closeDocAndFreeBuffer(pdfium, compPtr);
      }
    }
  },
);

// Re-export for type consumers so the import is not dropped.
export type { PixelCompareWorkerWarnings };
