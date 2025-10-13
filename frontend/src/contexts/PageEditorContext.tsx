import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FileId } from '../types/file';
import { useFileActions } from './FileContext';

interface PageEditorContextValue {
  // Set of selected file IDs (for quick lookup)
  selectedFileIds: Set<FileId>;

  // Toggle file selection
  toggleFileSelection: (fileId: FileId) => void;

  // Select/deselect all files
  selectAll: (fileIds: FileId[]) => void;
  deselectAll: () => void;

  // Reorder ALL files in FileContext (maintains selection state)
  reorderFiles: (fromIndex: number, toIndex: number, allFileIds: FileId[]) => void;

  // Sync with FileContext when files change
  syncWithFileContext: (allFileIds: FileId[]) => void;
}

const PageEditorContext = createContext<PageEditorContextValue | undefined>(undefined);

interface PageEditorProviderProps {
  children: ReactNode;
  initialFileIds?: FileId[];
}

export function PageEditorProvider({ children, initialFileIds = [] }: PageEditorProviderProps) {
  // Use Set for O(1) selection lookup
  const [selectedFileIds, setSelectedFileIds] = useState<Set<FileId>>(new Set(initialFileIds));
  const { actions: fileActions } = useFileActions();

  const toggleFileSelection = useCallback((fileId: FileId) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((fileIds: FileId[]) => {
    setSelectedFileIds(new Set(fileIds));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFileIds(new Set());
  }, []);

  const reorderFiles = useCallback((fromIndex: number, toIndex: number, allFileIds: FileId[]) => {
    // Reorder the entire file list in FileContext
    const newOrder = [...allFileIds];
    const [movedFile] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedFile);

    // Update global FileContext order
    fileActions.reorderFiles(newOrder);
  }, [fileActions]);

  const syncWithFileContext = useCallback((allFileIds: FileId[]) => {
    setSelectedFileIds(prev => {
      // Remove IDs that no longer exist in FileContext
      const next = new Set<FileId>();
      allFileIds.forEach(id => {
        if (prev.has(id)) {
          next.add(id);
        }
      });

      // If no files selected, select all by default
      if (next.size === 0 && allFileIds.length > 0) {
        return new Set(allFileIds);
      }

      // Only update if there's an actual change
      if (next.size === prev.size && Array.from(next).every(id => prev.has(id))) {
        return prev; // No change, return same reference
      }

      return next;
    });
  }, []);

  const value: PageEditorContextValue = {
    selectedFileIds,
    toggleFileSelection,
    selectAll,
    deselectAll,
    reorderFiles,
    syncWithFileContext,
  };

  return (
    <PageEditorContext.Provider value={value}>
      {children}
    </PageEditorContext.Provider>
  );
}

export function usePageEditor() {
  const context = useContext(PageEditorContext);
  if (!context) {
    throw new Error('usePageEditor must be used within PageEditorProvider');
  }
  return context;
}
