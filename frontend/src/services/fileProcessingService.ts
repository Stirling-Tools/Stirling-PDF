/**
 * Centralized file processing service
 * Handles metadata discovery, page counting, and thumbnail generation
 * Called when files are added to FileContext, before any view sees them
 */

import { getDocument } from 'pdfjs-dist';
import { generateThumbnailForFile } from '../utils/thumbnailUtils';

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

class FileProcessingService {
  private processingCache = new Map<string, Promise<FileProcessingResult>>();

  /**
   * Process a file to extract metadata, page count, and generate thumbnails
   * This is the single source of truth for file processing
   */
  async processFile(file: File, fileId: string): Promise<FileProcessingResult> {
    // Check if we're already processing this file
    const existingPromise = this.processingCache.get(fileId);
    if (existingPromise) {
      console.log(`📁 FileProcessingService: Using cached processing for ${file.name}`);
      return existingPromise;
    }

    // Create processing promise
    const processingPromise = this.performProcessing(file, fileId);
    this.processingCache.set(fileId, processingPromise);

    // Clean up cache after completion
    processingPromise.finally(() => {
      this.processingCache.delete(fileId);
    });

    return processingPromise;
  }

  private async performProcessing(file: File, fileId: string): Promise<FileProcessingResult> {
    console.log(`📁 FileProcessingService: Starting processing for ${file.name} (${fileId})`);

    try {
      let totalPages = 1;
      let thumbnailUrl: string | undefined;

      // Handle PDF files
      if (file.type === 'application/pdf') {
        // Discover page count using PDF.js (most accurate)
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await getDocument({
            data: arrayBuffer,
            disableAutoFetch: true,
            disableStream: true
          }).promise;

          totalPages = pdfDoc.numPages;
          console.log(`📁 FileProcessingService: PDF.js discovered ${totalPages} pages for ${file.name}`);

          // Clean up immediately
          pdfDoc.destroy();
        } catch (pdfError) {
          console.warn(`📁 FileProcessingService: PDF.js failed for ${file.name}, trying fallback:`, pdfError);
          
          // Fallback to text analysis
          try {
            const arrayBuffer = await file.arrayBuffer();
            const text = new TextDecoder('latin1').decode(arrayBuffer);
            const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
            totalPages = pageMatches ? pageMatches.length : 1;
            console.log(`📁 FileProcessingService: Text analysis discovered ${totalPages} pages for ${file.name}`);
          } catch (textError) {
            console.warn(`📁 FileProcessingService: Text analysis also failed for ${file.name}:`, textError);
            totalPages = 1;
          }
        }
      }

      // Generate page 1 thumbnail
      try {
        thumbnailUrl = await generateThumbnailForFile(file);
        console.log(`📁 FileProcessingService: Generated thumbnail for ${file.name}`);
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
  isProcessing(fileId: string): boolean {
    return this.processingCache.has(fileId);
  }
}

// Export singleton instance
export const fileProcessingService = new FileProcessingService();