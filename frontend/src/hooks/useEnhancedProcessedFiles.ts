import { useState, useEffect } from 'react';
import { ProcessedFile, ProcessingState, ProcessingConfig } from '../types/processing';
import { enhancedPDFProcessingService } from '../services/enhancedPDFProcessingService';
import { FileHasher } from '../utils/fileHash';

interface UseEnhancedProcessedFilesResult {
  processedFiles: Map<File, ProcessedFile>;
  processingStates: Map<string, ProcessingState>;
  isProcessing: boolean;
  hasProcessingErrors: boolean;
  processingProgress: {
    overall: number;
    fileProgress: Map<string, number>;
    estimatedTimeRemaining: number;
  };
  cacheStats: {
    entries: number;
    totalSizeBytes: number;
    maxSizeBytes: number;
  };
  metrics: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    averageProcessingTime: number;
    cacheHitRate: number;
  };
  actions: {
    cancelProcessing: (fileKey: string) => void;
    retryProcessing: (file: File) => void;
    clearCache: () => void;
  };
}

export function useEnhancedProcessedFiles(
  activeFiles: File[],
  config?: Partial<ProcessingConfig>
): UseEnhancedProcessedFilesResult {
  const [processedFiles, setProcessedFiles] = useState<Map<File, ProcessedFile>>(new Map());
  const [processingStates, setProcessingStates] = useState<Map<string, ProcessingState>>(new Map());

  // Subscribe to processing state changes once
  useEffect(() => {
    const unsubscribe = enhancedPDFProcessingService.onProcessingChange(setProcessingStates);
    return unsubscribe;
  }, []);

  // Process files when activeFiles changes
  useEffect(() => {
    if (activeFiles.length === 0) {
      setProcessedFiles(new Map());
      return;
    }

    const processFiles = async () => {
      const newProcessedFiles = new Map<File, ProcessedFile>();
      
      for (const file of activeFiles) {
        // Check if we already have this file processed
        const existing = processedFiles.get(file);
        if (existing) {
          newProcessedFiles.set(file, existing);
          continue;
        }

        try {
          // Generate proper file key matching the service
          const fileKey = await FileHasher.generateHybridHash(file);
          console.log('Processing file:', file.name);
          
          const processed = await enhancedPDFProcessingService.processFile(file, config);
          if (processed) {
            console.log('Got processed file for:', file.name);
            newProcessedFiles.set(file, processed);
          } else {
            console.log('Processing started for:', file.name, '- waiting for completion');
          }
        } catch (error) {
          console.error(`Failed to start processing for ${file.name}:`, error);
        }
      }
      
      // Update processed files if we have any
      if (newProcessedFiles.size > 0) {
        setProcessedFiles(newProcessedFiles);
      }
    };

    processFiles();
  }, [activeFiles]);

  // Listen for processing completion
  useEffect(() => {
    const checkForCompletedFiles = async () => {
      let hasNewFiles = false;
      const updatedFiles = new Map(processedFiles);
      
      // Generate file keys for all files first
      const fileKeyPromises = activeFiles.map(async (file) => ({
        file,
        key: await FileHasher.generateHybridHash(file)
      }));
      
      const fileKeyPairs = await Promise.all(fileKeyPromises);
      
      for (const { file, key } of fileKeyPairs) {
        // Only check files that don't have processed results yet
        if (!updatedFiles.has(file)) {
          const processingState = processingStates.get(key);
          
          // Check for both processing and recently completed files
          // This ensures we catch completed files before they're cleaned up
          if (processingState?.status === 'processing' || processingState?.status === 'completed') {
            try {
              const processed = await enhancedPDFProcessingService.processFile(file, config);
              if (processed) {
                console.log('Processing completed for:', file.name);
                updatedFiles.set(file, processed);
                hasNewFiles = true;
              }
            } catch (error) {
              // Ignore errors in completion check
            }
          }
        }
      }
      
      if (hasNewFiles) {
        setProcessedFiles(updatedFiles);
      }
    };

    // Check every 500ms for completed processing
    const interval = setInterval(checkForCompletedFiles, 500);
    return () => clearInterval(interval);
  }, [activeFiles, processingStates]);


  // Cleanup when activeFiles changes
  useEffect(() => {
    const currentFiles = new Set(activeFiles);
    const previousFiles = Array.from(processedFiles.keys());
    const removedFiles = previousFiles.filter(file => !currentFiles.has(file));
    
    if (removedFiles.length > 0) {
      // Clean up processing service cache
      enhancedPDFProcessingService.cleanup(removedFiles);
      
      // Update local state
      setProcessedFiles(prev => {
        const updated = new Map();
        for (const [file, processed] of prev) {
          if (currentFiles.has(file)) {
            updated.set(file, processed);
          }
        }
        return updated;
      });
    }
  }, [activeFiles]);

  // Calculate derived state
  const isProcessing = processingStates.size > 0;
  const hasProcessingErrors = Array.from(processingStates.values()).some(state => state.status === 'error');
  
  // Calculate overall progress
  const processingProgress = calculateProcessingProgress(processingStates);
  
  // Get cache stats and metrics
  const cacheStats = enhancedPDFProcessingService.getCacheStats();
  const metrics = enhancedPDFProcessingService.getMetrics();

  // Action handlers
  const actions = {
    cancelProcessing: (fileKey: string) => {
      enhancedPDFProcessingService.cancelProcessing(fileKey);
    },
    
    retryProcessing: async (file: File) => {
      try {
        await enhancedPDFProcessingService.processFile(file, config);
      } catch (error) {
        console.error(`Failed to retry processing for ${file.name}:`, error);
      }
    },
    
    clearCache: () => {
      enhancedPDFProcessingService.clearAll();
    }
  };

  return {
    processedFiles,
    processingStates,
    isProcessing,
    hasProcessingErrors,
    processingProgress,
    cacheStats,
    metrics,
    actions
  };
}

/**
 * Calculate overall processing progress from individual file states
 */
function calculateProcessingProgress(states: Map<string, ProcessingState>): {
  overall: number;
  fileProgress: Map<string, number>;
  estimatedTimeRemaining: number;
} {
  if (states.size === 0) {
    return {
      overall: 100,
      fileProgress: new Map(),
      estimatedTimeRemaining: 0
    };
  }

  const fileProgress = new Map<string, number>();
  let totalProgress = 0;
  let totalEstimatedTime = 0;

  for (const [fileKey, state] of states) {
    fileProgress.set(fileKey, state.progress);
    totalProgress += state.progress;
    totalEstimatedTime += state.estimatedTimeRemaining || 0;
  }

  const overall = totalProgress / states.size;
  const estimatedTimeRemaining = totalEstimatedTime;

  return {
    overall,
    fileProgress,
    estimatedTimeRemaining
  };
}

/**
 * Hook for getting a single processed file with enhanced features
 */
export function useEnhancedProcessedFile(
  file: File | null,
  config?: Partial<ProcessingConfig>
): {
  processedFile: ProcessedFile | null;
  isProcessing: boolean;
  processingState: ProcessingState | null;
  error: string | null;
  canRetry: boolean;
  actions: {
    cancel: () => void;
    retry: () => void;
  };
} {
  const result = useEnhancedProcessedFiles(file ? [file] : [], config);
  
  const processedFile = file ? result.processedFiles.get(file) || null : null;
  // Note: This is async but we can't await in hook return - consider refactoring if needed
  const fileKey = file ? '' : ''; // TODO: Handle async file key generation
  const processingState = fileKey ? result.processingStates.get(fileKey) || null : null;
  const isProcessing = !!processingState;
  const error = processingState?.error?.message || null;
  const canRetry = processingState?.error?.recoverable || false;

  const actions = {
    cancel: () => {
      if (fileKey) {
        result.actions.cancelProcessing(fileKey);
      }
    },
    retry: () => {
      if (file) {
        result.actions.retryProcessing(file);
      }
    }
  };

  return {
    processedFile,
    isProcessing,
    processingState,
    error,
    canRetry,
    actions
  };
}