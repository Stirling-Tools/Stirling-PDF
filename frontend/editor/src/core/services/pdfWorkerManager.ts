/**
 * PDF.js Worker Manager - Centralized worker lifecycle management.
 *
 * Prevents infinite worker creation by managing PDF.js workers globally
 * and ensuring proper cleanup when operations complete. The pdfjs bundle
 * (~450 KB) is imported lazily on first use so it never enters the startup
 * graph.
 */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

const loadPdfjs = (): Promise<PdfjsModule> => {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
};

type PdfSource =
  | ArrayBuffer
  | Uint8Array<ArrayBufferLike>
  | string
  | {
      data: ArrayBuffer | Uint8Array<ArrayBufferLike>;
    };

class PDFWorkerManager {
  private static instance: PDFWorkerManager;
  private activeDocuments = new Set<PDFDocumentProxy>();
  private workerCount = 0;
  private maxWorkers = 10; // Limit concurrent workers
  private isInitialized = false;

  private constructor() {
    // Worker setup is deferred to the first createDocument call.
  }

  static getInstance(): PDFWorkerManager {
    if (!PDFWorkerManager.instance) {
      PDFWorkerManager.instance = new PDFWorkerManager();
    }
    return PDFWorkerManager.instance;
  }

  /**
   * Initialize PDF.js worker once globally.
   */
  private async initializeWorker(): Promise<PdfjsModule> {
    const pdfjs = await loadPdfjs();
    if (!this.isInitialized) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      (
        pdfjs.GlobalWorkerOptions as typeof pdfjs.GlobalWorkerOptions & {
          docBaseUrl?: string;
        }
      ).docBaseUrl = undefined;
      this.isInitialized = true;
    }
    return pdfjs;
  }

  /**
   * Create a PDF document with proper lifecycle management.
   * Supports ArrayBuffer, Uint8Array, URL string, or {data: ArrayBuffer} object.
   */
  async createDocument(
    data: PdfSource,
    options: {
      disableAutoFetch?: boolean;
      disableStream?: boolean;
      stopAtErrors?: boolean;
      verbosity?: number;
    } = {},
  ): Promise<PDFDocumentProxy> {
    // Wait if we've hit the worker limit
    if (this.activeDocuments.size >= this.maxWorkers) {
      await this.waitForAvailableWorker();
    }

    const pdfjs = await this.initializeWorker();

    // Normalize input data to PDF.js format
    const pdfData:
      | string
      | { data: ArrayBuffer | Uint8Array<ArrayBufferLike> } =
      data instanceof ArrayBuffer || data instanceof Uint8Array
        ? { data }
        : data;

    const commonOptions = {
      disableAutoFetch: options.disableAutoFetch ?? true,
      disableStream: options.disableStream ?? true,
      stopAtErrors: options.stopAtErrors ?? false,
      verbosity: options.verbosity ?? 0,
      // Suppress warnings about unimplemented widget types and other non-critical issues
      isEvalSupported: false,
    };

    const loadingTask =
      typeof pdfData === "string"
        ? pdfjs.getDocument({ url: pdfData, ...commonOptions })
        : pdfjs.getDocument({ ...pdfData, ...commonOptions });

    try {
      const pdf = await loadingTask.promise;
      this.activeDocuments.add(pdf);
      this.workerCount++;

      return pdf;
    } catch (error) {
      // If document creation fails, make sure to clean up the loading task
      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          // Ignore errors
        }
      }
      throw error;
    }
  }

  /**
   * Properly destroy a PDF document and clean up resources
   */
  destroyDocument(pdf: PDFDocumentProxy): void {
    if (this.activeDocuments.has(pdf)) {
      try {
        pdf.destroy();
        this.activeDocuments.delete(pdf);
        this.workerCount = Math.max(0, this.workerCount - 1);
      } catch {
        // Still remove from tracking even if destroy failed
        this.activeDocuments.delete(pdf);
        this.workerCount = Math.max(0, this.workerCount - 1);
      }
    }
  }

  /**
   * Destroy all active PDF documents
   */
  destroyAllDocuments(): void {
    const documentsToDestroy = Array.from(this.activeDocuments);
    documentsToDestroy.forEach((pdf) => {
      this.destroyDocument(pdf);
    });

    this.activeDocuments.clear();
    this.workerCount = 0;
  }

  /**
   * Wait for a worker to become available
   */
  private async waitForAvailableWorker(): Promise<void> {
    return new Promise((resolve) => {
      const checkAvailability = () => {
        if (this.activeDocuments.size < this.maxWorkers) {
          resolve();
        } else {
          setTimeout(checkAvailability, 100);
        }
      };
      checkAvailability();
    });
  }

  /**
   * Get current worker statistics
   */
  getWorkerStats() {
    return {
      active: this.activeDocuments.size,
      max: this.maxWorkers,
      total: this.workerCount,
    };
  }

  /**
   * Force cleanup of all workers (emergency cleanup)
   */
  emergencyCleanup(): void {
    // Force destroy all documents
    this.activeDocuments.forEach((pdf) => {
      try {
        pdf.destroy();
      } catch {
        // Ignore errors
      }
    });

    this.activeDocuments.clear();
    this.workerCount = 0;
  }

  /**
   * Set maximum concurrent workers
   */
  setMaxWorkers(max: number): void {
    this.maxWorkers = Math.max(1, Math.min(max, 15)); // Between 1-15 workers for multi-file support
  }
}

// Export singleton instance
export const pdfWorkerManager = PDFWorkerManager.getInstance();
