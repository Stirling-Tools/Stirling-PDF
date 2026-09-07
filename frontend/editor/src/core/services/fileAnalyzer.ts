import { FileAnalysis, ProcessingStrategy } from "@app/types/processing";
import {
  getPdfiumModule,
  openRawDocumentSafe,
  closeDocAndFreeBuffer,
  getRawPageCount,
  PdfiumOpenError,
  FPDF_ERR_PASSWORD,
} from "@app/services/pdfiumService";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

// Bounded window scanned at each end of the PDF for an /Encrypt entry. The
// trailer sits at the tail; linearized files also keep a first-page trailer at
// the head. Sliced, so a multi-GB file is never read into memory.
const ENCRYPT_PROBE_BYTES = 64 * 1024;

function bufferHasEncryptMarker(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  // "/Encrypt" as ASCII bytes
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74];
  outer: for (let i = 0; i <= view.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (view[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function hasEncryptMarker(file: File): Promise<boolean> {
  const tailStart = Math.max(0, file.size - ENCRYPT_PROBE_BYTES);
  if (bufferHasEncryptMarker(await file.slice(tailStart).arrayBuffer())) {
    return true;
  }
  if (tailStart === 0) return false;
  return bufferHasEncryptMarker(
    await file.slice(0, ENCRYPT_PROBE_BYTES).arrayBuffer(),
  );
}

export class FileAnalyzer {
  private static readonly SIZE_THRESHOLDS = {
    SMALL: 10 * 1024 * 1024, // 10MB
    MEDIUM: 50 * 1024 * 1024, // 50MB
    LARGE: 200 * 1024 * 1024, // 200MB
  };

  private static readonly PAGE_THRESHOLDS = {
    FEW: 10, // < 10 pages - immediate full processing
    MANY: 50, // < 50 pages - priority pages
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
      recommendedStrategy: "metadata_only",
      estimatedProcessingTime: 0,
    };

    try {
      const quick = await this.quickPDFAnalysis(file);
      analysis.estimatedPageCount = quick.pageCount;
      analysis.isEncrypted = quick.isEncrypted;
      analysis.isCorrupted = quick.isCorrupted;
    } catch {
      analysis.isCorrupted = true;
    }

    analysis.recommendedStrategy = this.determineStrategy(
      analysis.fileSize,
      analysis.estimatedPageCount,
    );

    analysis.estimatedProcessingTime = this.estimateProcessingTime(
      analysis.fileSize,
      analysis.estimatedPageCount,
      analysis.recommendedStrategy,
    );

    return analysis;
  }

  /**
   * Cheap encryption-only probe for the upload-time detection path.
   *
   * Looks for a /Encrypt entry in a bounded window at either end of the file
   * (where PDF trailers live). If absent, the file is definitely not encrypted
   * and we can skip a full pdf.js parse. If present, falls back to pdf.js so we
   * can distinguish user-password (blocks open) from owner-password-only (opens
   * fine); only the former should prompt.
   *
   * Runs inside the addFiles mutex, so it must always settle: an unbounded
   * parse here stalls every later upload as well as this one.
   */
  static async isPDFUserPasswordProtected(file: File): Promise<boolean> {
    if (!(await hasEncryptMarker(file))) return false;

    // Too big to hand pdf.js: that full-buffer parse is the renderer OOM the
    // large-file path exists to avoid, so trust the marker instead of it.
    if (file.size >= LARGE_PDF_PARSE_LIMIT) return true;

    const m = await getPdfiumModule();
    let docPtr: number | null = null;
    try {
      const arrayBuffer = await file.arrayBuffer();
      docPtr = await openRawDocumentSafe(arrayBuffer, "");
      return false;
    } catch (error) {
      if (
        error instanceof PdfiumOpenError &&
        error.code === FPDF_ERR_PASSWORD
      ) {
        return true;
      }
      return true;
    } finally {
      if (docPtr != null) {
        closeDocAndFreeBuffer(m, docPtr);
      }
    }
  }

  static async quickPDFAnalysis(file: File): Promise<{
    pageCount: number;
    isEncrypted: boolean;
    isCorrupted: boolean;
  }> {
    if (file.size >= LARGE_PDF_PARSE_LIMIT) {
      return {
        pageCount: 0,
        isEncrypted: await hasEncryptMarker(file),
        isCorrupted: false,
      };
    }

    const m = await getPdfiumModule();
    let docPtr: number | null = null;
    try {
      const arrayBuffer = await file.arrayBuffer();
      docPtr = await openRawDocumentSafe(arrayBuffer, "");
      const pageCount = await getRawPageCount(docPtr);
      return {
        pageCount,
        isEncrypted: false,
        isCorrupted: false,
      };
    } catch (error) {
      const isEncrypted =
        error instanceof PdfiumOpenError && error.code === FPDF_ERR_PASSWORD;
      return {
        pageCount: 0,
        isEncrypted,
        isCorrupted: !isEncrypted,
      };
    } finally {
      if (docPtr != null) {
        closeDocAndFreeBuffer(m, docPtr);
      }
    }
  }

  /**
   * Determine the best processing strategy based on file characteristics
   */
  private static determineStrategy(
    fileSize: number,
    pageCount?: number,
  ): ProcessingStrategy {
    // Handle corrupted or encrypted files
    if (!pageCount || pageCount === 0) {
      return "metadata_only";
    }

    // Small files with few pages - process everything immediately
    if (
      fileSize <= this.SIZE_THRESHOLDS.SMALL &&
      pageCount <= this.PAGE_THRESHOLDS.FEW
    ) {
      return "immediate_full";
    }

    // Medium files or many pages - priority pages first, then progressive
    if (
      fileSize <= this.SIZE_THRESHOLDS.MEDIUM &&
      pageCount <= this.PAGE_THRESHOLDS.MANY
    ) {
      return "priority_pages";
    }

    // Large files or massive page counts - chunked processing
    if (
      fileSize <= this.SIZE_THRESHOLDS.LARGE &&
      pageCount <= this.PAGE_THRESHOLDS.MASSIVE
    ) {
      return "progressive_chunked";
    }

    // Very large files - metadata only
    return "metadata_only";
  }

  /**
   * Estimate processing time based on file characteristics and strategy
   */
  private static estimateProcessingTime(
    _fileSize: number,
    pageCount: number = 0,
    strategy: ProcessingStrategy,
  ): number {
    const baseTimes = {
      immediate_full: 200, // 200ms per page
      priority_pages: 150, // 150ms per page (optimized)
      progressive_chunked: 100, // 100ms per page (chunked)
      metadata_only: 50, // 50ms total
    };

    const baseTime = baseTimes[strategy];

    switch (strategy) {
      case "metadata_only":
        return baseTime;

      case "immediate_full":
        return pageCount * baseTime;

      case "priority_pages": {
        // Estimate time for priority pages (first 10)
        const priorityPages = Math.min(pageCount, 10);
        return priorityPages * baseTime;
      }

      case "progressive_chunked": {
        // Estimate time for first chunk (20 pages)
        const firstChunk = Math.min(pageCount, 20);
        return firstChunk * baseTime;
      }

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
      shouldUseWebWorker:
        totalPages > 100 || totalSize > this.SIZE_THRESHOLDS.MEDIUM,
      memoryWarning:
        totalSize > this.SIZE_THRESHOLDS.LARGE ||
        totalPages > this.PAGE_THRESHOLDS.MASSIVE,
    };

    return { analyses, recommendations };
  }

  /**
   * Calculate optimal batch size for processing multiple files
   */
  private static calculateBatchSize(
    fileCount: number,
    totalSize: number,
  ): number {
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
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return false;
    }

    try {
      // Read first few bytes to check PDF header
      const header = file.slice(0, 8);
      const headerBytes = new Uint8Array(await header.arrayBuffer());
      const headerString = String.fromCharCode(...headerBytes);

      return headerString.startsWith("%PDF-");
    } catch {
      return false;
    }
  }
}
