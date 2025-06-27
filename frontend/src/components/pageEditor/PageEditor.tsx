import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEnhancedProcessedFiles } from "../../hooks/useEnhancedProcessedFiles";
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
import { thumbnailGenerationService } from "../../services/thumbnailGenerationService";
import './pageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './DragDropGrid';

export interface PageEditorProps {
  activeFiles: File[];
  setActiveFiles: (files: File[]) => void;
  downloadUrl?: string | null;
  setDownloadUrl?: (url: string | null) => void;

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
  activeFiles,
  setActiveFiles,
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();

  // Enhanced processing with intelligent strategies
  const {
    processedFiles: enhancedProcessedFiles,
    processingStates,
    isProcessing: globalProcessing,
    hasProcessingErrors,
    processingProgress,
    actions: processingActions
  } = useEnhancedProcessedFiles(activeFiles, {
    strategy: 'priority_pages', // Process first pages immediately
    thumbnailQuality: 'low', // Low quality for page editor navigation
    priorityPageCount: 10
  });

  // Single merged document state
  const [mergedPdfDocument, setMergedPdfDocument] = useState<PDFDocument | null>(null);
  const [filename, setFilename] = useState<string>("");

  // Page editor state
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState(false);

  // Drag and drop state
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [multiPageDrag, setMultiPageDrag] = useState<{pageIds: string[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPreview, setExportPreview] = useState<{pageCount: number; splitCount: number; estimatedSize: string} | null>(null);

  // Animation state
  const [movingPage, setMovingPage] = useState<string | null>(null);
  const [pagePositions, setPagePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [isAnimating, setIsAnimating] = useState(false);
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<() => void>(null);

  // Undo/Redo system
  const { executeCommand, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Convert enhanced processed files to Page Editor format
  const convertToPageEditorFormat = useCallback((enhancedFile: EnhancedProcessedFile, fileName: string): PDFDocument => {
    return {
      id: enhancedFile.id,
      name: fileName,
      file: null as any, // We don't need the file reference in the converted format
      pages: enhancedFile.pages.map(page => ({
        ...page,
        // Ensure compatibility with existing page editor types
        splitBefore: page.splitBefore || false
      })),
      totalPages: enhancedFile.totalPages
    };
  }, []);

  // Merge multiple PDF documents into one
  const mergeAllPDFs = useCallback(() => {
    if (activeFiles.length === 0) {
      setMergedPdfDocument(null);
      return;
    }

    if (activeFiles.length === 1) {
      // Single file - use enhanced processed file
      const enhancedFile = enhancedProcessedFiles.get(activeFiles[0]);
      if (enhancedFile) {
        const pdfDoc = convertToPageEditorFormat(enhancedFile, activeFiles[0].name);
        setMergedPdfDocument(pdfDoc);
        setFilename(activeFiles[0].name.replace(/\.pdf$/i, ''));
      }
    } else {
      // Multiple files - merge them
      const allPages: PDFPage[] = [];
      let totalPages = 0;
      const filenames: string[] = [];

      activeFiles.forEach((file, fileIndex) => {
        const enhancedFile = enhancedProcessedFiles.get(file);
        if (enhancedFile) {
          filenames.push(file.name.replace(/\.pdf$/i, ''));
          enhancedFile.pages.forEach((page, pageIndex) => {
            // Create new page with updated IDs and page numbers for merged document
            const newPage: PDFPage = {
              ...page,
              id: `${fileIndex}-${page.id}`, // Unique ID across all files
              pageNumber: totalPages + pageIndex + 1,
              splitBefore: page.splitBefore || false
            };
            allPages.push(newPage);
          });
          totalPages += enhancedFile.pages.length;
        }
      });

      if (allPages.length > 0) {
        const mergedDocument: PDFDocument = {
          id: `merged-${Date.now()}`,
          name: filenames.join(' + '),
          file: null as any,
          pages: allPages,
          totalPages: totalPages
        };

        setMergedPdfDocument(mergedDocument);
        setFilename(filenames.join('_'));
      }
    }
  }, [activeFiles, enhancedProcessedFiles, convertToPageEditorFormat]);

  // Handle file upload from FileUploadSelector
  const handleMultipleFileUpload = useCallback((uploadedFiles: File[]) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      setStatus('No files provided');
      return;
    }

    // Simply set the activeFiles to the selected files (same as existing approach)
    setActiveFiles(uploadedFiles);
    setStatus(`Added ${uploadedFiles.length} file(s) for processing`);
  }, [setActiveFiles]);

  // Auto-merge documents when enhanced processing completes
  useEffect(() => {
    if (activeFiles.length > 0) {
      const allProcessed = activeFiles.every(file => enhancedProcessedFiles.has(file));

      if (allProcessed) {
        mergeAllPDFs();
      }
    } else {
      setMergedPdfDocument(null);
    }
  }, [activeFiles, enhancedProcessedFiles, mergeAllPDFs]);

  // Shared PDF instance for thumbnail generation
  const [sharedPdfInstance, setSharedPdfInstance] = useState<any>(null);
  const [thumbnailGenerationStarted, setThumbnailGenerationStarted] = useState(false);

  // Session-based thumbnail cache with 1GB limit
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, { thumbnail: string; lastUsed: number; sizeBytes: number }>>(new Map());
  const maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  const [currentCacheSize, setCurrentCacheSize] = useState(0);

  // Cache management functions
  const addThumbnailToCache = useCallback((pageId: string, thumbnail: string) => {
    const thumbnailSizeBytes = thumbnail.length * 0.75; // Rough base64 size estimate
    
    setThumbnailCache(prev => {
      const newCache = new Map(prev);
      const now = Date.now();
      
      // Add new thumbnail
      newCache.set(pageId, {
        thumbnail,
        lastUsed: now,
        sizeBytes: thumbnailSizeBytes
      });
      
      return newCache;
    });
    
    setCurrentCacheSize(prev => {
      const newSize = prev + thumbnailSizeBytes;
      
      // If we exceed 1GB, trigger cleanup
      if (newSize > maxCacheSizeBytes) {
        setTimeout(() => cleanupThumbnailCache(), 0);
      }
      
      return newSize;
    });
    
    console.log(`Cached thumbnail for ${pageId} (${Math.round(thumbnailSizeBytes / 1024)}KB)`);
  }, [maxCacheSizeBytes]);

  const getThumbnailFromCache = useCallback((pageId: string): string | null => {
    const cached = thumbnailCache.get(pageId);
    if (!cached) return null;
    
    // Update last used timestamp
    setThumbnailCache(prev => {
      const newCache = new Map(prev);
      const entry = newCache.get(pageId);
      if (entry) {
        entry.lastUsed = Date.now();
      }
      return newCache;
    });
    
    return cached.thumbnail;
  }, [thumbnailCache]);

  const cleanupThumbnailCache = useCallback(() => {
    setThumbnailCache(prev => {
      const entries = Array.from(prev.entries());
      
      // Sort by last used (oldest first)
      entries.sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
      
      const newCache = new Map();
      let newSize = 0;
      const targetSize = maxCacheSizeBytes * 0.8; // Clean to 80% of limit
      
      // Keep most recently used entries until we hit target size
      for (let i = entries.length - 1; i >= 0 && newSize < targetSize; i--) {
        const [key, value] = entries[i];
        newCache.set(key, value);
        newSize += value.sizeBytes;
      }
      
      setCurrentCacheSize(newSize);
      console.log(`Cleaned thumbnail cache: ${prev.size} → ${newCache.size} entries (${Math.round(newSize / 1024 / 1024)}MB)`);
      
      return newCache;
    });
  }, [maxCacheSizeBytes]);

  const clearThumbnailCache = useCallback(() => {
    setThumbnailCache(new Map());
    setCurrentCacheSize(0);
    console.log('Cleared thumbnail cache');
  }, []);

  // Start thumbnail generation process (separate from document loading)
  const startThumbnailGeneration = useCallback(() => {
    if (!mergedPdfDocument || activeFiles.length !== 1 || thumbnailGenerationStarted) return;
    
    const file = activeFiles[0];
    const totalPages = mergedPdfDocument.totalPages;
    
    console.log(`Starting Web Worker thumbnail generation for ${totalPages} pages`);
    setThumbnailGenerationStarted(true);
    
    // Run everything asynchronously to avoid blocking the main thread
    setTimeout(async () => {
      try {
        console.log('📖 Loading PDF array buffer...');
        
        // Load PDF array buffer for Web Workers
        const arrayBuffer = await file.arrayBuffer();
        
        console.log('✅ PDF array buffer loaded, starting Web Workers...');
        
        // Generate all page numbers
        const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
        
        // Start parallel thumbnail generation WITHOUT blocking the main thread
        thumbnailGenerationService.generateThumbnails(
          arrayBuffer,
          pageNumbers,
          {
            scale: 0.2, // Low quality for page editor
            quality: 0.8,
            batchSize: 15, // Smaller batches per worker for smoother UI
            parallelBatches: 3 // Use 3 Web Workers in parallel
          },
          // Progress callback (throttled for better performance)
          (progress) => {
            // Reduce console spam - only log every 10 completions
            if (progress.completed % 10 === 0) {
              console.log(`Thumbnail progress: ${progress.completed}/${progress.total} completed`);
            }
            
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
                }
              });
            });
          }
        ).then(thumbnails => {
          console.log(`🎉 Web Worker thumbnail generation completed: ${thumbnails.length} thumbnails generated`);
        }).catch(error => {
          console.error('❌ Web Worker thumbnail generation failed:', error);
          setThumbnailGenerationStarted(false);
        });
        
      } catch (error) {
        console.error('Failed to start Web Worker thumbnail generation:', error);
        setThumbnailGenerationStarted(false);
      }
    }, 0); // setTimeout with 0ms to defer to next tick
    
    console.log('🚀 Thumbnail generation queued - UI remains responsive');
  }, [mergedPdfDocument, activeFiles, thumbnailGenerationStarted, getThumbnailFromCache, addThumbnailToCache]);

  // Start thumbnail generation after document loads and UI settles
  useEffect(() => {
    if (mergedPdfDocument && !thumbnailGenerationStarted) {
      // Small delay to let document render, then start thumbnail generation
      const timer = setTimeout(startThumbnailGeneration, 1000);
      return () => clearTimeout(timer);
    }
  }, [mergedPdfDocument, startThumbnailGeneration, thumbnailGenerationStarted]);

  // Cleanup shared PDF instance, workers, and cache when component unmounts or files change
  useEffect(() => {
    return () => {
      if (sharedPdfInstance) {
        sharedPdfInstance.destroy();
        setSharedPdfInstance(null);
      }
      setThumbnailGenerationStarted(false);
      clearThumbnailCache(); // Clear cache when leaving/changing documents
      
      // Cancel any ongoing Web Worker operations
      thumbnailGenerationService.destroy();
    };
  }, [activeFiles, clearThumbnailCache]);

  // Clear selections when files change
  useEffect(() => {
    setSelectedPages([]);
    setCsvInput("");
    setSelectionMode(false);
  }, [activeFiles]);

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
      setSelectedPages(mergedPdfDocument.pages.map(p => p.id));
    }
  }, [mergedPdfDocument]);

  const deselectAll = useCallback(() => setSelectedPages([]), []);

  const togglePage = useCallback((pageId: string) => {
    setSelectedPages(prev =>
      prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  }, []);

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

    const pageIds: string[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= mergedPdfDocument.totalPages; i++) {
          if (i > 0) {
            const page = mergedPdfDocument.pages.find(p => p.pageNumber === i);
            if (page) pageIds.push(page.id);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= mergedPdfDocument.totalPages) {
          const page = mergedPdfDocument.pages.find(p => p.pageNumber === pageNum);
          if (page) pageIds.push(page.id);
        }
      }
    });

    return pageIds;
  }, [mergedPdfDocument]);

  const updatePagesFromCSV = useCallback(() => {
    const pageIds = parseCSVInput(csvInput);
    setSelectedPages(pageIds);
  }, [csvInput, parseCSVInput]);

  const handleDragStart = useCallback((pageId: string) => {
    setDraggedPage(pageId);

    // Check if this is a multi-page drag in selection mode
    if (selectionMode && selectedPages.includes(pageId) && selectedPages.length > 1) {
      setMultiPageDrag({
        pageIds: selectedPages,
        count: selectedPages.length
      });
    } else {
      setMultiPageDrag(null);
    }
  }, [selectionMode, selectedPages]);

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
    const pageContainer = elementUnderCursor.closest('[data-page-id]');
    if (pageContainer) {
      const pageId = pageContainer.getAttribute('data-page-id');
      if (pageId && pageId !== draggedPage) {
        setDropTarget(pageId);
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

  const handleDragEnter = useCallback((pageId: string) => {
    if (draggedPage && pageId !== draggedPage) {
      setDropTarget(pageId);
    }
  }, [draggedPage]);

  const handleDragLeave = useCallback(() => {
    // Don't clear drop target on drag leave - let dragover handle it
  }, []);

  // Create setPdfDocument wrapper for merged document
  const setPdfDocument = useCallback((updatedDoc: PDFDocument) => {
    setMergedPdfDocument(updatedDoc);
    // Return the updated document for immediate use in animations
    return updatedDoc;
  }, []);

  const animateReorder = useCallback((pageId: string, targetIndex: number) => {
    if (!mergedPdfDocument || isAnimating) return;


    // In selection mode, if the dragged page is selected, move all selected pages
    const pagesToMove = selectionMode && selectedPages.includes(pageId)
      ? selectedPages
      : [pageId];

    const originalIndex = mergedPdfDocument.pages.findIndex(p => p.id === pageId);
    if (originalIndex === -1 || originalIndex === targetIndex) return;

    setIsAnimating(true);

    // Get current positions of all pages by querying DOM directly
    const currentPositions = new Map<string, { x: number; y: number }>();
    const allCurrentElements = Array.from(document.querySelectorAll('[data-page-id]'));


    // Capture positions from actual DOM elements
    allCurrentElements.forEach((element) => {
      const pageId = element.getAttribute('data-page-id');
      if (pageId) {
        const rect = element.getBoundingClientRect();
        currentPositions.set(pageId, { x: rect.left, y: rect.top });
      }
    });


    // Execute the reorder - for multi-page, we use a different command
    if (pagesToMove.length > 1) {
      // Multi-page move - use MovePagesCommand
      const command = new MovePagesCommand(mergedPdfDocument, setPdfDocument, pagesToMove, targetIndex);
      executeCommand(command);
    } else {
      // Single page move
      const command = new ReorderPageCommand(mergedPdfDocument, setPdfDocument, pageId, targetIndex);
      executeCommand(command);
    }

    // Wait for state update and DOM to update, then get new positions and animate
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newPositions = new Map<string, { x: number; y: number }>();

          // Re-get all page elements after state update
          const allPageElements = Array.from(document.querySelectorAll('[data-page-id]'));

          allPageElements.forEach((element) => {
            const pageId = element.getAttribute('data-page-id');
            if (pageId) {
              const rect = element.getBoundingClientRect();
              newPositions.set(pageId, { x: rect.left, y: rect.top });
            }
          });

          let animationCount = 0;

          // Calculate and apply animations using DOM elements directly
          allPageElements.forEach((element) => {
            const pageId = element.getAttribute('data-page-id');
            if (!pageId) return;

            const currentPos = currentPositions.get(pageId);
            const newPos = newPositions.get(pageId);

            if (element && currentPos && newPos) {
              const deltaX = currentPos.x - newPos.x;
              const deltaY = currentPos.y - newPos.y;


              if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                animationCount++;
                const htmlElement = element as HTMLElement;
                // Apply initial transform (from new position back to old position)
                htmlElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                htmlElement.style.transition = 'none';

                // Force reflow
                htmlElement.offsetHeight;

                // Animate to final position
                htmlElement.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                htmlElement.style.transform = 'translate(0px, 0px)';
              }
            }
          });


          // Clean up after animation
          setTimeout(() => {
            const elementsToCleanup = Array.from(document.querySelectorAll('[data-page-id]'));
            elementsToCleanup.forEach((element) => {
              const htmlElement = element as HTMLElement;
              htmlElement.style.transform = '';
              htmlElement.style.transition = '';
            });
            setIsAnimating(false);
          }, 400);
        });
      });
    }, 10); // Small delay to allow state update
  }, [mergedPdfDocument, isAnimating, executeCommand, selectionMode, selectedPages, setPdfDocument]);

  const handleDrop = useCallback((e: React.DragEvent, targetPageId: string | 'end') => {
    e.preventDefault();
    if (!draggedPage || !mergedPdfDocument || draggedPage === targetPageId) return;

    let targetIndex: number;
    if (targetPageId === 'end') {
      targetIndex = mergedPdfDocument.pages.length;
    } else {
      targetIndex = mergedPdfDocument.pages.findIndex(p => p.id === targetPageId);
      if (targetIndex === -1) return;
    }

    animateReorder(draggedPage, targetIndex);

    setDraggedPage(null);
    setDropTarget(null);
    setMultiPageDrag(null);
    setDragPosition(null);

    const moveCount = multiPageDrag ? multiPageDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} pages` : 'Page'} reordered`);
  }, [draggedPage, mergedPdfDocument, animateReorder, multiPageDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedPage) {
      setDropTarget('end');
    }
  }, [draggedPage]);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!mergedPdfDocument) return;

    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode
      ? selectedPages
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new RotatePagesCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToRotate,
      rotation
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : mergedPdfDocument.pages.length;
    setStatus(`Rotated ${pageCount} pages ${direction}`);
  }, [mergedPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const handleDelete = useCallback(() => {
    if (!mergedPdfDocument) return;

    const pagesToDelete = selectionMode
      ? selectedPages
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new DeletePagesCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToDelete
    );

    executeCommand(command);
    if (selectionMode) {
      setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPages.length : mergedPdfDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [mergedPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const handleSplit = useCallback(() => {
    if (!mergedPdfDocument) return;

    const pagesToSplit = selectionMode
      ? selectedPages
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new ToggleSplitCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToSplit
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : mergedPdfDocument.pages.length;
    setStatus(`Split markers toggled for ${pageCount} pages`);
  }, [mergedPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const showExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    const exportPageIds = selectedOnly ? selectedPages : [];
    const preview = pdfExportService.getExportInfo(mergedPdfDocument, exportPageIds, selectedOnly);
    setExportPreview(preview);
    setShowExportModal(true);
  }, [mergedPdfDocument, selectedPages]);

  const handleExport = useCallback(async (selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    setExportLoading(true);
    try {
      const exportPageIds = selectedOnly ? selectedPages : [];
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
  }, [mergedPdfDocument, selectedPages, filename]);

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
    setActiveFiles([]);
    setMergedPdfDocument(null);
    setSelectedPages([]);
  }, [setActiveFiles]);

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
        selectedPages,
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
    selectedPages,
    closePdf
  ]);

  // Return early if no merged document - Homepage handles file selection
  if (!mergedPdfDocument) {
    return (
      <Center h="100vh">
        <LoadingOverlay visible={globalProcessing} />
        {globalProcessing ? (
          <Text c="dimmed">Processing PDF files...</Text>
        ) : (
          <Text c="dimmed">Waiting for PDF files...</Text>
        )}
      </Center>
    );
  }

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
      <LoadingOverlay visible={globalProcessing && !mergedPdfDocument} />


        <Box p="md" pt="xl">
          {/* Enhanced Processing Status */}
          {(globalProcessing || hasProcessingErrors) && (
            <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
              {globalProcessing && (
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Processing files...</Text>
                  <Text size="sm" c="dimmed">{Math.round(processingProgress.overall)}%</Text>
                </Group>
              )}

              {Array.from(processingStates.values()).map(state => (
                <Group key={state.fileKey} justify="space-between" mb={4}>
                  <Text size="xs">{state.fileName}</Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{state.progress}%</Text>
                    {state.error && (
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => {
                          // Show error details or retry
                          console.log('Processing error:', state.error);
                        }}
                      >
                        Error
                      </Button>
                    )}
                  </Group>
                </Group>
              ))}

              {hasProcessingErrors && (
                <Text size="xs" c="red" mt="xs">
                  Some files failed to process. Check individual file status above.
                </Text>
              )}
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
          </Group>

          {selectionMode && (
            <BulkSelectionPanel
              csvInput={csvInput}
              setCsvInput={setCsvInput}
              selectedPages={selectedPages}
              onUpdatePagesFromCSV={updatePagesFromCSV}
            />
          )}

        <DragDropGrid
          items={mergedPdfDocument.pages}
          selectedItems={selectedPages}
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
              totalPages={mergedPdfDocument.pages.length}
              originalFile={activeFiles.length === 1 ? activeFiles[0] : undefined}
              selectedPages={selectedPages}
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
              pdfDocument={mergedPdfDocument}
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
