import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FileId } from '../types/file';
import { useFileActions } from './FileContext';
import { PDFPage } from '../types/pageEditor';
import { MAX_PAGE_EDITOR_FILES } from '../components/pageEditor/fileColors';

/**
 * Computes file order based on the position of each file's first page
 * @param pages - Current page order
 * @returns Array of FileIds in order based on first page positions
 */
function computeFileOrderFromPages(pages: PDFPage[]): FileId[] {
  // Find the first page for each file
  const fileFirstPagePositions = new Map<FileId, number>();

  pages.forEach((page, index) => {
    const fileId = page.originalFileId;
    if (!fileId) return;

    if (!fileFirstPagePositions.has(fileId)) {
      fileFirstPagePositions.set(fileId, index);
    }
  });

  // Sort files by their first page position
  const fileOrder = Array.from(fileFirstPagePositions.entries())
    .sort((a, b) => a[1] - b[1])
    .map(entry => entry[0]);

  return fileOrder;
}

/**
 * Reorders pages based on file reordering while preserving manual page order within files
 * @param currentPages - Current page order (may include manual reordering)
 * @param fromIndex - Source file index
 * @param toIndex - Target file index
 * @param orderedFileIds - File IDs in their current order
 * @returns Reordered pages with updated page numbers
 */
function reorderPagesForFileMove(
  currentPages: PDFPage[],
  fromIndex: number,
  toIndex: number,
  orderedFileIds: FileId[]
): PDFPage[] {
  // Group pages by originalFileId, preserving their current relative positions
  const fileGroups = new Map<FileId, PDFPage[]>();

  currentPages.forEach(page => {
    const fileId = page.originalFileId;
    if (!fileId) return;

    if (!fileGroups.has(fileId)) {
      fileGroups.set(fileId, []);
    }
    fileGroups.get(fileId)!.push(page);
  });

  // Reorder the file IDs
  const newFileOrder = [...orderedFileIds];
  const [movedFileId] = newFileOrder.splice(fromIndex, 1);
  newFileOrder.splice(toIndex, 0, movedFileId);

  // Rebuild pages in new file order, preserving page order within each file
  const reorderedPages: PDFPage[] = [];

  newFileOrder.forEach(fileId => {
    const filePages = fileGroups.get(fileId) || [];
    reorderedPages.push(...filePages);
  });

  // Renumber all pages sequentially
  reorderedPages.forEach((page, index) => {
    page.pageNumber = index + 1;
  });

  return reorderedPages;
}

interface PageEditorContextValue {
  // Set of selected file IDs (for quick lookup)
  selectedFileIds: Set<FileId>;

  // Current page order (updated by PageEditor, used for file reordering)
  currentPages: PDFPage[] | null;
  updateCurrentPages: (pages: PDFPage[] | null) => void;

  // Reordered pages (when file reordering happens)
  reorderedPages: PDFPage[] | null;
  clearReorderedPages: () => void;

  // Toggle file selection
  toggleFileSelection: (fileId: FileId) => void;

  // Select/deselect all files
  selectAll: (fileIds: FileId[]) => void;
  deselectAll: () => void;

  // Reorder ALL files in FileContext (maintains selection state and page order)
  reorderFiles: (fromIndex: number, toIndex: number, allFileIds: FileId[]) => void;

  // Update file order based on page positions (when pages are manually reordered)
  updateFileOrderFromPages: (pages: PDFPage[]) => void;

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
  const [currentPages, setCurrentPages] = useState<PDFPage[] | null>(null);
  const [reorderedPages, setReorderedPages] = useState<PDFPage[] | null>(null);
  const { actions: fileActions } = useFileActions();

  const updateCurrentPages = useCallback((pages: PDFPage[] | null) => {
    setCurrentPages(pages);
  }, []);

  const clearReorderedPages = useCallback(() => {
    setReorderedPages(null);
  }, []);

  const toggleFileSelection = useCallback((fileId: FileId) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        // Check if adding this file would exceed the limit
        if (next.size >= MAX_PAGE_EDITOR_FILES) {
          console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Cannot select more files.`);
          return prev;
        }
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((fileIds: FileId[]) => {
    // Enforce maximum file limit
    if (fileIds.length > MAX_PAGE_EDITOR_FILES) {
      console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Only first ${MAX_PAGE_EDITOR_FILES} files will be selected.`);
      const limitedFiles = fileIds.slice(0, MAX_PAGE_EDITOR_FILES);
      setSelectedFileIds(new Set(limitedFiles));
    } else {
      setSelectedFileIds(new Set(fileIds));
    }
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

    // If current pages available, reorder them based on file move
    if (currentPages && currentPages.length > 0) {
      const reordered = reorderPagesForFileMove(currentPages, fromIndex, toIndex, allFileIds);
      setReorderedPages(reordered);
    }
  }, [fileActions, currentPages]);

  const updateFileOrderFromPages = useCallback((pages: PDFPage[]) => {
    if (!pages || pages.length === 0) return;

    // Compute the new file order based on page positions
    const newFileOrder = computeFileOrderFromPages(pages);

    if (newFileOrder.length > 0) {
      // Update global FileContext order
      fileActions.reorderFiles(newFileOrder);
    }
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

      // If no files selected, select all by default (up to MAX_PAGE_EDITOR_FILES)
      if (next.size === 0 && allFileIds.length > 0) {
        const filesToSelect = allFileIds.slice(0, MAX_PAGE_EDITOR_FILES);
        if (allFileIds.length > MAX_PAGE_EDITOR_FILES) {
          console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Only first ${MAX_PAGE_EDITOR_FILES} files will be selected.`);
        }
        return new Set(filesToSelect);
      }

      // Enforce maximum file limit
      if (next.size > MAX_PAGE_EDITOR_FILES) {
        console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Limiting selection.`);
        const limitedFiles = Array.from(next).slice(0, MAX_PAGE_EDITOR_FILES);
        return new Set(limitedFiles);
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
    currentPages,
    updateCurrentPages,
    reorderedPages,
    clearReorderedPages,
    toggleFileSelection,
    selectAll,
    deselectAll,
    reorderFiles,
    updateFileOrderFromPages,
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
