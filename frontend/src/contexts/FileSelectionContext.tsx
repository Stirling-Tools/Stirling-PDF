import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  MaxFiles,
  FileSelectionContextValue
} from '../types/tool';

interface FileSelectionProviderProps {
  children: ReactNode;
}

const FileSelectionContext = createContext<FileSelectionContextValue | undefined>(undefined);

export function FileSelectionProvider({ children }: FileSelectionProviderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [maxFiles, setMaxFiles] = useState<MaxFiles>(-1);
  const [isToolMode, setIsToolMode] = useState<boolean>(false);

  const clearSelection = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const selectionCount = selectedFiles.length;
  const canSelectMore = maxFiles === -1 || selectionCount < maxFiles;
  const isAtLimit = maxFiles > 0 && selectionCount >= maxFiles;
  const isMultiFileMode = maxFiles !== 1;

  const contextValue: FileSelectionContextValue = {
    selectedFiles,
    maxFiles,
    isToolMode,
    setSelectedFiles,
    setMaxFiles,
    setIsToolMode,
    clearSelection,
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

/**
 * Access the file selection context.
 * Throws if used outside a <FileSelectionProvider>.
 */
export function useFileSelection(): FileSelectionContextValue {
  const context = useContext(FileSelectionContext);
  if (!context) {
    throw new Error('useFileSelection must be used within a FileSelectionProvider');
  }
  return context;
}

// Returns only the file selection values relevant for tools (e.g. merge, split, etc.)
// Use this in tool panels/components that need to know which files are selected and selection limits.
export function useToolFileSelection(): Pick<FileSelectionContextValue, 'selectedFiles' | 'maxFiles' | 'canSelectMore' | 'isAtLimit' | 'selectionCount'> {
  const { selectedFiles, maxFiles, canSelectMore, isAtLimit, selectionCount } = useFileSelection();
  return { selectedFiles, maxFiles, canSelectMore, isAtLimit, selectionCount };
}

// Returns actions for manipulating file selection state.
// Use this in components that need to update the selection, clear it, or change selection mode.
export function useFileSelectionActions(): Pick<FileSelectionContextValue, 'setSelectedFiles' | 'clearSelection' | 'setMaxFiles' | 'setIsToolMode'> {
  const { setSelectedFiles, clearSelection, setMaxFiles, setIsToolMode } = useFileSelection();
  return { setSelectedFiles, clearSelection, setMaxFiles, setIsToolMode };
}

// Returns the raw file selection state (selected files, max files, tool mode).
// Use this for low-level state access, e.g. in context-aware UI.
export function useFileSelectionState(): Pick<FileSelectionContextValue, 'selectedFiles' | 'maxFiles' | 'isToolMode'> {
  const { selectedFiles, maxFiles, isToolMode } = useFileSelection();
  return { selectedFiles, maxFiles, isToolMode };
}

// Returns computed values derived from file selection state.
// Use this for file selection UI logic (e.g. disabling buttons when at limit).
export function useFileSelectionComputed(): Pick<FileSelectionContextValue, 'canSelectMore' | 'isAtLimit' | 'selectionCount' | 'isMultiFileMode'> {
  const { canSelectMore, isAtLimit, selectionCount, isMultiFileMode } = useFileSelection();
  return { canSelectMore, isAtLimit, selectionCount, isMultiFileMode };
}
