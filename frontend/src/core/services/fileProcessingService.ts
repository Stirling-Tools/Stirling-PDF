/**
 * Centralized file processing service
 * Handles metadata discovery, page counting, and thumbnail generation
 * Called when files are added to FileContext, before any view sees them
 */

import { generateThumbnailForFile } from '@app/utils/thumbnailUtils';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { FileId } from '@app/types/file';

export interface ProcessedFileMetadata {
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    thumbnail?: string;
    rotation: number;
    splitBefore: boolean;
  }>;
  thumbnailUrl?: string; // Page 1 thumbnail for FileEditor
  lastProcessed: number;
}

export interface FileProcessingResult {
  success: boolean;
  metadata?: ProcessedFileMetadata;
  error?: string;
}

interface ProcessingOperation {
  promise: Promise<FileProcessingResult>;
  abortController: AbortController;
}

class FileProcessingService {
  private processingCache = new Map<string, ProcessingOperation>();

  /**
   * Process a file to extract metadata, page count, and generate thumbnails
   * This is the single source of truth for file processing
   */
  async processFile(file: File, fileId: FileId): Promise<FileProcessingResult> {
    // Check if we're already processing this file
    const existingOperation = this.processingCache.get(fileId);
    if (existingOperation) {
      console.log(`📁 FileProcessingService: Using cached processing for ${file.name}`);
      return existingOperation.promise;
    }

    // Create abort controller for this operation
    const abortController = new AbortController();

    // Create processing promise
    const processingPromise = this.performProcessing(file, fileId, abortController);

    // Store operation with abort controller
    const operation: ProcessingOperation = {
      promise: processingPromise,
      abortController
    };
    this.processingCache.set(fileId, operation);

    // Clean up cache after completion
    processingPromise.finally(() => {
      this.processingCache.delete(fileId);
    });

    return processingPromise;
  }

  private async performProcessing(file: File, fileId: FileId, abortController: AbortController): Promise<FileProcessingResult> {
    console.log(`📁 FileProcessingService: Starting processing for ${file.name} (${fileId})`);

    try {
      // Check for cancellation at start
      if (abortController.signal.aborted) {
        throw new Error('Processing cancelled');
      }

      let totalPages = 1;
      let thumbnailUrl: string | undefined;

      // Handle PDF files
      if (file.type === 'application/pdf') {
        // Read arrayBuffer once and reuse for both PDF.js and fallback
        const arrayBuffer = await file.arrayBuffer();

        // Check for cancellation after async operation
        if (abortController.signal.aborted) {
          throw new Error('Processing cancelled');
        }

        // Discover page count using PDF.js (most accurate)
        try {
          const pdfDoc = await pdfWorkerManager.createDocument(arrayBuffer, {
            disableAutoFetch: true,
            disableStream: true
          });

          totalPages = pdfDoc.numPages;
          console.log(`📁 FileProcessingService: PDF.js discovered ${totalPages} pages for ${file.name}`);

          // Clean up immediately
          pdfWorkerManager.destroyDocument(pdfDoc);

          // Check for cancellation after PDF.js processing
          if (abortController.signal.aborted) {
            throw new Error('Processing cancelled');
          }
        } catch (pdfError) {
          console.warn(`📁 FileProcessingService: PDF.js failed for ${file.name}, setting pages to 0:`, pdfError);
          totalPages = 0; // Unknown page count - UI will hide page count display
        }
      }

      // Generate page 1 thumbnail
      try {
        thumbnailUrl = await generateThumbnailForFile(file);
        console.log(`📁 FileProcessingService: Generated thumbnail for ${file.name}`);

        // Check for cancellation after thumbnail generation
        if (abortController.signal.aborted) {
          throw new Error('Processing cancelled');
        }
      } catch (thumbError) {
        console.warn(`📁 FileProcessingService: Thumbnail generation failed for ${file.name}:`, thumbError);
      }

      // Create page structure
      const pages = Array.from({ length: totalPages }, (_, index) => ({
        pageNumber: index + 1,
        thumbnail: index === 0 ? thumbnailUrl : undefined, // Only page 1 gets thumbnail initially
        rotation: 0,
        splitBefore: false
      }));

      const metadata: ProcessedFileMetadata = {
        totalPages,
        pages,
        thumbnailUrl, // For FileEditor display
        lastProcessed: Date.now()
      };

      console.log(`📁 FileProcessingService: Processing complete for ${file.name} - ${totalPages} pages`);

      return {
        success: true,
        metadata
      };

    } catch (error) {
      console.error(`📁 FileProcessingService: Processing failed for ${file.name}:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      };
    }
  }

  /**
   * Clear all processing caches
   */
  clearCache(): void {
    this.processingCache.clear();
  }

  /**
   * Check if a file is currently being processed
   */
  isProcessing(fileId: FileId): boolean {
    return this.processingCache.has(fileId);
  }

  /**
   * Cancel processing for a specific file
   */
  cancelProcessing(fileId: FileId): boolean {
    const operation = this.processingCache.get(fileId);
    if (operation) {
      operation.abortController.abort();
      console.log(`📁 FileProcessingService: Cancelled processing for ${fileId}`);
      return true;
    }
    return false;
  }

  /**
   * Cancel all ongoing processing operations
   */
  cancelAllProcessing(): void {
    this.processingCache.forEach((operation, fileId) => {
      operation.abortController.abort();
      console.log(`📁 FileProcessingService: Cancelled processing for ${fileId}`);
    });
    console.log(`📁 FileProcessingService: Cancelled ${this.processingCache.size} processing operations`);
  }

  /**
   * Emergency cleanup - cancel all processing and destroy workers
   */
  emergencyCleanup(): void {
    this.cancelAllProcessing();
    this.clearCache();
    pdfWorkerManager.destroyAllDocuments();
  }
}

// Export singleton instance
export const fileProcessingService = new FileProcessingService();
