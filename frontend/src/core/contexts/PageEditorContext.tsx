import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { FileId } from '@app/types/file';
import { useFileActions, useFileState } from '@app/contexts/FileContext';
import { PDFPage } from '@app/types/pageEditor';
import { MAX_PAGE_EDITOR_FILES } from '@app/components/pageEditor/fileColors';

// PageEditorFile is now defined locally in consuming components
// Components should derive file list directly from FileContext

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
    // Moving down: insert AFTER the last page of ANY file that should come before us
    // We need to find the last page belonging to any file at index <= toIndex in orderedFileIds
    const filesBeforeUs = new Set(orderedFileIds.slice(0, toIndex + 1));
    for (let i = remainingPages.length - 1; i >= 0; i--) {
      const pageFileId = remainingPages[i].originalFileId;
      if (pageFileId && filesBeforeUs.has(pageFileId)) {
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
  // Current page order (updated by PageEditor, used for file reordering)
  currentPages: PDFPage[] | null;
  updateCurrentPages: (pages: PDFPage[] | null) => void;

  // Reordered pages (when file reordering happens)
  reorderedPages: PDFPage[] | null;
  clearReorderedPages: () => void;

  // Page editor's own file order (independent of FileContext global order)
  fileOrder: FileId[];
  setFileOrder: (order: FileId[]) => void;

  // Set file selection (calls FileContext actions)
  setFileSelection: (fileId: FileId, selected: boolean) => void;

  // Toggle file selection (calls FileContext actions)
  toggleFileSelection: (fileId: FileId) => void;

  // Select/deselect all files (calls FileContext actions)
  selectAll: () => void;
  deselectAll: () => void;

  // Reorder files (only affects page editor's local order)
  reorderFiles: (fromIndex: number, toIndex: number) => void;

  // Update file order based on page positions (when pages are manually reordered)
  updateFileOrderFromPages: (pages: PDFPage[]) => void;
}

const PageEditorContext = createContext<PageEditorContextValue | undefined>(undefined);

interface PageEditorProviderProps {
  children: ReactNode;
}

export function PageEditorProvider({ children }: PageEditorProviderProps) {
  const [currentPages, setCurrentPages] = useState<PDFPage[] | null>(null);
  const [reorderedPages, setReorderedPages] = useState<PDFPage[] | null>(null);

  // Page editor's own file order (independent of FileContext)
  const [fileOrder, setFileOrder] = useState<FileId[]>([]);

  // Read from FileContext (for file metadata only, not order)
  const { actions: fileActions } = useFileActions();
  const { state } = useFileState();

  // Keep a ref to always read latest state in stable callbacks
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Track the previous FileContext order to detect actual changes
  const prevFileContextIdsRef = React.useRef<FileId[]>([]);

  // Initialize fileOrder from FileContext when files change (add/remove only)
  React.useEffect(() => {
    const currentFileIds = state.files.ids;
    const prevFileIds = prevFileContextIdsRef.current;

    // Only react to FileContext changes, not our own fileOrder changes
    const fileContextChanged =
      currentFileIds.length !== prevFileIds.length ||
      !currentFileIds.every((id, idx) => id === prevFileIds[idx]);

    if (!fileContextChanged) {
      return;
    }

    prevFileContextIdsRef.current = currentFileIds;

    // Collect new file IDs outside the setState callback so we can clear them after
    let newFileIdsToProcess: FileId[] = [];

    // Use functional setState to read latest fileOrder without depending on it
    setFileOrder(currentOrder => {
      // Identify new files
      const newFileIds = currentFileIds.filter(id => !currentOrder.includes(id));
      newFileIdsToProcess = newFileIds; // Store for cleanup

      // Remove deleted files
      const validFileOrder = currentOrder.filter(id => currentFileIds.includes(id));

      if (newFileIds.length === 0 && validFileOrder.length === currentOrder.length) {
        return currentOrder; // No changes needed
      }

      // Always append new files to end
      // If files have insertAfterPageId, page-level insertion is handled by usePageDocument
      return [...validFileOrder, ...newFileIds];
    });

    // Clear insertAfterPageId after a delay to allow usePageDocument to consume it first
    setTimeout(() => {
      newFileIdsToProcess.forEach(fileId => {
        const stub = state.files.byId[fileId];
        if (stub?.insertAfterPageId) {
          fileActions.updateStirlingFileStub(fileId, { insertAfterPageId: undefined });
        }
      });
    }, 100);
  }, [state.files.ids, state.files.byId, fileActions]);

  const updateCurrentPages = useCallback((pages: PDFPage[] | null) => {
    setCurrentPages(pages);
  }, []);

  const clearReorderedPages = useCallback(() => {
    setReorderedPages(null);
  }, []);

  const setFileSelection = useCallback((fileId: FileId, selected: boolean) => {
    const currentSelection = stateRef.current.ui.selectedFileIds;
    const isAlreadySelected = currentSelection.includes(fileId);

    // Check if we're trying to select when at limit
    if (selected && !isAlreadySelected && currentSelection.length >= MAX_PAGE_EDITOR_FILES) {
      console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Cannot select more files.`);
      return;
    }

    // Update FileContext selection
    const newSelectedIds = selected
      ? [...currentSelection, fileId]
      : currentSelection.filter(id => id !== fileId);

    fileActions.setSelectedFiles(newSelectedIds);
  }, [fileActions]);

  const toggleFileSelection = useCallback((fileId: FileId) => {
    const currentSelection = stateRef.current.ui.selectedFileIds;
    const isCurrentlySelected = currentSelection.includes(fileId);

    // If toggling on and at limit, don't allow
    if (!isCurrentlySelected && currentSelection.length >= MAX_PAGE_EDITOR_FILES) {
      console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Cannot select more files.`);
      return;
    }

    // Update FileContext selection
    const newSelectedIds = isCurrentlySelected
      ? currentSelection.filter(id => id !== fileId)
      : [...currentSelection, fileId];

    fileActions.setSelectedFiles(newSelectedIds);
  }, [fileActions]);

  const selectAll = useCallback(() => {
    const allFileIds = stateRef.current.files.ids;

    if (allFileIds.length > MAX_PAGE_EDITOR_FILES) {
      console.warn(`Page editor supports maximum ${MAX_PAGE_EDITOR_FILES} files. Only first ${MAX_PAGE_EDITOR_FILES} files will be selected.`);
      fileActions.setSelectedFiles(allFileIds.slice(0, MAX_PAGE_EDITOR_FILES));
    } else {
      fileActions.setSelectedFiles(allFileIds);
    }
  }, [fileActions]);

  const deselectAll = useCallback(() => {
    fileActions.setSelectedFiles([]);
  }, [fileActions]);

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    // Reorder local fileOrder array (page editor workspace only)
    const newOrder = [...fileOrder];
    const [movedFileId] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedFileId);
    setFileOrder(newOrder);

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

      // Get the target file ID from the NEW order (after the move)
      // When moving down: we want to position after the file at toIndex-1 (file just before insertion)
      // When moving up: we want to position before the file at toIndex+1 (file just after insertion)
      const targetFileId = fromIndex < toIndex
        ? newOrder[toIndex - 1]  // Moving down: target is the file just before where we inserted
        : newOrder[toIndex + 1];  // Moving up: target is the file just after where we inserted

      // Find their positions in the current page order (not the full file list)
      const pageOrderFromIndex = currentFileOrder.findIndex(id => id === movedFileId);
      const pageOrderToIndex = currentFileOrder.findIndex(id => id === targetFileId);

      // Only reorder pages if both files have pages loaded
      if (pageOrderFromIndex >= 0 && pageOrderToIndex >= 0) {
        const reorderedPagesResult = reorderPagesForFileMove(currentPages, pageOrderFromIndex, pageOrderToIndex, currentFileOrder);
        setReorderedPages(reorderedPagesResult);
      }
    }
  }, [fileOrder, currentPages]);

  const updateFileOrderFromPages = useCallback((pages: PDFPage[]) => {
    if (!pages || pages.length === 0) return;

    // Compute the new file order based on page positions
    const newFileOrder = computeFileOrderFromPages(pages);

    if (newFileOrder.length > 0) {
      // Update local page editor file order (not FileContext)
      setFileOrder(newFileOrder);
    }
  }, []);


  const value: PageEditorContextValue = useMemo(() => ({
    currentPages,
    updateCurrentPages,
    reorderedPages,
    clearReorderedPages,
    fileOrder,
    setFileOrder,
    setFileSelection,
    toggleFileSelection,
    selectAll,
    deselectAll,
    reorderFiles,
    updateFileOrderFromPages,
  }), [
    currentPages,
    updateCurrentPages,
    reorderedPages,
    clearReorderedPages,
    fileOrder,
    setFileSelection,
    toggleFileSelection,
    selectAll,
    deselectAll,
    reorderFiles,
    updateFileOrderFromPages,
  ]);

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
