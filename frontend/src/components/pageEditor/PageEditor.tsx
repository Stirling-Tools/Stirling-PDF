import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileContext, useCurrentFile } from "../../contexts/FileContext";
import { ViewType } from "../../types/fileContext";
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
import './pageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';

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
    selectedPages: string[];
    closePdf: () => void;
  }) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();

  // Get file context
  const fileContext = useFileContext();
  const { file: currentFile, processedFile: currentProcessedFile } = useCurrentFile();
  
  // Use file context state
  const {
    activeFiles,
    processedFiles,
    selectedPageNumbers,
    setSelectedPages,
    updateProcessedFile,
    setCurrentView: originalSetCurrentView,
    isProcessing: globalProcessing,
    processingProgress,
    clearAllFiles
  } = fileContext;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [foundDraft, setFoundDraft] = useState<any>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Override setCurrentView to check for unsaved changes
  const setCurrentView = useCallback((view: ViewType) => {
    if (hasUnsavedChanges && view !== 'pageEditor') {
      // Show warning modal instead of immediately switching views
      setPendingNavigation(() => () => originalSetCurrentView(view));
      setShowUnsavedModal(true);
    } else {
      originalSetCurrentView(view);
    }
  }, [hasUnsavedChanges, originalSetCurrentView]);

  // Simple computed document from processed files (no caching needed)
  const mergedPdfDocument = useMemo(() => {
    if (activeFiles.length === 0) return null;
    
    if (activeFiles.length === 1) {
      // Single file
      const processedFile = processedFiles.get(activeFiles[0]);
      if (!processedFile) return null;
      
      return {
        id: processedFile.id,
        name: activeFiles[0].name,
        file: activeFiles[0],
        pages: processedFile.pages.map(page => ({
          ...page,
          rotation: page.rotation || 0,
          splitBefore: page.splitBefore || false
        })),
        totalPages: processedFile.totalPages
      };
    } else {
      // Multiple files - merge them
      const allPages: PDFPage[] = [];
      let totalPages = 0;
      const filenames: string[] = [];

      activeFiles.forEach((file, i) => {
        const processedFile = processedFiles.get(file);
        if (processedFile) {
          filenames.push(file.name.replace(/\.pdf$/i, ''));
          
          processedFile.pages.forEach((page, pageIndex) => {
            const newPage: PDFPage = {
              ...page,
              id: `${i}-${page.id}`, // Unique ID across all files
              pageNumber: totalPages + pageIndex + 1,
              rotation: page.rotation || 0,
              splitBefore: page.splitBefore || false
            };
            allPages.push(newPage);
          });
          
          totalPages += processedFile.pages.length;
        }
      });

      if (allPages.length === 0) return null;

      return {
        id: `merged-${Date.now()}`,
        name: filenames.join(' + '),
        file: activeFiles[0], // Use first file as reference
        pages: allPages,
        totalPages: totalPages
      };
    }
  }, [activeFiles, processedFiles]);

  // Display document: Use edited version if exists, otherwise original
  const displayDocument = editedDocument || mergedPdfDocument;

  const [filename, setFilename] = useState<string>("");
  
  // Debug render performance
  const renderStartTime = useRef(performance.now());
  
  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    console.log('PageEditor: Component render:', renderTime.toFixed(2) + 'ms');
    renderStartTime.current = performance.now();
  });

  // Page editor state (use context for selectedPages)
  const [status, setStatus] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState(false);

  // Drag and drop state
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [multiPageDrag, setMultiPageDrag] = useState<{pageNumbers: number[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);

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

  // Set initial filename when document changes
  useEffect(() => {
    if (mergedPdfDocument) {
      if (activeFiles.length === 1) {
        setFilename(activeFiles[0].name.replace(/\.pdf$/i, ''));
      } else {
        const filenames = activeFiles.map(f => f.name.replace(/\.pdf$/i, ''));
        setFilename(filenames.join('_'));
      }
    }
  }, [mergedPdfDocument, activeFiles]);

  // Handle file upload from FileUploadSelector (now using context)
  const handleMultipleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      setStatus('No files provided');
      return;
    }

    // Add files to context
    await fileContext.addFiles(uploadedFiles);
    setStatus(`Added ${uploadedFiles.length} file(s) for processing`);
  }, [fileContext]);


  // PageEditor no longer handles cleanup - it's centralized in FileContext

  // Shared PDF instance for thumbnail generation
  const [sharedPdfInstance, setSharedPdfInstance] = useState<any>(null);
  const [thumbnailGenerationStarted, setThumbnailGenerationStarted] = useState(false);

  // Thumbnail generation (opt-in for visual tools)
  const { 
    generateThumbnails,
    addThumbnailToCache, 
    getThumbnailFromCache, 
    stopGeneration,
    destroyThumbnails 
  } = useThumbnailGeneration();

  // Start thumbnail generation process (separate from document loading)
  const startThumbnailGeneration = useCallback(() => {
    console.log('🎬 PageEditor: startThumbnailGeneration called');
    console.log('🎬 Conditions - mergedPdfDocument:', !!mergedPdfDocument, 'activeFiles:', activeFiles.length, 'started:', thumbnailGenerationStarted);
    
    if (!mergedPdfDocument || activeFiles.length !== 1 || thumbnailGenerationStarted) {
      console.log('🎬 PageEditor: Skipping thumbnail generation due to conditions');
      return;
    }
    
    const file = activeFiles[0];
    const totalPages = mergedPdfDocument.totalPages;
    
    console.log('🎬 PageEditor: Starting thumbnail generation for', totalPages, 'pages');
    setThumbnailGenerationStarted(true);
    
    // Run everything asynchronously to avoid blocking the main thread
    setTimeout(async () => {
      try {
        // Load PDF array buffer for Web Workers
        const arrayBuffer = await file.arrayBuffer();
        
        // Generate page numbers for pages that don't have thumbnails yet
        const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(pageNum => {
            const page = mergedPdfDocument.pages.find(p => p.pageNumber === pageNum);
            return !page?.thumbnail; // Only generate for pages without thumbnails
          });
        
        console.log(`🎬 PageEditor: Generating thumbnails for ${pageNumbers.length} pages (out of ${totalPages} total):`, pageNumbers.slice(0, 10), pageNumbers.length > 10 ? '...' : '');
        
        // If no pages need thumbnails, we're done
        if (pageNumbers.length === 0) {
          console.log('🎬 PageEditor: All pages already have thumbnails, no generation needed');
          return;
        }
        
        // Calculate quality scale based on file size
        const scale = activeFiles.length === 1 ? calculateScaleFromFileSize(activeFiles[0].size) : 0.2;
        
        // Start parallel thumbnail generation WITHOUT blocking the main thread
        const generationPromise = generateThumbnails(
          arrayBuffer,
          pageNumbers,
          {
            scale, // Dynamic quality based on file size
            quality: 0.8,
            batchSize: 15, // Smaller batches per worker for smoother UI
            parallelBatches: 3 // Use 3 Web Workers in parallel
          },
          // Progress callback (throttled for better performance)
          (progress) => {
            console.log(`🎬 PageEditor: Progress - ${progress.completed}/${progress.total} pages, ${progress.thumbnails.length} new thumbnails`);
            // Batch process thumbnails to reduce main thread work
            requestAnimationFrame(() => {
              progress.thumbnails.forEach(({ pageNumber, thumbnail }) => {
                // Check cache first, then send thumbnail
                const pageId = `${file.name}-page-${pageNumber}`;
                const cached = getThumbnailFromCache(pageId);
                
                if (!cached) {
                  // Cache and send to component
                  addThumbnailToCache(pageId, thumbnail);
                  
                  window.dispatchEvent(new CustomEvent('thumbnailReady', {
                    detail: { pageNumber, thumbnail, pageId }
                  }));
                  console.log(`✓ PageEditor: Dispatched thumbnail for page ${pageNumber}`);
                }
              });
            });
          }
        );

        // Handle completion properly
        generationPromise
          .then((allThumbnails) => {
            console.log(`✅ PageEditor: Thumbnail generation completed! Generated ${allThumbnails.length} thumbnails`);
            // Don't reset thumbnailGenerationStarted here - let it stay true to prevent restarts
          })
          .catch(error => {
            console.error('✗ PageEditor: Web Worker thumbnail generation failed:', error);
            setThumbnailGenerationStarted(false);
          });
        
      } catch (error) {
        console.error('Failed to start Web Worker thumbnail generation:', error);
        setThumbnailGenerationStarted(false);
      }
    }, 0); // setTimeout with 0ms to defer to next tick
  }, [mergedPdfDocument, activeFiles, thumbnailGenerationStarted, getThumbnailFromCache, addThumbnailToCache]);

  // Start thumbnail generation after document loads
  useEffect(() => {
    console.log('🎬 PageEditor: Thumbnail generation effect triggered');
    console.log('🎬 Conditions - mergedPdfDocument:', !!mergedPdfDocument, 'started:', thumbnailGenerationStarted);
    
    if (mergedPdfDocument && !thumbnailGenerationStarted) {
      // Check if ALL pages already have thumbnails from processed files
      const totalPages = mergedPdfDocument.pages.length;
      const pagesWithThumbnails = mergedPdfDocument.pages.filter(page => page.thumbnail).length;
      const hasAllThumbnails = pagesWithThumbnails === totalPages;
      
      console.log('🎬 PageEditor: Thumbnail status:', {
        totalPages,
        pagesWithThumbnails,
        hasAllThumbnails,
        missingThumbnails: totalPages - pagesWithThumbnails
      });
      
      if (hasAllThumbnails) {
        console.log('🎬 PageEditor: Skipping generation - all thumbnails already exist');
        return; // Skip generation if ALL thumbnails already exist
      }
      
      console.log('🎬 PageEditor: Some thumbnails missing, proceeding with generation');
      // Small delay to let document render, then start thumbnail generation
      console.log('🎬 PageEditor: Scheduling thumbnail generation in 500ms');
      const timer = setTimeout(startThumbnailGeneration, 500);
      return () => clearTimeout(timer);
    }
  }, [mergedPdfDocument, startThumbnailGeneration, thumbnailGenerationStarted]);

  // Cleanup shared PDF instance when component unmounts (but preserve cache)
  useEffect(() => {
    return () => {
      if (sharedPdfInstance) {
        sharedPdfInstance.destroy();
        setSharedPdfInstance(null);
      }
      setThumbnailGenerationStarted(false);
      // DON'T stop generation on file changes - preserve cache for view switching
      // stopGeneration();
    };
  }, [sharedPdfInstance]); // Only depend on PDF instance, not activeFiles

  // Clear selections when files change
  useEffect(() => {
    setSelectedPages([]);
    setCsvInput("");
    setSelectionMode(false);
  }, [activeFiles, setSelectedPages]);

  // Sync csvInput with selectedPageNumbers changes
  useEffect(() => {
    // Simply sort the page numbers and join them
    const sortedPageNumbers = [...selectedPageNumbers].sort((a, b) => a - b);
    const newCsvInput = sortedPageNumbers.join(', ');
    setCsvInput(newCsvInput);
  }, [selectedPageNumbers]);

  useEffect(() => {
    const handleGlobalDragEnd = () => {
      // Clean up drag state when drag operation ends anywhere
      setDraggedPage(null);
      setDropTarget(null);
      setMultiPageDrag(null);
      setDragPosition(null);
    };

    const handleGlobalDrop = (e: DragEvent) => {
      // Prevent default to handle invalid drops
      e.preventDefault();
    };

    if (draggedPage) {
      document.addEventListener('dragend', handleGlobalDragEnd);
      document.addEventListener('drop', handleGlobalDrop);
    }

    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [draggedPage]);

  const selectAll = useCallback(() => {
    if (mergedPdfDocument) {
      setSelectedPages(mergedPdfDocument.pages.map(p => p.pageNumber));
    }
  }, [mergedPdfDocument, setSelectedPages]);

  const deselectAll = useCallback(() => setSelectedPages([]), [setSelectedPages]);

  const togglePage = useCallback((pageNumber: number) => {
    console.log('🔄 Toggling page', pageNumber);
    
    // Check if currently selected and update accordingly
    const isCurrentlySelected = selectedPageNumbers.includes(pageNumber);
    
    if (isCurrentlySelected) {
      // Remove from selection
      console.log('🔄 Removing page', pageNumber);
      const newSelectedPageNumbers = selectedPageNumbers.filter(num => num !== pageNumber);
      setSelectedPages(newSelectedPageNumbers);
    } else {
      // Add to selection
      console.log('🔄 Adding page', pageNumber);
      const newSelectedPageNumbers = [...selectedPageNumbers, pageNumber];
      setSelectedPages(newSelectedPageNumbers);
    }
  }, [selectedPageNumbers, setSelectedPages]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        // Clear selections when exiting selection mode
        setSelectedPages([]);
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
        for (let i = start; i <= end && i <= mergedPdfDocument.totalPages; i++) {
          if (i > 0) {
            pageNumbers.push(i);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= mergedPdfDocument.totalPages) {
          pageNumbers.push(pageNum);
        }
      }
    });

    return pageNumbers;
  }, [mergedPdfDocument]);

  const updatePagesFromCSV = useCallback(() => {
    const pageNumbers = parseCSVInput(csvInput);
    setSelectedPages(pageNumbers);
  }, [csvInput, parseCSVInput, setSelectedPages]);

  const handleDragStart = useCallback((pageNumber: number) => {
    setDraggedPage(pageNumber);

    // Check if this is a multi-page drag in selection mode
    if (selectionMode && selectedPageNumbers.includes(pageNumber) && selectedPageNumbers.length > 1) {
      setMultiPageDrag({
        pageNumbers: selectedPageNumbers,
        count: selectedPageNumbers.length
      });
    } else {
      setMultiPageDrag(null);
    }
  }, [selectionMode, selectedPageNumbers]);

  const handleDragEnd = useCallback(() => {
    // Clean up drag state regardless of where the drop happened
    setDraggedPage(null);
    setDropTarget(null);
    setMultiPageDrag(null);
    setDragPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (!draggedPage) return;

    // Update drag position for multi-page indicator
    if (multiPageDrag) {
      setDragPosition({ x: e.clientX, y: e.clientY });
    }

    // Get the element under the mouse cursor
    const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementUnderCursor) return;

    // Find the closest page container
    const pageContainer = elementUnderCursor.closest('[data-page-number]');
    if (pageContainer) {
      const pageNumberStr = pageContainer.getAttribute('data-page-number');
      const pageNumber = pageNumberStr ? parseInt(pageNumberStr) : null;
      if (pageNumber && pageNumber !== draggedPage) {
        setDropTarget(pageNumber);
        return;
      }
    }

    // Check if over the end zone
    const endZone = elementUnderCursor.closest('[data-drop-zone="end"]');
    if (endZone) {
      setDropTarget('end');
      return;
    }

    // If not over any valid drop target, clear it
    setDropTarget(null);
  }, [draggedPage, multiPageDrag]);

  const handleDragEnter = useCallback((pageNumber: number) => {
    if (draggedPage && pageNumber !== draggedPage) {
      setDropTarget(pageNumber);
    }
  }, [draggedPage]);

  const handleDragLeave = useCallback(() => {
    // Don't clear drop target on drag leave - let dragover handle it
  }, []);

  // Update PDF document state with edit tracking
  const setPdfDocument = useCallback((updatedDoc: PDFDocument) => {
    console.log('setPdfDocument called - setting edited state');
    
    // Update local edit state for immediate visual feedback
    setEditedDocument(updatedDoc);
    setHasUnsavedChanges(true);
    
    // Auto-save to drafts (debounced)
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    
    autoSaveTimer.current = setTimeout(() => {
      saveDraftToIndexedDB(updatedDoc);
    }, 2000); // Auto-save after 2 seconds of inactivity
    
    return updatedDoc;
  }, []);

  // Save draft to separate IndexedDB location
  const saveDraftToIndexedDB = useCallback(async (doc: PDFDocument) => {
    try {
      const draftKey = `draft-${doc.id || 'merged'}`;
      const draftData = {
        document: doc,
        timestamp: Date.now(),
        originalFiles: activeFiles.map(f => f.name)
      };
      
      // Save to 'pdf-drafts' store in IndexedDB
      const request = indexedDB.open('stirling-pdf-drafts', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('drafts', 'readwrite');
        const store = transaction.objectStore('drafts');
        store.put(draftData, draftKey);
        console.log('Draft auto-saved to IndexedDB');
      };
    } catch (error) {
      console.warn('Failed to auto-save draft:', error);
    }
  }, [activeFiles]);

  // Apply changes to create new processed file
  const applyChanges = useCallback(async () => {
    if (!editedDocument || !mergedPdfDocument) return;
    
    console.log('Applying changes - creating new processed file');
    
    // Create new filename with (edited) suffix
    const originalName = mergedPdfDocument.name.replace(/\.pdf$/i, '');
    const newName = `${originalName}(edited).pdf`;
    
    try {
      // Convert edited document back to processedFiles format
      if (activeFiles.length === 1) {
        // Single file - update the existing processed file
        const file = activeFiles[0];
        const currentProcessedFile = processedFiles.get(file);
        
        if (currentProcessedFile) {
          const updatedProcessedFile = {
            ...currentProcessedFile,
            id: `${currentProcessedFile.id}-edited`,
            pages: editedDocument.pages.map(page => ({
              ...page,
              rotation: page.rotation || 0,
              splitBefore: page.splitBefore || false
            })),
            totalPages: editedDocument.pages.length,
            lastModified: Date.now()
          };
          
          // Use the proper FileContext action to update
          updateProcessedFile(file, updatedProcessedFile);
          
          // Also save the updated file to IndexedDB for persistence
          await fileStorage.storeProcessedFile(file, updatedProcessedFile);
        }
      }
      
      // Clear edit state
      setEditedDocument(null);
      setHasUnsavedChanges(false);
      
      // Clean up auto-save draft
      cleanupDraft();
      
      setStatus('Changes applied successfully');
      
    } catch (error) {
      console.error('Failed to apply changes:', error);
      setStatus('Failed to apply changes');
    }
  }, [editedDocument, mergedPdfDocument, processedFiles, activeFiles, updateProcessedFile]);

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

  const handleDrop = useCallback((e: React.DragEvent, targetPageNumber: number | 'end') => {
    e.preventDefault();
    if (!draggedPage || !displayDocument || draggedPage === targetPageNumber) return;

    let targetIndex: number;
    if (targetPageNumber === 'end') {
      targetIndex = displayDocument.pages.length;
    } else {
      targetIndex = displayDocument.pages.findIndex(p => p.pageNumber === targetPageNumber);
      if (targetIndex === -1) return;
    }

    animateReorder(draggedPage, targetIndex);

    setDraggedPage(null);
    setDropTarget(null);
    setMultiPageDrag(null);
    setDragPosition(null);

    const moveCount = multiPageDrag ? multiPageDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} pages` : 'Page'} reordered`);
  }, [draggedPage, displayDocument, animateReorder, multiPageDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedPage) {
      setDropTarget('end');
    }
  }, [draggedPage]);

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
      setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPageNumbers.length : displayDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [displayDocument, selectedPageNumbers, selectionMode, executeCommand, setPdfDocument, setSelectedPages]);

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
        setError(errors.join(', '));
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
      setError(errorMessage);
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
    if (hasUnsavedChanges) {
      // Show warning modal instead of immediately closing
      setPendingNavigation(() => () => {
        clearAllFiles(); // This now handles all cleanup centrally (including merged docs)
        setSelectedPages([]);
      });
      setShowUnsavedModal(true);
    } else {
      clearAllFiles(); // This now handles all cleanup centrally (including merged docs)
      setSelectedPages([]);
    }
  }, [hasUnsavedChanges, clearAllFiles, setSelectedPages]);

  // PageEditorControls needs onExportSelected and onExportAll
  const onExportSelected = useCallback(() => showExportPreview(true), [showExportPreview]);
  const onExportAll = useCallback(() => showExportPreview(false), [showExportPreview]);

  // Expose functions to parent component for PageEditorControls
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
        showExportPreview,
        onExportSelected,
        onExportAll,
        exportLoading,
        selectionMode,
        selectedPages: selectedPageNumbers,
        closePdf,
      });
    }
  }, [
    onFunctionsReady,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    handleRotate,
    handleDelete,
    handleSplit,
    showExportPreview,
    onExportSelected,
    onExportAll,
    exportLoading,
    selectionMode,
    selectedPageNumbers,
    closePdf
  ]);

  // Show loading or empty state instead of blocking
  const showLoading = !mergedPdfDocument && (globalProcessing || activeFiles.length > 0);
  const showEmpty = !mergedPdfDocument && !globalProcessing && activeFiles.length === 0;
  
  // Clean up draft from IndexedDB
  const cleanupDraft = useCallback(async () => {
    try {
      const draftKey = `draft-${mergedPdfDocument?.id || 'merged'}`;
      const request = indexedDB.open('stirling-pdf-drafts', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('drafts', 'readwrite');
        const store = transaction.objectStore('drafts');
        store.delete(draftKey);
        console.log('Draft cleaned up from IndexedDB');
      };
    } catch (error) {
      console.warn('Failed to cleanup draft:', error);
    }
  }, [mergedPdfDocument]);

  // Export and continue
  const exportAndContinue = useCallback(async () => {
    if (!editedDocument) return;
    
    // First apply changes
    await applyChanges();
    
    // Then export
    await handleExport(false);
    
    // Continue with navigation if pending
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
    
    setShowUnsavedModal(false);
  }, [editedDocument, applyChanges, handleExport, pendingNavigation]);

  // Discard changes
  const discardChanges = useCallback(() => {
    setEditedDocument(null);
    setHasUnsavedChanges(false);
    cleanupDraft();
    
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
    
    setShowUnsavedModal(false);
    setStatus('Changes discarded');
  }, [cleanupDraft, pendingNavigation]);

  // Keep working (stay on page editor)
  const keepWorking = useCallback(() => {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  }, []);

  // Check for existing drafts
  const checkForDrafts = useCallback(async () => {
    if (!mergedPdfDocument) return;
    
    try {
      const draftKey = `draft-${mergedPdfDocument.id || 'merged'}`;
      const request = indexedDB.open('stirling-pdf-drafts', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('drafts')) return;
        
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
      };
    } catch (error) {
      console.warn('Failed to check for drafts:', error);
    }
  }, [mergedPdfDocument]);

  // Resume work from draft
  const resumeWork = useCallback(() => {
    if (foundDraft && foundDraft.document) {
      setEditedDocument(foundDraft.document);
      setHasUnsavedChanges(true);
      setFoundDraft(null);
      setShowResumeModal(false);
      setStatus('Resumed previous work');
    }
  }, [foundDraft]);

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
      console.log('PageEditor unmounting - cleaning up resources');
      
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

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onEndZoneDragEnter={handleEndZoneDragEnter}
          draggedItem={draggedPage}
          dropTarget={dropTarget}
          multiItemDrag={multiPageDrag}
          dragPosition={dragPosition}
          renderItem={(page, index, refs) => (
            <PageThumbnail
              page={page}
              index={index}
              totalPages={displayDocument.pages.length}
              originalFile={activeFiles.length === 1 ? activeFiles[0] : undefined}
              selectedPages={selectedPageNumbers}
              selectionMode={selectionMode}
              draggedPage={draggedPage}
              dropTarget={dropTarget}
              movingPage={movingPage}
              isAnimating={isAnimating}
              pageRefs={refs}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
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
                    const selectedOnly = exportPreview.pageCount < (mergedPdfDocument?.totalPages || 0);
                    handleExport(selectedOnly);
                  }}
                >
                  Export PDF
                </Button>
              </Group>
            </Stack>
          )}
        </Modal>

        {/* Unsaved Changes Modal */}
        <Modal
          opened={showUnsavedModal}
          onClose={keepWorking}
          title="Unsaved Changes"
          centered
          closeOnClickOutside={false}
          closeOnEscape={false}
        >
          <Stack gap="md">
            <Text>
              You have unsaved changes to your PDF. What would you like to do?
            </Text>
            
            <Group justify="flex-end" gap="sm">
              <Button
                variant="light"
                color="gray"
                onClick={keepWorking}
              >
                Keep Working
              </Button>
              
              <Button
                variant="light"
                color="red"
                onClick={discardChanges}
              >
                Discard Changes
              </Button>
              
              <Button
                variant="light"
                color="blue"
                onClick={async () => {
                  await applyChanges();
                  if (pendingNavigation) {
                    pendingNavigation();
                    setPendingNavigation(null);
                  }
                  setShowUnsavedModal(false);
                }}
              >
                Apply & Continue
              </Button>
              
              <Button
                color="green"
                onClick={exportAndContinue}
              >
                Export & Continue
              </Button>
            </Group>
          </Stack>
        </Modal>

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
    </Box>
  );
};

export default PageEditor;
