import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { 
  MaxFiles, 
  FileSelectionState, 
  FileSelectionActions, 
  FileSelectionComputed, 
  FileSelectionContextValue 
} from '../types/tool';

interface FileSelectionProviderProps {
  children: ReactNode;
}

const FileSelectionContext = createContext<FileSelectionContextValue | undefined>(undefined);

export function FileSelectionProvider({ children }: FileSelectionProviderProps) {
  // State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [maxFiles, setMaxFiles] = useState<MaxFiles>(-1); // Default: unlimited
  const [isToolMode, setIsToolMode] = useState<boolean>(false);

  // Actions
  const clearSelection = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  // Computed properties
  const selectionCount = selectedFiles.length;
  const canSelectMore = maxFiles === -1 || selectionCount < maxFiles;
  const isAtLimit = maxFiles > 0 && selectionCount >= maxFiles;
  const isMultiFileMode = maxFiles !== 1;

  const contextValue: FileSelectionContextValue = {
    // State
    selectedFiles,
    maxFiles,
    isToolMode,
    // Actions
    setSelectedFiles,
    setMaxFiles,
    setIsToolMode,
    clearSelection,
    // Computed
    canSelectMore,
    isAtLimit,
    selectionCount,
    isMultiFileMode
  };

  return (
    <FileSelectionContext.Provider value={contextValue}>
      {children}
    </FileSelectionContext.Provider>
  );
}

// Custom hook to use the context
export function useFileSelection(): FileSelectionContextValue {
  const context = useContext(FileSelectionContext);
  if (!context) {
    throw new Error('useFileSelection must be used within a FileSelectionProvider');
  }
  return context;
}

// Helper hooks for specific use cases with strict typing
export function useToolFileSelection(): Pick<FileSelectionContextValue, 'selectedFiles' | 'maxFiles' | 'canSelectMore' | 'isAtLimit' | 'selectionCount'> {
  const { selectedFiles, maxFiles, canSelectMore, isAtLimit, selectionCount } = useFileSelection();
  return { selectedFiles, maxFiles, canSelectMore, isAtLimit, selectionCount };
}

export function useFileSelectionActions(): Pick<FileSelectionContextValue, 'setSelectedFiles' | 'clearSelection' | 'setMaxFiles' | 'setIsToolMode'> {
  const { setSelectedFiles, clearSelection, setMaxFiles, setIsToolMode } = useFileSelection();
  return { setSelectedFiles, clearSelection, setMaxFiles, setIsToolMode };
}

export function useFileSelectionState(): Pick<FileSelectionContextValue, 'selectedFiles' | 'maxFiles' | 'isToolMode'> {
  const { selectedFiles, maxFiles, isToolMode } = useFileSelection();
  return { selectedFiles, maxFiles, isToolMode };
}

export function useFileSelectionComputed(): Pick<FileSelectionContextValue, 'canSelectMore' | 'isAtLimit' | 'selectionCount' | 'isMultiFileMode'> {
  const { canSelectMore, isAtLimit, selectionCount, isMultiFileMode } = useFileSelection();
  return { canSelectMore, isAtLimit, selectionCount, isMultiFileMode };
}