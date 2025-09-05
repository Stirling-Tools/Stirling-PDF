/**
 * Custom hook for on-demand file history loading
 * Replaces automatic history extraction during file loading
 */

import { useState, useCallback } from 'react';
import { FileId } from '../types/file';
import { StirlingFileStub } from '../types/fileContext';
import { loadFileHistoryOnDemand } from '../utils/fileHistoryUtils';

interface FileHistoryState {
  originalFileId?: string;
  versionNumber?: number;
  parentFileId?: FileId;
  toolHistory?: Array<{
    toolName: string;
    timestamp: number;
    parameters?: Record<string, any>;
  }>;
}

interface UseFileHistoryResult {
  historyData: FileHistoryState | null;
  isLoading: boolean;
  error: string | null;
  loadHistory: (file: File, fileId: FileId, updateFileStub?: (id: FileId, updates: Partial<StirlingFileStub>) => void) => Promise<void>;
  clearHistory: () => void;
}

export function useFileHistory(): UseFileHistoryResult {
  const [historyData, setHistoryData] = useState<FileHistoryState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (
    file: File,
    fileId: FileId,
    updateFileStub?: (id: FileId, updates: Partial<StirlingFileStub>) => void
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const history = await loadFileHistoryOnDemand(file, fileId, updateFileStub);
      setHistoryData(history);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load file history';
      setError(errorMessage);
      setHistoryData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    historyData,
    isLoading,
    error,
    loadHistory,
    clearHistory
  };
}

/**
 * Hook for managing history state of multiple files
 */
export function useMultiFileHistory() {
  const [historyCache, setHistoryCache] = useState<Map<FileId, FileHistoryState>>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<FileId>>(new Set());
  const [errors, setErrors] = useState<Map<FileId, string>>(new Map());

  const loadFileHistory = useCallback(async (
    file: File,
    fileId: FileId,
    updateFileStub?: (id: FileId, updates: Partial<StirlingFileStub>) => void
  ) => {
    // Don't reload if already loaded or currently loading
    if (historyCache.has(fileId) || loadingFiles.has(fileId)) {
      return historyCache.get(fileId) || null;
    }

    setLoadingFiles(prev => new Set(prev).add(fileId));
    setErrors(prev => {
      const newErrors = new Map(prev);
      newErrors.delete(fileId);
      return newErrors;
    });

    try {
      const history = await loadFileHistoryOnDemand(file, fileId, updateFileStub);

      if (history) {
        setHistoryCache(prev => new Map(prev).set(fileId, history));
      }

      return history;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load file history';
      setErrors(prev => new Map(prev).set(fileId, errorMessage));
      return null;
    } finally {
      setLoadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  }, [historyCache, loadingFiles]);

  const getHistory = useCallback((fileId: FileId) => {
    return historyCache.get(fileId) || null;
  }, [historyCache]);

  const isLoadingHistory = useCallback((fileId: FileId) => {
    return loadingFiles.has(fileId);
  }, [loadingFiles]);

  const getError = useCallback((fileId: FileId) => {
    return errors.get(fileId) || null;
  }, [errors]);

  const clearHistory = useCallback((fileId: FileId) => {
    setHistoryCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(fileId);
      return newCache;
    });
    setErrors(prev => {
      const newErrors = new Map(prev);
      newErrors.delete(fileId);
      return newErrors;
    });
    setLoadingFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileId);
      return newSet;
    });
  }, []);

  const clearAllHistory = useCallback(() => {
    setHistoryCache(new Map());
    setLoadingFiles(new Set());
    setErrors(new Map());
  }, []);

  return {
    loadFileHistory,
    getHistory,
    isLoadingHistory,
    getError,
    clearHistory,
    clearAllHistory
  };
}
