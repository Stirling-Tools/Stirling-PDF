import { useState, useEffect } from 'react';
import { ProcessedFile, ProcessingState } from '../types/processing';
import { pdfProcessingService } from '../services/pdfProcessingService';

interface UseProcessedFilesResult {
  processedFiles: Map<File, ProcessedFile>;
  processingStates: Map<string, ProcessingState>;
  isProcessing: boolean;
  hasProcessingErrors: boolean;
  cacheStats: {
    entries: number;
    totalSizeBytes: number;
    maxSizeBytes: number;
  };
}

export function useProcessedFiles(activeFiles: File[]): UseProcessedFilesResult {
  const [processedFiles, setProcessedFiles] = useState<Map<File, ProcessedFile>>(new Map());
  const [processingStates, setProcessingStates] = useState<Map<string, ProcessingState>>(new Map());

  useEffect(() => {
    // Subscribe to processing state changes
    const unsubscribe = pdfProcessingService.onProcessingChange(setProcessingStates);
    
    // Check/start processing for each active file
    const checkProcessing = async () => {
      const newProcessedFiles = new Map<File, ProcessedFile>();
      
      for (const file of activeFiles) {
        const processed = await pdfProcessingService.getProcessedFile(file);
        if (processed) {
          newProcessedFiles.set(file, processed);
        }
      }
      
      setProcessedFiles(newProcessedFiles);
    };

    checkProcessing();

    return unsubscribe;
  }, [activeFiles]);

  // Listen for processing completion and update processed files
  useEffect(() => {
    const updateProcessedFiles = async () => {
      const updated = new Map<File, ProcessedFile>();
      
      for (const file of activeFiles) {
        const existing = processedFiles.get(file);
        if (existing) {
          updated.set(file, existing);
        } else {
          // Check if processing just completed
          const processed = await pdfProcessingService.getProcessedFile(file);
          if (processed) {
            updated.set(file, processed);
          }
        }
      }
      
      setProcessedFiles(updated);
    };

    // Small delay to allow processing state to settle
    const timeoutId = setTimeout(updateProcessedFiles, 100);
    return () => clearTimeout(timeoutId);
  }, [processingStates, activeFiles]);

  // Cleanup when activeFiles changes
  useEffect(() => {
    const currentFiles = new Set(activeFiles);
    const previousFiles = Array.from(processedFiles.keys());
    const removedFiles = previousFiles.filter(file => !currentFiles.has(file));
    
    if (removedFiles.length > 0) {
      // Clean up processing service cache
      pdfProcessingService.cleanup(removedFiles);
      
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

  // Derived state
  const isProcessing = processingStates.size > 0;
  const hasProcessingErrors = Array.from(processingStates.values()).some(state => state.status === 'error');
  const cacheStats = pdfProcessingService.getCacheStats();

  return {
    processedFiles,
    processingStates,
    isProcessing,
    hasProcessingErrors,
    cacheStats
  };
}

// Hook for getting a single processed file
export function useProcessedFile(file: File | null): {
  processedFile: ProcessedFile | null;
  isProcessing: boolean;
  processingState: ProcessingState | null;
} {
  const result = useProcessedFiles(file ? [file] : []);
  
  const processedFile = file ? result.processedFiles.get(file) || null : null;
  const fileKey = file ? pdfProcessingService.generateFileKey(file) : '';
  const processingState = fileKey ? result.processingStates.get(fileKey) || null : null;
  const isProcessing = !!processingState;

  return {
    processedFile,
    isProcessing,
    processingState
  };
}