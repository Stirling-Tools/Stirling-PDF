import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { ProcessedFile, ProcessingState, PDFPage } from '../types/processing';
import { ProcessingCache } from './processingCache';

// Set up PDF.js worker
GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

export class PDFProcessingService {
  private static instance: PDFProcessingService;
  private cache = new ProcessingCache();
  private processing = new Map<string, ProcessingState>();
  private processingListeners = new Set<(states: Map<string, ProcessingState>) => void>();

  private constructor() {}

  static getInstance(): PDFProcessingService {
    if (!PDFProcessingService.instance) {
      PDFProcessingService.instance = new PDFProcessingService();
    }
    return PDFProcessingService.instance;
  }

  async getProcessedFile(file: File): Promise<ProcessedFile | null> {
    const fileKey = this.generateFileKey(file);
    
    // Check cache first
    const cached = this.cache.get(fileKey);
    if (cached) {
      console.log('Cache hit for:', file.name);
      return cached;
    }
    
    // Check if already processing
    if (this.processing.has(fileKey)) {
      console.log('Already processing:', file.name);
      return null; // Will be available when processing completes
    }
    
    // Start processing
    this.startProcessing(file, fileKey);
    return null;
  }

  private async startProcessing(file: File, fileKey: string): Promise<void> {
    // Set initial state
    const state: ProcessingState = {
      fileKey,
      fileName: file.name,
      status: 'processing',
      progress: 0,
      startedAt: Date.now()
    };
    
    this.processing.set(fileKey, state);
    this.notifyListeners();

    try {
      // Process the file with progress updates
      const processedFile = await this.processFileWithProgress(file, (progress) => {
        state.progress = progress;
        this.notifyListeners();
      });

      // Cache the result
      this.cache.set(fileKey, processedFile);
      
      // Update state to completed
      state.status = 'completed';
      state.progress = 100;
      state.completedAt = Date.now();
      this.notifyListeners();
      
      // Remove from processing map after brief delay
      setTimeout(() => {
        this.processing.delete(fileKey);
        this.notifyListeners();
      }, 2000);

    } catch (error) {
      console.error('Processing failed for', file.name, ':', error);
      state.status = 'error';
      state.error = error instanceof Error ? error.message : 'Unknown error';
      this.notifyListeners();
      
      // Remove failed processing after delay
      setTimeout(() => {
        this.processing.delete(fileKey);
        this.notifyListeners();
      }, 5000);
    }
  }

  private async processFileWithProgress(
    file: File, 
    onProgress: (progress: number) => void
  ): Promise<ProcessedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    onProgress(10); // PDF loaded
    
    const pages: PDFPage[] = [];
    
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const context = canvas.getContext('2d');
      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
        const thumbnail = canvas.toDataURL();
        
        pages.push({
          id: `${file.name}-page-${i}`,
          pageNumber: i,
          thumbnail,
          rotation: 0,
          selected: false
        });
      }
      
      // Update progress
      const progress = 10 + (i / totalPages) * 85; // 10-95%
      onProgress(progress);
    }
    
    pdf.destroy();
    onProgress(100);
    
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pages,
      totalPages,
      metadata: {
        title: file.name,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      }
    };
  }

  // State subscription for components
  onProcessingChange(callback: (states: Map<string, ProcessingState>) => void): () => void {
    this.processingListeners.add(callback);
    return () => this.processingListeners.delete(callback);
  }

  getProcessingStates(): Map<string, ProcessingState> {
    return new Map(this.processing);
  }

  private notifyListeners(): void {
    this.processingListeners.forEach(callback => callback(this.processing));
  }

  generateFileKey(file: File): string {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  // Cleanup method for activeFiles changes
  cleanup(removedFiles: File[]): void {
    removedFiles.forEach(file => {
      const key = this.generateFileKey(file);
      this.cache.delete(key);
      this.processing.delete(key);
    });
    this.notifyListeners();
  }

  // Get cache stats (for debugging)
  getCacheStats() {
    return this.cache.getStats();
  }

  // Clear all cache and processing
  clearAll(): void {
    this.cache.clear();
    this.processing.clear();
    this.notifyListeners();
  }
}

// Export singleton instance
export const pdfProcessingService = PDFProcessingService.getInstance();