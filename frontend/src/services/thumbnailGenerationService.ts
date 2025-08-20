/**
 * High-performance thumbnail generation service using main thread processing
 */

import { pdfWorkerManager } from './pdfWorkerManager';

interface ThumbnailResult {
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
  pdf: any; // PDFDocumentProxy from pdfjs-dist
  lastUsed: number;
  refCount: number;
}

export class ThumbnailGenerationService {
  // Session-based thumbnail cache
  private thumbnailCache = new Map<string, CachedThumbnail>();
  private maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  private currentCacheSize = 0;

  // PDF document cache to reuse PDF instances and avoid creating multiple workers
  private pdfDocumentCache = new Map<string, CachedPDFDocument>();
  private maxPdfCacheSize = 10; // Keep up to 10 PDF documents cached

  constructor(private maxWorkers: number = 3) {
    // PDF rendering requires DOM access, so we use optimized main thread processing
  }

  /**
   * Get or create a cached PDF document
   */
  private async getCachedPDFDocument(fileId: string, pdfArrayBuffer: ArrayBuffer): Promise<any> {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      cached.lastUsed = Date.now();
      cached.refCount++;
      return cached.pdf;
    }

    // Evict old PDFs if cache is full
    while (this.pdfDocumentCache.size >= this.maxPdfCacheSize) {
      this.evictLeastRecentlyUsedPDF();
    }

    const { getDocument } = await import('pdfjs-dist');
    const pdf = await getDocument({ data: pdfArrayBuffer }).promise;

    this.pdfDocumentCache.set(fileId, {
      pdf,
      lastUsed: Date.now(),
      refCount: 1
    });

    return pdf;
  }

  /**
   * Release a reference to a cached PDF document
   */
  private releasePDFDocument(fileId: string): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      cached.refCount--;
      // Don't destroy immediately - keep in cache for potential reuse
    }
  }

  /**
   * Evict the least recently used PDF document
   */
  private evictLeastRecentlyUsedPDF(): void {
    let oldestEntry: [string, CachedPDFDocument] | null = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.pdfDocumentCache.entries()) {
      if (value.lastUsed < oldestTime && value.refCount === 0) {
        oldestTime = value.lastUsed;
        oldestEntry = [key, value];
      }
    }

    if (oldestEntry) {
      oldestEntry[1].pdf.destroy(); // Clean up PDF worker
      this.pdfDocumentCache.delete(oldestEntry[0]);
    }
  }

  /**
   * Generate thumbnails for multiple pages using main thread processing
   */
  async generateThumbnails(
    fileId: string,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: ThumbnailGenerationOptions = {},
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    const {
      scale = 0.2,
      quality = 0.8
    } = options;

    return await this.generateThumbnailsMainThread(fileId, pdfArrayBuffer, pageNumbers, scale, quality, onProgress);
  }

  /**
   * Main thread thumbnail generation with batching for UI responsiveness
   */
  private async generateThumbnailsMainThread(
    fileId: string,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    scale: number,
    quality: number,
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    const pdf = await this.getCachedPDFDocument(fileId, pdfArrayBuffer);
    
    const allResults: ThumbnailResult[] = [];
    let completed = 0;
    const batchSize = 3; // Smaller batches for better UI responsiveness
    
    // Process pages in small batches
    for (let i = 0; i < pageNumbers.length; i += batchSize) {
      const batch = pageNumbers.slice(i, i + batchSize);
      
      // Process batch sequentially (to avoid canvas conflicts)
      for (const pageNumber of batch) {
        try {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          
          await page.render({ canvasContext: context, viewport }).promise;
          const thumbnail = canvas.toDataURL('image/jpeg', quality);
          
          allResults.push({ pageNumber, thumbnail, success: true });
          
        } catch (error) {
          console.error(`Failed to generate thumbnail for page ${pageNumber}:`, error);
          allResults.push({ 
            pageNumber, 
            thumbnail: '', 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      completed += batch.length;
      
      // Report progress
      if (onProgress) {
        onProgress({
          completed,
          total: pageNumbers.length,
          thumbnails: allResults.slice(-batch.length).filter(r => r.success)
        });
      }
      
      // Yield control to prevent UI blocking
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    // Release reference to PDF document (don't destroy - keep in cache)
    this.releasePDFDocument(fileId);
    return allResults;
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
    
    // Enforce cache size limits
    while (this.currentCacheSize + sizeBytes > this.maxCacheSizeBytes && this.thumbnailCache.size > 0) {
      this.evictLeastRecentlyUsed();
    }

    this.thumbnailCache.set(pageId, {
      thumbnail,
      lastUsed: Date.now(),
      sizeBytes
    });
    
    this.currentCacheSize += sizeBytes;
  }

  private evictLeastRecentlyUsed(): void {
    let oldestEntry: [string, CachedThumbnail] | null = null;
    let oldestTime = Date.now();

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
      maxSizeBytes: this.maxCacheSizeBytes
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
    // Destroy all cached PDF documents
    for (const [, cached] of this.pdfDocumentCache) {
      cached.pdf.destroy();
    }
    this.pdfDocumentCache.clear();
  }

  clearPDFCacheForFile(fileId: string): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      cached.pdf.destroy();
      this.pdfDocumentCache.delete(fileId);
    }
  }

  destroy(): void {
    this.clearCache();
    this.clearPDFCache();
  }
}

// Global singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();