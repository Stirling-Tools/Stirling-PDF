import { useCallback, useRef } from 'react';
import { thumbnailGenerationService } from '../services/thumbnailGenerationService';
import { FileId } from '../types/fileContext';

// Request queue to handle concurrent thumbnail requests
interface ThumbnailRequest {
  pageId: string;
  file: File;
  pageNumber: number;
  resolve: (thumbnail: string | null) => void;
  reject: (error: Error) => void;
}

// Global request queue (shared across all hook instances)
const requestQueue: ThumbnailRequest[] = [];
let isProcessingQueue = false;
let batchTimer: number | null = null;

// Track active thumbnail requests to prevent duplicates across components
const activeRequests = new Map<string, Promise<string | null>>();

// Batch processing configuration
const BATCH_SIZE = 20; // Process thumbnails in batches of 20 for better UI responsiveness
const BATCH_DELAY = 100; // Wait 100ms to collect requests before processing
const PRIORITY_BATCH_DELAY = 50; // Faster processing for the first batch (visible pages)

// Process the queue in batches for better performance
async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (requestQueue.length > 0) {
      // Sort queue by page number to prioritize visible pages first
      requestQueue.sort((a, b) => a.pageNumber - b.pageNumber);

      // Take a batch of requests (same file only for efficiency)
      const batchSize = Math.min(BATCH_SIZE, requestQueue.length);
      const batch = requestQueue.splice(0, batchSize);

      // Group by file to process efficiently
      const fileGroups = new Map<File, ThumbnailRequest[]>();

      // First, resolve any cached thumbnails immediately
      const uncachedRequests: ThumbnailRequest[] = [];

      for (const request of batch) {
        const cached = thumbnailGenerationService.getThumbnailFromCache(request.pageId);
        if (cached) {
          request.resolve(cached);
        } else {
          uncachedRequests.push(request);

          if (!fileGroups.has(request.file)) {
            fileGroups.set(request.file, []);
          }
          fileGroups.get(request.file)!.push(request);
        }
      }

      // Process each file group with batch thumbnail generation
      for (const [file, requests] of fileGroups) {
        if (requests.length === 0) continue;

        try {
          const pageNumbers = requests.map(req => req.pageNumber);
          const arrayBuffer = await file.arrayBuffer();

          console.log(`📸 Batch generating ${requests.length} thumbnails for pages: ${pageNumbers.slice(0, 5).join(', ')}${pageNumbers.length > 5 ? '...' : ''}`);

          // Use file name as fileId for PDF document caching
          const fileId = file.name + '_' + file.size + '_' + file.lastModified as FileId;

          const results = await thumbnailGenerationService.generateThumbnails(
            fileId,
            arrayBuffer,
            pageNumbers,
            { scale: 1.0, quality: 0.8, batchSize: BATCH_SIZE },
            (progress) => {
              // Optional: Could emit progress events here for UI feedback
              console.log(`📸 Batch progress: ${progress.completed}/${progress.total} thumbnails generated`);
            }
          );

          // Match results back to requests and resolve
          for (const request of requests) {
            const result = results.find(r => r.pageNumber === request.pageNumber);

            if (result && result.success && result.thumbnail) {
              thumbnailGenerationService.addThumbnailToCache(request.pageId, result.thumbnail);
              request.resolve(result.thumbnail);
            } else {
              console.warn(`No result for page ${request.pageNumber}`);
              request.resolve(null);
            }
          }

        } catch (error) {
          console.warn(`Batch thumbnail generation failed for ${requests.length} pages:`, error);
          // Reject all requests in this batch
          requests.forEach(request => request.reject(error as Error));
        }
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Hook for tools that want to use thumbnail generation
 * Tools can choose whether to include visual features
 */
export function useThumbnailGeneration() {
  const generateThumbnails = useCallback(async (
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: {
      scale?: number;
      quality?: number;
      batchSize?: number;
      parallelBatches?: number;
    } = {},
    onProgress?: (progress: { completed: number; total: number; thumbnails: any[] }) => void
  ) => {
    return thumbnailGenerationService.generateThumbnails(
      fileId,
      pdfArrayBuffer,
      pageNumbers,
      options,
      onProgress
    );
  }, []);

  const addThumbnailToCache = useCallback((pageId: string, thumbnail: string) => {
    thumbnailGenerationService.addThumbnailToCache(pageId, thumbnail);
  }, []);

  const getThumbnailFromCache = useCallback((pageId: string): string | null => {
    return thumbnailGenerationService.getThumbnailFromCache(pageId);
  }, []);

  const getCacheStats = useCallback(() => {
    return thumbnailGenerationService.getCacheStats();
  }, []);

  const stopGeneration = useCallback(() => {
    thumbnailGenerationService.stopGeneration();
  }, []);

  const destroyThumbnails = useCallback(() => {
    // Clear any pending batch timer
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }

    // Clear the queue and active requests
    requestQueue.length = 0;
    activeRequests.clear();
    isProcessingQueue = false;

    thumbnailGenerationService.destroy();
  }, []);

  const clearPDFCacheForFile = useCallback((fileId: FileId) => {
    thumbnailGenerationService.clearPDFCacheForFile(fileId);
  }, []);

  const requestThumbnail = useCallback(async (
    pageId: string,
    file: File,
    pageNumber: number
  ): Promise<string | null> => {
    // Check cache first for immediate return
    const cached = thumbnailGenerationService.getThumbnailFromCache(pageId);
    if (cached) {
      return cached;
    }

    // Check if this request is already being processed globally
    const activeRequest = activeRequests.get(pageId);
    if (activeRequest) {
      return activeRequest;
    }

    // Create new request promise and track it globally
    const requestPromise = new Promise<string | null>((resolve, reject) => {
      requestQueue.push({
        pageId,
        file,
        pageNumber,
        resolve: (result: string | null) => {
          activeRequests.delete(pageId);
          resolve(result);
        },
        reject: (error: Error) => {
          activeRequests.delete(pageId);
          reject(error);
        }
      });

      // Schedule batch processing with a small delay to collect more requests
      if (batchTimer) {
        clearTimeout(batchTimer);
      }

      // Use shorter delay for the first batch (pages 1-50) to show visible content faster
      const isFirstBatch = requestQueue.length <= BATCH_SIZE && requestQueue.every(req => req.pageNumber <= BATCH_SIZE);
      const delay = isFirstBatch ? PRIORITY_BATCH_DELAY : BATCH_DELAY;

      batchTimer = window.setTimeout(() => {
        processRequestQueue().catch(error => {
          console.error('Error processing thumbnail request queue:', error);
        });
        batchTimer = null;
      }, delay);
    });

    // Track this request to prevent duplicates
    activeRequests.set(pageId, requestPromise);

    return requestPromise;
  }, []);

  return {
    generateThumbnails,
    addThumbnailToCache,
    getThumbnailFromCache,
    getCacheStats,
    stopGeneration,
    destroyThumbnails,
    clearPDFCacheForFile,
    requestThumbnail
  };
}
