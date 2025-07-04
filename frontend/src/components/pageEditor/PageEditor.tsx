import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileContext, useCurrentFile } from "../../contexts/FileContext";
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
    selectedPageIds,
    setSelectedPages,
    isProcessing: globalProcessing,
    processingProgress,
    clearAllFiles,
    getCurrentMergedDocument,
    setCurrentMergedDocument
  } = fileContext;

  // Use cached merged document from context instead of local state
  const [filename, setFilename] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  
  // Get merged document from cache
  const mergedPdfDocument = getCurrentMergedDocument();
  
  // Debug render performance
  console.time('PageEditor: Component render');
  
  useEffect(() => {
    console.timeEnd('PageEditor: Component render');
  });

  // Page editor state (use context for selectedPages)
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
  const convertToPageEditorFormat = useCallback((enhancedFile: EnhancedProcessedFile, fileName: string, originalFile: File): PDFDocument => {
    return {
      id: enhancedFile.id,
      name: fileName,
      file: originalFile, // Keep reference to original file for export functionality
      pages: enhancedFile.pages.map(page => ({
        ...page,
        // Ensure compatibility with existing page editor types
        splitBefore: page.splitBefore || false
      })),
      totalPages: enhancedFile.totalPages
    };
  }, []);

  // Merge multiple PDF documents into one (async to avoid blocking UI)
  const mergeAllPDFs = useCallback(async () => {
    if (activeFiles.length === 0) {
      setIsMerging(false);
      return;
    }
    
    console.time('PageEditor: mergeAllPDFs');
    
    // Check if we already have this combination cached
    const cached = getCurrentMergedDocument();
    if (cached) {
      console.log('PageEditor: Using cached merged document with', cached.pages.length, 'pages');
      setFilename(cached.name);
      setIsMerging(false);
      console.timeEnd('PageEditor: mergeAllPDFs');
      return;
    }
    
    console.log('PageEditor: Creating new merged document (not cached)');
    setIsMerging(true);

    if (activeFiles.length === 1) {
      // Single file - use processed file from context
      const processedFile = processedFiles.get(activeFiles[0]);
      if (processedFile) {
        // Defer to next frame to avoid blocking
        await new Promise(resolve => requestAnimationFrame(resolve));
        const pdfDoc = convertToPageEditorFormat(processedFile, activeFiles[0].name, activeFiles[0]);
        
        // Cache the merged document
        setCurrentMergedDocument(pdfDoc);
        setFilename(activeFiles[0].name.replace(/\.pdf$/i, ''));
      }
    } else {
      // Multiple files - merge them with chunked processing
      const allPages: PDFPage[] = [];
      let totalPages = 0;
      const filenames: string[] = [];

      // Process files in chunks to avoid blocking UI
      for (let i = 0; i < activeFiles.length; i++) {
        const file = activeFiles[i];
        const processedFile = processedFiles.get(file);
        
        if (processedFile) {
          filenames.push(file.name.replace(/\.pdf$/i, ''));
          
          // Process pages in chunks to avoid blocking
          const pages = processedFile.pages;
          const chunkSize = 50; // Process 50 pages at a time
          
          for (let j = 0; j < pages.length; j += chunkSize) {
            const chunk = pages.slice(j, j + chunkSize);
            
            chunk.forEach((page, pageIndex) => {
              const newPage: PDFPage = {
                ...page,
                id: `${i}-${page.id}`, // Unique ID across all files
                pageNumber: totalPages + j + pageIndex + 1,
                splitBefore: page.splitBefore || false
              };
              allPages.push(newPage);
            });
            
            // Yield to main thread after each chunk
            if (j + chunkSize < pages.length) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
          
          totalPages += processedFile.pages.length;
        }
        
        // Yield between files
        if (i < activeFiles.length - 1) {
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }

      if (allPages.length > 0) {
        const mergedDocument: PDFDocument = {
          id: `merged-${Date.now()}`,
          name: filenames.join(' + '),
          file: activeFiles[0], // Use first file as reference for export operations
          pages: allPages,
          totalPages: totalPages
        };

        // Cache the merged document
        setCurrentMergedDocument(mergedDocument);
        setFilename(filenames.join('_'));
      }
    }
    
    setIsMerging(false);
    console.timeEnd('PageEditor: mergeAllPDFs');
  }, [activeFiles, processedFiles]); // Removed function dependencies to prevent unnecessary re-runs

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

  // Store mergeAllPDFs in ref to avoid effect dependency
  const mergeAllPDFsRef = useRef(mergeAllPDFs);
  mergeAllPDFsRef.current = mergeAllPDFs;
  
  // Auto-merge documents when processing completes (async)
  useEffect(() => {
    const doMerge = async () => {
      console.time('PageEditor: doMerge effect');
      
      if (activeFiles.length > 0) {
        const allProcessed = activeFiles.every(file => processedFiles.has(file));

        if (allProcessed) {
          console.log('PageEditor: All files processed, calling mergeAllPDFs');
          await mergeAllPDFsRef.current();
        } else {
          console.log('PageEditor: Not all files processed yet');
        }
      } else {
        console.log('PageEditor: No active files');
      }
      
      console.timeEnd('PageEditor: doMerge effect');
    };
    
    doMerge();
  }, [activeFiles, processedFiles]); // Stable dependencies only

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
    if (!mergedPdfDocument || activeFiles.length !== 1 || thumbnailGenerationStarted) {
      return;
    }
    
    const file = activeFiles[0];
    const totalPages = mergedPdfDocument.totalPages;
    
    setThumbnailGenerationStarted(true);
    
    // Run everything asynchronously to avoid blocking the main thread
    setTimeout(async () => {
      try {
        // Load PDF array buffer for Web Workers
        const arrayBuffer = await file.arrayBuffer();
        
        // Generate all page numbers
        const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
        
        // Calculate quality scale based on file size
        const scale = activeFiles.length === 1 ? calculateScaleFromFileSize(activeFiles[0].size) : 0.2;
        
        // Start parallel thumbnail generation WITHOUT blocking the main thread
        generateThumbnails(
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
        ).catch(error => {
          console.error('Web Worker thumbnail generation failed:', error);
          setThumbnailGenerationStarted(false);
        });
        
      } catch (error) {
        console.error('Failed to start Web Worker thumbnail generation:', error);
        setThumbnailGenerationStarted(false);
      }
    }, 0); // setTimeout with 0ms to defer to next tick
  }, [mergedPdfDocument, activeFiles, thumbnailGenerationStarted, getThumbnailFromCache, addThumbnailToCache]);

  // Start thumbnail generation after document loads and UI settles
  useEffect(() => {
    if (mergedPdfDocument && !thumbnailGenerationStarted && !isMerging) {
      // Check if pages already have thumbnails from processed files
      const hasExistingThumbnails = mergedPdfDocument.pages.some(page => page.thumbnail);
      
      if (hasExistingThumbnails) {
        return; // Skip generation if thumbnails already exist
      }
      // Small delay to let document render, then start thumbnail generation
      const timer = setTimeout(startThumbnailGeneration, 500); // Reduced delay
      return () => clearTimeout(timer);
    }
  }, [mergedPdfDocument, startThumbnailGeneration, thumbnailGenerationStarted, isMerging]);

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
  }, [mergedPdfDocument, setSelectedPages]);

  const deselectAll = useCallback(() => setSelectedPages([]), [setSelectedPages]);

  const togglePage = useCallback((pageId: string) => {
    setSelectedPages(prev =>
      prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  }, [setSelectedPages]);

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
    if (selectionMode && selectedPageIds.includes(pageId) && selectedPageIds.length > 1) {
      setMultiPageDrag({
        pageIds: selectedPageIds,
        count: selectedPageIds.length
      });
    } else {
      setMultiPageDrag(null);
    }
  }, [selectionMode, selectedPageIds]);

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
    // Update the cached merged document
    setCurrentMergedDocument(updatedDoc);
    // Return the updated document for immediate use in animations
    return updatedDoc;
  }, [setCurrentMergedDocument]);

  const animateReorder = useCallback((pageId: string, targetIndex: number) => {
    if (!mergedPdfDocument || isAnimating) return;

    // In selection mode, if the dragged page is selected, move all selected pages
    const pagesToMove = selectionMode && selectedPageIds.includes(pageId)
      ? selectedPageIds
      : [pageId];

    const originalIndex = mergedPdfDocument.pages.findIndex(p => p.id === pageId);
    if (originalIndex === -1 || originalIndex === targetIndex) return;

    // Skip animation for large documents (500+ pages) to improve performance
    const isLargeDocument = mergedPdfDocument.pages.length > 500;
    
    if (isLargeDocument) {
      // For large documents, just execute the command without animation
      if (pagesToMove.length > 1) {
        const command = new MovePagesCommand(mergedPdfDocument, setPdfDocument, pagesToMove, targetIndex);
        executeCommand(command);
      } else {
        const command = new ReorderPageCommand(mergedPdfDocument, setPdfDocument, pageId, targetIndex);
        executeCommand(command);
      }
      return;
    }

    setIsAnimating(true);

    // For smaller documents, determine which pages might be affected by the move
    const startIndex = Math.min(originalIndex, targetIndex);
    const endIndex = Math.max(originalIndex, targetIndex);
    const affectedPageIds = mergedPdfDocument.pages
      .slice(Math.max(0, startIndex - 5), Math.min(mergedPdfDocument.pages.length, endIndex + 5))
      .map(p => p.id);

    // Only capture positions for potentially affected pages
    const currentPositions = new Map<string, { x: number; y: number }>();
    
    affectedPageIds.forEach(pageId => {
      const element = document.querySelector(`[data-page-id="${pageId}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        currentPositions.set(pageId, { x: rect.left, y: rect.top });
      }
    });

    // Execute the reorder command
    if (pagesToMove.length > 1) {
      const command = new MovePagesCommand(mergedPdfDocument, setPdfDocument, pagesToMove, targetIndex);
      executeCommand(command);
    } else {
      const command = new ReorderPageCommand(mergedPdfDocument, setPdfDocument, pageId, targetIndex);
      executeCommand(command);
    }

    // Animate only the affected pages
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newPositions = new Map<string, { x: number; y: number }>();

          // Get new positions only for affected pages
          affectedPageIds.forEach(pageId => {
            const element = document.querySelector(`[data-page-id="${pageId}"]`);
            if (element) {
              const rect = element.getBoundingClientRect();
              newPositions.set(pageId, { x: rect.left, y: rect.top });
            }
          });

          const elementsToAnimate: HTMLElement[] = [];

          // Apply animations only to pages that actually moved
          affectedPageIds.forEach(pageId => {
            const element = document.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement;
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
  }, [mergedPdfDocument, isAnimating, executeCommand, selectionMode, selectedPageIds, setPdfDocument]);

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
      ? selectedPageIds
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageIds.length === 0) return;

    const command = new RotatePagesCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToRotate,
      rotation
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPageIds.length : mergedPdfDocument.pages.length;
    setStatus(`Rotated ${pageCount} pages ${direction}`);
  }, [mergedPdfDocument, selectedPageIds, selectionMode, executeCommand, setPdfDocument]);

  const handleDelete = useCallback(() => {
    if (!mergedPdfDocument) return;

    const pagesToDelete = selectionMode
      ? selectedPageIds
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageIds.length === 0) return;

    const command = new DeletePagesCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToDelete
    );

    executeCommand(command);
    if (selectionMode) {
      setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPageIds.length : mergedPdfDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [mergedPdfDocument, selectedPageIds, selectionMode, executeCommand, setPdfDocument, setSelectedPages]);

  const handleSplit = useCallback(() => {
    if (!mergedPdfDocument) return;

    const pagesToSplit = selectionMode
      ? selectedPageIds
      : mergedPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPageIds.length === 0) return;

    const command = new ToggleSplitCommand(
      mergedPdfDocument,
      setPdfDocument,
      pagesToSplit
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPageIds.length : mergedPdfDocument.pages.length;
    setStatus(`Split markers toggled for ${pageCount} pages`);
  }, [mergedPdfDocument, selectedPageIds, selectionMode, executeCommand, setPdfDocument]);

  const showExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    const exportPageIds = selectedOnly ? selectedPageIds : [];
    const preview = pdfExportService.getExportInfo(mergedPdfDocument, exportPageIds, selectedOnly);
    setExportPreview(preview);
    setShowExportModal(true);
  }, [mergedPdfDocument, selectedPageIds]);

  const handleExport = useCallback(async (selectedOnly: boolean = false) => {
    if (!mergedPdfDocument) return;

    setExportLoading(true);
    try {
      const exportPageIds = selectedOnly ? selectedPageIds : [];
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
  }, [mergedPdfDocument, selectedPageIds, filename]);

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
    clearAllFiles(); // This now handles all cleanup centrally (including merged docs)
    setSelectedPages([]);
  }, [clearAllFiles, setSelectedPages]);

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
        selectedPages: selectedPageIds,
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
    selectedPageIds,
    closePdf
  ]);

  // Show loading or empty state instead of blocking
  const showLoading = !mergedPdfDocument && (globalProcessing || isMerging || activeFiles.length > 0);
  const showEmpty = !mergedPdfDocument && !globalProcessing && !isMerging && activeFiles.length === 0;
  
  // For large documents, implement pagination to avoid rendering too many components
  const isLargeDocument = mergedPdfDocument && mergedPdfDocument.pages.length > 200;
  const [currentPageRange, setCurrentPageRange] = useState({ start: 0, end: 200 });
  
  // Reset pagination when document changes
  useEffect(() => {
    setCurrentPageRange({ start: 0, end: 200 });
  }, [mergedPdfDocument]);
  
  const displayedPages = isLargeDocument 
    ? mergedPdfDocument.pages.slice(currentPageRange.start, currentPageRange.end)
    : mergedPdfDocument?.pages || [];

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
                {isMerging ? "Merging PDF documents..." : "Processing PDF files..."}
              </Text>
              <Text size="sm" c="dimmed">
                {isMerging ? "" : `${Math.round(processingProgress || 0)}%`}
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

      {mergedPdfDocument && (
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
          </Group>

          {selectionMode && (
            <BulkSelectionPanel
              csvInput={csvInput}
              setCsvInput={setCsvInput}
              selectedPages={selectedPageIds}
              onUpdatePagesFromCSV={updatePagesFromCSV}
            />
          )}

        {isLargeDocument && (
          <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Large document detected ({mergedPdfDocument.pages.length} pages)</Text>
              <Group gap="xs">
                <Button 
                  size="xs" 
                  variant="light"
                  disabled={currentPageRange.start === 0}
                  onClick={() => setCurrentPageRange(prev => ({
                    start: Math.max(0, prev.start - 200),
                    end: Math.max(200, prev.end - 200)
                  }))}
                >
                  Previous 200
                </Button>
                <Text size="xs" c="dimmed">
                  {currentPageRange.start + 1}-{Math.min(currentPageRange.end, mergedPdfDocument.pages.length)} of {mergedPdfDocument.pages.length}
                </Text>
                <Button 
                  size="xs" 
                  variant="light"
                  disabled={currentPageRange.end >= mergedPdfDocument.pages.length}
                  onClick={() => setCurrentPageRange(prev => ({
                    start: prev.start + 200,
                    end: Math.min(mergedPdfDocument.pages.length, prev.end + 200)
                  }))}
                >
                  Next 200
                </Button>
              </Group>
            </Group>
          </Box>
        )}
        
        <DragDropGrid
          items={displayedPages}
          selectedItems={selectedPageIds}
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
              selectedPages={selectedPageIds}
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
