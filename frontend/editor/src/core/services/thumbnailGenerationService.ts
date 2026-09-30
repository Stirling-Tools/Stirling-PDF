/**
 * High-performance thumbnail generation service using main thread processing
 */

import { FileId } from "@app/types/file";
import {
  openRawDocumentSafe,
  closeRawDocument,
} from "@app/services/pdfiumService";
import { renderPdfiumPageDataUrl } from "@app/utils/pdfiumPageRender";

export interface ThumbnailResult {
  pageNumber: number;
  thumbnail: string;
  success: boolean;
  error?: string;
}

interface ThumbnailGenerationOptions {
  scale?: number;
  quality?: number;
  batchSize?: number;
  parallelBatches?: number;
}

interface CachedThumbnail {
  thumbnail: string;
  lastUsed: number;
  sizeBytes: number;
}

interface CachedPDFDocument {
  docPtr: number;
  opening: Promise<number>;
  lastUsed: number;
  refCount: number;
  invalidated: boolean;
}

export class ThumbnailGenerationService {
  // Session-based thumbnail cache
  private thumbnailCache = new Map<
    FileId | string /* FIX ME: Page ID */,
    CachedThumbnail
  >();
  private maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  private currentCacheSize = 0;

  // PDF document cache to reuse PDF instances and avoid creating multiple workers
  private pdfDocumentCache = new Map<FileId, CachedPDFDocument>();
  private maxPdfCacheSize = 10; // Keep up to 10 PDF documents cached
  private documentWaiters = new Set<() => void>();

  constructor(private maxWorkers: number = 10) {
    // PDF rendering requires DOM access, so we use optimized main thread processing
  }

  /**
   * Get or create a cached PDFium document pointer.
   */
  private async getCachedPDFDocument(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
  ): Promise<CachedPDFDocument> {
    let cached: CachedPDFDocument;
    for (;;) {
      const existing = this.pdfDocumentCache.get(fileId);
      if (existing && !existing.invalidated) {
        cached = existing;
        cached.refCount++;
        cached.lastUsed = Date.now();
        break;
      }
      if (!existing && this.pdfDocumentCache.size < this.maxPdfCacheSize) {
        cached = {
          docPtr: 0,
          opening: Promise.resolve().then(() =>
            openRawDocumentSafe(pdfArrayBuffer),
          ),
          lastUsed: Date.now(),
          refCount: 1,
          invalidated: false,
        };
        this.pdfDocumentCache.set(fileId, cached);
        break;
      }
      if (this.evictLeastRecentlyUsedPDF()) continue;
      await new Promise<void>((resolve) => this.documentWaiters.add(resolve));
    }
    try {
      cached.docPtr = await cached.opening;
      return cached;
    } catch (error) {
      this.releasePDFDocument(fileId, cached);
      throw error;
    }
  }

  /**
   * Release a reference to a cached PDF document
   */
  private releasePDFDocument(fileId: FileId, cached: CachedPDFDocument): void {
    cached.refCount--;
    if (cached.refCount === 0) {
      this.cleanupCompletedDocument(fileId);
    }
  }

  /**
   * Evict the least recently used PDF document
   */
  private evictLeastRecentlyUsedPDF(): boolean {
    let oldestEntry: [FileId, CachedPDFDocument] | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.pdfDocumentCache.entries()) {
      if (value.lastUsed < oldestTime && value.refCount === 0) {
        oldestTime = value.lastUsed;
        oldestEntry = [key, value];
      }
    }

    if (oldestEntry) {
      this.cleanupCompletedDocument(oldestEntry[0]);
      return true;
    }
    return false;
  }

  /**
   * Generate thumbnails for multiple pages using main thread processing
   */
  async generateThumbnails(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: ThumbnailGenerationOptions = {},
    onProgress?: (progress: {
      completed: number;
      total: number;
      thumbnails: ThumbnailResult[];
    }) => void,
  ): Promise<ThumbnailResult[]> {
    // Input validation
    if (!fileId || typeof fileId !== "string" || fileId.trim() === "") {
      throw new Error("generateThumbnails: fileId must be a non-empty string");
    }

    if (!pdfArrayBuffer || pdfArrayBuffer.byteLength === 0) {
      throw new Error("generateThumbnails: pdfArrayBuffer must not be empty");
    }

    if (!pageNumbers || pageNumbers.length === 0) {
      throw new Error("generateThumbnails: pageNumbers must not be empty");
    }

    const { scale = 0.2, quality = 0.8 } = options;

    return await this.generateThumbnailsMainThread(
      fileId,
      pdfArrayBuffer,
      pageNumbers,
      scale,
      quality,
      onProgress,
    );
  }

  /**
   * Main thread thumbnail generation with batching for UI responsiveness
   */
  private async generateThumbnailsMainThread(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    scale: number,
    quality: number,
    onProgress?: (progress: {
      completed: number;
      total: number;
      thumbnails: ThumbnailResult[];
    }) => void,
  ): Promise<ThumbnailResult[]> {
    const cached = await this.getCachedPDFDocument(fileId, pdfArrayBuffer);
    const docPtr = cached.docPtr;
    try {
      const allResults: ThumbnailResult[] = [];
      let completed = 0;
      const batchSize = 3; // Smaller batches for better UI responsiveness

      // Process pages in small batches
      for (let i = 0; i < pageNumbers.length; i += batchSize) {
        const batch = pageNumbers.slice(i, i + batchSize);

        // Process batch sequentially (to avoid canvas conflicts)
        for (const pageNumber of batch) {
          try {
            const thumbnail = await renderPdfiumPageDataUrl(
              docPtr,
              pageNumber - 1,
              scale,
              { applyRotation: false, format: "jpeg", quality },
            );
            if (!thumbnail) {
              throw new Error(`Could not render page ${pageNumber}`);
            }
            allResults.push({ pageNumber, thumbnail, success: true });
          } catch (error) {
            console.error(
              `Failed to generate thumbnail for page ${pageNumber}:`,
              error,
            );
            allResults.push({
              pageNumber,
              thumbnail: "",
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        completed += batch.length;

        // Report progress
        if (onProgress) {
          onProgress({
            completed,
            total: pageNumbers.length,
            thumbnails: allResults
              .slice(-batch.length)
              .filter((r) => r.success),
          });
        }

        // Yield control to prevent UI blocking
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      return allResults;
    } finally {
      this.releasePDFDocument(fileId, cached);
    }
  }

  /**
   * Cache management
   */
  getThumbnailFromCache(pageId: string): string | null {
    const cached = this.thumbnailCache.get(pageId);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.thumbnail;
    }
    return null;
  }

  addThumbnailToCache(pageId: string, thumbnail: string): void {
    const sizeBytes = thumbnail.length * 2; // Rough estimate for base64 string
    const previous = this.thumbnailCache.get(pageId);
    if (previous) {
      this.currentCacheSize -= previous.sizeBytes;
      this.thumbnailCache.delete(pageId);
    }
    if (sizeBytes > this.maxCacheSizeBytes) return;

    // Enforce cache size limits
    while (
      this.currentCacheSize + sizeBytes > this.maxCacheSizeBytes &&
      this.thumbnailCache.size > 0
    ) {
      this.evictLeastRecentlyUsed();
    }

    this.thumbnailCache.set(pageId, {
      thumbnail,
      lastUsed: Date.now(),
      sizeBytes,
    });

    this.currentCacheSize += sizeBytes;
  }

  private evictLeastRecentlyUsed(): void {
    let oldestEntry: [string, CachedThumbnail] | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.thumbnailCache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestEntry = [key, value];
      }
    }

    if (oldestEntry) {
      this.thumbnailCache.delete(oldestEntry[0]);
      this.currentCacheSize -= oldestEntry[1].sizeBytes;
    }
  }

  getCacheStats() {
    return {
      size: this.thumbnailCache.size,
      sizeBytes: this.currentCacheSize,
      maxSizeBytes: this.maxCacheSizeBytes,
    };
  }

  stopGeneration(): void {
    // No-op since we removed workers
  }

  clearCache(): void {
    this.thumbnailCache.clear();
    this.currentCacheSize = 0;
  }

  clearPDFCache(): void {
    for (const fileId of this.pdfDocumentCache.keys()) {
      this.clearPDFCacheForFile(fileId);
    }
  }

  clearPDFCacheForFile(fileId: FileId): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      cached.invalidated = true;
      this.cleanupCompletedDocument(fileId);
    }
  }

  /**
   * Clean up a PDF document from cache when thumbnail generation is complete
   * This frees up workers faster for better performance
   */
  cleanupCompletedDocument(fileId: FileId): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached && cached.refCount <= 0) {
      this.pdfDocumentCache.delete(fileId);
      if (cached.docPtr)
        void closeRawDocument(cached.docPtr).catch(() => undefined);
      for (const wake of this.documentWaiters) wake();
      this.documentWaiters.clear();
    }
  }

  destroy(): void {
    this.clearCache();
    this.clearPDFCache();
  }
}

// Global singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();
