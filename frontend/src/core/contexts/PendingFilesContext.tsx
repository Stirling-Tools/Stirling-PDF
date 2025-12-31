/**
 * PendingFilesContext - Tracks files that are currently being uploaded
 * 
 * Provides immediate visual feedback when files are dropped/selected by showing
 * loading placeholders before the actual file processing completes.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { uuidV4 } from '@embedpdf/models';
import { FileId } from '@app/types/fileContext';

// Type for pending file placeholders
export interface PendingFile {
  id: FileId;
  name: string;
  size: number;
  lastModified: number;
}

interface PendingFilesContextValue {
  pendingFiles: PendingFile[];
  addPendingFiles: (files: File[]) => FileId[];
  removePendingFiles: (ids: FileId[]) => void;
  clearPendingFiles: () => void;
  hasPendingFiles: boolean;
}

const PendingFilesContext = createContext<PendingFilesContextValue | null>(null);

export function PendingFilesProvider({ children }: { children: React.ReactNode }) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const addPendingFiles = useCallback((files: File[]): FileId[] => {
    const newPendingFiles: PendingFile[] = files.map(file => ({
      id: uuidV4() as FileId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    }));
    
    setPendingFiles(prev => [...prev, ...newPendingFiles]);
    return newPendingFiles.map(f => f.id);
  }, []);

  const removePendingFiles = useCallback((ids: FileId[]) => {
    const idsSet = new Set(ids);
    setPendingFiles(prev => prev.filter(f => !idsSet.has(f.id)));
  }, []);

  const clearPendingFiles = useCallback(() => {
    setPendingFiles([]);
  }, []);

  const value = useMemo<PendingFilesContextValue>(() => ({
    pendingFiles,
    addPendingFiles,
    removePendingFiles,
    clearPendingFiles,
    hasPendingFiles: pendingFiles.length > 0,
  }), [pendingFiles, addPendingFiles, removePendingFiles, clearPendingFiles]);

  return (
    <PendingFilesContext.Provider value={value}>
      {children}
    </PendingFilesContext.Provider>
  );
}

export function usePendingFiles(): PendingFilesContextValue {
  const context = useContext(PendingFilesContext);
  if (!context) {
    throw new Error('usePendingFiles must be used within a PendingFilesProvider');
  }
  return context;
}

