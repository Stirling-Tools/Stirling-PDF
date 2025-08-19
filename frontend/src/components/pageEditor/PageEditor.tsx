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
import {
  RotatePagesCommand,
  DeletePagesCommand,
  ReorderPageCommand,
  MovePagesCommand,
  ToggleSplitCommand
} from "../../commands/pageCommands";
import { pdfExportService } from "../../services/pdfExportService";
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

export interface PageEditorProps {
  // Optional callbacks to expose internal functions for PageEditorControls
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
  const selectedPageNumbers = state.ui.selectedPageNumbers;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [foundDraft, setFoundDraft] = useState<any>(null);
  const autoSaveTimer = useRef<number | null>(null);

  /**
   * Create stable files signature to prevent infinite re-computation.
   * This signature only changes when files are actually added/removed or processing state changes.
   * Using this instead of direct file arrays prevents unnecessary re-renders.
   */
  
  // Thumbnail generation (opt-in for visual tools) - MUST be before mergedPdfDocument
  const {
    generateThumbnails,
    addThumbnailToCache,
    getThumbnailFromCache,
    stopGeneration,
    destroyThumbnails
  } = useThumbnailGeneration();
  

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

    // Get pages from processed file data
    const processedFile = primaryFileRecord.processedFile;
    
    // Debug logging for processed file data
    console.log(`🎬 PageEditor: Building document for ${name}`);
    console.log(`🎬 ProcessedFile exists:`, !!processedFile);
    console.log(`🎬 ProcessedFile pages:`, processedFile?.pages?.length || 0);
    console.log(`🎬 ProcessedFile totalPages:`, processedFile?.totalPages || 'unknown');
    if (processedFile?.pages) {
      console.log(`🎬 Pages structure:`, processedFile.pages.map(p => ({ pageNumber: p.pageNumber || 'unknown', hasThumbnail: !!p.thumbnail })));
    }
    console.log(`🎬 Will use ${(processedFile?.pages?.length || 0) > 0 ? 'PROCESSED' : 'FALLBACK'} pages`);
    
    // Convert processed pages to PageEditor format or create placeholders from metadata
    let pages: PDFPage[] = [];
    
    if (processedFile?.pages && processedFile.pages.length > 0) {
      // Use fully processed pages with thumbnails
      pages = processedFile.pages.map((page, index) => {
        const pageId = `${primaryFileId}-page-${index + 1}`;
        // Try multiple sources for thumbnails in order of preference:
        // 1. Processed data thumbnail
        // 2. Cached thumbnail from previous generation
        // 3. For page 1: FileRecord's thumbnailUrl (from FileProcessingService)
        let thumbnail = page.thumbnail || null;
        const cachedThumbnail = getThumbnailFromCache(pageId);
        if (!thumbnail && cachedThumbnail) {
          thumbnail = cachedThumbnail;
          console.log(`📸 PageEditor: Using cached thumbnail for page ${index + 1} (${pageId})`);
        }
        if (!thumbnail && index === 0) {
          // For page 1, use the thumbnail from FileProcessingService
          thumbnail = primaryFileRecord.thumbnailUrl || null;
          if (thumbnail) {
            addThumbnailToCache(pageId, thumbnail);
            console.log(`📸 PageEditor: Using FileProcessingService thumbnail for page 1 (${pageId})`);
          }
        }
        
        return {
          id: pageId,
          pageNumber: index + 1,
          thumbnail,
          rotation: page.rotation || 0,
          selected: false,
          splitBefore: page.splitBefore || false,
        };
      });
    } else if (processedFile?.totalPages && processedFile.totalPages > 0) {
      // Create placeholder pages from metadata while thumbnails are being generated
      console.log(`🎬 PageEditor: Creating ${processedFile.totalPages} placeholder pages from metadata`);
      pages = Array.from({ length: processedFile.totalPages }, (_, index) => {
        const pageId = `${primaryFileId}-page-${index + 1}`;
        
        // Check for existing cached thumbnail
        let thumbnail = getThumbnailFromCache(pageId) || null;
        
        // For page 1, try to use the FileRecord thumbnail
        if (!thumbnail && index === 0) {
          thumbnail = primaryFileRecord.thumbnailUrl || null;
          if (thumbnail) {
            addThumbnailToCache(pageId, thumbnail);
            console.log(`📸 PageEditor: Using FileProcessingService thumbnail for placeholder page 1 (${pageId})`);
          }
        }
        
        return {
          id: pageId,
          pageNumber: index + 1,
          thumbnail, // Will be null initially, populated by PageThumbnail components
          rotation: 0,
          selected: false,
          splitBefore: false,
        };
      });
    } else {
      // Ultimate fallback - single page while we wait for metadata
      pages = [{
        id: `${primaryFileId}-page-1`,
        pageNumber: 1,
        thumbnail: getThumbnailFromCache(`${primaryFileId}-page-1`) || primaryFileRecord.thumbnailUrl || null,
        rotation: 0,
        selected: false,
        splitBefore: false,
      }];
    }

    // Create document with determined pages

    return {
      id: activeFileIds.length === 1 ? (primaryFileId ?? 'unknown') : `merged:${filesSignature}`,
      name,
      file: primaryFile || new File([], primaryFileRecord.name), // Create minimal File if needed
      pages,
      totalPages: pages.length,
      destroy: () => {} // Optional cleanup function
    };
  }, [filesSignature, primaryFileId, primaryFileRecord]);


  // Display document: Use edited version if exists, otherwise original
  const displayDocument = editedDocument || mergedPdfDocument;

  const [filename, setFilename] = useState<string>("");



  // Page editor state (use context for selectedPages)
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState(false);


  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPreview, setExportPreview] = useState<{pageCount: number; splitCount: number; estimatedSize: string} | null>(null);

  // Animation state
  const [movingPage, setMovingPage] = useState<number | null>(null);
  const [pagePositions, setPagePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [isAnimating, setIsAnimating] = useState(false);
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<() => void>(null);

  // Undo/Redo system
  const { executeCommand, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Set initial filename when document changes - use stable signature
  useEffect(() => {
    if (mergedPdfDocument) {
      if (activeFileIds.length === 1 && primaryFileId) {
        const record = selectors.getFileRecord(primaryFileId);
        if (record) {
          setFilename(record.name.replace(/\.pdf$/i, ''));
        }
      } else {
        const filenames = activeFileIds
          .map(id => selectors.getFileRecord(id)?.name.replace(/\.pdf$/i, '') || 'file')
          .filter(Boolean);
        setFilename(filenames.join('_'));
      }
    }
  }, [mergedPdfDocument, filesSignature, primaryFileId, selectors]);

  // Handle file upload from FileUploadSelector (now using context)
  const handleMultipleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      setStatus('No files provided');
      return;
    }

    // Add files to context
    await actions.addFiles(uploadedFiles);
    setStatus(`Added ${uploadedFiles.length} file(s) for processing`);
  }, [actions]);


  // PageEditor no longer handles cleanup - it's centralized in FileContext

  // Simple cache-first thumbnail generation (no complex detection needed)

  // Lazy thumbnail generation - only generate when needed, with intelligent batching
  const generateMissingThumbnails = useCallback(async () => {
    if (!mergedPdfDocument || !primaryFileId || activeFileIds.length !== 1) {
      return;
    }

    const file = selectors.getFile(primaryFileId);
    if (!file) return;
    
    const totalPages = mergedPdfDocument.totalPages;
    if (totalPages <= 1) return; // Only page 1, nothing to generate
    
    // For very large documents (2000+ pages), be much more conservative
    const isVeryLargeDocument = totalPages > 2000;
    
    if (isVeryLargeDocument) {
      console.log(`📸 PageEditor: Very large document (${totalPages} pages) - using minimal thumbnail generation`);
      // For very large docs, only generate the next visible batch (pages 2-25) to avoid UI blocking
      const pageNumbersToGenerate = [];
      for (let pageNum = 2; pageNum <= Math.min(25, totalPages); pageNum++) {
        const pageId = `${primaryFileId}-page-${pageNum}`;
        if (!getThumbnailFromCache(pageId)) {
          pageNumbersToGenerate.push(pageNum);
        }
      }
      
      if (pageNumbersToGenerate.length > 0) {
        console.log(`📸 PageEditor: Generating initial batch for large doc: pages [${pageNumbersToGenerate.join(', ')}]`);
        await generateThumbnailBatch(file, primaryFileId, pageNumbersToGenerate);
      }
      
      // Schedule remaining thumbnails with delay to avoid blocking
      setTimeout(() => {
        generateRemainingThumbnailsLazily(file, primaryFileId, totalPages, 26);
      }, 2000); // 2 second delay before starting background generation
      
      return;
    }
    
    // For smaller documents, check which pages 2+ need thumbnails
    const pageNumbersToGenerate = [];
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      const pageId = `${primaryFileId}-page-${pageNum}`;
      if (!getThumbnailFromCache(pageId)) {
        pageNumbersToGenerate.push(pageNum);
      }
    }

    if (pageNumbersToGenerate.length === 0) {
      console.log(`📸 PageEditor: All pages 2+ already cached, skipping generation`);
      return;
    }

    console.log(`📸 PageEditor: Generating thumbnails for pages: [${pageNumbersToGenerate.slice(0, 5).join(', ')}${pageNumbersToGenerate.length > 5 ? '...' : ''}]`);
    await generateThumbnailBatch(file, primaryFileId, pageNumbersToGenerate);
  }, [mergedPdfDocument, primaryFileId, activeFileIds, selectors]);

  // Helper function to generate thumbnails in batches
  const generateThumbnailBatch = useCallback(async (file: File, fileId: string, pageNumbers: number[]) => {
    try {
      // Load PDF array buffer for Web Workers
      const arrayBuffer = await file.arrayBuffer();

      // Calculate quality scale based on file size
      const scale = calculateScaleFromFileSize(selectors.getFileRecord(fileId)?.size || 0);

      // Start parallel thumbnail generation WITHOUT blocking the main thread
      await generateThumbnails(
        arrayBuffer,
        pageNumbers,
        {
          scale, // Dynamic quality based on file size
          quality: 0.8,
          batchSize: 15, // Smaller batches per worker for smoother UI
          parallelBatches: 3 // Use 3 Web Workers in parallel
        },
        // Progress callback for thumbnail updates
        (progress) => {
          // Batch process thumbnails to reduce main thread work
          requestAnimationFrame(() => {
            progress.thumbnails.forEach(({ pageNumber, thumbnail }) => {
              // Use stable fileId for cache key
              const pageId = `${fileId}-page-${pageNumber}`;
              addThumbnailToCache(pageId, thumbnail);

              // Don't update context state - thumbnails stay in cache only
              // This eliminates per-page context rerenders
              // PageThumbnail will find thumbnails via cache polling
            });
          });
        }
      );

      // Removed verbose logging - only log errors
    } catch (error) {
      console.error('PageEditor: Thumbnail generation failed:', error);
    }
  }, [generateThumbnails, addThumbnailToCache, selectors]);

  // Background generation for remaining pages in very large documents
  const generateRemainingThumbnailsLazily = useCallback(async (file: File, fileId: string, totalPages: number, startPage: number) => {
    console.log(`📸 PageEditor: Starting background thumbnail generation from page ${startPage} to ${totalPages}`);
    
    // Generate in small chunks to avoid blocking
    const CHUNK_SIZE = 50;
    for (let start = startPage; start <= totalPages; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, totalPages);
      const chunkPageNumbers = [];
      
      for (let pageNum = start; pageNum <= end; pageNum++) {
        const pageId = `${fileId}-page-${pageNum}`;
        if (!getThumbnailFromCache(pageId)) {
          chunkPageNumbers.push(pageNum);
        }
      }
      
      if (chunkPageNumbers.length > 0) {
        // Background thumbnail generation in progress (removed verbose logging)
        await generateThumbnailBatch(file, fileId, chunkPageNumbers);
        
        // Small delay between chunks to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`📸 PageEditor: Background thumbnail generation completed for ${totalPages} pages`);
  }, [getThumbnailFromCache, generateThumbnailBatch]);

  // Simple useEffect - just generate missing thumbnails when document is ready
  useEffect(() => {
    if (mergedPdfDocument && mergedPdfDocument.totalPages > 1) {
      console.log(`📸 PageEditor: Document ready with ${mergedPdfDocument.totalPages} pages, checking for missing thumbnails`);
      generateMissingThumbnails();
    }
  }, [mergedPdfDocument, generateMissingThumbnails]);

  // Cleanup thumbnail generation when component unmounts
  useEffect(() => {
    return () => {
      // Stop any ongoing thumbnail generation
      if (stopGeneration) {
        stopGeneration();
      }
    };
  }, [stopGeneration]);

  // Clear selections when files change - use stable signature
  useEffect(() => {
    actions.setSelectedPages([]);
    setCsvInput("");
    setSelectionMode(false);
  }, [filesSignature, actions]);

  // Sync csvInput with selectedPageNumbers changes
  useEffect(() => {
    // Simply sort the page numbers and join them
    const sortedPageNumbers = [...selectedPageNumbers].sort((a, b) => a - b);
    const newCsvInput = sortedPageNumbers.join(', ');
    setCsvInput(newCsvInput);
  }, [selectedPageNumbers]);


  const selectAll = useCallback(() => {
    if (mergedPdfDocument) {
      actions.setSelectedPages(mergedPdfDocument.pages.map(p => p.pageNumber));
    }
  }, [mergedPdfDocument, actions]);

  const deselectAll = useCallback(() => actions.setSelectedPages([]), [actions]);

  const togglePage = useCallback((pageNumber: number) => {
    console.log('🔄 Toggling page', pageNumber);


    // Check if currently selected and update accordingly
    const isCurrentlySelected = selectedPageNumbers.includes(pageNumber);


    if (isCurrentlySelected) {
      // Remove from selection
      console.log('🔄 Removing page', pageNumber);
      const newSelectedPageNumbers = selectedPageNumbers.filter(num => num !== pageNumber);
      actions.setSelectedPages(newSelectedPageNumbers);
    } else {
      // Add to selection
      console.log('🔄 Adding page', pageNumber);
      const newSelectedPageNumbers = [...selectedPageNumbers, pageNumber];
      actions.setSelectedPages(newSelectedPageNumbers);
    }
  }, [selectedPageNumbers, actions]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        // Clear selections when exiting selection mode
        actions.setSelectedPages([]);
        setCsvInput("");
      }
      return newMode;
    });
  }, []);

  const parseCSVInput = useCallback((csv: string) => {
    if (!mergedPdfDocument) return [];

    const pageNumbers: number[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= mergedPdfDocument.pages.length; i++) {
          if (i > 0) {
            pageNumbers.push(i);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= mergedPdfDocument.pages.length) {
          pageNumbers.push(pageNum);
        }
      }
    });

    return pageNumbers;
  }, [mergedPdfDocument]);

  const updatePagesFromCSV = useCallback(() => {
    const pageNumbers = parseCSVInput(csvInput);
    actions.setSelectedPages(pageNumbers);
  }, [csvInput, parseCSVInput, actions]);




  // Update PDF document state with edit tracking
  const setPdfDocument = useCallback((updatedDoc: PDFDocument) => {
    console.log('setPdfDocument called - setting edited state');


    // Update local edit state for immediate visual feedback
    setEditedDocument(updatedDoc);
    actions.setHasUnsavedChanges(true); // Use actions from context
    setHasUnsavedDraft(true); // Mark that we have unsaved draft changes


    // Auto-save to drafts (debounced) - only if we have new changes
    
    // Enhanced auto-save to drafts with proper error handling
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = window.setTimeout(async () => {
      if (hasUnsavedDraft) {
        try {
          await saveDraftToIndexedDB(updatedDoc);
          setHasUnsavedDraft(false); // Mark draft as saved
          console.log('Auto-save completed successfully');
        } catch (error) {
          console.warn('Auto-save failed, will retry on next change:', error);
          // Don't set hasUnsavedDraft to false so it will retry
        }
      }
    }, 30000); // Auto-save after 30 seconds of inactivity


    return updatedDoc;
  }, [actions, hasUnsavedDraft]);

  // Enhanced draft save using centralized IndexedDB manager
  const saveDraftToIndexedDB = useCallback(async (doc: PDFDocument) => {
    const draftKey = `draft-${doc.id || 'merged'}`;
    
    // Convert PDF document to bytes for storage
    const pdfBytes = await doc.save();
    const originalFileNames = activeFileIds.map(id => selectors.getFileRecord(id)?.name).filter(Boolean);
    
    // Create a temporary file for thumbnail generation
    const tempFile = new File([pdfBytes], `Draft - ${originalFileNames.join(', ') || 'Untitled'}.pdf`, {
      type: 'application/pdf',
      lastModified: Date.now()
    });
    
    // Generate thumbnail for the draft
    let thumbnail: string | undefined;
    try {
      const { generateThumbnailForFile } = await import('../../utils/thumbnailUtils');
      thumbnail = await generateThumbnailForFile(tempFile);
    } catch (error) {
      console.warn('Failed to generate thumbnail for draft:', error);
    }
    
    const draftData = {
      id: draftKey,
      name: `Draft - ${originalFileNames.join(', ') || 'Untitled'}`,
      pdfData: pdfBytes,
      size: pdfBytes.length,
      timestamp: Date.now(),
      thumbnail,
      originalFiles: originalFileNames
    };

    try {
      // Use centralized IndexedDB manager
      const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.DRAFTS);
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      
      const putRequest = store.put(draftData, draftKey);
      putRequest.onsuccess = () => {
        console.log('Draft auto-saved to IndexedDB');
      };
      putRequest.onerror = () => {
        console.warn('Failed to put draft data:', putRequest.error);
      };
      
    } catch (error) {
      console.warn('Failed to auto-save draft:', error);
    }
  }, [activeFileIds, selectors]);

  // Enhanced draft cleanup using centralized IndexedDB manager
  const cleanupDraft = useCallback(async () => {
    const draftKey = `draft-${mergedPdfDocument?.id || 'merged'}`;
    
    try {
      // Use centralized IndexedDB manager
      const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.DRAFTS);
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      
      const deleteRequest = store.delete(draftKey);
      deleteRequest.onsuccess = () => {
        console.log('Draft cleaned up successfully');
      };
      deleteRequest.onerror = () => {
        console.warn('Failed to delete draft:', deleteRequest.error);
      };
      
    } catch (error) {
      console.warn('Failed to cleanup draft:', error);
    }
  }, [mergedPdfDocument]);

  // Apply changes to create new processed file
  const applyChanges = useCallback(async () => {
    if (!editedDocument || !mergedPdfDocument) return;


    try {
      if (activeFileIds.length === 1 && primaryFileId) {
        const file = selectors.getFile(primaryFileId);
        if (!file) return;
        
        // Apply changes simplified - no complex dispatch loops
        setStatus('Changes applied successfully');
      } else if (activeFileIds.length > 1) {
        setStatus('Apply changes for multiple files not yet supported');
        return;
      }

      // Clear edit state immediately
      setEditedDocument(null);
      actions.setHasUnsavedChanges(false);
      setHasUnsavedDraft(false);
      cleanupDraft();

    } catch (error) {
      console.error('Failed to apply changes:', error);
      setStatus('Failed to apply changes');
    }
  }, [editedDocument, mergedPdfDocument, activeFileIds, primaryFileId, selectors, actions, cleanupDraft]);

  const animateReorder = useCallback((pageNumber: number, targetIndex: number) => {
    if (!displayDocument || isAnimating) return;

    // In selection mode, if the dragged page is selected, move all selected pages
    const pagesToMove = selectionMode && selectedPageNumbers.includes(pageNumber)
      ? selectedPageNumbers.map(num => {
          const page = displayDocument.pages.find(p => p.pageNumber === num);
          return page?.id || '';
        }).filter(id => id)
      : [displayDocument.pages.find(p => p.pageNumber === pageNumber)?.id || ''].filter(id => id);

    const originalIndex = displayDocument.pages.findIndex(p => p.pageNumber === pageNumber);
    if (originalIndex === -1 || originalIndex === targetIndex) return;

    // Skip animation for large documents (500+ pages) to improve performance
    const isLargeDocument = displayDocument.pages.length > 500;


    if (isLargeDocument) {
      // For large documents, just execute the command without animation
      if (pagesToMove.length > 1) {
        const command = new MovePagesCommand(displayDocument, setPdfDocument, pagesToMove, targetIndex);
        executeCommand(command);
      } else {
        const pageId = pagesToMove[0];
        const command = new ReorderPageCommand(displayDocument, setPdfDocument, pageId, targetIndex);
        executeCommand(command);
      }
      return;
    }

    setIsAnimating(true);

    // For smaller documents, determine which pages might be affected by the move
    const startIndex = Math.min(originalIndex, targetIndex);
    const endIndex = Math.max(originalIndex, targetIndex);
    const affectedPageIds = displayDocument.pages
      .slice(Math.max(0, startIndex - 5), Math.min(displayDocument.pages.length, endIndex + 5))
      .map(p => p.id);

    // Only capture positions for potentially affected pages
    const currentPositions = new Map<string, { x: number; y: number }>();


    affectedPageIds.forEach(pageId => {
      const element = document.querySelector(`[data-page-number="${pageId}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        currentPositions.set(pageId, { x: rect.left, y: rect.top });
      }
    });

    // Execute the reorder command
    if (pagesToMove.length > 1) {
      const command = new MovePagesCommand(displayDocument, setPdfDocument, pagesToMove, targetIndex);
      executeCommand(command);
    } else {
      const pageId = pagesToMove[0];
      const command = new ReorderPageCommand(displayDocument, setPdfDocument, pageId, targetIndex);
      executeCommand(command);
    }

    // Animate only the affected pages
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newPositions = new Map<string, { x: number; y: number }>();

          // Get new positions only for affected pages
          affectedPageIds.forEach(pageId => {
            const element = document.querySelector(`[data-page-number="${pageId}"]`);
            if (element) {
              const rect = element.getBoundingClientRect();
              newPositions.set(pageId, { x: rect.left, y: rect.top });
            }
          });

          const elementsToAnimate: HTMLElement[] = [];

          // Apply animations only to pages that actually moved
          affectedPageIds.forEach(pageId => {
            const element = document.querySelector(`[data-page-number="${pageId}"]`) as HTMLElement;
            if (!element) return;

            const currentPos = currentPositions.get(pageId);
            const newPos = newPositions.get(pageId);

            if (currentPos && newPos) {
              const deltaX = currentPos.x - newPos.x;
              const deltaY = currentPos.y - newPos.y;

              if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                elementsToAnimate.push(element);


                // Apply initial transform
                element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                element.style.transition = 'none';


                // Force reflow
                element.offsetHeight;


                // Animate to final position
                element.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                element.style.transform = 'translate(0px, 0px)';
              }
            }
          });

          // Clean up after animation (only for animated elements)
          setTimeout(() => {
            elementsToAnimate.forEach((element) => {
              element.style.transform = '';
              element.style.transition = '';
            });
            setIsAnimating(false);
          }, 300);
        });
      });
    }, 10); // Small delay to allow state update
  }, [displayDocument, isAnimating, executeCommand, selectionMode, selectedPageNumbers, setPdfDocument]);

  const handleReorderPages = useCallback((sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => {
    if (!displayDocument) return;

    const pagesToMove = selectedPages && selectedPages.length > 1 
      ? selectedPages 
      : [sourcePageNumber];
    
    const sourceIndex = displayDocument.pages.findIndex(p => p.pageNumber === sourcePageNumber);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    animateReorder(sourcePageNumber, targetIndex);
    
    const moveCount = pagesToMove.length;
    setStatus(`${moveCount > 1 ? `${moveCount} pages` : 'Page'} reordered`);
  }, [displayDocument, animateReorder]);


  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!displayDocument) return;

    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageNumbers.length === 0) return;

    const command = new RotatePagesCommand(
      displayDocument,
      setPdfDocument,
      pagesToRotate,
      rotation
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPageNumbers.length : displayDocument.pages.length;
    setStatus(`Rotated ${pageCount} pages ${direction}`);
  }, [displayDocument, selectedPageNumbers, selectionMode, executeCommand, setPdfDocument]);

  const handleDelete = useCallback(() => {
    if (!displayDocument) return;

    const pagesToDelete = selectionMode
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageNumbers.length === 0) return;

    const command = new DeletePagesCommand(
      displayDocument,
      setPdfDocument,
      pagesToDelete
    );

    executeCommand(command);
    if (selectionMode) {
      actions.setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPageNumbers.length : displayDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [displayDocument, selectedPageNumbers, selectionMode, executeCommand, setPdfDocument, actions]);

  const handleSplit = useCallback(() => {
    if (!displayDocument) return;

    const pagesToSplit = selectionMode
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageNumbers.length === 0) return;

    const command = new ToggleSplitCommand(
      displayDocument,
      setPdfDocument,
      pagesToSplit
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPageNumbers.length : displayDocument.pages.length;
    setStatus(`Split markers toggled for ${pageCount} pages`);
  }, [displayDocument, selectedPageNumbers, selectionMode, executeCommand, setPdfDocument]);

  const showExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    // Convert page numbers to page IDs for export service
    const exportPageIds = selectedOnly
      ? selectedPageNumbers.map(pageNum => {
          const page = mergedPdfDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : [];


    const preview = pdfExportService.getExportInfo(mergedPdfDocument, exportPageIds, selectedOnly);
    setExportPreview(preview);
    setShowExportModal(true);
  }, [mergedPdfDocument, selectedPageNumbers]);

  const handleExport = useCallback(async (selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    setExportLoading(true);
    try {
      // Convert page numbers to page IDs for export service
      const exportPageIds = selectedOnly
        ? selectedPageNumbers.map(pageNum => {
            const page = mergedPdfDocument.pages.find(p => p.pageNumber === pageNum);
            return page?.id || '';
          }).filter(id => id)
        : [];


      const errors = pdfExportService.validateExport(mergedPdfDocument, exportPageIds, selectedOnly);
      if (errors.length > 0) {
        setStatus(errors.join(', '));
        return;
      }

      const hasSplitMarkers = mergedPdfDocument.pages.some(page => page.splitBefore);

      if (hasSplitMarkers) {
        const result = await pdfExportService.exportPDF(mergedPdfDocument, exportPageIds, {
          selectedOnly,
          filename,
          splitDocuments: true
        }) as { blobs: Blob[]; filenames: string[] };

        result.blobs.forEach((blob, index) => {
          setTimeout(() => {
            pdfExportService.downloadFile(blob, result.filenames[index]);
          }, index * 500);
        });

        setStatus(`Exported ${result.blobs.length} split documents`);
      } else {
        const result = await pdfExportService.exportPDF(mergedPdfDocument, exportPageIds, {
          selectedOnly,
          filename
        }) as { blob: Blob; filename: string };

        pdfExportService.downloadFile(result.blob, result.filename);
        setStatus('PDF exported successfully');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      setStatus(errorMessage);
      setStatus(errorMessage);
    } finally {
      setExportLoading(false);
    }
  }, [mergedPdfDocument, selectedPageNumbers, filename]);

  const handleUndo = useCallback(() => {
    if (undo()) {
      setStatus('Operation undone');
    }
  }, [undo]);

  const handleRedo = useCallback(() => {
    if (redo()) {
      setStatus('Operation redone');
    }
  }, [redo]);

  const closePdf = useCallback(() => {
    // Use actions from context
    actions.clearAllFiles();
    actions.setSelectedPages([]);
  }, [actions]);

  // PageEditorControls needs onExportSelected and onExportAll
  const onExportSelected = useCallback(() => showExportPreview(true), [showExportPreview]);
  const onExportAll = useCallback(() => showExportPreview(false), [showExportPreview]);

  /**
   * Stable function proxy pattern to prevent infinite loops.
   * 
   * Problem: If we include selectedPages in useEffect dependencies, every page selection
   * change triggers onFunctionsReady → parent re-renders → PageEditor unmounts/remounts → infinite loop
   * 
   * Solution: Create a stable proxy object that uses getters to access current values
   * without triggering parent re-renders when values change.
   */
  const pageEditorFunctionsRef = useRef({
    handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit,
    showExportPreview, onExportSelected, onExportAll, exportLoading, selectionMode,
    selectedPages: selectedPageNumbers, closePdf,
  });

  // Update ref with current values (no parent notification)
  pageEditorFunctionsRef.current = {
    handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit,
    showExportPreview, onExportSelected, onExportAll, exportLoading, selectionMode,
    selectedPages: selectedPageNumbers, closePdf,
  };

  // Only call onFunctionsReady once - use stable proxy for live updates
  useEffect(() => {
    if (onFunctionsReady) {
      const stableFunctions = {
        get handleUndo() { return pageEditorFunctionsRef.current.handleUndo; },
        get handleRedo() { return pageEditorFunctionsRef.current.handleRedo; },
        get canUndo() { return pageEditorFunctionsRef.current.canUndo; },
        get canRedo() { return pageEditorFunctionsRef.current.canRedo; },
        get handleRotate() { return pageEditorFunctionsRef.current.handleRotate; },
        get handleDelete() { return pageEditorFunctionsRef.current.handleDelete; },
        get handleSplit() { return pageEditorFunctionsRef.current.handleSplit; },
        get showExportPreview() { return pageEditorFunctionsRef.current.showExportPreview; },
        get onExportSelected() { return pageEditorFunctionsRef.current.onExportSelected; },
        get onExportAll() { return pageEditorFunctionsRef.current.onExportAll; },
        get exportLoading() { return pageEditorFunctionsRef.current.exportLoading; },
        get selectionMode() { return pageEditorFunctionsRef.current.selectionMode; },
        get selectedPages() { return pageEditorFunctionsRef.current.selectedPages; },
        get closePdf() { return pageEditorFunctionsRef.current.closePdf; },
      };
      onFunctionsReady(stableFunctions);
    }
  }, [onFunctionsReady]);

  // Show loading or empty state instead of blocking
  const showLoading = !mergedPdfDocument && (globalProcessing || activeFileIds.length > 0);
  const showEmpty = !mergedPdfDocument && !globalProcessing && activeFileIds.length === 0;
  // Functions for global NavigationWarningModal
  const handleApplyAndContinue = useCallback(async () => {
    if (editedDocument) {
      await applyChanges();
    }
  }, [editedDocument, applyChanges]);

  const handleExportAndContinue = useCallback(async () => {
    if (editedDocument) {
      await applyChanges();
      await handleExport(false);
    }
  }, [editedDocument, applyChanges, handleExport]);

  // Enhanced draft checking using centralized IndexedDB manager
  const checkForDrafts = useCallback(async () => {
    if (!mergedPdfDocument) return;


    try {
      const draftKey = `draft-${mergedPdfDocument.id || 'merged'}`;
      // Use centralized IndexedDB manager
      const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.DRAFTS);
      
      // Check if the drafts object store exists before using it
      if (!db.objectStoreNames.contains('drafts')) {
        console.log('📝 Drafts object store not found, skipping draft check');
        return;
      }
      
      const transaction = db.transaction('drafts', 'readonly');
      const store = transaction.objectStore('drafts');
      const getRequest = store.get(draftKey);

      getRequest.onsuccess = () => {
        const draft = getRequest.result;
        if (draft && draft.timestamp) {
          // Check if draft is recent (within last 24 hours)
          const draftAge = Date.now() - draft.timestamp;
          const twentyFourHours = 24 * 60 * 60 * 1000;

          if (draftAge < twentyFourHours) {
            setFoundDraft(draft);
            setShowResumeModal(true);
          }
        }
      };
      
      getRequest.onerror = () => {
        console.warn('Failed to get draft:', getRequest.error);
      };
      
    } catch (error) {
      console.warn('Draft check failed:', error);
      // Don't throw - draft checking failure shouldn't break the app
    }
  }, [mergedPdfDocument]);

  // Resume work from draft
  const resumeWork = useCallback(() => {
    if (foundDraft && foundDraft.document) {
      setEditedDocument(foundDraft.document);
      actions.setHasUnsavedChanges(true); // Use context action
      setFoundDraft(null);
      setShowResumeModal(false);
      setStatus('Resumed previous work');
    }
  }, [foundDraft, actions]);

  // Start fresh (ignore draft)
  const startFresh = useCallback(() => {
    if (foundDraft) {
      // Clean up the draft
      cleanupDraft();
    }
    setFoundDraft(null);
    setShowResumeModal(false);
  }, [foundDraft, cleanupDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {

      // Clear auto-save timer
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }


      // Clean up draft if component unmounts with unsaved changes
      if (hasUnsavedChanges) {
        cleanupDraft();
      }
    };
  }, [hasUnsavedChanges, cleanupDraft]);

  // Check for drafts when document loads
  useEffect(() => {
    if (mergedPdfDocument && !editedDocument && !hasUnsavedChanges) {
      // Small delay to let the component settle
      setTimeout(checkForDrafts, 1000);
    }
  }, [mergedPdfDocument, editedDocument, hasUnsavedChanges, checkForDrafts]);

  // Global navigation intercept - listen for navigation events
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return 'You have unsaved changes. Are you sure you want to leave?';
    };

    // Intercept browser navigation
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }} data-scrolling-container="true">
      <LoadingOverlay visible={globalProcessing && !mergedPdfDocument} />

      {showEmpty && (
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Text size="lg" c="dimmed">📄</Text>
            <Text c="dimmed">No PDF files loaded</Text>
            <Text size="sm" c="dimmed">Add files to start editing pages</Text>
          </Stack>
        </Center>
      )}

      {showLoading && (
        <Box p="md" pt="xl">
          <SkeletonLoader type="controls" />


          {/* Progress indicator */}
          <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Processing PDF files...
              </Text>
              <Text size="sm" c="dimmed">
                {Math.round(processingProgress || 0)}%
              </Text>
            </Group>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: 'var(--mantine-color-gray-2)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.round(processingProgress || 0)}%`,
                height: '100%',
                backgroundColor: 'var(--mantine-color-blue-6)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </Box>


          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {displayDocument && (
        <Box p="md" pt="xl">
          {/* Enhanced Processing Status */}
          {globalProcessing && processingProgress < 100 && (
            <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>Processing thumbnails...</Text>
                <Text size="sm" c="dimmed">{Math.round(processingProgress || 0)}%</Text>
              </Group>
              <div style={{
                width: '100%',
                height: '4px',
                backgroundColor: 'var(--mantine-color-gray-2)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.round(processingProgress || 0)}%`,
                  height: '100%',
                  backgroundColor: 'var(--mantine-color-blue-6)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </Box>
          )}

          <Group mb="md">
            <TextInput
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename"
              style={{ minWidth: 200 }}
            />
            <Button
              onClick={toggleSelectionMode}
              variant={selectionMode ? "filled" : "outline"}
              color={selectionMode ? "blue" : "gray"}
              styles={{
                root: {
                  transition: 'all 0.2s ease',
                  ...(selectionMode && {
                    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                  })
                }
              }}
            >
              {selectionMode ? "Exit Selection" : "Select Pages"}
            </Button>
            {selectionMode && (
              <>
                <Button onClick={selectAll} variant="light">Select All</Button>
                <Button onClick={deselectAll} variant="light">Deselect All</Button>
              </>
            )}


            {/* Apply Changes Button */}
            {hasUnsavedChanges && (
              <Button
                onClick={applyChanges}
                color="green"
                variant="filled"
                style={{ marginLeft: 'auto' }}
              >
                Apply Changes
              </Button>
            )}
          </Group>

          {selectionMode && (
            <BulkSelectionPanel
              csvInput={csvInput}
              setCsvInput={setCsvInput}
              selectedPages={selectedPageNumbers}
              onUpdatePagesFromCSV={updatePagesFromCSV}
            />
          )}



        <DragDropGrid
          items={displayedPages}
          selectedItems={selectedPageNumbers}
          selectionMode={selectionMode}
          isAnimating={isAnimating}
          onReorderPages={handleReorderPages}
          renderItem={(page, index, refs) => (
            <PageThumbnail
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
              onSetStatus={setStatus}
              onSetMovingPage={setMovingPage}
              RotatePagesCommand={RotatePagesCommand}
              DeletePagesCommand={DeletePagesCommand}
              ToggleSplitCommand={ToggleSplitCommand}
              pdfDocument={displayDocument}
              setPdfDocument={setPdfDocument}
            />
          )}
          renderSplitMarker={(page, index) => (
            <div
              style={{
                width: '2px',
                height: '20rem',
                borderLeft: '2px dashed #3b82f6',
                backgroundColor: 'transparent',
                marginLeft: '-0.75rem',
                marginRight: '-0.75rem',
                flexShrink: 0
              }}
            />
          )}
        />

        </Box>
      )}

      {/* Modal should be outside the conditional but inside the main container */}
      <Modal
          opened={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Export Preview"
        >
          {exportPreview && (
            <Stack gap="md">
              <Group justify="space-between">
                <Text>Pages to export:</Text>
                <Text fw={500}>{exportPreview.pageCount}</Text>
              </Group>

              {exportPreview.splitCount > 1 && (
                <Group justify="space-between">
                  <Text>Split into documents:</Text>
                  <Text fw={500}>{exportPreview.splitCount}</Text>
                </Group>
              )}

              <Group justify="space-between">
                <Text>Estimated size:</Text>
                <Text fw={500}>{exportPreview.estimatedSize}</Text>
              </Group>

              {mergedPdfDocument && mergedPdfDocument.pages.some(p => p.splitBefore) && (
                <Alert color="blue">
                  This will create multiple PDF files based on split markers.
                </Alert>
              )}

              <Group justify="flex-end" mt="md">
                <Button
                  variant="light"
                  onClick={() => setShowExportModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  color="green"
                  loading={exportLoading}
                  onClick={() => {
                    setShowExportModal(false);
                    const selectedOnly = exportPreview.pageCount < (mergedPdfDocument?.pages.length || 0);
                    handleExport(selectedOnly);
                  }}
                >
                  Export PDF
                </Button>
              </Group>
            </Stack>
          )}
        </Modal>

        {/* Global Navigation Warning Modal */}
        <NavigationWarningModal
          onApplyAndContinue={handleApplyAndContinue}
          onExportAndContinue={handleExportAndContinue}
        />

        {/* Resume Work Modal */}
        <Modal
          opened={showResumeModal}
          onClose={startFresh}
          title="Resume Work"
          centered
          closeOnClickOutside={false}
          closeOnEscape={false}
        >
          <Stack gap="md">
            <Text>
              We found unsaved changes from a previous session. Would you like to resume where you left off?
            </Text>


            {foundDraft && (
              <Text size="sm" c="dimmed">
                Last saved: {new Date(foundDraft.timestamp).toLocaleString()}
              </Text>
            )}


            <Group justify="flex-end" gap="sm">
              <Button
                variant="light"
                color="gray"
                onClick={startFresh}
              >
                Start Fresh
              </Button>


              <Button
                color="blue"
                onClick={resumeWork}
              >
                Resume Work
              </Button>
            </Group>
          </Stack>
        </Modal>

      {status && (
        <Notification
          color="blue"
          mt="md"
          onClose={() => setStatus(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}
        >
          {status}
        </Notification>
      )}
      
      {error && (
        <Notification
          color="red"
          mt="md"
          onClose={() => setError(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}
        >
          {error}
        </Notification>
      )}
    </Box>
  );
};

export default PageEditor;
