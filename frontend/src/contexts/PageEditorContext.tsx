import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FileId } from '../types/file';
import { useFileActions } from './FileContext';
import { PDFPage } from '../types/pageEditor';
import { MAX_PAGE_EDITOR_FILES } from '../components/pageEditor/fileColors';

export interface PageEditorFile {
  fileId: FileId;
  name: string;
  versionNumber?: number;
  isSelected: boolean;
}

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
 * Reorders pages based on file reordering while preserving interlacing and manual page order
 * @param currentPages - Current page order (may include manual reordering and interlacing)
 * @param fromIndex - Source file index in the file order
 * @param toIndex - Target file index in the file order
 * @param orderedFileIds - File IDs in their current order
 * @returns Reordered pages with updated page numbers
 */
function reorderPagesForFileMove(
  currentPages: PDFPage[],
  fromIndex: number,
  toIndex: number,
  orderedFileIds: FileId[]
): PDFPage[] {
  // Get the file ID being moved
  const movedFileId = orderedFileIds[fromIndex];
  const targetFileId = orderedFileIds[toIndex];

  // Extract pages belonging to the moved file (maintaining their relative order)
  const movedFilePages: PDFPage[] = [];
  const remainingPages: PDFPage[] = [];

  currentPages.forEach(page => {
    if (page.originalFileId === movedFileId) {
      movedFilePages.push(page);
    } else {
      remainingPages.push(page);
    }
  });

  // Find the insertion point based on the target file
  let insertionIndex = 0;

  if (fromIndex < toIndex) {
    // Moving down: insert AFTER the last page of target file
    for (let i = remainingPages.length - 1; i >= 0; i--) {
      if (remainingPages[i].originalFileId === targetFileId) {
        insertionIndex = i + 1;
        break;
      }
    }
  } else {
    // Moving up: insert BEFORE the first page of target file
    for (let i = 0; i < remainingPages.length; i++) {
      if (remainingPages[i].originalFileId === targetFileId) {
        insertionIndex = i;
        break;
      }
    }
  }

  // Insert moved pages at the calculated position
  const reorderedPages = [
    ...remainingPages.slice(0, insertionIndex),
    ...movedFilePages,
    ...remainingPages.slice(insertionIndex)
  ];

  // Renumber all pages sequentially (clone to avoid mutation)
  return reorderedPages.map((page, index) => ({
    ...page,
    pageNumber: index + 1
  }));
}

interface PageEditorContextValue {
  // Single array of files with selection state
  files: PageEditorFile[];

  // Current page order (updated by PageEditor, used for file reordering)
  currentPages: PDFPage[] | null;
  updateCurrentPages: (pages: PDFPage[] | null) => void;

  // Reordered pages (when file reordering happens)
  reorderedPages: PDFPage[] | null;
  clearReorderedPages: () => void;

  // Set file selection
  setFileSelection: (fileId: FileId, selected: boolean) => void;

  // Toggle file selection
  toggleFileSelection: (fileId: FileId) => void;

  // Select/deselect all files
  selectAll: () => void;
  deselectAll: () => void;

  // Reorder files (simple array reordering)
  reorderFiles: (fromIndex: number, toIndex: number) => void;

  // Update file order based on page positions (when pages are manually reordered)
  updateFileOrderFromPages: (pages: PDFPage[]) => void;

  // Track mutation source to prevent feedback loops
  lastReorderSource: 'file' | 'page' | null;
  clearReorderSource: () => void;

  // Sync with FileContext when files change
  syncWithFileContext: (fileContextFiles: Array<{ fileId: FileId; name: string; versionNumber?: number }>) => void;
}

const PageEditorContext = createContext<PageEditorContextValue | undefined>(undefined);

interface PageEditorProviderProps {
  children: ReactNode;
  initialFileIds?: FileId[];
}

export function PageEditorProvider({ children, initialFileIds = [] }: PageEditorProviderProps) {
  // Single array of files with selection state
  const [files, setFiles] = useState<PageEditorFile[]>([]);
  const [currentPages, setCurrentPages] = useState<PDFPage[] | null>(null);
  const [reorderedPages, setReorderedPages] = useState<PDFPage[] | null>(null);
  const [lastReorderSource, setLastReorderSource] = useState<'file' | 'page' | null>(null);
  const lastReorderSourceAtRef = React.useRef<number>(0);
  const { actions: fileActions } = useFileActions();

  const updateCurrentPages = useCallback((pages: PDFPage[] | null) => {
    setCurrentPages(pages);
  }, []);

  const clearReorderedPages = useCallback(() => {
    setReorderedPages(null);
  }, []);

  const clearReorderSource = useCallback(() => {
    setLastReorderSource(null);
  }, []);

  const setFileSelection = useCallback((fileId: FileId, selected: boolean) => {
    setFiles(prev => {
      const selectedCount = prev.filter(f => f.isSelected).length;

      // Check if we're trying to select when at limit
      if (selected && selectedCount >= MAX_PAGE_EDITOR_FILES) {
        const alreadySelected = prev.find(f => f.fileId === fileId)?.isSelected;
        if (!alreadySelected) {
          console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Cannot select more files.`);
          return prev;
        }
      }

      return prev.map(f =>
        f.fileId === fileId ? { ...f, isSelected: selected } : f
      );
    });
  }, []);

  const toggleFileSelection = useCallback((fileId: FileId) => {
    setFiles(prev => {
      const file = prev.find(f => f.fileId === fileId);
      if (!file) return prev;

      const selectedCount = prev.filter(f => f.isSelected).length;

      // If toggling on and at limit, don't allow
      if (!file.isSelected && selectedCount >= MAX_PAGE_EDITOR_FILES) {
        console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Cannot select more files.`);
        return prev;
      }

      return prev.map(f =>
        f.fileId === fileId ? { ...f, isSelected: !f.isSelected } : f
      );
    });
  }, []);

  const selectAll = useCallback(() => {
    setFiles(prev => {
      if (prev.length > MAX_PAGE_EDITOR_FILES) {
        console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Only first ${MAX_PAGE_EDITOR_FILES} files will be selected.`);
        return prev.map((f, index) => ({ ...f, isSelected: index < MAX_PAGE_EDITOR_FILES }));
      }
      return prev.map(f => ({ ...f, isSelected: true }));
    });
  }, []);

  const deselectAll = useCallback(() => {
    setFiles(prev => prev.map(f => ({ ...f, isSelected: false })));
  }, []);

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    let newFileIds: FileId[] = [];
    let reorderedPagesResult: PDFPage[] | null = null;

    // Mark that this reorder came from file-level action
  setLastReorderSource('file');
  lastReorderSourceAtRef.current = Date.now();

    setFiles(prev => {
      // Simple array reordering
      const newOrder = [...prev];
      const [movedFile] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, movedFile);

      // Collect file IDs for later FileContext update
      newFileIds = newOrder.map(f => f.fileId);

      // If current pages available, reorder them based on file move
      if (currentPages && currentPages.length > 0 && fromIndex !== toIndex) {
        // Get the current file order from pages (files that have pages loaded)
        const currentFileOrder: FileId[] = [];
        const filesSeen = new Set<FileId>();
        currentPages.forEach(page => {
          const fileId = page.originalFileId;
          if (fileId && !filesSeen.has(fileId)) {
            filesSeen.add(fileId);
            currentFileOrder.push(fileId);
          }
        });

        // Get the moved and target file IDs
        const movedFileId = prev[fromIndex].fileId;
        const targetFileId = prev[toIndex].fileId;

        // Find their positions in the current page order (not the full file list)
        const pageOrderFromIndex = currentFileOrder.findIndex(id => id === movedFileId);
        const pageOrderToIndex = currentFileOrder.findIndex(id => id === targetFileId);

        // Only reorder pages if both files have pages loaded
        if (pageOrderFromIndex >= 0 && pageOrderToIndex >= 0) {
          reorderedPagesResult = reorderPagesForFileMove(currentPages, pageOrderFromIndex, pageOrderToIndex, currentFileOrder);
        }
      }

      return newOrder;
    });

    // Update FileContext after state settles
    if (newFileIds.length > 0) {
      fileActions.reorderFiles(newFileIds);
    }

    // Update reordered pages after state settles
    if (reorderedPagesResult) {
      setReorderedPages(reorderedPagesResult);
    }
  }, [fileActions, currentPages]);

  const updateFileOrderFromPages = useCallback((pages: PDFPage[]) => {
    if (!pages || pages.length === 0) return;
    // Suppress page-derived reorder if a recent explicit file reorder just occurred (prevents feedback loop)
    if (lastReorderSource === 'file' && Date.now() - lastReorderSourceAtRef.current < 500) {
      return;
    }

    setLastReorderSource('page');
    lastReorderSourceAtRef.current = Date.now();

    // Compute the new file order based on page positions
    const newFileOrder = computeFileOrderFromPages(pages);

    if (newFileOrder.length > 0) {
      // Update global FileContext order
      fileActions.reorderFiles(newFileOrder);
    }
  }, [fileActions, lastReorderSource]);

  const syncWithFileContext = useCallback((fileContextFiles: Array<{ fileId: FileId; name: string; versionNumber?: number }>) => {
    setFiles(prev => {
      // Create a map of existing files for quick lookup
      const existingMap = new Map(prev.map(f => [f.fileId, f]));

      // Build new files array from FileContext, preserving selection state
      const newFiles: PageEditorFile[] = fileContextFiles.map(file => {
        const existing = existingMap.get(file.fileId);
        return {
          fileId: file.fileId,
          name: file.name,
          versionNumber: file.versionNumber,
          isSelected: existing?.isSelected ?? false, // Preserve selection or default to false
        };
      });

      // If no files selected, select all by default (up to MAX_PAGE_EDITOR_FILES)
      const selectedCount = newFiles.filter(f => f.isSelected).length;
      if (selectedCount === 0 && newFiles.length > 0) {
        const maxToSelect = Math.min(newFiles.length, MAX_PAGE_EDITOR_FILES);
        if (newFiles.length > MAX_PAGE_EDITOR_FILES) {
          console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Only first ${MAX_PAGE_EDITOR_FILES} files will be selected.`);
        }
        return newFiles.map((f, index) => ({
          ...f,
          isSelected: index < maxToSelect,
        }));
      }

      // Enforce maximum file limit
      if (selectedCount > MAX_PAGE_EDITOR_FILES) {
        console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Limiting selection.`);
        let selectedSoFar = 0;
        return newFiles.map(f => ({
          ...f,
          isSelected: f.isSelected && selectedSoFar++ < MAX_PAGE_EDITOR_FILES,
        }));
      }

      return newFiles;
    });
  }, []);

  const value: PageEditorContextValue = {
    files,
    currentPages,
    updateCurrentPages,
    reorderedPages,
    clearReorderedPages,
    setFileSelection,
    toggleFileSelection,
    selectAll,
    deselectAll,
    reorderFiles,
    updateFileOrderFromPages,
    lastReorderSource,
    clearReorderSource,
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
