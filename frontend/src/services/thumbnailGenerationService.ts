/**
 * High-performance thumbnail generation service using Web Workers
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
  private workers: Worker[] = [];
  private activeJobs = new Map<string, { resolve: Function; reject: Function; onProgress?: Function }>();
  private jobCounter = 0;
  private isGenerating = false;
  
  // Session-based thumbnail cache
  private thumbnailCache = new Map<string, CachedThumbnail>();
  private maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  private currentCacheSize = 0;

  constructor(private maxWorkers: number = 3) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const workerPromises: Promise<Worker | null>[] = [];
    
    for (let i = 0; i < this.maxWorkers; i++) {
      const workerPromise = new Promise<Worker | null>((resolve) => {
        try {
          console.log(`Attempting to create worker ${i}...`);
          const worker = new Worker('/thumbnailWorker.js');
          let workerReady = false;
          let pingTimeout: NodeJS.Timeout;
          
          worker.onmessage = (e) => {
            const { type, data, jobId } = e.data;
            
            // Handle PONG response to confirm worker is ready
            if (type === 'PONG') {
              workerReady = true;
              clearTimeout(pingTimeout);
              console.log(`✓ Worker ${i} is ready and responsive`);
              resolve(worker);
              return;
            }
            
            const job = this.activeJobs.get(jobId);
            if (!job) return;
            
            switch (type) {
              case 'PROGRESS':
                if (job.onProgress) {
                  job.onProgress(data);
                }
                break;
                
              case 'COMPLETE':
                job.resolve(data.thumbnails);
                this.activeJobs.delete(jobId);
                break;
                
              case 'ERROR':
                job.reject(new Error(data.error));
                this.activeJobs.delete(jobId);
                break;
            }
          };
          
          worker.onerror = (error) => {
            console.error(`✗ Worker ${i} failed with error:`, error);
            clearTimeout(pingTimeout);
            worker.terminate();
            resolve(null);
          };
          
          // Test worker with timeout
          pingTimeout = setTimeout(() => {
            if (!workerReady) {
              console.warn(`✗ Worker ${i} timed out (no PONG response)`);
              worker.terminate();
              resolve(null);
            }
          }, 3000); // Reduced timeout for faster feedback
          
          // Send PING to test worker
          try {
            worker.postMessage({ type: 'PING' });
          } catch (pingError) {
            console.error(`✗ Failed to send PING to worker ${i}:`, pingError);
            clearTimeout(pingTimeout);
            worker.terminate();
            resolve(null);
          }
          
        } catch (error) {
          console.error(`✗ Failed to create worker ${i}:`, error);
          resolve(null);
        }
      });
      
      workerPromises.push(workerPromise);
    }
    
    // Wait for all workers to initialize or fail
    Promise.all(workerPromises).then((workers) => {
      this.workers = workers.filter((w): w is Worker => w !== null);
      const successCount = this.workers.length;
      const failCount = this.maxWorkers - successCount;
      
      console.log(`🔧 Worker initialization complete: ${successCount}/${this.maxWorkers} workers ready`);
      
      if (failCount > 0) {
        console.warn(`⚠️  ${failCount} workers failed to initialize - will use main thread fallback`);
      }
      
      if (successCount === 0) {
        console.warn('🚨 No Web Workers available - all thumbnail generation will use main thread');
      }
    });
  }

  /**
   * Generate thumbnails for multiple pages using Web Workers
   */
  async generateThumbnails(
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: ThumbnailGenerationOptions = {},
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    if (this.isGenerating) {
      throw new Error('Thumbnail generation already in progress');
    }

    this.isGenerating = true;
    
    const {
      scale = 0.2,
      quality = 0.8,
      batchSize = 20, // Pages per worker
      parallelBatches = this.maxWorkers
    } = options;

    try {
      // Check if workers are available, fallback to main thread if not
      if (this.workers.length === 0) {
        console.warn('No Web Workers available, falling back to main thread processing');
        return await this.generateThumbnailsMainThread(pdfArrayBuffer, pageNumbers, scale, quality, onProgress);
      }

      // Split pages across workers
      const workerBatches = this.distributeWork(pageNumbers, this.workers.length);
      const jobPromises: Promise<ThumbnailResult[]>[] = [];

      for (let i = 0; i < workerBatches.length; i++) {
        const batch = workerBatches[i];
        if (batch.length === 0) continue;

        const worker = this.workers[i % this.workers.length];
        const jobId = `job-${++this.jobCounter}`;

        const promise = new Promise<ThumbnailResult[]>((resolve, reject) => {
          this.activeJobs.set(jobId, { resolve, reject, onProgress });
          
          // Add timeout for worker jobs
          const timeout = setTimeout(() => {
            this.activeJobs.delete(jobId);
            reject(new Error(`Worker job ${jobId} timed out`));
          }, 60000); // 1 minute timeout
          
          // Clear timeout when job completes
          const originalResolve = resolve;
          const originalReject = reject;
          this.activeJobs.set(jobId, { 
            resolve: (result: any) => { clearTimeout(timeout); originalResolve(result); },
            reject: (error: any) => { clearTimeout(timeout); originalReject(error); },
            onProgress 
          });
          
          worker.postMessage({
            type: 'GENERATE_THUMBNAILS',
            jobId,
            data: {
              pdfArrayBuffer,
              pageNumbers: batch,
              scale,
              quality
            }
          });
        });

        jobPromises.push(promise);
      }

      // Wait for all workers to complete
      const results = await Promise.all(jobPromises);
      
      // Flatten and sort results by page number
      const allThumbnails = results.flat().sort((a, b) => a.pageNumber - b.pageNumber);
      
      return allThumbnails;
      
    } catch (error) {
      console.error('Web Worker thumbnail generation failed, falling back to main thread:', error);
      return await this.generateThumbnailsMainThread(pdfArrayBuffer, pageNumbers, scale, quality, onProgress);
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Fallback thumbnail generation on main thread
   */
  private async generateThumbnailsMainThread(
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    scale: number,
    quality: number,
    onProgress?: (progress: { completed: number; total: number; thumbnails: ThumbnailResult[] }) => void
  ): Promise<ThumbnailResult[]> {
    // Import PDF.js dynamically for main thread
    const { getDocument } = await import('pdfjs-dist');
    
    // Load PDF once
    const pdf = await getDocument({ data: pdfArrayBuffer }).promise;
    
    const allResults: ThumbnailResult[] = [];
    let completed = 0;
    const batchSize = 5; // Small batches for UI responsiveness
    
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
      
      // Small delay to keep UI responsive
      if (i + batchSize < pageNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // Clean up
    pdf.destroy();
    
    return allResults.filter(r => r.success);
  }

  /**
   * Distribute work evenly across workers
   */
  private distributeWork(pageNumbers: number[], numWorkers: number): number[][] {
    const batches: number[][] = Array(numWorkers).fill(null).map(() => []);
    
    pageNumbers.forEach((pageNum, index) => {
      const workerIndex = index % numWorkers;
      batches[workerIndex].push(pageNum);
    });
    
    return batches;
  }

  /**
   * Generate a single thumbnail (fallback for individual pages)
   */
  async generateSingleThumbnail(
    pdfArrayBuffer: ArrayBuffer,
    pageNumber: number,
    options: ThumbnailGenerationOptions = {}
  ): Promise<string> {
    const results = await this.generateThumbnails(pdfArrayBuffer, [pageNumber], options);
    
    if (results.length === 0 || !results[0].success) {
      throw new Error(`Failed to generate thumbnail for page ${pageNumber}`);
    }
    
    return results[0].thumbnail;
  }

  /**
   * Add thumbnail to cache with size management
   */
  addThumbnailToCache(pageId: string, thumbnail: string): void {
    const thumbnailSizeBytes = thumbnail.length * 0.75; // Rough base64 size estimate
    const now = Date.now();
    
    // Add new thumbnail
    this.thumbnailCache.set(pageId, {
      thumbnail,
      lastUsed: now,
      sizeBytes: thumbnailSizeBytes
    });
    
    this.currentCacheSize += thumbnailSizeBytes;
    
    // If we exceed 1GB, trigger cleanup
    if (this.currentCacheSize > this.maxCacheSizeBytes) {
      this.cleanupThumbnailCache();
    }
  }

  /**
   * Get thumbnail from cache and update last used timestamp
   */
  getThumbnailFromCache(pageId: string): string | null {
    const cached = this.thumbnailCache.get(pageId);
    if (!cached) return null;
    
    // Update last used timestamp
    cached.lastUsed = Date.now();
    
    return cached.thumbnail;
  }

  /**
   * Clean up cache using LRU eviction
   */
  private cleanupThumbnailCache(): void {
    const entries = Array.from(this.thumbnailCache.entries());
    
    // Sort by last used (oldest first)
    entries.sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    
    this.thumbnailCache.clear();
    this.currentCacheSize = 0;
    const targetSize = this.maxCacheSizeBytes * 0.8; // Clean to 80% of limit
    
    // Keep most recently used entries until we hit target size
    for (let i = entries.length - 1; i >= 0 && this.currentCacheSize < targetSize; i--) {
      const [key, value] = entries[i];
      this.thumbnailCache.set(key, value);
      this.currentCacheSize += value.sizeBytes;
    }
  }

  /**
   * Clear all cached thumbnails
   */
  clearThumbnailCache(): void {
    this.thumbnailCache.clear();
    this.currentCacheSize = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      entries: this.thumbnailCache.size,
      totalSizeBytes: this.currentCacheSize,
      maxSizeBytes: this.maxCacheSizeBytes
    };
  }

  /**
   * Stop generation but keep cache and workers alive
   */
  stopGeneration(): void {
    this.activeJobs.clear();
    this.isGenerating = false;
  }

  /**
   * Terminate all workers and clear cache (only on explicit cleanup)
   */
  destroy(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.activeJobs.clear();
    this.isGenerating = false;
    this.clearThumbnailCache();
  }
}

// Export singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();