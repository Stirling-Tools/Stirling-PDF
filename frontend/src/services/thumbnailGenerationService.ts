/**
 * High-performance thumbnail generation service using main thread processing
 */

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

export class ThumbnailGenerationService {
  // Session-based thumbnail cache
  private thumbnailCache = new Map<string, CachedThumbnail>();
  private maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  private currentCacheSize = 0;

  constructor(private maxWorkers: number = 3) {
    // PDF rendering requires DOM access, so we use optimized main thread processing
  }

  /**
   * Generate thumbnails for multiple pages using main thread processing
   */
  async generateThumbnails(
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: ThumbnailGenerationOptions = {},
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    const {
      scale = 0.2,
      quality = 0.8
    } = options;

    return await this.generateThumbnailsMainThread(pdfArrayBuffer, pageNumbers, scale, quality, onProgress);
  }

  /**
   * Main thread thumbnail generation with batching for UI responsiveness
   */
  private async generateThumbnailsMainThread(
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    scale: number,
    quality: number,
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    const { getDocument } = await import('pdfjs-dist');
    const pdf = await getDocument({ data: pdfArrayBuffer }).promise;
    
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
    
    await pdf.destroy();
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

  destroy(): void {
    this.clearCache();
  }
}

// Global singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();