/**
 * PDF.js Worker Manager - Centralized worker lifecycle management
 * 
 * Prevents infinite worker creation by managing PDF.js workers globally
 * and ensuring proper cleanup when operations complete.
 */

import * as pdfjsLib from 'pdfjs-dist';
const { getDocument, GlobalWorkerOptions } = pdfjsLib;

class PDFWorkerManager {
  private static instance: PDFWorkerManager;
  private activeDocuments = new Set<any>();
  private workerCount = 0;
  private maxWorkers = 3; // Limit concurrent workers
  private isInitialized = false;

  private constructor() {
    this.initializeWorker();
  }

  static getInstance(): PDFWorkerManager {
    if (!PDFWorkerManager.instance) {
      PDFWorkerManager.instance = new PDFWorkerManager();
    }
    return PDFWorkerManager.instance;
  }

  /**
   * Initialize PDF.js worker once globally
   */
  private initializeWorker(): void {
    if (!this.isInitialized) {
      GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
      this.isInitialized = true;
      console.log('🏭 PDF.js worker initialized');
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
  ): Promise<any> {
    // Wait if we've hit the worker limit
    if (this.activeDocuments.size >= this.maxWorkers) {
      console.warn(`🏭 PDF Worker limit reached (${this.maxWorkers}), waiting for available worker...`);
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

    const loadingTask = getDocument(
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
      
      console.log(`🏭 PDF document created (active: ${this.activeDocuments.size}/${this.maxWorkers})`);
      
      return pdf;
    } catch (error) {
      // If document creation fails, make sure to clean up the loading task
      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch (destroyError) {
          console.warn('🏭 Error destroying failed loading task:', destroyError);
        }
      }
      throw error;
    }
  }

  /**
   * Properly destroy a PDF document and clean up resources
   */
  destroyDocument(pdf: any): void {
    if (this.activeDocuments.has(pdf)) {
      try {
        pdf.destroy();
        this.activeDocuments.delete(pdf);
        this.workerCount = Math.max(0, this.workerCount - 1);
        
        console.log(`🏭 PDF document destroyed (active: ${this.activeDocuments.size}/${this.maxWorkers})`);
      } catch (error) {
        console.warn('🏭 Error destroying PDF document:', error);
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
    console.log(`🏭 Destroying all PDF documents (${this.activeDocuments.size} active)`);
    
    const documentsToDestroy = Array.from(this.activeDocuments);
    documentsToDestroy.forEach(pdf => {
      this.destroyDocument(pdf);
    });
    
    this.activeDocuments.clear();
    this.workerCount = 0;
    
    console.log('🏭 All PDF documents destroyed');
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
    console.warn('🏭 Emergency PDF worker cleanup initiated');
    
    // Force destroy all documents
    this.activeDocuments.forEach(pdf => {
      try {
        pdf.destroy();
      } catch (error) {
        console.warn('🏭 Emergency cleanup - error destroying document:', error);
      }
    });
    
    this.activeDocuments.clear();
    this.workerCount = 0;
    
    console.warn('🏭 Emergency cleanup completed');
  }

  /**
   * Set maximum concurrent workers
   */
  setMaxWorkers(max: number): void {
    this.maxWorkers = Math.max(1, Math.min(max, 10)); // Between 1-10 workers
    console.log(`🏭 Max workers set to ${this.maxWorkers}`);
  }
}

// Export singleton instance
export const pdfWorkerManager = PDFWorkerManager.getInstance();