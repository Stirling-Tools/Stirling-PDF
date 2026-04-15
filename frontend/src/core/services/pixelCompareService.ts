import PixelCompareWorkerCtor from "@app/workers/pixelCompareWorker?worker";
import {
  ADDITION_HIGHLIGHT,
  REMOVAL_HIGHLIGHT,
  type ComparePixelPageResult,
  type CompareResultPixelData,
  type PixelCompareWorkerErrors,
  type PixelCompareWorkerRequest,
  type PixelCompareWorkerResponse,
  type PixelCompareWorkerWarnings,
  type PixelRgb,
} from "@app/types/compare";

const hexToRgb = (hex: string): PixelRgb => {
  const normalised = hex.replace("#", "");
  const value = parseInt(
    normalised.length === 3
      ? normalised
          .split("")
          .map((c) => c + c)
          .join("")
      : normalised,
    16,
  );
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

// Keep pixel mode visually consistent with text mode:
// - removed (content in base, not in comparison) → REMOVAL_HIGHLIGHT (red)
// - added   (content in comparison, not in base) → ADDITION_HIGHLIGHT (green)
const DEFAULT_DIFF_COLOR: PixelRgb = hexToRgb(REMOVAL_HIGHLIGHT);
const DEFAULT_DIFF_COLOR_ALT: PixelRgb = hexToRgb(ADDITION_HIGHLIGHT);

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
  onPageReady?: (page: ComparePixelPageResult) => void;
  signal?: { cancelled: boolean };
  warnings: PixelCompareWorkerWarnings;
  errors: PixelCompareWorkerErrors;
  // Max in-flight pages processed in parallel inside the worker.
  concurrency?: number;
  // Override diff highlight colours. Defaults to REMOVAL_HIGHLIGHT / ADDITION_HIGHLIGHT
  // so pixel mode matches text mode (removed = red, added = green).
  diffColor?: PixelRgb;
  diffColorAlt?: PixelRgb;
}

export const runPixelCompare = async ({
  baseFile,
  comparisonFile,
  baseFileId,
  comparisonFileId,
  dpi,
  threshold,
  onProgress,
  onPageReady,
  signal,
  warnings,
  errors,
  concurrency,
  diffColor = DEFAULT_DIFF_COLOR,
  diffColorAlt = DEFAULT_DIFF_COLOR_ALT,
}: RunPixelCompareArgs): Promise<CompareResultPixelData> => {
  if (signal?.cancelled) throw new Error("CANCELLED");

  const worker = new PixelCompareWorkerCtor();
  const emittedUrls: string[] = [];
  const pages: ComparePixelPageResult[] = [];

  const cleanupOnFailure = () => {
    for (const url of emittedUrls) URL.revokeObjectURL(url);
  };

  return await new Promise<CompareResultPixelData>((resolve, reject) => {
    const handleMessage = (event: MessageEvent<PixelCompareWorkerResponse>) => {
      const message = event.data;
      if (!message) return;
      if (signal?.cancelled) {
        terminateWorker();
        cleanupOnFailure();
        reject(new Error("CANCELLED"));
        return;
      }

      switch (message.type) {
        case "progress": {
          onProgress?.(message.pageNumber, message.totalPages);
          break;
        }
        case "page": {
          const payload = message.page;
          const baseUrl = URL.createObjectURL(payload.baseBlob);
          const comparisonUrl = URL.createObjectURL(payload.comparisonBlob);
          const diffUrl = URL.createObjectURL(payload.diffBlob);
          emittedUrls.push(baseUrl, comparisonUrl, diffUrl);
          const pageResult: ComparePixelPageResult = {
            pageNumber: payload.pageNumber,
            width: payload.width,
            height: payload.height,
            baseImageUrl: baseUrl,
            comparisonImageUrl: comparisonUrl,
            diffImageUrl: diffUrl,
            diffPixels: payload.diffPixels,
            totalPixels: payload.totalPixels,
            diffRatio: payload.diffRatio,
            sizeMismatch: payload.sizeMismatch,
          };
          pages.push(pageResult);
          onPageReady?.(pageResult);
          break;
        }
        case "success": {
          pages.sort((a, b) => a.pageNumber - b.pageNumber);
          terminateWorker();
          resolve({
            mode: "pixel",
            base: { fileId: baseFileId, fileName: baseFile.name },
            comparison: { fileId: comparisonFileId, fileName: comparisonFile.name },
            pages,
            totals: {
              ...message.totals,
              processedAt: Date.now(),
            },
            warnings: message.warnings,
            settings: { dpi, threshold },
          });
          break;
        }
        case "error": {
          terminateWorker();
          cleanupOnFailure();
          reject(new Error(message.message));
          break;
        }
      }
    };

    const handleError = (event: ErrorEvent) => {
      terminateWorker();
      cleanupOnFailure();
      reject(event.error ?? new Error(event.message || "Pixel compare worker error"));
    };

    const terminateWorker = () => {
      worker.removeEventListener("message", handleMessage as EventListener);
      worker.removeEventListener("error", handleError as EventListener);
      try {
        worker.terminate();
      } catch {
        /* swallow */
      }
    };

    worker.addEventListener("message", handleMessage as EventListener);
    worker.addEventListener("error", handleError as EventListener);

    const request: PixelCompareWorkerRequest = {
      type: "pixel-compare",
      payload: {
        baseFile,
        comparisonFile,
        dpi,
        threshold,
        concurrency,
        warnings,
        errors,
        diffColor,
        diffColorAlt,
      },
    };

    worker.postMessage(request);
  });
};
