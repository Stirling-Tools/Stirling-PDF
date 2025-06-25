import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, FileInput, LoadingOverlay, Modal, Alert, Container,
  Stack, Group, Paper, SimpleGrid
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { usePDFProcessor } from "../../hooks/usePDFProcessor";
import { PDFDocument, PDFPage } from "../../types/pageEditor";
import { fileStorage } from "../../services/fileStorage";
import { generateThumbnailForFile } from "../../utils/thumbnailUtils";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import {
  RotatePagesCommand,
  DeletePagesCommand,
  ReorderPageCommand,
  MovePagesCommand,
  ToggleSplitCommand
} from "../../commands/pageCommands";
import { pdfExportService } from "../../services/pdfExportService";
import styles from './pageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './DragDropGrid';
import FilePickerModal from '../shared/FilePickerModal';
import FileUploadSelector from '../shared/FileUploadSelector';

export interface PageEditorProps {
  activeFiles: File[];
  setActiveFiles: (files: File[]) => void;
  downloadUrl?: string | null;
  setDownloadUrl?: (url: string | null) => void;
  sharedFiles?: any[]; // For FileUploadSelector when no files loaded

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
  downloadUrl,
  setDownloadUrl,
  sharedFiles = [],
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();
  const { processPDFFile, loading: pdfLoading } = usePDFProcessor();

  // Single merged document state
  const [mergedPdfDocument, setMergedPdfDocument] = useState<PDFDocument | null>(null);
  const [processedFiles, setProcessedFiles] = useState<Map<string, PDFDocument>>(new Map());
  const [filename, setFilename] = useState<string>("");

  // Page editor state
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Process uploaded file
  const handleFileUpload = useCallback(async (uploadedFile: File | any) => {
    if (!uploadedFile) {
      setError('No file provided');
      return;
    }

    let fileToProcess: File;

    // Handle FileWithUrl objects from storage
    if (uploadedFile.storedInIndexedDB && uploadedFile.arrayBuffer) {
      try {
        console.log('Converting FileWithUrl to File:', uploadedFile.name);
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: uploadedFile.type || 'application/pdf' });
        fileToProcess = new File([blob], uploadedFile.name, {
          type: uploadedFile.type || 'application/pdf',
          lastModified: uploadedFile.lastModified || Date.now()
        });
      } catch (error) {
        console.error('Error converting FileWithUrl:', error);
        setError('Unable to load file from storage');
        return;
      }
    } else if (uploadedFile instanceof File) {
      fileToProcess = uploadedFile;
    } else {
      setError('Invalid file object');
      console.error('handleFileUpload received unsupported object:', uploadedFile);
      return;
    }

    if (fileToProcess.type !== 'application/pdf') {
      setError('Please upload a valid PDF file');
      return;
    }

    const fileKey = `${fileToProcess.name}-${fileToProcess.size}`;

    // Skip processing if already processed
    if (processedFiles.has(fileKey)) return;

    setLoading(true);
    setError(null);

    try {
      const document = await processPDFFile(fileToProcess);

      // Store processed document
      setProcessedFiles(prev => new Map(prev).set(fileKey, document));
      setFilename(fileToProcess.name.replace(/\.pdf$/i, ''));
      setSelectedPages([]);


      if (document.pages.length > 0) {
        // Only store if it's a new file (not from storage)
        if (!uploadedFile.storedInIndexedDB) {
          const thumbnail = await generateThumbnailForFile(fileToProcess);
          await fileStorage.storeFile(fileToProcess, thumbnail);
        }
      }

      setStatus(`PDF loaded successfully with ${document.totalPages} pages`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process PDF';
      setError(errorMessage);
      console.error('PDF processing error:', err);
    } finally {
      setLoading(false);
    }
  }, [processPDFFile, activeFiles, setActiveFiles, processedFiles]);

  // Process multiple uploaded files - just add them to activeFiles like FileManager does
  const handleMultipleFileUpload = useCallback((uploadedFiles: File[]) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      setError('No files provided');
      return;
    }

    // Simply set the activeFiles to the selected files (same as FileManager approach)
    setActiveFiles(uploadedFiles);
  }, []);

  // Merge multiple PDF documents into one
  const mergeAllPDFs = useCallback(() => {
    if (activeFiles.length === 0) {
      setMergedPdfDocument(null);
      return;
    }

    if (activeFiles.length === 1) {
      // Single file - use it directly
      const fileKey = `${activeFiles[0].name}-${activeFiles[0].size}`;
      const pdfDoc = processedFiles.get(fileKey);
      if (pdfDoc) {
        setMergedPdfDocument(pdfDoc);
        setFilename(activeFiles[0].name.replace(/\.pdf$/i, ''));
      }
    } else {
      // Multiple files - merge them
      const allPages: PDFPage[] = [];
      let totalPages = 0;
      const filenames: string[] = [];

      activeFiles.forEach((file, fileIndex) => {
        const fileKey = `${file.name}-${file.size}`;
        const pdfDoc = processedFiles.get(fileKey);
        if (pdfDoc) {
          filenames.push(file.name.replace(/\.pdf$/i, ''));
          pdfDoc.pages.forEach((page, pageIndex) => {
            // Create new page with updated IDs and page numbers for merged document
            const newPage: PDFPage = {
              ...page,
              id: `${fileIndex}-${page.id}`, // Unique ID across all files
              pageNumber: totalPages + pageIndex + 1,
              sourceFile: file.name // Track which file this page came from
            };
            allPages.push(newPage);
          });
          totalPages += pdfDoc.pages.length;
        }
      });

      const mergedDocument: PDFDocument = {
        pages: allPages,
        totalPages: totalPages,
        title: filenames.join(' + '),
        metadata: {
          title: filenames.join(' + '),
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
        }
      };

      setMergedPdfDocument(mergedDocument);
      setFilename(filenames.join('_'));
    }
  }, [activeFiles, processedFiles]);

  // Auto-process files from activeFiles
  useEffect(() => {
    console.log('Auto-processing effect triggered:', {
      activeFilesCount: activeFiles.length,
      processedFilesCount: processedFiles.size,
      activeFileNames: activeFiles.map(f => f.name)
    });
    
    activeFiles.forEach(file => {
      const fileKey = `${file.name}-${file.size}`;
      console.log(`Checking file ${file.name}: processed =`, processedFiles.has(fileKey));
      if (!processedFiles.has(fileKey)) {
        console.log('Processing file:', file.name);
        handleFileUpload(file);
      }
    });
  }, [activeFiles, processedFiles, handleFileUpload]);

  // Merge multiple PDF documents into one when all files are processed
  useEffect(() => {
    if (activeFiles.length > 0) {
      const allProcessed = activeFiles.every(file => {
        const fileKey = `${file.name}-${file.size}`;
        return processedFiles.has(fileKey);
      });

      if (allProcessed && activeFiles.length > 0) {
        mergeAllPDFs();
      }
    }
  }, [activeFiles, processedFiles, mergeAllPDFs]);

  // Clear selections when files change
  useEffect(() => {
    setSelectedPages([]);
    setCsvInput("");
    setSelectionMode(false);
  }, [activeFiles]);

  // Global drag cleanup to handle drops outside valid areas
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      // Clean up drag state when drag operation ends anywhere
      setDraggedPage(null);
      setDropTarget(null);
      setMultiPageDrag(null);
      setDragPosition(null);
    };

    const handleGlobalDrop = (e: DragEvent) => {
      // Prevent default to avoid browser navigation on invalid drops
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
    setProcessedFiles(new Map());
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

  if (!mergedPdfDocument) {
    return (
      <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={loading || pdfLoading} />

        <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileUploadSelector
            title="Select PDFs to edit"
            subtitle="Choose files from storage or upload PDFs - multiple files will be merged"
            sharedFiles={sharedFiles}
            onFilesSelect={handleMultipleFileUpload}
            accept={["application/pdf"]}
            loading={loading || pdfLoading}
          />
        </Container>
      </Box>
    );
  }

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
      <LoadingOverlay visible={loading || pdfLoading} />


        <Box p="md" pt="xl">
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

        <FileInput
          ref={fileInputRef}
          accept="application/pdf"
          onChange={(file) => file && handleFileUpload(file)}
          style={{ display: 'none' }}
        />

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
            style={{ position: 'fixed', bottom: 70, right: 20, zIndex: 1000 }}
          >
            {error}
          </Notification>
        )}

      </Box>
  );
};

export default PageEditor;
