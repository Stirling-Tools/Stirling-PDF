import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { ProcessedFile, ProcessingState, PDFPage, ProcessingStrategy, ProcessingConfig, ProcessingMetrics } from '../types/processing';
import { ProcessingCache } from './processingCache';
import { FileHasher } from '../utils/fileHash';
import { FileAnalyzer } from './fileAnalyzer';
import { ProcessingErrorHandler } from './processingErrorHandler';

// Set up PDF.js worker
GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

export class EnhancedPDFProcessingService {
  private static instance: EnhancedPDFProcessingService;
  private cache = new ProcessingCache();
  private processing = new Map<string, ProcessingState>();
  private processingListeners = new Set<(states: Map<string, ProcessingState>) => void>();
  private metrics: ProcessingMetrics = {
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    averageProcessingTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0
  };

  private defaultConfig: ProcessingConfig = {
    strategy: 'immediate_full',
    chunkSize: 20,
    thumbnailQuality: 'medium',
    priorityPageCount: 10,
    useWebWorker: false,
    maxRetries: 3,
    timeoutMs: 300000 // 5 minutes
  };

  private constructor() {}

  static getInstance(): EnhancedPDFProcessingService {
    if (!EnhancedPDFProcessingService.instance) {
      EnhancedPDFProcessingService.instance = new EnhancedPDFProcessingService();
    }
    return EnhancedPDFProcessingService.instance;
  }

  /**
   * Process a file with intelligent strategy selection
   */
  async processFile(file: File, customConfig?: Partial<ProcessingConfig>): Promise<ProcessedFile | null> {
    const fileKey = await this.generateFileKey(file);
    
    // Check cache first
    const cached = this.cache.get(fileKey);
    if (cached) {
      this.updateMetrics('cacheHit');
      return cached;
    }
    
    // Check if already processing
    if (this.processing.has(fileKey)) {
      return null;
    }
    
    // Analyze file to determine optimal strategy
    const analysis = await FileAnalyzer.analyzeFile(file);
    if (analysis.isCorrupted) {
      throw new Error(`File ${file.name} appears to be corrupted`);
    }
    
    // Create processing config
    const config: ProcessingConfig = {
      ...this.defaultConfig,
      strategy: analysis.recommendedStrategy,
      ...customConfig
    };
    
    // Start processing
    this.startProcessing(file, fileKey, config, analysis.estimatedProcessingTime);
    return null;
  }

  /**
   * Start processing a file with the specified configuration
   */
  private async startProcessing(
    file: File, 
    fileKey: string, 
    config: ProcessingConfig,
    estimatedTime: number
  ): Promise<void> {
    // Create cancellation token
    const cancellationToken = ProcessingErrorHandler.createTimeoutController(config.timeoutMs);
    
    // Set initial state
    const state: ProcessingState = {
      fileKey,
      fileName: file.name,
      status: 'processing',
      progress: 0,
      strategy: config.strategy,
      startedAt: Date.now(),
      estimatedTimeRemaining: estimatedTime,
      cancellationToken
    };
    
    this.processing.set(fileKey, state);
    this.notifyListeners();
    this.updateMetrics('started');

    try {
      // Execute processing with retry logic
      const processedFile = await ProcessingErrorHandler.executeWithRetry(
        () => this.executeProcessingStrategy(file, config, state),
        (error) => {
          state.error = error;
          this.notifyListeners();
        },
        config.maxRetries
      );

      // Cache the result
      this.cache.set(fileKey, processedFile);
      
      // Update state to completed
      state.status = 'completed';
      state.progress = 100;
      state.completedAt = Date.now();
      this.notifyListeners();
      this.updateMetrics('completed', Date.now() - state.startedAt);
      
      // Remove from processing map after brief delay
      setTimeout(() => {
        this.processing.delete(fileKey);
        this.notifyListeners();
      }, 2000);

    } catch (error) {
      console.error('Processing failed for', file.name, ':', error);
      
      const processingError = ProcessingErrorHandler.createProcessingError(error);
      state.status = 'error';
      state.error = processingError;
      this.notifyListeners();
      this.updateMetrics('failed');
      
      // Remove failed processing after delay
      setTimeout(() => {
        this.processing.delete(fileKey);
        this.notifyListeners();
      }, 10000);
    }
  }

  /**
   * Execute the actual processing based on strategy
   */
  private async executeProcessingStrategy(
    file: File, 
    config: ProcessingConfig, 
    state: ProcessingState
  ): Promise<ProcessedFile> {
    switch (config.strategy) {
      case 'immediate_full':
        return this.processImmediateFull(file, config, state);
      
      case 'priority_pages':
        return this.processPriorityPages(file, config, state);
      
      case 'progressive_chunked':
        return this.processProgressiveChunked(file, config, state);
      
      case 'metadata_only':
        return this.processMetadataOnly(file, config, state);
      
      default:
        return this.processImmediateFull(file, config, state);
    }
  }

  /**
   * Process all pages immediately (for small files)
   */
  private async processImmediateFull(
    file: File, 
    config: ProcessingConfig, 
    state: ProcessingState
  ): Promise<ProcessedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    state.progress = 10;
    this.notifyListeners();
    
    const pages: PDFPage[] = [];
    
    for (let i = 1; i <= totalPages; i++) {
      // Check for cancellation
      if (state.cancellationToken?.signal.aborted) {
        pdf.destroy();
        throw new Error('Processing cancelled');
      }
      
      const page = await pdf.getPage(i);
      const thumbnail = await this.renderPageThumbnail(page, config.thumbnailQuality);
      
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail,
        rotation: 0,
        selected: false
      });
      
      // Update progress
      state.progress = 10 + (i / totalPages) * 85;
      state.currentPage = i;
      this.notifyListeners();
    }
    
    pdf.destroy();
    state.progress = 100;
    this.notifyListeners();
    
    return this.createProcessedFile(file, pages, totalPages);
  }

  /**
   * Process priority pages first, then queue the rest
   */
  private async processPriorityPages(
    file: File, 
    config: ProcessingConfig, 
    state: ProcessingState
  ): Promise<ProcessedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    state.progress = 10;
    this.notifyListeners();
    
    const pages: PDFPage[] = [];
    const priorityCount = Math.min(config.priorityPageCount, totalPages);
    
    // Process priority pages first
    for (let i = 1; i <= priorityCount; i++) {
      if (state.cancellationToken?.signal.aborted) {
        pdf.destroy();
        throw new Error('Processing cancelled');
      }
      
      const page = await pdf.getPage(i);
      const thumbnail = await this.renderPageThumbnail(page, config.thumbnailQuality);
      
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail,
        rotation: 0,
        selected: false
      });
      
      state.progress = 10 + (i / priorityCount) * 60;
      state.currentPage = i;
      this.notifyListeners();
    }
    
    // Create placeholder pages for remaining pages
    for (let i = priorityCount + 1; i <= totalPages; i++) {
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail: null, // Will be loaded lazily
        rotation: 0,
        selected: false
      });
    }
    
    pdf.destroy();
    state.progress = 100;
    this.notifyListeners();
    
    return this.createProcessedFile(file, pages, totalPages);
  }

  /**
   * Process in chunks with breaks between chunks
   */
  private async processProgressiveChunked(
    file: File, 
    config: ProcessingConfig, 
    state: ProcessingState
  ): Promise<ProcessedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    state.progress = 10;
    this.notifyListeners();
    
    const pages: PDFPage[] = [];
    const chunkSize = config.chunkSize;
    let processedPages = 0;
    
    // Process first chunk immediately
    const firstChunkEnd = Math.min(chunkSize, totalPages);
    
    for (let i = 1; i <= firstChunkEnd; i++) {
      if (state.cancellationToken?.signal.aborted) {
        pdf.destroy();
        throw new Error('Processing cancelled');
      }
      
      const page = await pdf.getPage(i);
      const thumbnail = await this.renderPageThumbnail(page, config.thumbnailQuality);
      
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail,
        rotation: 0,
        selected: false
      });
      
      processedPages++;
      state.progress = 10 + (processedPages / totalPages) * 70;
      state.currentPage = i;
      this.notifyListeners();
      
      // Small delay to prevent UI blocking
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // Create placeholders for remaining pages
    for (let i = firstChunkEnd + 1; i <= totalPages; i++) {
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail: null,
        rotation: 0,
        selected: false
      });
    }
    
    pdf.destroy();
    state.progress = 100;
    this.notifyListeners();
    
    return this.createProcessedFile(file, pages, totalPages);
  }

  /**
   * Process metadata only (for very large files)
   */
  private async processMetadataOnly(
    file: File, 
    config: ProcessingConfig, 
    state: ProcessingState
  ): Promise<ProcessedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    state.progress = 50;
    this.notifyListeners();
    
    // Create placeholder pages without thumbnails
    const pages: PDFPage[] = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push({
        id: `${file.name}-page-${i}`,
        pageNumber: i,
        thumbnail: null,
        rotation: 0,
        selected: false
      });
    }
    
    pdf.destroy();
    state.progress = 100;
    this.notifyListeners();
    
    return this.createProcessedFile(file, pages, totalPages);
  }

  /**
   * Render a page thumbnail with specified quality
   */
  private async renderPageThumbnail(page: any, quality: 'low' | 'medium' | 'high'): Promise<string> {
    const scales = { low: 0.2, medium: 0.5, high: 0.8 }; // Reduced low quality for page editor
    const scale = scales[quality];
    
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.8); // Use JPEG for better compression
  }

  /**
   * Create a ProcessedFile object
   */
  private createProcessedFile(file: File, pages: PDFPage[], totalPages: number): ProcessedFile {
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


  /**
   * Generate a unique, collision-resistant cache key
   */
  private async generateFileKey(file: File): Promise<string> {
    return await FileHasher.generateHybridHash(file);
  }

  /**
   * Cancel processing for a specific file
   */
  cancelProcessing(fileKey: string): void {
    const state = this.processing.get(fileKey);
    if (state && state.cancellationToken) {
      state.cancellationToken.abort();
      state.status = 'cancelled';
      this.notifyListeners();
    }
  }

  /**
   * Update processing metrics
   */
  private updateMetrics(event: 'started' | 'completed' | 'failed' | 'cacheHit', processingTime?: number): void {
    switch (event) {
      case 'started':
        this.metrics.totalFiles++;
        break;
      case 'completed':
        this.metrics.completedFiles++;
        if (processingTime) {
          // Update rolling average
          const totalProcessingTime = this.metrics.averageProcessingTime * (this.metrics.completedFiles - 1) + processingTime;
          this.metrics.averageProcessingTime = totalProcessingTime / this.metrics.completedFiles;
        }
        break;
      case 'failed':
        this.metrics.failedFiles++;
        break;
      case 'cacheHit':
        // Update cache hit rate
        const totalAttempts = this.metrics.totalFiles + 1;
        this.metrics.cacheHitRate = (this.metrics.cacheHitRate * this.metrics.totalFiles + 1) / totalAttempts;
        break;
    }
  }

  /**
   * Get processing metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  /**
   * State subscription for components
   */
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

  /**
   * Cleanup method for removed files
   */
  cleanup(removedFiles: File[]): void {
    removedFiles.forEach(async (file) => {
      const key = await this.generateFileKey(file);
      this.cache.delete(key);
      this.cancelProcessing(key);
      this.processing.delete(key);
    });
    this.notifyListeners();
  }

  /**
   * Clear all processing for view switches
   */
  clearAllProcessing(): void {
    // Cancel all ongoing processing
    this.processing.forEach((state, key) => {
      if (state.cancellationToken) {
        state.cancellationToken.abort();
      }
    });
    
    // Clear processing states
    this.processing.clear();
    this.notifyListeners();
    
    // Force memory cleanup hint
    if (typeof window !== 'undefined' && window.gc) {
      setTimeout(() => window.gc(), 100);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear all cache and processing
   */
  clearAll(): void {
    this.cache.clear();
    this.processing.clear();
    this.notifyListeners();
  }
}

// Export singleton instance
export const enhancedPDFProcessingService = EnhancedPDFProcessingService.getInstance();