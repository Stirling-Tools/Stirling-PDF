/**
 * PDF.js Worker Manager - Centralized worker lifecycle management
 *
 * Prevents infinite worker creation by managing PDF.js workers globally
 * and ensuring proper cleanup when operations complete.
 *
 * Uses dynamic imports to avoid bundling PDF.js in main bundle.
 */

// Dynamic import types for TypeScript
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;
type GlobalWorkerOptions = typeof import('pdfjs-dist').GlobalWorkerOptions;
type GetDocumentFn = typeof import('pdfjs-dist').getDocument;

class PDFWorkerManager {
  private static instance: PDFWorkerManager;
  private activeDocuments = new Set<PDFDocumentProxy>();
  private workerCount = 0;
  private maxWorkers = 10; // Limit concurrent workers
  private isInitialized = false;
  private pdfjsLib: { GlobalWorkerOptions: GlobalWorkerOptions; getDocument: GetDocumentFn } | null = null;

  private constructor() {
    // Don't initialize worker in constructor - defer until first use
  }

  static getInstance(): PDFWorkerManager {
    if (!PDFWorkerManager.instance) {
      PDFWorkerManager.instance = new PDFWorkerManager();
    }
    return PDFWorkerManager.instance;
  }

  /**
   * Lazy-load PDF.js library and initialize worker once globally
   */
  private async initializeWorker(): Promise<void> {
    if (!this.isInitialized) {
      // Dynamic import - only loads when first PDF operation is needed
      this.pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      this.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      this.isInitialized = true;
    }
  }

  /**
   * Create a PDF document with proper lifecycle management
   * Supports ArrayBuffer, Uint8Array, URL string, or {data: ArrayBuffer} object
   */
  async createDocument(
    data: ArrayBuffer | Uint8Array | string | { data: ArrayBuffer },
    options: {
      disableAutoFetch?: boolean;
      disableStream?: boolean;
      stopAtErrors?: boolean;
      verbosity?: number;
    } = {}
  ): Promise<PDFDocumentProxy> {
    // Lazy-load PDF.js on first use
    await this.initializeWorker();

    if (!this.pdfjsLib) {
      throw new Error('Failed to load PDF.js library');
    }

    // Wait if we've hit the worker limit
    if (this.activeDocuments.size >= this.maxWorkers) {
      await this.waitForAvailableWorker();
    }

    // Normalize input data to PDF.js format
    let pdfData: any;
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      pdfData = { data };
    } else if (typeof data === 'string') {
      pdfData = data; // URL string
    } else if (data && typeof data === 'object' && 'data' in data) {
      pdfData = data; // Already in {data: ArrayBuffer} format
    } else {
      pdfData = data; // Pass through as-is
    }

    const loadingTask = this.pdfjsLib.getDocument(
      typeof pdfData === 'string' ? {
        url: pdfData,
        disableAutoFetch: options.disableAutoFetch ?? true,
        disableStream: options.disableStream ?? true,
        stopAtErrors: options.stopAtErrors ?? false,
        verbosity: options.verbosity ?? 0
      } : {
        ...pdfData,
        disableAutoFetch: options.disableAutoFetch ?? true,
        disableStream: options.disableStream ?? true,
        stopAtErrors: options.stopAtErrors ?? false,
        verbosity: options.verbosity ?? 0
      }
    );

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
    documentsToDestroy.forEach(pdf => {
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
      total: this.workerCount
    };
  }

  /**
   * Force cleanup of all workers (emergency cleanup)
   */
  emergencyCleanup(): void {
    // Force destroy all documents
    this.activeDocuments.forEach(pdf => {
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
