export interface ProcessingError {
  type: 'network' | 'parsing' | 'memory' | 'corruption' | 'timeout' | 'cancelled';
  message: string;
  recoverable: boolean;
  retryCount: number;
  maxRetries: number;
  originalError?: Error;
}

export interface ProcessingState {
  fileKey: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number; // 0-100
  strategy: ProcessingStrategy;
  error?: ProcessingError;
  startedAt: number;
  completedAt?: number;
  estimatedTimeRemaining?: number;
  currentPage?: number;
  cancellationToken?: AbortController;
}

export interface ProcessedFile {
  id: string;
  pages: PDFPage[];
  totalPages: number;
  metadata: {
    title: string;
    createdAt: string;
    modifiedAt: string;
  };
}

export interface PDFPage {
  id: string;
  pageNumber: number;
  thumbnail: string | null;
  rotation: number;
  selected: boolean;
  splitBefore?: boolean;
}

export interface CacheConfig {
  maxFiles: number;
  maxSizeBytes: number;
  ttlMs: number;
}

export interface CacheEntry {
  data: ProcessedFile;
  size: number;
  lastAccessed: number;
  createdAt: number;
}

export interface CacheStats {
  entries: number;
  totalSizeBytes: number;
  maxSizeBytes: number;
}

export type ProcessingStrategy = 'immediate_full' | 'progressive_chunked' | 'metadata_only' | 'priority_pages';

export interface ProcessingConfig {
  strategy: ProcessingStrategy;
  chunkSize: number; // Pages per chunk
  thumbnailQuality: 'low' | 'medium' | 'high';
  priorityPageCount: number; // Number of priority pages to process first
  useWebWorker: boolean;
  maxRetries: number;
}

export interface FileAnalysis {
  fileSize: number;
  estimatedPageCount?: number;
  isEncrypted: boolean;
  isCorrupted: boolean;
  recommendedStrategy: ProcessingStrategy;
  estimatedProcessingTime: number; // milliseconds
}

export interface ProcessingMetrics {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  memoryUsage: number;
}