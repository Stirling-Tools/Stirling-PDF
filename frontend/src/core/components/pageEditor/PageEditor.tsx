import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { usePageEditor } from "@app/contexts/PageEditorContext";
import { PDFDocument, PDFPage, PageEditorFunctions } from "@app/types/pageEditor";
import { StirlingFileStub } from "@app/types/fileContext";
import { pdfExportService } from "@app/services/pdfExportService";
import { documentManipulationService } from "@app/services/documentManipulationService";
import { exportProcessedDocumentsToFiles } from "@app/services/pdfExportHelpers";
// Thumbnail generation is now handled by individual PageThumbnail components
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';
import { FileId } from "@app/types/file";

import {
  DeletePagesCommand,
  ReorderPagesCommand,
  SplitCommand,
  BulkRotateCommand,
  PageBreakCommand,
  UndoManager
} from './commands/pageCommands';
import { GRID_CONSTANTS } from './constants';
import { useInitialPageDocument } from './hooks/useInitialPageDocument';
import { usePageDocument } from './hooks/usePageDocument';
import { usePageEditorState } from './hooks/usePageEditorState';
import { parseSelection } from "@app/utils/bulkselection/parseSelection";
import { usePageEditorRightRailButtons } from "@app/components/pageEditor/pageEditorRightRailButtons";
import { useFileColorMap } from "@app/components/pageEditor/hooks/useFileColorMap";
import { useWheelZoom } from "@app/hooks/useWheelZoom";

export interface PageEditorProps {
  onFunctionsReady?: (functions: PageEditorFunctions) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {

  // Use split contexts to prevent re-renders
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  // Navigation guard for unsaved changes
  const { setHasUnsavedChanges } = useNavigationGuard();

  // Get PageEditor coordination functions
  const { updateFileOrderFromPages, fileOrder, reorderedPages, clearReorderedPages, updateCurrentPages } = usePageEditor();

  // Zoom state management
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const rootFontSize = useMemo(() => {
    if (typeof window === 'undefined') {
      return 16;
    }
    const computed = getComputedStyle(document.documentElement).fontSize;
    const parsed = parseFloat(computed);
    return Number.isNaN(parsed) ? 16 : parsed;
  }, []);
  const itemGapPx = useMemo(() => {
    return parseFloat(GRID_CONSTANTS.ITEM_GAP) * rootFontSize * zoomLevel;
  }, [rootFontSize, zoomLevel]);

  // Zoom actions
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 0.1, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  }, []);

  // Derive page editor files from PageEditorContext's fileOrder (page editor workspace order)
  // Filter to only show PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  // Cache file objects to prevent infinite re-renders from new object references
  const fileOrderKey = fileOrder.join(',');
  const selectedIdsKey = [...state.ui.selectedFileIds].sort().join(',');
  const filesSignature = selectors.getFilesSignature();

  const fileObjectsRef = useRef(new Map<FileId, any>());
  const pagePositionCacheRef = useRef<Map<string, number>>(new Map());
  const pageNeighborCacheRef = useRef<Map<string, string | null>>(new Map());
  const gridItemRefsRef = useRef<React.MutableRefObject<Map<string, HTMLDivElement>> | null>(null);

  const pageEditorFiles = useMemo(() => {
    const cache = fileObjectsRef.current;
    const newFiles: any[] = [];

    fileOrder.forEach(fileId => {
      const stub = selectors.getStirlingFileStub(fileId);
      const isSelected = state.ui.selectedFileIds.includes(fileId);
      const isPdf = stub?.name?.toLowerCase().endsWith('.pdf') ?? false;

      if (!isPdf) return; // Skip non-PDFs

      const cached = cache.get(fileId);

      // Check if data actually changed (compare by fileId, not position)
      if (cached &&
          cached.fileId === fileId &&
          cached.name === (stub?.name || '') &&
          cached.versionNumber === stub?.versionNumber &&
          cached.isSelected === isSelected) {
        // Reuse existing object reference
        newFiles.push(cached);
      } else {
        // Create new object only if data changed
        const newFile = {
          fileId,
          name: stub?.name || '',
          versionNumber: stub?.versionNumber,
          isSelected,
        };
        cache.set(fileId, newFile);
        newFiles.push(newFile);
      }
    });

    // Clean up removed files from cache
    const activeIds = new Set(newFiles.map(f => f.fileId));
    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) {
        cache.delete(cachedId);
      }
    }

    return newFiles;
  }, [fileOrderKey, selectedIdsKey, filesSignature]);

  // Get ALL file IDs in order (not filtered by selection)
  const orderedFileIds = useMemo(() => {
    return pageEditorFiles.map(f => f.fileId);
  }, [pageEditorFiles]);

  // Get selected file IDs for filtering
  const selectedFileIds = useMemo(() => {
    return pageEditorFiles.filter(f => f.isSelected).map(f => f.fileId);
  }, [pageEditorFiles]);
  const activeFilesSignature = selectors.getFilesSignature();

  // UI state
  const globalProcessing = state.ui.isProcessing;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);

  // DOM-first undo manager (replaces the old React state undo system)
  const undoManagerRef = useRef(new UndoManager());

  // Document state management
  // Get initial document ONCE - useInitialPageDocument captures first value only
  const initialDocument = useInitialPageDocument();

  // Also get live mergedPdfDocument for delta sync (source of truth for page existence)
  const { document: mergedPdfDocument } = usePageDocument();

  // Initialize editedDocument from initial document
  useEffect(() => {
    if (!initialDocument || editedDocument) return;

    console.log('📄 Initializing editedDocument from initial document:', initialDocument.pages.length, 'pages');

    // Clone to avoid mutation
    setEditedDocument({
      ...initialDocument,
      pages: initialDocument.pages.map(p => ({ ...p }))
    });
  }, [initialDocument, editedDocument]);

  // Apply file reordering from PageEditorContext
  useEffect(() => {
    if (reorderedPages && editedDocument) {
      setEditedDocument({
        ...editedDocument,
        pages: reorderedPages
      });
      clearReorderedPages();
    }
  }, [reorderedPages, editedDocument, clearReorderedPages]);

  useEffect(() => {
    if (!editedDocument) return;
    const positionCache = pagePositionCacheRef.current;
    const neighborCache = pageNeighborCacheRef.current;
    const pages = editedDocument.pages;
    pages.forEach((page, index) => {
      positionCache.set(page.id, index);
      neighborCache.set(page.id, index > 0 ? pages[index - 1].id : null);
    });
  }, [editedDocument]);

  // Live delta sync: reflect external add/remove without touching existing order
  useEffect(() => {
    if (!mergedPdfDocument || !editedDocument) return;

    const sourcePages = mergedPdfDocument.pages;
    const sourceIds = new Set(sourcePages.map(p => p.id));

    // Group new pages by file (preserve within-file order from source)
    const prevIds = new Set(editedDocument.pages.map(p => p.id));
    const newPages: PDFPage[] = [];
    for (const p of sourcePages) {
      if (!prevIds.has(p.id)) {
        newPages.push(p);
      }
    }

    // Fast check: changes exist?
    const hasAdditions = newPages.length > 0;
    let hasRemovals = false;
    for (const p of editedDocument.pages) {
      if (!sourceIds.has(p.id)) {
        hasRemovals = true;
        break;
      }
    }

    if (!hasAdditions && !hasRemovals) return;

    setEditedDocument(prev => {
      if (!prev) return prev;
      let pages = [...prev.pages];

      // Capture placeholder positions before they are removed so we can restore files without disrupting current order
      const placeholderPositions = new Map<FileId, number>();
      pages.forEach((page, index) => {
        if (page.isPlaceholder && page.originalFileId) {
          placeholderPositions.set(page.originalFileId, index);
        }
      });

      // Track next insertion index per file when replacing placeholders
      const nextInsertIndexByFile = new Map(placeholderPositions);

      // Remove pages that no longer exist in source
      if (hasRemovals) {
        pages = pages.filter(p => sourceIds.has(p.id));
      }

      // Insert new pages while preserving current interleaving
      if (hasAdditions) {
        const mergedIndexMap = new Map<string, number>();
        sourcePages.forEach((page, index) => mergedIndexMap.set(page.id, index));

        const additions = newPages
          .map(page => ({
            page,
            cachedIndex: pagePositionCacheRef.current.get(page.id),
            mergedIndex: mergedIndexMap.get(page.id) ?? sourcePages.length,
            neighborId: pageNeighborCacheRef.current.get(page.id)
          }))
          .sort((a, b) => {
            const aIndex = a.cachedIndex ?? a.mergedIndex;
            const bIndex = b.cachedIndex ?? b.mergedIndex;
            if (aIndex !== bIndex) return aIndex - bIndex;
            return a.mergedIndex - b.mergedIndex;
          });

        additions.forEach(({ page, neighborId, cachedIndex, mergedIndex }) => {
          if (pages.some(existing => existing.id === page.id)) {
            return;
          }

          let insertIndex: number;
          const originalFileId = page.originalFileId;
          const placeholderIndex = originalFileId ? nextInsertIndexByFile.get(originalFileId) : undefined;

          if (originalFileId && placeholderIndex !== undefined) {
            insertIndex = Math.min(placeholderIndex, pages.length);
            nextInsertIndexByFile.set(originalFileId, insertIndex + 1);
          } else if (neighborId === null) {
            insertIndex = 0;
          } else if (neighborId) {
            const neighborIndex = pages.findIndex(p => p.id === neighborId);
            if (neighborIndex !== -1) {
              insertIndex = neighborIndex + 1;
            } else {
              const fallbackIndex = cachedIndex ?? mergedIndex ?? pages.length;
              insertIndex = Math.min(fallbackIndex, pages.length);
            }
          } else {
            const fallbackIndex = cachedIndex ?? mergedIndex ?? pages.length;
            insertIndex = Math.min(fallbackIndex, pages.length);
          }

          const clonedPage = { ...page };
          pages.splice(insertIndex, 0, clonedPage);
        });
      }

      // Renumber without reordering
      pages = pages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
      return { ...prev, pages };
    });
  }, [fileOrder.join(','), mergedPdfDocument && mergedPdfDocument.pages.map(p => p.id).join(',')]);

  // UI state management
  const {
    selectionMode, selectedPageIds, movingPage, isAnimating, splitPositions, exportLoading,
    setSelectionMode, setSelectedPageIds, setMovingPage, setSplitPositions, setExportLoading,
    togglePage, toggleSelectAll, animateReorder
  } = usePageEditorState();

  const [csvInput, setCsvInput] = useState<string>('');

  useEffect(() => {
    setCsvInput('');
  }, [activeFilesSignature]);

  // Grid container ref for positioning split indicators
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Update undo/redo state
  const updateUndoRedoState = useCallback(() => {
    const undoManager = undoManagerRef.current;
    setCanUndo(undoManager.canUndo());
    setCanRedo(undoManager.canRedo());

    if (!undoManager.hasHistory()) {
      setHasUnsavedChanges(false);
    }
  }, [setHasUnsavedChanges]);

  // Set up undo manager callback
  useEffect(() => {
    undoManagerRef.current.setStateChangeCallback(updateUndoRedoState);
    // Initialize state
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Wrapper for executeCommand to track unsaved changes
  const executeCommandWithTracking = useCallback((command: any) => {
    undoManagerRef.current.executeCommand(command);
    setHasUnsavedChanges(true);
  }, [setHasUnsavedChanges]);

  // Watch for container size changes to update split line positions
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Interface functions for parent component
  const displayDocument = editedDocument || initialDocument;

  // Feed current pages to PageEditorContext so file reordering can compute page-level changes
  useEffect(() => {
    updateCurrentPages(displayDocument?.pages ?? null);
  }, [displayDocument, updateCurrentPages]);

  // Derived values for right rail and usePageEditorRightRailButtons (must be after displayDocument)
  const totalPages = displayDocument?.pages.length || 0;
  const selectedPageCount = selectedPageIds.length;
  const activeFileIds = selectedFileIds;

  // Utility functions to convert between page IDs and page numbers
  const getPageNumbersFromIds = useCallback((pageIds: string[]): number[] => {
    if (!displayDocument) return [];
    return pageIds.map(id => {
      const page = displayDocument.pages.find(p => p.id === id);
      return page?.pageNumber || 0;
    }).filter(num => num > 0);
  }, [displayDocument]);

  const getPageIdsFromNumbers = useCallback((pageNumbers: number[]): string[] => {
    if (!displayDocument) return [];
    return pageNumbers.map(num => {
      const page = displayDocument.pages.find(p => p.pageNumber === num);
      return page?.id || '';
    }).filter(id => id !== '');
  }, [displayDocument]);

  // Select all pages by default when document initially loads
  const hasInitializedSelection = useRef(false);
  useEffect(() => {
    if (displayDocument && displayDocument.pages.length > 0 && !hasInitializedSelection.current) {
      const allPageIds = displayDocument.pages.map(p => p.id);
      setSelectedPageIds(allPageIds);
      setSelectionMode(true);
      hasInitializedSelection.current = true;
    }
  }, [displayDocument, setSelectedPageIds, setSelectionMode]);

  // Automatically include newly added pages in the current selection
  const previousPageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!displayDocument || displayDocument.pages.length === 0) {
      previousPageIdsRef.current = new Set();
      return;
    }

    const currentIds = new Set(displayDocument.pages.map(page => page.id));
    const newlyAddedPageIds: string[] = [];
    currentIds.forEach(id => {
      if (!previousPageIdsRef.current.has(id)) {
        newlyAddedPageIds.push(id);
      }
    });

    if (newlyAddedPageIds.length > 0) {
      const next = new Set(selectedPageIds);
      newlyAddedPageIds.forEach(id => next.add(id));
      setSelectedPageIds(Array.from(next));
    }

    previousPageIdsRef.current = currentIds;
  }, [displayDocument, selectedPageIds, setSelectedPageIds]);

  // DOM-first command handlers
  const handleRotatePages = useCallback((pageIds: string[], rotation: number) => {
    const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);
    executeCommandWithTracking(bulkRotateCommand);
  }, [executeCommandWithTracking]);

  // Command factory functions for PageThumbnail
  const createRotateCommand = useCallback((pageIds: string[], rotation: number) => ({
    execute: () => {
      const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);
      executeCommandWithTracking(bulkRotateCommand);
    }
  }), [executeCommandWithTracking]);

  const createDeleteCommand = useCallback((pageIds: string[]) => ({
    execute: () => {
      if (!displayDocument) return;

      const pagesToDelete = pageIds.map(pageId => {

    const page = displayDocument.pages.find(p => p.id === pageId);
        return page?.pageNumber || 0;
      }).filter(num => num > 0);

      if (pagesToDelete.length > 0) {
        const deleteCommand = new DeletePagesCommand(
          pagesToDelete,
          () => displayDocument,
          setEditedDocument,
          (pageNumbers: number[]) => {
            const pageIds = getPageIdsFromNumbers(pageNumbers);
            setSelectedPageIds(pageIds);
          },
          () => splitPositions,
          setSplitPositions,
          () => getPageNumbersFromIds(selectedPageIds),
          closePdf
        );
        executeCommandWithTracking(deleteCommand);
      }
    }
  }), [displayDocument, splitPositions, selectedPageIds, getPageNumbersFromIds, executeCommandWithTracking]);

  const createSplitCommand = useCallback((position: number) => ({
    execute: () => {
      const splitCommand = new SplitCommand(
        position,
        () => splitPositions,
        setSplitPositions
      );
      executeCommandWithTracking(splitCommand);
    }
}), [splitPositions, executeCommandWithTracking]);

  // Command executor for PageThumbnail
  const executeCommand = useCallback((command: any) => {
    if (command && typeof command.execute === 'function') {
      command.execute();
    }
  }, []);


  const handleUndo = useCallback(() => {
    undoManagerRef.current.undo();
  }, []);

  const handleRedo = useCallback(() => {
    undoManagerRef.current.redo();
  }, []);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!displayDocument || selectedPageIds.length === 0) return;
    const rotation = direction === 'left' ? -90 : 90;

    handleRotatePages(selectedPageIds, rotation);
  }, [displayDocument, selectedPageIds, handleRotatePages]);

  const handleDelete = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    // Convert selected page IDs to page numbers for the command
    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const deleteCommand = new DeletePagesCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument,
      (pageNumbers: number[]) => {
        const pageIds = getPageIdsFromNumbers(pageNumbers);
        setSelectedPageIds(pageIds);
      },
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers,
      closePdf
    );
    executeCommandWithTracking(deleteCommand);
  }, [selectedPageIds, displayDocument, splitPositions, getPageNumbersFromIds, getPageIdsFromNumbers, executeCommandWithTracking]);

  const handleDeletePage = useCallback((pageNumber: number) => {
    if (!displayDocument) return;

    const deleteCommand = new DeletePagesCommand(
      [pageNumber],
      () => displayDocument,
      setEditedDocument,
      (pageNumbers: number[]) => {
        const pageIds = getPageIdsFromNumbers(pageNumbers);
        setSelectedPageIds(pageIds);
      },
      () => splitPositions,
      setSplitPositions,
      () => getPageNumbersFromIds(selectedPageIds),
      closePdf
    );
    executeCommandWithTracking(deleteCommand);
  }, [displayDocument, splitPositions, selectedPageIds, getPageNumbersFromIds, executeCommandWithTracking]);

  const handleSplit = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    // Convert selected page IDs to page numbers, then to split positions (0-based indices)
    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);
    const selectedPositions: number[] = [];
    selectedPageNumbers.forEach(pageNum => {
      const pageIndex = displayDocument.pages.findIndex(p => p.pageNumber === pageNum);
      if (pageIndex !== -1 && pageIndex < displayDocument.pages.length - 1) {
        // Only allow splits before the last page
        selectedPositions.push(pageIndex);
      }
    });

    if (selectedPositions.length === 0) return;

    // Smart toggle logic: follow the majority, default to adding splits if equal
    const existingSplitsCount = selectedPositions.filter(pos => splitPositions.has(pos)).length;
    const noSplitsCount = selectedPositions.length - existingSplitsCount;

    // Remove splits only if majority already have splits
    // If equal (50/50), default to adding splits
    const shouldRemoveSplits = existingSplitsCount > noSplitsCount;


    const newSplitPositions = new Set(splitPositions);

    if (shouldRemoveSplits) {
      // Remove splits from all selected positions
      selectedPositions.forEach(pos => newSplitPositions.delete(pos));
    } else {
      // Add splits to all selected positions
      selectedPositions.forEach(pos => newSplitPositions.add(pos));
    }

    // Create a custom command that sets the final state directly
    const smartSplitCommand = {
      execute: () => setSplitPositions(newSplitPositions),
      undo: () => setSplitPositions(splitPositions),
      description: shouldRemoveSplits
        ? `Remove ${selectedPositions.length} split(s)`
        : `Add ${selectedPositions.length - existingSplitsCount} split(s)`
    };

    executeCommandWithTracking(smartSplitCommand);
  }, [selectedPageIds, displayDocument, splitPositions, setSplitPositions, getPageNumbersFromIds, executeCommandWithTracking]);

  // Alias for consistency - handleSplitAll is the same as handleSplit (both have smart toggle logic)
  const handleSplitAll = handleSplit;

  const handlePageBreak = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    // Convert selected page IDs to page numbers for the command
    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const pageBreakCommand = new PageBreakCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument
    );
    executeCommandWithTracking(pageBreakCommand);
  }, [selectedPageIds, displayDocument, getPageNumbersFromIds, executeCommandWithTracking]);

  // Alias for consistency - handlePageBreakAll is the same as handlePageBreak
  const handlePageBreakAll = handlePageBreak;

  const handleInsertFiles = useCallback(async (
    files: File[] | StirlingFileStub[],
    insertAfterPage: number,
    isFromStorage?: boolean
  ) => {
    if (!editedDocument || files.length === 0) return;

    try {
      const targetPage = editedDocument.pages.find(p => p.pageNumber === insertAfterPage);
      if (!targetPage) return;

      console.log('📄 handleInsertFiles: Inserting files after page', insertAfterPage, 'targetPage:', targetPage.id);

      // Add files to FileContext for metadata tracking and preserve insertion point
      const insertAfterPageId = targetPage.id;
      let addedFileIds: FileId[] = [];
      if (isFromStorage) {
        const stubs = files as StirlingFileStub[];
        const result = await actions.addStirlingFileStubs(stubs, {
          selectFiles: true,
          insertAfterPageId
        });
        addedFileIds = result.map(f => f.fileId);
        console.log('📄 handleInsertFiles: Added stubs, IDs:', addedFileIds);
      } else {
        const result = await actions.addFiles(files as File[], {
          selectFiles: true,
          insertAfterPageId
        });
        addedFileIds = result.map(f => f.fileId);
        console.log('📄 handleInsertFiles: Added files, IDs:', addedFileIds);
      }

      // Wait a moment for files to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Extract pages from newly added files and insert them into editedDocument
      const newPages: PDFPage[] = [];
      for (const fileId of addedFileIds) {
        const stub = selectors.getStirlingFileStub(fileId);
        console.log('📄 handleInsertFiles: File', fileId, 'stub:', stub?.name, 'processedFile:', stub?.processedFile?.totalPages, 'pages:', stub?.processedFile?.pages?.length);
        if (stub?.processedFile?.pages) {
          // Clone pages and ensure proper PDFPage structure
          const clonedPages = stub.processedFile.pages.map((page, idx) => ({
            ...page,
            id: `${fileId}-${page.pageNumber ?? idx + 1}`,
            pageNumber: page.pageNumber ?? idx + 1,
            originalFileId: fileId,
            originalPageNumber: page.originalPageNumber ?? page.pageNumber ?? idx + 1,
            rotation: page.rotation ?? 0,
            thumbnail: page.thumbnail ?? null,
            selected: false,
            splitAfter: page.splitAfter ?? false,
          }));
          newPages.push(...clonedPages);
        }
      }

      console.log('📄 handleInsertFiles: Collected', newPages.length, 'new pages');

      if (newPages.length > 0) {
        // Find insertion index in editedDocument
        const targetIndex = editedDocument.pages.findIndex(p => p.id === targetPage.id);
        console.log('📄 handleInsertFiles: Target index in editedDocument:', targetIndex);

        if (targetIndex >= 0) {
          // Clone pages and insert
          const updatedPages = [...editedDocument.pages];
          updatedPages.splice(targetIndex + 1, 0, ...newPages);

          // Renumber all pages
          updatedPages.forEach((page, index) => {
            page.pageNumber = index + 1;
          });

          console.log('📄 handleInsertFiles: Updated pages:', updatedPages.map(p => `${p.id}(${p.pageNumber})`));

          setEditedDocument({
            ...editedDocument,
            pages: updatedPages
          });

          // Keep PageEditor file order in sync with newly inserted pages
          updateFileOrderFromPages(updatedPages);
        }
      }
    } catch (error) {
      console.error('Failed to insert files:', error);
    }
  }, [editedDocument, actions, selectors, updateFileOrderFromPages]);

  const handleSelectAll = useCallback(() => {
    if (!displayDocument) return;
    const allPageIds = displayDocument.pages.map(p => p.id);
    toggleSelectAll(allPageIds);
  }, [displayDocument, toggleSelectAll]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPageIds([]);
  }, [setSelectedPageIds]);

  const handleSetSelectedPages = useCallback((pageNumbers: number[]) => {
    const pageIds = getPageIdsFromNumbers(pageNumbers);
    setSelectedPageIds(pageIds);
  }, [getPageIdsFromNumbers, setSelectedPageIds]);

  const updatePagesFromCSV = useCallback((override?: string) => {
    if (totalPages === 0) return;
    const normalized = parseSelection(override ?? csvInput, totalPages);
    handleSetSelectedPages(normalized);
  }, [csvInput, totalPages, handleSetSelectedPages]);

  const handleReorderPages = useCallback((sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => {
    if (!displayDocument) return;

    // Convert selectedPageIds to page numbers for the reorder command
    const selectedPages = selectedPageIds ? getPageNumbersFromIds(selectedPageIds) : undefined;

    const reorderCommand = new ReorderPagesCommand(
      sourcePageNumber,
      targetIndex,
      selectedPages,
      () => displayDocument,
      setEditedDocument,
      (newPages) => updateFileOrderFromPages(newPages) // Sync file order when pages are reordered
    );
    executeCommandWithTracking(reorderCommand);
  }, [displayDocument, getPageNumbersFromIds, executeCommandWithTracking, updateFileOrderFromPages]);

  // Helper function to collect source files for multi-file export
  const getSourceFiles = useCallback((): Map<FileId, File> | null => {
    const sourceFiles = new Map<FileId, File>();

    // Always include selected files
    selectedFileIds.forEach(fileId => {
      const file = selectors.getFile(fileId);
      if (file) {
        sourceFiles.set(fileId, file);
      }
    });

    // Use multi-file export if we have multiple original files
    const hasInsertedFiles = false;
    const hasMultipleOriginalFiles = selectedFileIds.length > 1;

    if (!hasInsertedFiles && !hasMultipleOriginalFiles) {
      return null; // Use single-file export method
    }

    return sourceFiles.size > 0 ? sourceFiles : null;
  }, [selectedFileIds, selectors]);

  // Helper function to generate proper filename for exports
  const getExportFilename = useCallback((): string => {
    if (selectedFileIds.length <= 1) {
      // Single file - use original name
      return displayDocument?.name || 'document.pdf';
    }

    // Multiple files - use first file name with " (merged)" suffix
    const firstFile = selectors.getFile(selectedFileIds[0]);
    if (firstFile) {
      const baseName = firstFile.name.replace(/\.pdf$/i, '');
      return `${baseName} (merged).pdf`;
    }

    return 'merged-document.pdf';
  }, [selectedFileIds, selectors, displayDocument]);

  const onExportSelected = useCallback(async () => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        displayDocument, // Original order (editedDocument is our working doc now)
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );

      // For selected pages export, we work with the first document (or single document)
      const documentWithDOMState = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;

      // Step 2: Use the already selected page IDs
      // Filter to only include IDs that exist in the document with DOM state
      const validSelectedPageIds = selectedPageIds.filter(pageId =>
        documentWithDOMState.pages.some(p => p.id === pageId)
      );

      // Step 3: Export with pdfExportService

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const result = sourceFiles
        ? await pdfExportService.exportPDFMultiFile(
            documentWithDOMState,
            sourceFiles,
            validSelectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          )
        : await pdfExportService.exportPDF(
            documentWithDOMState,
            validSelectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          );

      // Step 4: Download the result
      pdfExportService.downloadFile(result.blob, result.filename);
      setHasUnsavedChanges(false); // Clear unsaved changes after successful export

      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, selectedPageIds, initialDocument, splitPositions, getSourceFiles, getExportFilename, setHasUnsavedChanges]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        displayDocument,
        displayDocument,
        splitPositions
      );

      // Step 2: Export to files
      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(processedDocuments, sourceFiles, exportFilename);

      // Step 3: Download
      if (files.length > 1) {
        // Multiple files - create ZIP
        const JSZip = await import('jszip');
        const zip = new JSZip.default();

        files.forEach((file) => {
          zip.file(file.name, file);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const exportFilename = getExportFilename();
        const zipFilename = exportFilename.replace(/\.pdf$/i, '.zip');

        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        // Single file - download directly
        const file = files[0];
        pdfExportService.downloadFile(file, file.name);
      }

      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, initialDocument, splitPositions, getSourceFiles, getExportFilename, setHasUnsavedChanges]);

  // Apply DOM changes to document state using dedicated service
  const applyChanges = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        displayDocument,
        displayDocument,
        splitPositions
      );

      // Step 2: Export to files
      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(processedDocuments, sourceFiles, exportFilename);

      // Step 3: Add merged output as new files while keeping originals
      const newStirlingFiles = await actions.addFiles(files, { selectFiles: true });
      if (newStirlingFiles.length > 0) {
        actions.setSelectedFiles(newStirlingFiles.map(file => file.fileId));
      }

      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error('Apply changes failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, initialDocument, splitPositions, getSourceFiles, getExportFilename, actions, setHasUnsavedChanges]);


  const closePdf = useCallback(() => {
    actions.clearAllFiles();

    undoManagerRef.current.clear();
    setSelectedPageIds([]);
    setSelectionMode(false);
  }, [actions]);

  usePageEditorRightRailButtons({
    totalPages,
    selectedPageCount,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument: displayDocument || undefined,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
    onSaveChanges: applyChanges,
    exportLoading,
    activeFileCount: activeFileIds.length,
    closePdf,
  });

  // Export preview function - defined after export functions to avoid circular dependency
  const handleExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!displayDocument) return;

    // For now, trigger the actual export directly
   // In the original, this would show a preview modal first
    if (selectedOnly) {
      onExportSelected();
    } else {
      onExportAll();
    }
  }, [displayDocument, onExportSelected, onExportAll]);

  // Expose functions to parent component
  useEffect(() => {
    if (onFunctionsReady) {
      onFunctionsReady({
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleRotate,
        handleDelete,
        handleSplit,
        handleSplitAll,
        handlePageBreak,
        handlePageBreakAll,
        handleSelectAll,
        handleDeselectAll,
        handleSetSelectedPages,
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPageIds,
        displayDocument: displayDocument || undefined,
        splitPositions,
        totalPages: displayDocument?.pages.length || 0,
        closePdf,
      });
    }
  }, [
    onFunctionsReady, handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit, handleSplitAll,
    handlePageBreak, handlePageBreakAll, handleSelectAll, handleDeselectAll, handleSetSelectedPages, handleExportPreview, onExportSelected, onExportAll, applyChanges, exportLoading,
    selectionMode, selectedPageIds, splitPositions, displayDocument?.pages.length, closePdf
  ]);

  useWheelZoom({
    ref: containerRef,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    enabled: !!displayDocument,
  });

  // Handle keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isContainerHovered) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          // Ctrl+= or Ctrl++ for zoom in
          event.preventDefault();
          zoomIn();
        } else if (event.key === '-' || event.key === '_') {
          // Ctrl+- for zoom out
          event.preventDefault();
          zoomOut();
        } else if (event.key === '0') {
          // Ctrl+0 for reset zoom
          event.preventDefault();
          setZoomLevel(1.0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isContainerHovered, zoomIn, zoomOut]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  // Track color assignments by insertion order (files keep their color)
  const fileColorIndexMap = useFileColorMap(orderedFileIds);

  return (
    <Box
      ref={containerRef}
      pos="relative"
      h='100%'
      style={{ overflow: 'auto' }}
      data-scrolling-container="true"
      onMouseEnter={() => setIsContainerHovered(true)}
      onMouseLeave={() => setIsContainerHovered(false)}
    >
      <LoadingOverlay visible={globalProcessing && !initialDocument} />

      {!initialDocument && !globalProcessing && selectedFileIds.length === 0 && (
        <Center h='100%'>
          <Stack align="center" gap="md">
            <Text size="lg" c="dimmed">📄</Text>
            <Text c="dimmed">No PDF files loaded</Text>
            <Text size="sm" c="dimmed">Add files to start editing pages</Text>
          </Stack>
        </Center>
      )}

      {!initialDocument && globalProcessing && (
        <Box p={0}>
          <SkeletonLoader type="controls" />
          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {displayDocument && (
        <Box ref={gridContainerRef} p={0} pt="2rem" pb="15rem" style={{ position: 'relative' }}>

            {/* Split Lines Overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
            {(() => {
              const refsMap = gridItemRefsRef.current?.current;
              const containerEl = gridContainerRef.current;
              if (!refsMap || !containerEl) {
                return null;
              }

              const containerRect = containerEl.getBoundingClientRect();

              return Array.from(splitPositions).map((position) => {
                const currentPage = displayedPages[position];
                if (!currentPage) {
                  return null;
                }

                const currentEl = refsMap.get(currentPage.id);
                if (!currentEl) {
                  return null;
                }

                const currentRect = currentEl.getBoundingClientRect();
                const nextPage = displayedPages[position + 1];
                let lineLeft;

                if (nextPage) {
                  const nextEl = refsMap.get(nextPage.id);
                  if (nextEl) {
                    const nextRect = nextEl.getBoundingClientRect();
                    const sameRow = Math.abs(nextRect.top - currentRect.top) < currentRect.height / 2;
                    if (sameRow) {
                      lineLeft = (currentRect.right + nextRect.left) / 2;
                    } else {
                      lineLeft = currentRect.right + itemGapPx / 2;
                    }
                  } else {
                    lineLeft = currentRect.right + itemGapPx / 2;
                  }
                } else {
                  lineLeft = currentRect.right + itemGapPx / 2;
                }

                return (
                  <div
                    key={`split-${position}`}
                    style={{
                      position: 'absolute',
                      left: `${lineLeft - containerRect.left}px`,
                      top: `${currentRect.top - containerRect.top}px`,
                      width: '1px',
                      height: `${currentRect.height}px`,
                      borderLeft: '1px dashed #3b82f6',
                    }}
                  />
                );
              });
            })()}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            onReorderPages={handleReorderPages}
            zoomLevel={zoomLevel}
            getThumbnailData={(pageId) => {
              const page = displayDocument.pages.find(p => p.id === pageId);
              if (!page?.thumbnail) return null;
              return {
                src: page.thumbnail,
                rotation: page.rotation || 0
              };
            }}
            renderItem={(page, index, refs, boxSelectedIds, clearBoxSelection, _getBoxSelection, _activeId, activeDragIds, justMoved, _isOver, dragHandleProps, zoomLevel) => {
              gridItemRefsRef.current = refs;
              const fileColorIndex = page.originalFileId ? fileColorIndexMap.get(page.originalFileId) ?? 0 : 0;
              const isBoxSelected = boxSelectedIds.includes(page.id);
              return (
                <PageThumbnail
                  key={page.id}
                  page={page}
                  index={index}
                  totalPages={displayDocument.pages.length}
                  originalFile={(page as any).originalFileId ? selectors.getFile((page as any).originalFileId) : undefined}
                  fileColorIndex={fileColorIndex}
                  selectedPageIds={selectedPageIds}
                  selectionMode={selectionMode}
                  movingPage={movingPage}
                  isAnimating={isAnimating}
                  isBoxSelected={isBoxSelected}
                  clearBoxSelection={clearBoxSelection}
                  activeDragIds={activeDragIds}
                  justMoved={justMoved}
                  pageRefs={refs}
                  dragHandleProps={dragHandleProps}
                  onReorderPages={handleReorderPages}
                  onTogglePage={togglePage}
                  onAnimateReorder={animateReorder}
                  onExecuteCommand={executeCommand}
                  onSetStatus={() => {}}
                  onSetMovingPage={setMovingPage}
                  onDeletePage={handleDeletePage}
                  createRotateCommand={createRotateCommand}
                  createDeleteCommand={createDeleteCommand}
                  createSplitCommand={createSplitCommand}
                  pdfDocument={displayDocument}
                  setPdfDocument={setEditedDocument}
                  splitPositions={splitPositions}
                  onInsertFiles={handleInsertFiles}
                  zoomLevel={zoomLevel}
                />
              );
            }}
          />
        </Box>
      )}


      <NavigationWarningModal
        onApplyAndContinue={async () => {
          await applyChanges();
        }}
        onExportAndContinue={async () => {
          await onExportAll();
        }}
      />

    </Box>
  );
};

export default PageEditor;
