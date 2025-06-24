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
import styles from './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './shared/DragDropGrid';
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

  // Multi-file state
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processedFiles, setProcessedFiles] = useState<Map<string, PDFDocument>>(new Map());

  // Current file references
  const currentFile = activeFiles[currentFileIndex] || null;
  const currentFileKey = currentFile ? `${currentFile.name}-${currentFile.size}` : null;
  const currentPdfDocument = currentFileKey ? processedFiles.get(currentFileKey) : null;
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
    
    // Skip if already processed
    if (processedFiles.has(fileKey)) return;

    setLoading(true);
    setError(null);

    try {
      const document = await processPDFFile(fileToProcess);
      
      // Store processed document
      setProcessedFiles(prev => new Map(prev).set(fileKey, document));
      setFilename(fileToProcess.name.replace(/\.pdf$/i, ''));
      setSelectedPages([]);
      
      // Add to activeFiles if not already there
      if (!activeFiles.some(f => f.name === fileToProcess.name && f.size === fileToProcess.size)) {
        setActiveFiles([...activeFiles, fileToProcess]);
      }

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

  // Auto-process files from activeFiles
  useEffect(() => {
    activeFiles.forEach(file => {
      const fileKey = `${file.name}-${file.size}`;
      if (!processedFiles.has(fileKey)) {
        handleFileUpload(file);
      }
    });
  }, [activeFiles, processedFiles, handleFileUpload]);

  // Reset current file index when activeFiles changes
  useEffect(() => {
    if (currentFileIndex >= activeFiles.length) {
      setCurrentFileIndex(0);
    }
  }, [activeFiles.length, currentFileIndex]);

  // Clear selections when switching files
  useEffect(() => {
    setSelectedPages([]);
    setCsvInput("");
    setSelectionMode(false);
  }, [currentFileIndex]);

  // Update filename when current file changes
  useEffect(() => {
    if (currentFile) {
      setFilename(currentFile.name.replace(/\.pdf$/i, ''));
    }
  }, [currentFile]);

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
    if (currentPdfDocument) {
      setSelectedPages(currentPdfDocument.pages.map(p => p.id));
    }
  }, [currentPdfDocument]);

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
    if (!currentPdfDocument) return [];

    const pageIds: string[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= currentPdfDocument.totalPages; i++) {
          if (i > 0) {
            const page = currentPdfDocument.pages.find(p => p.pageNumber === i);
            if (page) pageIds.push(page.id);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= currentPdfDocument.totalPages) {
          const page = currentPdfDocument.pages.find(p => p.pageNumber === pageNum);
          if (page) pageIds.push(page.id);
        }
      }
    });

    return pageIds;
  }, [currentPdfDocument]);

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

  // Create setPdfDocument wrapper for current file
  const setPdfDocument = useCallback((updatedDoc: PDFDocument) => {
    if (currentFileKey) {
      setProcessedFiles(prev => new Map(prev).set(currentFileKey, updatedDoc));
    }
  }, [currentFileKey]);

  const animateReorder = useCallback((pageId: string, targetIndex: number) => {
    if (!currentPdfDocument || isAnimating) return;

    // In selection mode, if the dragged page is selected, move all selected pages
    const pagesToMove = selectionMode && selectedPages.includes(pageId)
      ? selectedPages
      : [pageId];

    const originalIndex = currentPdfDocument.pages.findIndex(p => p.id === pageId);
    if (originalIndex === -1 || originalIndex === targetIndex) return;

    setIsAnimating(true);

    // Get current positions of all pages
    const currentPositions = new Map<string, { x: number; y: number }>();
    currentPdfDocument.pages.forEach((page) => {
      const element = pageRefs.current.get(page.id);
      if (element) {
        const rect = element.getBoundingClientRect();
        currentPositions.set(page.id, { x: rect.left, y: rect.top });
      }
    });

    // Execute the reorder - for multi-page, we use a different command
    if (pagesToMove.length > 1) {
      // Multi-page move - use MovePagesCommand
      const command = new MovePagesCommand(currentPdfDocument, setPdfDocument, pagesToMove, targetIndex);
      executeCommand(command);
    } else {
      // Single page move
      const command = new ReorderPageCommand(currentPdfDocument, setPdfDocument, pageId, targetIndex);
      executeCommand(command);
    }

    // Wait for DOM to update, then get new positions and animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const newPositions = new Map<string, { x: number; y: number }>();

        // Get the updated document from the state after command execution
        const currentDoc = currentPdfDocument; // This should be the updated version after command

        currentDoc.pages.forEach((page) => {
          const element = pageRefs.current.get(page.id);
          if (element) {
            const rect = element.getBoundingClientRect();
            newPositions.set(page.id, { x: rect.left, y: rect.top });
          }
        });

        // Calculate and apply animations
        currentDoc.pages.forEach((page) => {
          const element = pageRefs.current.get(page.id);
          const currentPos = currentPositions.get(page.id);
          const newPos = newPositions.get(page.id);

          if (element && currentPos && newPos) {
            const deltaX = currentPos.x - newPos.x;
            const deltaY = currentPos.y - newPos.y;

            // Apply initial transform (from new position back to old position)
            element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            element.style.transition = 'none';

            // Force reflow
            element.offsetHeight;

            // Animate to final position
            element.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            element.style.transform = 'translate(0px, 0px)';
          }
        });

        // Clean up after animation
        setTimeout(() => {
          currentDoc.pages.forEach((page) => {
            const element = pageRefs.current.get(page.id);
            if (element) {
              element.style.transform = '';
              element.style.transition = '';
            }
          });
          setIsAnimating(false);
        }, 400);
      });
    });
  }, [currentPdfDocument, isAnimating, executeCommand, selectionMode, selectedPages, setPdfDocument]);

  const handleDrop = useCallback((e: React.DragEvent, targetPageId: string | 'end') => {
    e.preventDefault();
    if (!draggedPage || !currentPdfDocument || draggedPage === targetPageId) return;

    let targetIndex: number;
    if (targetPageId === 'end') {
      targetIndex = currentPdfDocument.pages.length;
    } else {
      targetIndex = currentPdfDocument.pages.findIndex(p => p.id === targetPageId);
      if (targetIndex === -1) return;
    }

    animateReorder(draggedPage, targetIndex);

    setDraggedPage(null);
    setDropTarget(null);
    setMultiPageDrag(null);
    setDragPosition(null);

    const moveCount = multiPageDrag ? multiPageDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} pages` : 'Page'} reordered`);
  }, [draggedPage, currentPdfDocument, animateReorder, multiPageDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedPage) {
      setDropTarget('end');
    }
  }, [draggedPage]);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!currentPdfDocument) return;

    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode
      ? selectedPages
      : currentPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new RotatePagesCommand(
      currentPdfDocument,
      setPdfDocument,
      pagesToRotate,
      rotation
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : currentPdfDocument.pages.length;
    setStatus(`Rotated ${pageCount} pages ${direction}`);
  }, [currentPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const handleDelete = useCallback(() => {
    if (!currentPdfDocument) return;

    const pagesToDelete = selectionMode
      ? selectedPages
      : currentPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new DeletePagesCommand(
      currentPdfDocument,
      setPdfDocument,
      pagesToDelete
    );

    executeCommand(command);
    if (selectionMode) {
      setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPages.length : currentPdfDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [currentPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const handleSplit = useCallback(() => {
    if (!currentPdfDocument) return;

    const pagesToSplit = selectionMode
      ? selectedPages
      : currentPdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new ToggleSplitCommand(
      currentPdfDocument,
      setPdfDocument,
      pagesToSplit
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : currentPdfDocument.pages.length;
    setStatus(`Split markers toggled for ${pageCount} pages`);
  }, [currentPdfDocument, selectedPages, selectionMode, executeCommand, setPdfDocument]);

  const showExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!currentPdfDocument) return;

    const exportPageIds = selectedOnly ? selectedPages : [];
    const preview = pdfExportService.getExportInfo(currentPdfDocument, exportPageIds, selectedOnly);
    setExportPreview(preview);
    setShowExportModal(true);
  }, [currentPdfDocument, selectedPages]);

  const handleExport = useCallback(async (selectedOnly: boolean = false) => {
    if (!currentPdfDocument) return;

    setExportLoading(true);
    try {
      const exportPageIds = selectedOnly ? selectedPages : [];
      const errors = pdfExportService.validateExport(currentPdfDocument, exportPageIds, selectedOnly);
      if (errors.length > 0) {
        setError(errors.join(', '));
        return;
      }

      const hasSplitMarkers = currentPdfDocument.pages.some(page => page.splitBefore);

      if (hasSplitMarkers) {
        const result = await pdfExportService.exportPDF(currentPdfDocument, exportPageIds, {
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
        const result = await pdfExportService.exportPDF(currentPdfDocument, exportPageIds, {
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
  }, [currentPdfDocument, selectedPages, filename]);

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
    setCurrentFileIndex(0);
    setActiveFiles([]);
    setProcessedFiles(new Map());
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

  if (!currentPdfDocument) {
    return (
      <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={loading || pdfLoading} />

        <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileUploadSelector
            title="Select a PDF to edit"
            subtitle="Choose a file from storage or upload a new PDF"
            sharedFiles={sharedFiles}
            onFileSelect={handleFileUpload}
            allowMultiple={false}
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

      {/* File Switcher Tabs */}
      {activeFiles.length > 1 && (
        <Box p="md" pb={0} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Group gap="xs">
            {activeFiles.map((file, index) => {
              const isActive = index === currentFileIndex;

              return (
                <Button
                  key={`${file.name}-${file.size}`}
                  size="sm"
                  variant={isActive ? "filled" : "light"}
                  color={isActive ? "blue" : "gray"}
                  onClick={() => setCurrentFileIndex(index)}
                  styles={{
                    root: {
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }
                  }}
                >
                  {file.name.replace('.pdf', '')}
                </Button>
              );
            })}
          </Group>
        </Box>
      )}

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
          items={currentPdfDocument.pages}
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
              totalPages={currentPdfDocument.pages.length}
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
              pdfDocument={currentPdfDocument}
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

              {currentPdfDocument && currentPdfDocument.pages.some(p => p.splitBefore) && (
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
                    const selectedOnly = exportPreview.pageCount < (currentPdfDocument?.totalPages || 0);
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