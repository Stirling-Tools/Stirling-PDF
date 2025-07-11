import { getDocument } from 'pdfjs-dist';
import { FileAnalysis, ProcessingStrategy } from '../types/processing';

export class FileAnalyzer {
  private static readonly SIZE_THRESHOLDS = {
    SMALL: 10 * 1024 * 1024,  // 10MB
    MEDIUM: 50 * 1024 * 1024, // 50MB
    LARGE: 200 * 1024 * 1024, // 200MB
  };

  private static readonly PAGE_THRESHOLDS = {
    FEW: 10,    // < 10 pages - immediate full processing
    MANY: 50,   // < 50 pages - priority pages
    MASSIVE: 100, // < 100 pages - progressive chunked
    // >100 pages = metadata only
  };

  /**
   * Analyze a file to determine optimal processing strategy
   */
  static async analyzeFile(file: File): Promise<FileAnalysis> {
    const analysis: FileAnalysis = {
      fileSize: file.size,
      isEncrypted: false,
      isCorrupted: false,
      recommendedStrategy: 'metadata_only',
      estimatedProcessingTime: 0,
    };

    try {
      // Quick validation and page count estimation
      const quickAnalysis = await this.quickPDFAnalysis(file);
      analysis.estimatedPageCount = quickAnalysis.pageCount;
      analysis.isEncrypted = quickAnalysis.isEncrypted;
      analysis.isCorrupted = quickAnalysis.isCorrupted;

      // Determine strategy based on file characteristics
      analysis.recommendedStrategy = this.determineStrategy(file.size, quickAnalysis.pageCount);
      
      // Estimate processing time
      analysis.estimatedProcessingTime = this.estimateProcessingTime(
        file.size, 
        quickAnalysis.pageCount, 
        analysis.recommendedStrategy
      );

    } catch (error) {
      console.error('File analysis failed:', error);
      analysis.isCorrupted = true;
      analysis.recommendedStrategy = 'metadata_only';
    }

    return analysis;
  }

  /**
   * Quick PDF analysis without full processing
   */
  private static async quickPDFAnalysis(file: File): Promise<{
    pageCount: number;
    isEncrypted: boolean;
    isCorrupted: boolean;
  }> {
    try {
      // For small files, read the whole file
      // For large files, try the whole file first (PDF.js needs the complete structure)
      const arrayBuffer = await file.arrayBuffer();

      const pdf = await getDocument({ 
        data: arrayBuffer,
        stopAtErrors: false, // Don't stop at minor errors
        verbosity: 0 // Suppress PDF.js warnings
      }).promise;

      const pageCount = pdf.numPages;
      const isEncrypted = pdf.isEncrypted;
      
      // Clean up
      pdf.destroy();

      return {
        pageCount,
        isEncrypted,
        isCorrupted: false
      };

    } catch (error) {
      // Try to determine if it's corruption vs encryption
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      const isEncrypted = errorMessage.includes('password') || errorMessage.includes('encrypted');
      
      return {
        pageCount: 0,
        isEncrypted,
        isCorrupted: !isEncrypted // If not encrypted, probably corrupted
      };
    }
  }

  /**
   * Determine the best processing strategy based on file characteristics
   */
  private static determineStrategy(fileSize: number, pageCount?: number): ProcessingStrategy {
    // Handle corrupted or encrypted files
    if (!pageCount || pageCount === 0) {
      return 'metadata_only';
    }

    // Small files with few pages - process everything immediately
    if (fileSize <= this.SIZE_THRESHOLDS.SMALL && pageCount <= this.PAGE_THRESHOLDS.FEW) {
      return 'immediate_full';
    }

    // Medium files or many pages - priority pages first, then progressive
    if (fileSize <= this.SIZE_THRESHOLDS.MEDIUM && pageCount <= this.PAGE_THRESHOLDS.MANY) {
      return 'priority_pages';
    }

    // Large files or massive page counts - chunked processing
    if (fileSize <= this.SIZE_THRESHOLDS.LARGE && pageCount <= this.PAGE_THRESHOLDS.MASSIVE) {
      return 'progressive_chunked';
    }

    // Very large files - metadata only
    return 'metadata_only';
  }

  /**
   * Estimate processing time based on file characteristics and strategy
   */
  private static estimateProcessingTime(
    fileSize: number, 
    pageCount: number = 0, 
    strategy: ProcessingStrategy
  ): number {
    const baseTimes = {
      immediate_full: 200,      // 200ms per page
      priority_pages: 150,     // 150ms per page (optimized)
      progressive_chunked: 100, // 100ms per page (chunked)
      metadata_only: 50        // 50ms total
    };

    const baseTime = baseTimes[strategy];

    switch (strategy) {
      case 'metadata_only':
        return baseTime;
      
      case 'immediate_full':
        return pageCount * baseTime;
      
      case 'priority_pages':
        // Estimate time for priority pages (first 10)
        const priorityPages = Math.min(pageCount, 10);
        return priorityPages * baseTime;
      
      case 'progressive_chunked':
        // Estimate time for first chunk (20 pages)
        const firstChunk = Math.min(pageCount, 20);
        return firstChunk * baseTime;
      
      default:
        return pageCount * baseTime;
    }
  }

  /**
   * Get processing recommendations for a set of files
   */
  static async analyzeMultipleFiles(files: File[]): Promise<{
    analyses: Map<File, FileAnalysis>;
    recommendations: {
      totalEstimatedTime: number;
      suggestedBatchSize: number;
      shouldUseWebWorker: boolean;
      memoryWarning: boolean;
    };
  }> {
    const analyses = new Map<File, FileAnalysis>();
    let totalEstimatedTime = 0;
    let totalSize = 0;
    let totalPages = 0;

    // Analyze each file
    for (const file of files) {
      const analysis = await this.analyzeFile(file);
      analyses.set(file, analysis);
      totalEstimatedTime += analysis.estimatedProcessingTime;
      totalSize += file.size;
      totalPages += analysis.estimatedPageCount || 0;
    }

    // Generate recommendations
    const recommendations = {
      totalEstimatedTime,
      suggestedBatchSize: this.calculateBatchSize(files.length, totalSize),
      shouldUseWebWorker: totalPages > 100 || totalSize > this.SIZE_THRESHOLDS.MEDIUM,
      memoryWarning: totalSize > this.SIZE_THRESHOLDS.LARGE || totalPages > this.PAGE_THRESHOLDS.MASSIVE
    };

    return { analyses, recommendations };
  }

  /**
   * Calculate optimal batch size for processing multiple files
   */
  private static calculateBatchSize(fileCount: number, totalSize: number): number {
    // Process small batches for large total sizes
    if (totalSize > this.SIZE_THRESHOLDS.LARGE) {
      return Math.max(1, Math.floor(fileCount / 4));
    }
    
    if (totalSize > this.SIZE_THRESHOLDS.MEDIUM) {
      return Math.max(2, Math.floor(fileCount / 2));
    }
    
    // Process all at once for smaller total sizes
    return fileCount;
  }

  /**
   * Check if a file appears to be a valid PDF
   */
  static async isValidPDF(file: File): Promise<boolean> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return false;
    }

    try {
      // Read first few bytes to check PDF header
      const header = file.slice(0, 8);
      const headerBytes = new Uint8Array(await header.arrayBuffer());
      const headerString = String.fromCharCode(...headerBytes);
      
      return headerString.startsWith('%PDF-');
    } catch (error) {
      return false;
    }
  }
}