/**
 * PDF.js Worker Manager - Centralized worker lifecycle management
 *
 * Prevents infinite worker creation by managing PDF.js workers globally
 * and ensuring proper cleanup when operations complete.
 */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjs: Promise<PdfJs> | null = null;

/**
 * pdf.js, loaded on first use rather than with this module. The manager is on the
 * startup graph (file analysis runs on every add), and a static import put all of
 * pdf.js on the initial load before anything needed it. A failed load is not
 * cached, so a dropped connection does not end PDF parsing for the session.
 */
export function loadPdfjs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs").then(
    (lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      (lib.GlobalWorkerOptions as { docBaseUrl?: string }).docBaseUrl =
        undefined;
      return lib;
    },
    (error: unknown) => {
      pdfjs = null;
      throw error;
    },
  );
  return pdfjs;
}

/** A document did not open inside the caller's `openTimeoutMs`. */
export class PdfOpenTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`PDF did not open within ${timeoutMs}ms`);
    this.name = "PdfOpenTimeout";
  }
}

class PDFWorkerManager {
  private static instance: PDFWorkerManager;
  private activeDocuments = new Set<PDFDocumentProxy>();
  private destroyingDocuments = new WeakSet<PDFDocumentProxy>();
  private workerCount = 0;
  private maxWorkers = 10; // Limit concurrent workers

  private constructor() {}

  static getInstance(): PDFWorkerManager {
    if (!PDFWorkerManager.instance) {
      PDFWorkerManager.instance = new PDFWorkerManager();
    }
    return PDFWorkerManager.instance;
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
      signal?: { cancelled: boolean };
      /** Reject with {@link PdfOpenTimeout} if the document has not opened by then,
       *  destroying the loading task. A worker that dies mid-parse never settles its
       *  promise, so without this its task and the file's bytes are held for the life
       *  of the page. */
      openTimeoutMs?: number;
    } = {},
  ): Promise<PDFDocumentProxy> {
    // Wait if we've hit the worker limit
    if (this.activeDocuments.size >= this.maxWorkers) {
      await this.waitForAvailableWorker(options.signal);
    }

    // Normalize input data to PDF.js format
    let pdfData: string | { data: ArrayBuffer | Uint8Array };
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      pdfData = { data };
    } else if (typeof data === "string") {
      pdfData = data; // URL string
    } else if (data && typeof data === "object" && "data" in data) {
      pdfData = data; // Already in {data: ArrayBuffer} format
    } else {
      pdfData = data; // Pass through as-is
    }

    const { getDocument } = await loadPdfjs();
    const loadingTask = getDocument(
      typeof pdfData === "string"
        ? {
            url: pdfData,
            disableAutoFetch: options.disableAutoFetch ?? true,
            disableStream: options.disableStream ?? true,
            stopAtErrors: options.stopAtErrors ?? false,
            verbosity: options.verbosity ?? 0,
            // Suppress warnings about unimplemented widget types and other non-critical issues
            isEvalSupported: false,
          }
        : {
            ...pdfData,
            disableAutoFetch: options.disableAutoFetch ?? true,
            disableStream: options.disableStream ?? true,
            stopAtErrors: options.stopAtErrors ?? false,
            verbosity: options.verbosity ?? 0,
            // Suppress warnings about unimplemented widget types and other non-critical issues
            isEvalSupported: false,
          },
    );

    const openTimeoutMs = options.openTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const opened =
        openTimeoutMs === undefined
          ? loadingTask.promise
          : Promise.race([
              loadingTask.promise,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new PdfOpenTimeout(openTimeoutMs)),
                  openTimeoutMs,
                );
              }),
            ]);
      const pdf = await opened;
      this.activeDocuments.add(pdf);
      this.workerCount++;

      return pdf;
    } catch (error) {
      // If document creation fails, make sure to clean up the loading task
      if (loadingTask) {
        try {
          void loadingTask.destroy();
        } catch {
          // Ignore errors
        }
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  /**
   * Properly destroy a PDF document and clean up resources
   */
  async destroyDocument(pdf: PDFDocumentProxy): Promise<void> {
    if (!this.activeDocuments.has(pdf) || this.destroyingDocuments.has(pdf)) {
      return;
    }
    this.destroyingDocuments.add(pdf);
    try {
      await pdf.destroy();
    } catch {
      // Still remove from tracking if destroy fails.
    } finally {
      this.destroyingDocuments.delete(pdf);
      this.activeDocuments.delete(pdf);
      this.workerCount = Math.max(0, this.workerCount - 1);
    }
  }

  /**
   * Destroy all active PDF documents
   */
  async destroyAllDocuments(): Promise<void> {
    const documentsToDestroy = Array.from(this.activeDocuments);
    await Promise.all(
      documentsToDestroy.map((pdf) => this.destroyDocument(pdf)),
    );
  }

  /**
   * Wait for a worker to become available
   */
  private async waitForAvailableWorker(signal?: {
    cancelled: boolean;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const checkAvailability = () => {
        if (signal?.cancelled) {
          if (timer !== null) clearTimeout(timer);
          reject(new Error("CANCELLED"));
          return;
        }
        if (this.activeDocuments.size < this.maxWorkers) {
          resolve();
        } else {
          timer = setTimeout(checkAvailability, 100);
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
        void pdf.destroy();
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
