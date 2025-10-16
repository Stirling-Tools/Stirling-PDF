import { useState, useCallback, useRef, useEffect } from "react";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { useFileState, useFileActions } from "../../contexts/FileContext";
import { useNavigationGuard } from "../../contexts/NavigationContext";
import { PDFDocument, PageEditorFunctions } from "../../types/pageEditor";
import { pdfExportService } from "../../services/pdfExportService";
import { documentManipulationService } from "../../services/documentManipulationService";
import { exportProcessedDocumentsToFiles } from "../../services/pdfExportHelpers";
import { createStirlingFilesAndStubs } from "../../services/fileStubHelpers";
// Thumbnail generation is now handled by individual PageThumbnail components
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';
import { FileId } from "../../types/file";

import {
  DeletePagesCommand,
  ReorderPagesCommand,
  SplitCommand,
  BulkRotateCommand,
  PageBreakCommand,
  UndoManager
} from './commands/pageCommands';
import { GRID_CONSTANTS } from './constants';
import { usePageDocument } from './hooks/usePageDocument';
import { usePageEditorState } from './hooks/usePageEditorState';
import { parseSelection } from "../../utils/bulkselection/parseSelection";
import { usePageEditorRightRailButtons } from "./pageEditorRightRailButtons";

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

  // Prefer IDs + selectors to avoid array identity churn
  const activeFileIds = state.files.ids;
  const filesSignature = selectors.getFilesSignature();

  // UI state
  const globalProcessing = state.ui.isProcessing;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);

  // DOM-first undo manager (replaces the old React state undo system)
  const undoManagerRef = useRef(new UndoManager());

  // Document state management
  const { document: mergedPdfDocument } = usePageDocument();


  // UI state management
  const {
    selectionMode, selectedPageIds, movingPage, isAnimating, splitPositions, exportLoading,
    setSelectionMode, setSelectedPageIds, setMovingPage, setSplitPositions, setExportLoading,
    togglePage, toggleSelectAll, animateReorder
  } = usePageEditorState();

  const [csvInput, setCsvInput] = useState<string>('');
  const [rightRailVisible, setRightRailVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRightRailVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      setRightRailVisible(false);
    };
  }, []);

  useEffect(() => {
    setCsvInput('');
  }, [filesSignature]);

  // Grid container ref for positioning split indicators
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // State to trigger re-renders when container size changes
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Update undo/redo state
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoManagerRef.current.canUndo());
    setCanRedo(undoManagerRef.current.canRedo());
  }, []);

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
  const displayDocument = editedDocument || mergedPdfDocument;
  const totalPages = displayDocument?.pages.length ?? 0;
  const selectedPageCount = selectedPageIds.length;

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

  const handleSplitAll = useCallback(() => {
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

  const handlePageBreakAll = useCallback(() => {
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

  const handleInsertFiles = useCallback(async (files: File[], insertAfterPage: number) => {
    if (!displayDocument || files.length === 0) return;

    try {
      const targetPage = displayDocument.pages.find(p => p.pageNumber === insertAfterPage);
      if (!targetPage) return;

      await actions.addFiles(files, { insertAfterPageId: targetPage.id });
    } catch (error) {
      console.error('Failed to insert files:', error);
    }
  }, [displayDocument, actions]);

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
      setEditedDocument
    );
    executeCommandWithTracking(reorderCommand);
  }, [displayDocument, getPageNumbersFromIds, executeCommandWithTracking]);

  // Helper function to collect source files for multi-file export
  const getSourceFiles = useCallback((): Map<FileId, File> | null => {
    const sourceFiles = new Map<FileId, File>();

    // Always include original files
    activeFileIds.forEach(fileId => {
      const file = selectors.getFile(fileId);
      if (file) {
        sourceFiles.set(fileId, file);
      }
    });

    // Use multi-file export if we have multiple original files
    const hasInsertedFiles = false;
    const hasMultipleOriginalFiles = activeFileIds.length > 1;

    if (!hasInsertedFiles && !hasMultipleOriginalFiles) {
      return null; // Use single-file export method
    }

    return sourceFiles.size > 0 ? sourceFiles : null;
  }, [activeFileIds, selectors]);

  // Helper function to generate proper filename for exports
  const getExportFilename = useCallback((): string => {
    if (activeFileIds.length <= 1) {
      // Single file - use original name
      return displayDocument?.name || 'document.pdf';
    }

    // Multiple files - use first file name with " (merged)" suffix
    const firstFile = selectors.getFile(activeFileIds[0]);
    if (firstFile) {
      const baseName = firstFile.name.replace(/\.pdf$/i, '');
      return `${baseName} (merged).pdf`;
    }

    return 'merged-document.pdf';
  }, [activeFileIds, selectors, displayDocument]);

  const onExportSelected = useCallback(async () => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
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
  }, [displayDocument, selectedPageIds, mergedPdfDocument, splitPositions, getSourceFiles, getExportFilename, setHasUnsavedChanges]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument,
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
  }, [displayDocument, mergedPdfDocument, splitPositions, getSourceFiles, getExportFilename, setHasUnsavedChanges]);

  // Apply DOM changes to document state using dedicated service
  const applyChanges = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument,
        displayDocument,
        splitPositions
      );

      // Step 2: Export to files
      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(processedDocuments, sourceFiles, exportFilename);

      // Step 3: Create StirlingFiles and stubs for version history
      const parentStub = selectors.getStirlingFileStub(activeFileIds[0]);
      if (!parentStub) throw new Error('Parent stub not found');

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(files, parentStub, 'multiTool');

      // Step 4: Consume files (replace in context)
      await actions.consumeFiles(activeFileIds, stirlingFiles, stubs);

      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error('Apply changes failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, mergedPdfDocument, splitPositions, activeFileIds, getSourceFiles, getExportFilename, actions, selectors, setHasUnsavedChanges]);


  const closePdf = useCallback(() => {
    actions.clearAllFiles();

    undoManagerRef.current.clear();
    setSelectedPageIds([]);
    setSelectionMode(false);
  }, [actions]);

  usePageEditorRightRailButtons({
    totalPages,
    selectedPageCount,
    rightRailVisible,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument: displayDocument || undefined,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
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

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  return (
    <Box pos="relative" h='100%' style={{ overflow: 'auto' }} data-scrolling-container="true">
      <LoadingOverlay visible={globalProcessing && !mergedPdfDocument} />

      {!mergedPdfDocument && !globalProcessing && activeFileIds.length === 0 && (
        <Center h='100%'>
          <Stack align="center" gap="md">
            <Text size="lg" c="dimmed">📄</Text>
            <Text c="dimmed">No PDF files loaded</Text>
            <Text size="sm" c="dimmed">Add files to start editing pages</Text>
          </Stack>
        </Center>
      )}

      {!mergedPdfDocument && globalProcessing && (
        <Box p={0}>
          <SkeletonLoader type="controls" />
          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {displayDocument && (
        <Box ref={gridContainerRef} p={0} pb="15rem" style={{ position: 'relative' }}>


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
              // Calculate remToPx once outside the map to avoid layout thrashing
              const containerWidth = containerDimensions.width;
              const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
              const ITEM_WIDTH = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
              const ITEM_HEIGHT = parseFloat(GRID_CONSTANTS.ITEM_HEIGHT) * remToPx;
              const ITEM_GAP = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;

              return Array.from(splitPositions).map((position) => {

              // Calculate items per row using DragDropGrid's logic
              const availableWidth = containerWidth - ITEM_GAP; // Account for first gap
              const itemWithGap = ITEM_WIDTH + ITEM_GAP;
              const itemsPerRow = Math.max(1, Math.floor(availableWidth / itemWithGap));

              // Calculate position within the grid (same as DragDropGrid)
              const row = Math.floor(position / itemsPerRow);
              const col = position % itemsPerRow;

              // Position split line between pages (after the current page)
              // Calculate grid centering offset (same as DragDropGrid)
              const gridWidth = itemsPerRow * ITEM_WIDTH + (itemsPerRow - 1) * ITEM_GAP;
              const gridOffset = Math.max(0, (containerWidth - gridWidth) / 2);

              const leftPosition = gridOffset + col * itemWithGap + ITEM_WIDTH + (ITEM_GAP / 2);
              const topPosition = row * ITEM_HEIGHT + (ITEM_HEIGHT * 0.05); // Center vertically (5% offset since page is 90% height)

              return (
                <div
                  key={`split-${position}`}
                  style={{
                    position: 'absolute',
                    left: leftPosition,
                    top: topPosition,
                    width: '1px',
                    height: `calc(${GRID_CONSTANTS.ITEM_HEIGHT} * 0.9)`, // Match page container height (90%)
                    borderLeft: '1px dashed #3b82f6'
                  }}
                />
              );
              });
            })()}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            selectedItems={selectedPageIds}
            selectionMode={selectionMode}
            isAnimating={isAnimating}
            onReorderPages={handleReorderPages}
            renderItem={(page, index, refs) => (
              <PageThumbnail
                key={page.id}
                page={page}
                index={index}
                totalPages={displayDocument.pages.length}
                originalFile={(page as any).originalFileId ? selectors.getFile((page as any).originalFileId) : undefined}
                selectedPageIds={selectedPageIds}
                selectionMode={selectionMode}
                movingPage={movingPage}
                isAnimating={isAnimating}
                pageRefs={refs}
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
              />
            )}
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
