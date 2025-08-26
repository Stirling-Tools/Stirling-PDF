import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Button, Text, Center, Box,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group, Portal
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions, useCurrentFile, useFileSelection } from "../../contexts/FileContext";
import { ModeType } from "../../contexts/NavigationContext";
import { PDFDocument, PDFPage, PageEditorFunctions } from "../../types/pageEditor";
import { ProcessedFile as EnhancedProcessedFile } from "../../types/processing";
import { pdfExportService } from "../../services/pdfExportService";
import { documentManipulationService } from "../../services/documentManipulationService";
// Thumbnail generation is now handled by individual PageThumbnail components
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';
import { FileId } from "../../types/fileContext";

import {
  DOMCommand,
  RotatePageCommand,
  DeletePagesCommand,
  ReorderPagesCommand,
  SplitCommand,
  BulkRotateCommand,
  BulkSplitCommand,
  SplitAllCommand,
  PageBreakCommand,
  BulkPageBreakCommand,
  UndoManager
} from './commands/pageCommands';
import { GRID_CONSTANTS } from './constants';
import { usePageDocument } from './hooks/usePageDocument';
import { usePageEditorState } from './hooks/usePageEditorState';

export interface PageEditorProps {
  onFunctionsReady?: (functions: PageEditorFunctions) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {

  // Use split contexts to prevent re-renders
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  // Prefer IDs + selectors to avoid array identity churn
  const activeFileIds = state.files.ids;
  const primaryFileId = activeFileIds[0] ?? null;
  const selectedFiles = selectors.getSelectedFiles();

  // Stable signature for effects (prevents loops)
  const filesSignature = selectors.getFilesSignature();

  // UI state
  const globalProcessing = state.ui.isProcessing;
  const processingProgress = state.ui.processingProgress;
  const hasUnsavedChanges = state.ui.hasUnsavedChanges;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [foundDraft, setFoundDraft] = useState<any>(null);
  const autoSaveTimer = useRef<number | null>(null);

  // DOM-first undo manager (replaces the old React state undo system)
  const undoManagerRef = useRef(new UndoManager());

  // Document state management
  const { document: mergedPdfDocument, isVeryLargeDocument, isLoading: documentLoading } = usePageDocument();


  // UI state management
  const {
    selectionMode, selectedPageIds, movingPage, isAnimating, splitPositions, exportLoading,
    setSelectionMode, setSelectedPageIds, setMovingPage, setIsAnimating, setSplitPositions, setExportLoading,
    togglePage, toggleSelectAll, animateReorder
  } = usePageEditorState();

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
  
  // Convert selectedPageIds to numbers for components that still need numbers
  const selectedPageNumbers = useMemo(() => 
    getPageNumbersFromIds(selectedPageIds), 
    [selectedPageIds, getPageNumbersFromIds]
  );

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
    undoManagerRef.current.executeCommand(bulkRotateCommand);
  }, []);

  // Command factory functions for PageThumbnail
  const createRotateCommand = useCallback((pageIds: string[], rotation: number) => ({
    execute: () => {
      const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);

    undoManagerRef.current.executeCommand(bulkRotateCommand);
    }
  }), []);

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
          () => getPageNumbersFromIds(selectedPageIds)
        );
        undoManagerRef.current.executeCommand(deleteCommand);
      }
    }
  }), [displayDocument, splitPositions, selectedPageIds, getPageNumbersFromIds]);

  const createSplitCommand = useCallback((position: number) => ({
    execute: () => {
      const splitCommand = new SplitCommand(
        position,
        () => splitPositions,
        setSplitPositions
      );
      undoManagerRef.current.executeCommand(splitCommand);
    }
}), [splitPositions]);

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
      () => selectedPageNumbers
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [selectedPageIds, displayDocument, splitPositions, getPageNumbersFromIds, getPageIdsFromNumbers]);

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
      () => getPageNumbersFromIds(selectedPageIds)
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [displayDocument, splitPositions, selectedPageIds, getPageNumbersFromIds]);

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

    undoManagerRef.current.executeCommand(smartSplitCommand);
  }, [selectedPageIds, displayDocument, splitPositions, setSplitPositions, getPageNumbersFromIds]);

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

    undoManagerRef.current.executeCommand(smartSplitCommand);
  }, [selectedPageIds, displayDocument, splitPositions, setSplitPositions, getPageNumbersFromIds]);

  const handlePageBreak = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    // Convert selected page IDs to page numbers for the command
    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const pageBreakCommand = new PageBreakCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument
    );
    undoManagerRef.current.executeCommand(pageBreakCommand);
  }, [selectedPageIds, displayDocument, getPageNumbersFromIds]);

  const handlePageBreakAll = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    // Convert selected page IDs to page numbers for the command
    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const pageBreakCommand = new PageBreakCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument
    );
    undoManagerRef.current.executeCommand(pageBreakCommand);
  }, [selectedPageIds, displayDocument, getPageNumbersFromIds]);

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
    undoManagerRef.current.executeCommand(reorderCommand);
  }, [displayDocument, getPageNumbersFromIds]);

  // Helper function to collect source files for multi-file export
  const getSourceFiles = useCallback((): Map<string, File> | null => {
    const sourceFiles = new Map<string, File>();

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

      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, selectedPageIds, mergedPdfDocument, splitPositions, getSourceFiles, getExportFilename]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );

      // Step 2: Check if we have multiple documents (splits) or single document
      if (Array.isArray(processedDocuments)) {
        // Multiple documents (splits) - export as ZIP
        const blobs: Blob[] = [];
        const filenames: string[] = [];

        const sourceFiles = getSourceFiles();
        const baseExportFilename = getExportFilename();
        const baseName = baseExportFilename.replace(/\.pdf$/i, '');

        for (let i = 0; i < processedDocuments.length; i++) {
          const doc = processedDocuments[i];
          const partFilename = `${baseName}_part_${i + 1}.pdf`;

          const result = sourceFiles
            ? await pdfExportService.exportPDFMultiFile(doc, sourceFiles, [], { filename: partFilename })
            : await pdfExportService.exportPDF(doc, [], { filename: partFilename });
          blobs.push(result.blob);
          filenames.push(result.filename);
        }

        // Create ZIP file
        const JSZip = await import('jszip');
        const zip = new JSZip.default();

        blobs.forEach((blob, index) => {
          zip.file(filenames[index], blob);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFilename = baseExportFilename.replace(/\.pdf$/i, '.zip');

        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        // Single document - regular export
        const sourceFiles = getSourceFiles();
        const exportFilename = getExportFilename();
        const result = sourceFiles
          ? await pdfExportService.exportPDFMultiFile(
              processedDocuments,
              sourceFiles,
              [],
              { selectedOnly: false, filename: exportFilename }
            )
          : await pdfExportService.exportPDF(
              processedDocuments,
              [],
              { selectedOnly: false, filename: exportFilename }
            );

        pdfExportService.downloadFile(result.blob, result.filename);
      }

      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, mergedPdfDocument, splitPositions, getSourceFiles, getExportFilename]);

  // Apply DOM changes to document state using dedicated service
  const applyChanges = useCallback(() => {
    if (!displayDocument) return;

    // Pass current display document (which includes reordering) to get both reordering AND DOM changes
    const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
      mergedPdfDocument || displayDocument, // Original order
      displayDocument, // Current display order (includes reordering)
      splitPositions // Position-based splits
    );

    // For apply changes, we only set the first document if it's an array (splits shouldn't affect document state)
    const documentToSet = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;
    setEditedDocument(documentToSet);

  }, [displayDocument, mergedPdfDocument, splitPositions]);


  const closePdf = useCallback(() => {
    actions.clearAllFiles();

    undoManagerRef.current.clear();
    setSelectedPageIds([]);
    setSelectionMode(false);
  }, [actions]);

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
    <Box pos="relative" h="100vh" pt={40} style={{ overflow: 'auto' }} data-scrolling-container="true">
      <LoadingOverlay visible={globalProcessing && !mergedPdfDocument} />

      {!mergedPdfDocument && !globalProcessing && activeFileIds.length === 0 && (
        <Center h="100vh">
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


      <NavigationWarningModal />
    </Box>
  );
};

export default PageEditor;
