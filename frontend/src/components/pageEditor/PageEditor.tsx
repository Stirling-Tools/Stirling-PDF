import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions, useCurrentFile, useFileSelection } from "../../contexts/FileContext";
import { ModeType } from "../../contexts/NavigationContext";
import { PDFDocument, PDFPage } from "../../types/pageEditor";
import { ProcessedFile as EnhancedProcessedFile } from "../../types/processing";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { pdfExportService } from "../../services/pdfExportService";
import { documentManipulationService } from "../../services/documentManipulationService";
import { enhancedPDFProcessingService } from "../../services/enhancedPDFProcessingService";
import { fileProcessingService } from "../../services/fileProcessingService";
import { pdfProcessingService } from "../../services/pdfProcessingService";
import { pdfWorkerManager } from "../../services/pdfWorkerManager";
import { useThumbnailGeneration } from "../../hooks/useThumbnailGeneration";
import { calculateScaleFromFileSize } from "../../utils/thumbnailUtils";
import { fileStorage } from "../../services/fileStorage";
import { indexedDBManager, DATABASE_CONFIGS } from "../../services/indexedDBManager";
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';

// V1-style DOM-first command system (replaces the old React state commands)
abstract class DOMCommand {
  abstract execute(): void;
  abstract undo(): void;
  abstract description: string;
}

class RotatePageCommand extends DOMCommand {
  constructor(
    private pageId: string,
    private degrees: number
  ) {
    super();
  }

  execute(): void {
    // Only update DOM for immediate visual feedback
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        const currentRotation = parseInt(img.style.rotate?.replace(/[^\d-]/g, '') || '0');
        const newRotation = currentRotation + this.degrees;
        img.style.rotate = `${newRotation}deg`;
      }
    }
  }

  undo(): void {
    // Only update DOM
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        const currentRotation = parseInt(img.style.rotate?.replace(/[^\d-]/g, '') || '0');
        const previousRotation = currentRotation - this.degrees;
        img.style.rotate = `${previousRotation}deg`;
      }
    }
  }

  get description(): string {
    return `Rotate page ${this.degrees > 0 ? 'right' : 'left'}`;
  }
}

// Simple undo manager for DOM commands
class UndoManager {
  private undoStack: DOMCommand[] = [];
  private redoStack: DOMCommand[] = [];

  executeCommand(command: DOMCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      return true;
    }
    return false;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      return true;
    }
    return false;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export interface PageEditorProps {
  onFunctionsReady?: (functions: {
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleRotate: (direction: 'left' | 'right') => void;
    handleDelete: () => void;
    handleSplit: () => void;
    showExportPreview: (selectedOnly: boolean) => void;
    onExportSelected: () => void;
    onExportAll: () => void;
    applyChanges: () => void;
    exportLoading: boolean;
    selectionMode: boolean;
    selectedPages: number[];
    closePdf: () => void;
  }) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();

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

  // Thumbnail generation (opt-in for visual tools) - MUST be before mergedPdfDocument
  const {
    generateThumbnails,
    addThumbnailToCache,
    getThumbnailFromCache,
    stopGeneration,
    destroyThumbnails
  } = useThumbnailGeneration();

  // Helper function to generate thumbnails in batches
  const generateThumbnailBatch = useCallback(async (file: File, fileId: string, pageNumbers: number[]) => {
    console.log(`📸 PageEditor: Starting thumbnail batch for ${file.name}, pages: [${pageNumbers.join(', ')}]`);
    
    try {
      // Load PDF array buffer for Web Workers
      const arrayBuffer = await file.arrayBuffer();
      
      // Calculate quality scale based on file size
      const scale = calculateScaleFromFileSize(selectors.getFileRecord(fileId)?.size || 0);
      
      // Start parallel thumbnail generation
      const results = await generateThumbnails(
        fileId,
        arrayBuffer,
        pageNumbers,
        {
          scale,
          parallelBatches: Math.min(4, pageNumbers.length),
        }
      );

      // Cache all generated thumbnails
      results.forEach(({ pageNumber, thumbnail }) => {
        if (thumbnail) {
          const pageId = `${fileId}-${pageNumber}`;
          addThumbnailToCache(pageId, thumbnail);
        }
      });

      console.log(`📸 PageEditor: Thumbnail batch completed for ${file.name}. Generated ${results.length} thumbnails`);
    } catch (error) {
      console.error(`PageEditor: Thumbnail generation failed for ${file.name}:`, error);
    }
  }, [generateThumbnails, addThumbnailToCache, selectors]);


  // Get primary file record outside useMemo to track processedFile changes
  const primaryFileRecord = primaryFileId ? selectors.getFileRecord(primaryFileId) : null;
  const processedFilePages = primaryFileRecord?.processedFile?.pages;
  const processedFileTotalPages = primaryFileRecord?.processedFile?.totalPages;

  // Compute merged document with stable signature (prevents infinite loops)
  const mergedPdfDocument = useMemo((): PDFDocument | null => {
    if (activeFileIds.length === 0) return null;

    const primaryFile = primaryFileId ? selectors.getFile(primaryFileId) : null;
    
    // If we have file IDs but no file record, something is wrong - return null to show loading
    if (!primaryFileRecord) {
      console.log('🎬 PageEditor: No primary file record found, showing loading');
      return null;
    }

    const name =
      activeFileIds.length === 1
        ? (primaryFileRecord.name ?? 'document.pdf')
        : activeFileIds
            .map(id => (selectors.getFileRecord(id)?.name ?? 'file').replace(/\.pdf$/i, ''))
            .join(' + ');

    // Debug logging for merged document creation
    console.log(`🎬 PageEditor: Building merged document for ${name} with ${activeFileIds.length} files`);
    
    // Collect pages from ALL active files, not just the primary file
    let pages: PDFPage[] = [];
    let totalPageCount = 0;
    
    activeFileIds.forEach((fileId, fileIndex) => {
      const fileRecord = selectors.getFileRecord(fileId);
      if (!fileRecord) {
        console.warn(`🎬 PageEditor: No record found for file ${fileId}`);
        return;
      }
      
      const processedFile = fileRecord.processedFile;
      console.log(`🎬 PageEditor: Processing file ${fileIndex + 1}/${activeFileIds.length} (${fileRecord.name})`);
      console.log(`🎬 ProcessedFile exists:`, !!processedFile);
      console.log(`🎬 ProcessedFile pages:`, processedFile?.pages?.length || 0);
      console.log(`🎬 ProcessedFile totalPages:`, processedFile?.totalPages || 'unknown');
      
      let filePages: PDFPage[] = [];
      
      if (processedFile?.pages && processedFile.pages.length > 0) {
        // Use fully processed pages with thumbnails
        filePages = processedFile.pages.map((page, pageIndex) => ({
          id: `${fileId}-${page.pageNumber}`,
          pageNumber: totalPageCount + pageIndex + 1,
          thumbnail: page.thumbnail || null,
          rotation: page.rotation || 0,
          selected: false,
          splitAfter: page.splitAfter || false,
          originalPageNumber: page.originalPageNumber || page.pageNumber || pageIndex + 1,
          originalFileId: fileId,
        }));
      } else if (processedFile?.totalPages) {
        // Fallback: create pages without thumbnails but with correct count
        console.log(`🎬 PageEditor: Creating placeholder pages for ${fileRecord.name} (${processedFile.totalPages} pages)`);
        filePages = Array.from({ length: processedFile.totalPages }, (_, pageIndex) => ({
          id: `${fileId}-${pageIndex + 1}`,
          pageNumber: totalPageCount + pageIndex + 1,
          originalPageNumber: pageIndex + 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null, // Will be generated later
          selected: false,
          splitAfter: false,
        }));
      }
      
      pages = pages.concat(filePages);
      totalPageCount += filePages.length;
    });

    if (pages.length === 0) {
      console.warn('🎬 PageEditor: No pages found in any files');
      return null;
    }

    console.log(`🎬 PageEditor: Created merged document with ${pages.length} total pages`);

    const mergedDoc: PDFDocument = {
      id: activeFileIds.join('-'),
      name,
      file: primaryFile!,
      pages,
      totalPages: pages.length,
    };

    return mergedDoc;
  }, [activeFileIds, primaryFileId, primaryFileRecord, processedFilePages, processedFileTotalPages, selectors, filesSignature]);

  // Generate missing thumbnails for all loaded files
  const generateMissingThumbnails = useCallback(async () => {
    if (!mergedPdfDocument || activeFileIds.length === 0) {
      return;
    }

    console.log(`📸 PageEditor: Generating thumbnails for ${activeFileIds.length} files with ${mergedPdfDocument.totalPages} total pages`);
    
    // Process files sequentially to avoid PDF document contention
    for (const fileId of activeFileIds) {
      const file = selectors.getFile(fileId);
      const fileRecord = selectors.getFileRecord(fileId);
      
      if (!file || !fileRecord?.processedFile) continue;

      const fileTotalPages = fileRecord.processedFile.totalPages;
      if (!fileTotalPages) continue;

      // Find missing thumbnails for this file
      const pageNumbersToGenerate: number[] = [];
      for (let pageNum = 1; pageNum <= fileTotalPages; pageNum++) {
        const pageId = `${fileId}-${pageNum}`;
        if (!getThumbnailFromCache(pageId)) {
          pageNumbersToGenerate.push(pageNum);
        }
      }

      if (pageNumbersToGenerate.length > 0) {
        console.log(`📸 PageEditor: Generating thumbnails for ${fileRecord.name}: pages [${pageNumbersToGenerate.join(', ')}]`);
        await generateThumbnailBatch(file, fileId, pageNumbersToGenerate);
      }
      
      // Small delay between files to ensure proper sequential processing
      if (activeFileIds.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }, [mergedPdfDocument, activeFileIds, selectors, getThumbnailFromCache, generateThumbnailBatch]);

  // Generate missing thumbnails when document is ready
  useEffect(() => {
    if (mergedPdfDocument && mergedPdfDocument.totalPages > 0) {
      console.log(`📸 PageEditor: Document ready with ${mergedPdfDocument.totalPages} pages, checking for missing thumbnails`);
      generateMissingThumbnails();
    }
  }, [mergedPdfDocument, generateMissingThumbnails]);

  // Selection and UI state management
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  const [movingPage, setMovingPage] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  
  // Export state
  const [exportLoading, setExportLoading] = useState(false);

  // DOM-first command handlers
  const handleRotatePages = useCallback((pageIds: string[], rotation: number) => {
    pageIds.forEach(pageId => {
      const command = new RotatePageCommand(pageId, rotation);
      undoManagerRef.current.executeCommand(command);
    });
  }, []);

  // Page selection handlers
  const togglePage = useCallback((pageNumber: number) => {
    setSelectedPageNumbers(prev => 
      prev.includes(pageNumber)
        ? prev.filter(n => n !== pageNumber)
        : [...prev, pageNumber]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!mergedPdfDocument) return;
    
    const allPageNumbers = mergedPdfDocument.pages.map(p => p.pageNumber);
    setSelectedPageNumbers(prev => 
      prev.length === allPageNumbers.length ? [] : allPageNumbers
    );
  }, [mergedPdfDocument]);

  // CSV page selection
  const updatePagesFromCSV = useCallback(() => {
    if (!csvInput.trim()) return;
    
    const pageNumbers: number[] = [];
    const ranges = csvInput.split(',').map(s => s.trim());
    
    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            pageNumbers.push(i);
          }
        }
      } else {
        const num = parseInt(range);
        if (!isNaN(num)) {
          pageNumbers.push(num);
        }
      }
    });
    
    setSelectedPageNumbers(pageNumbers);
  }, [csvInput]);

  // Animation helpers
  const animateReorder = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  }, []);

  // Placeholder command classes for PageThumbnail compatibility
  class RotatePagesCommand {
    constructor(public pageIds: string[], public rotation: number) {}
    execute() {
      this.pageIds.forEach(pageId => {
        const command = new RotatePageCommand(pageId, this.rotation);
        undoManagerRef.current.executeCommand(command);
      });
    }
  }

  class DeletePagesCommand {
    constructor(public pageIds: string[]) {}
    execute() {
      console.log('Delete pages:', this.pageIds);
    }
  }

  class ToggleSplitCommand {
    constructor(public pageIds: string[]) {}
    execute() {
      if (!displayDocument) return;
      
      console.log('Toggle split:', this.pageIds);
      
      // Create new pages array with toggled split markers
      const newPages = displayDocument.pages.map(page => {
        if (this.pageIds.includes(page.id)) {
          return {
            ...page,
            splitAfter: !page.splitAfter
          };
        }
        return page;
      });
      
      // Update the document with new split markers
      const updatedDocument: PDFDocument = {
        ...displayDocument,
        pages: newPages,
      };
      
      setEditedDocument(updatedDocument);
    }
  }

  // Command executor for PageThumbnail
  const executeCommand = useCallback((command: any) => {
    if (command && typeof command.execute === 'function') {
      command.execute();
    }
  }, []);

  // Interface functions for parent component
  const displayDocument = editedDocument || mergedPdfDocument;
  
  const handleUndo = useCallback(() => {
    undoManagerRef.current.undo();
  }, []);

  const handleRedo = useCallback(() => {
    undoManagerRef.current.redo();
  }, []);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!displayDocument) return;
    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectedPageNumbers.length > 0
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);
    
    handleRotatePages(pagesToRotate, rotation);
  }, [displayDocument, selectedPageNumbers, handleRotatePages]);

  const handleDelete = useCallback(() => {
    console.log('Delete selected pages:', selectedPageNumbers);
  }, [selectedPageNumbers]);

  const handleSplit = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;
    
    console.log('Toggle split markers at selected pages:', selectedPageNumbers);
    
    // Get page IDs for selected pages
    const selectedPageIds = selectedPageNumbers.map(pageNum => {
      const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
      return page?.id || '';
    }).filter(id => id);
    
    if (selectedPageIds.length > 0) {
      const command = new ToggleSplitCommand(selectedPageIds);
      command.execute();
    }
  }, [selectedPageNumbers, displayDocument]);

  const handleReorderPages = useCallback((sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => {
    if (!displayDocument) return;
    
    console.log('Reorder pages:', { sourcePageNumber, targetIndex, selectedPages });
    
    // Find the source page
    const sourceIndex = displayDocument.pages.findIndex(p => p.pageNumber === sourcePageNumber);
    if (sourceIndex === -1) return;
    
    // Create a new pages array with reordered pages
    const newPages = [...displayDocument.pages];
    
    if (selectedPages && selectedPages.length > 1 && selectedPages.includes(sourcePageNumber)) {
      // Multi-page drag: move all selected pages together
      const selectedPageObjects = selectedPages
        .map(pageNum => displayDocument.pages.find(p => p.pageNumber === pageNum))
        .filter(page => page !== undefined) as PDFPage[];
      
      // Remove selected pages from their current positions
      const remainingPages = newPages.filter(page => !selectedPages.includes(page.pageNumber));
      
      // Insert selected pages at target position
      remainingPages.splice(targetIndex, 0, ...selectedPageObjects);
      
      // Update page numbers to reflect new positions
      remainingPages.forEach((page, index) => {
        page.pageNumber = index + 1;
      });
      
      newPages.splice(0, newPages.length, ...remainingPages);
    } else {
      // Single page drag
      const [movedPage] = newPages.splice(sourceIndex, 1);
      newPages.splice(targetIndex, 0, movedPage);
      
      // Update page numbers to reflect new positions
      newPages.forEach((page, index) => {
        page.pageNumber = index + 1;
      });
    }
    
    // Update the document with reordered pages
    const reorderedDocument: PDFDocument = {
      ...displayDocument,
      pages: newPages,
      totalPages: newPages.length,
    };
    
    console.log('Reordered document page numbers:', newPages.map(p => p.pageNumber));
    console.log('Reordered document page IDs:', newPages.map(p => p.id));
    
    // Update the edited document state
    setEditedDocument(reorderedDocument);
    
    console.log('Pages reordered successfully');
  }, [displayDocument]);



  const onExportSelected = useCallback(async () => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;
    
    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument // Current display order (includes reordering)
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
      const result = await pdfExportService.exportPDF(
        documentWithDOMState,
        selectedPageIds,
        { selectedOnly: true, filename: documentWithDOMState.name }
      );

      // Step 4: Download the result
      pdfExportService.downloadFile(result.blob, result.filename);
      
      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, selectedPageNumbers, mergedPdfDocument]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;
    
    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument // Current display order (includes reordering)
      );
      
      // Step 2: Check if we have multiple documents (splits) or single document
      if (Array.isArray(processedDocuments)) {
        // Multiple documents (splits) - export as ZIP
        console.log('Exporting multiple split documents:', processedDocuments.length);
        const blobs: Blob[] = [];
        const filenames: string[] = [];
        
        for (const doc of processedDocuments) {
          const result = await pdfExportService.exportPDF(doc, [], { filename: doc.name });
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
        const zipFilename = displayDocument.name.replace(/\.pdf$/i, '_split.zip');
        
        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        // Single document - regular export
        console.log('Exporting as single PDF');
        const result = await pdfExportService.exportPDF(
          processedDocuments,
          [],
          { selectedOnly: false, filename: processedDocuments.name }
        );

        pdfExportService.downloadFile(result.blob, result.filename);
      }
      
      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, mergedPdfDocument]);

  // Apply DOM changes to document state using dedicated service
  const applyChanges = useCallback(() => {
    if (!displayDocument) return;
    
    // Pass current display document (which includes reordering) to get both reordering AND DOM changes
    const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
      mergedPdfDocument || displayDocument, // Original order
      displayDocument // Current display order (includes reordering)
    );
    
    // For apply changes, we only set the first document if it's an array (splits shouldn't affect document state)
    const documentToSet = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;
    setEditedDocument(documentToSet);
    
    console.log('Changes applied to document');
  }, [displayDocument, mergedPdfDocument]);


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
        canUndo: undoManagerRef.current.canUndo(),
        canRedo: undoManagerRef.current.canRedo(),
        handleRotate,
        handleDelete,
        handleSplit,
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPages: selectedPageNumbers,
        closePdf,
      });
    }
  }, [
    onFunctionsReady, handleUndo, handleRedo, handleRotate, handleDelete, handleSplit,
    handleExportPreview, onExportSelected, onExportAll, applyChanges, exportLoading, selectionMode, selectedPageNumbers, closePdf
  ]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }} data-scrolling-container="true">
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
        <Box p={0}>
          {/* File name and basic controls */}
          <Group mb="md" p="md" justify="space-between">
            <TextInput
              placeholder="Enter filename"
              defaultValue={displayDocument.name.replace(/\.pdf$/i, '')}
              style={{ minWidth: 300 }}
            />
            <Group>
              <Button 
                variant={selectionMode ? "filled" : "outline"} 
                onClick={() => setSelectionMode(!selectionMode)}
              >
                {selectionMode ? "Exit Selection" : "Select Pages"}
              </Button>
              {selectionMode && (
                <>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    {selectedPageNumbers.length === displayDocument.pages.length ? "Deselect All" : "Select All"}
                  </Button>
                  <Text size="sm" c="dimmed">
                    {selectedPageNumbers.length} selected
                  </Text>
                </>
              )}
            </Group>
          </Group>

          {/* Bulk selection panel - only show in selection mode */}
          {selectionMode && (
            <BulkSelectionPanel
              csvInput={csvInput}
              setCsvInput={setCsvInput}
              selectedPages={selectedPageNumbers}
              onUpdatePagesFromCSV={updatePagesFromCSV}
            />
          )}

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
                originalFile={activeFileIds.length === 1 && primaryFileId ? selectors.getFile(primaryFileId) : undefined}
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
                RotatePagesCommand={RotatePagesCommand}
                DeletePagesCommand={DeletePagesCommand}
                ToggleSplitCommand={ToggleSplitCommand}
                pdfDocument={displayDocument}
                setPdfDocument={setEditedDocument}
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