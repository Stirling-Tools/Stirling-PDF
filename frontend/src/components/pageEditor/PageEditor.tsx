import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Button, Text, Center, Box,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group, Portal
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions, useCurrentFile, useFileSelection } from "../../contexts/FileContext";
import { ModeType } from "../../contexts/NavigationContext";
import { PDFDocument, PDFPage } from "../../types/pageEditor";
import { ProcessedFile as EnhancedProcessedFile } from "../../types/processing";
import { pdfExportService } from "../../services/pdfExportService";
import { documentManipulationService } from "../../services/documentManipulationService";
// Thumbnail generation is now handled by individual PageThumbnail components
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';

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
  onFunctionsReady?: (functions: {
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleRotate: (direction: 'left' | 'right') => void;
    handleDelete: () => void;
    handleSplit: () => void;
    handleSplitAll: () => void;
    handlePageBreak: () => void;
    handlePageBreakAll: () => void;
    showExportPreview: (selectedOnly: boolean) => void;
    onExportSelected: () => void;
    onExportAll: () => void;
    applyChanges: () => void;
    exportLoading: boolean;
    selectionMode: boolean;
    selectedPages: number[];
    splitPositions: Set<number>;
    totalPages: number;
    closePdf: () => void;
  }) => void;
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
    selectionMode, selectedPageNumbers, movingPage, isAnimating, splitPositions, exportLoading,
    setSelectionMode, setSelectedPageNumbers, setMovingPage, setIsAnimating, setSplitPositions, setExportLoading,
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
          setSelectedPageNumbers,
          () => splitPositions,
          setSplitPositions,
          () => selectedPageNumbers
        );
        undoManagerRef.current.executeCommand(deleteCommand);
      }
    }
  }), [displayDocument, splitPositions, selectedPageNumbers]);

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
    if (!displayDocument) return;
    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode && selectedPageNumbers.length > 0
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);

    handleRotatePages(pagesToRotate, rotation);
  }, [displayDocument, selectedPageNumbers, selectionMode, handleRotatePages]);

  const handleDelete = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;

    const deleteCommand = new DeletePagesCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers,
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [selectedPageNumbers, displayDocument, splitPositions]);

  const handleDeletePage = useCallback((pageNumber: number) => {
    if (!displayDocument) return;

    const deleteCommand = new DeletePagesCommand(
      [pageNumber],
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers,
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [displayDocument, splitPositions, selectedPageNumbers]);

  const handleSplit = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;

    console.log('Toggle split markers at selected page positions:', selectedPageNumbers);

    // Convert page numbers to positions (0-based indices)
    const positions: number[] = [];
    selectedPageNumbers.forEach(pageNum => {
      const pageIndex = displayDocument.pages.findIndex(p => p.pageNumber === pageNum);
      if (pageIndex !== -1 && pageIndex < displayDocument.pages.length - 1) {
        // Only allow splits before the last page
        positions.push(pageIndex);
      }
    });

    if (positions.length > 0) {
      const bulkSplitCommand = new BulkSplitCommand(
        positions,
        () => splitPositions,
        setSplitPositions
      );
      undoManagerRef.current.executeCommand(bulkSplitCommand);
    }
  }, [selectedPageNumbers, displayDocument, splitPositions]);

  const handleSplitAll = useCallback(() => {
    if (!displayDocument) return;

    const splitAllCommand = new SplitAllCommand(
      displayDocument.pages.length,
      () => splitPositions,
      setSplitPositions
    );
    undoManagerRef.current.executeCommand(splitAllCommand);
  }, [displayDocument, splitPositions]);

  const handlePageBreak = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;

    console.log('Insert page breaks after selected pages:', selectedPageNumbers);

    const pageBreakCommand = new PageBreakCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers
    );
    undoManagerRef.current.executeCommand(pageBreakCommand);
  }, [selectedPageNumbers, displayDocument]);

  const handlePageBreakAll = useCallback(() => {
    if (!displayDocument) return;

    const pageBreakAllCommand = new BulkPageBreakCommand(
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers
    );
    undoManagerRef.current.executeCommand(pageBreakAllCommand);
  }, [displayDocument]);

  const handleReorderPages = useCallback((sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => {
    if (!displayDocument) return;

    const reorderCommand = new ReorderPagesCommand(
      sourcePageNumber,
      targetIndex,
      selectedPages,
      () => displayDocument,
      setEditedDocument
    );
    undoManagerRef.current.executeCommand(reorderCommand);
  }, [displayDocument]);

  // Helper function to collect source files for multi-file export
  const getSourceFiles = useCallback((): Map<string, File> | null => {
    const sourceFiles = new Map<string, File>();

    // Check if we have multiple files by looking at active file IDs
    if (activeFileIds.length <= 1) {
      return null; // Use single-file export method
    }

    // Collect all source files
    activeFileIds.forEach(fileId => {
      const file = selectors.getFile(fileId);
      if (file) {
        sourceFiles.set(fileId, file);
      }
    });

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
    if (!displayDocument || selectedPageNumbers.length === 0) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );

      // For selected pages export, we work with the first document (or single document)
      const documentWithDOMState = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;

      // Step 2: Convert selected page numbers to page IDs from the document with DOM state
      const selectedPageIds = selectedPageNumbers.map(pageNum => {
        const page = documentWithDOMState.pages.find(p => p.pageNumber === pageNum);
        return page?.id || '';
      }).filter(id => id);

      // Step 3: Export with pdfExportService
      console.log('Exporting selected pages:', selectedPageNumbers, 'with DOM rotations applied');

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const result = sourceFiles
        ? await pdfExportService.exportPDFMultiFile(
            documentWithDOMState,
            sourceFiles,
            selectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          )
        : await pdfExportService.exportPDF(
            documentWithDOMState,
            selectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          );

      // Step 4: Download the result
      pdfExportService.downloadFile(result.blob, result.filename);

      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, selectedPageNumbers, mergedPdfDocument, splitPositions, getSourceFiles, getExportFilename]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );

      // Step 2: Check if we have multiple documents (splits) or single document
      if (Array.isArray(processedDocuments)) {
        // Multiple documents (splits) - export as ZIP
        console.log('Exporting multiple split documents:', processedDocuments.length);
        const blobs: Blob[] = [];
        const filenames: string[] = [];

        const sourceFiles = getSourceFiles();
        const exportFilename = getExportFilename();
        for (const doc of processedDocuments) {
          const result = sourceFiles
            ? await pdfExportService.exportPDFMultiFile(doc, sourceFiles, [], { filename: exportFilename })
            : await pdfExportService.exportPDF(doc, [], { filename: exportFilename });
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
        const zipFilename = exportFilename.replace(/\.pdf$/i, '.zip');

        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        // Single document - regular export
        console.log('Exporting as single PDF');
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

    console.log('Changes applied to document');
  }, [displayDocument, mergedPdfDocument, splitPositions]);


  const closePdf = useCallback(() => {
    actions.clearAllFiles();
    undoManagerRef.current.clear();
    setSelectedPageNumbers([]);
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
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPages: selectedPageNumbers,
        splitPositions,
        totalPages: displayDocument?.pages.length || 0,
        closePdf,
      });
    }
  }, [
    onFunctionsReady, handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit, handleSplitAll,
    handlePageBreak, handlePageBreakAll, handleExportPreview, onExportSelected, onExportAll, applyChanges, exportLoading,
    selectionMode, selectedPageNumbers, splitPositions, displayDocument?.pages.length, closePdf
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
        <Box ref={gridContainerRef} p={0} style={{ position: 'relative' }}>


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
            {Array.from(splitPositions).map((position) => {
              // Match DragDropGrid's layout calculations exactly
              const containerWidth = containerDimensions.width;
              const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
              const ITEM_WIDTH = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
              const ITEM_HEIGHT = parseFloat(GRID_CONSTANTS.ITEM_HEIGHT) * remToPx;
              const ITEM_GAP = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;
              
              // Calculate items per row using DragDropGrid's logic
              const availableWidth = containerWidth - ITEM_GAP; // Account for first gap
              const itemWithGap = ITEM_WIDTH + ITEM_GAP;
              const itemsPerRow = Math.max(1, Math.floor(availableWidth / itemWithGap));
              
              // Calculate position within the grid (same as DragDropGrid)
              const row = Math.floor(position / itemsPerRow);
              const col = position % itemsPerRow;
              
              // Position split line between pages (after the current page)
              const leftPosition = col * itemWithGap + ITEM_WIDTH + (ITEM_GAP / 2);
              const topPosition = row * ITEM_HEIGHT;

              return (
                <div
                  key={`split-${position}`}
                  style={{
                    position: 'absolute',
                    left: leftPosition,
                    top: topPosition,
                    width: '1px',
                    height: GRID_CONSTANTS.ITEM_WIDTH, // Match item height
                    borderLeft: '1px dashed #3b82f6'
                  }}
                />
              );
            })}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            selectedItems={selectedPageNumbers}
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
                selectedPages={selectedPageNumbers}
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
