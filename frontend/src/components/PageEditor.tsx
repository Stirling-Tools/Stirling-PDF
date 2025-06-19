import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, FileInput, LoadingOverlay, Modal, Alert, Container,
  Stack, Group, Paper, SimpleGrid
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AddIcon from "@mui/icons-material/Add";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DownloadIcon from "@mui/icons-material/Download";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ConstructionIcon from "@mui/icons-material/Construction";
import EventListIcon from "@mui/icons-material/EventList";
import DeselectIcon from "@mui/icons-material/Deselect";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import { usePDFProcessor } from "../hooks/usePDFProcessor";
import { PDFDocument, PDFPage } from "../types/pageEditor";
import { fileStorage } from "../services/fileStorage";
import { generateThumbnailForFile } from "../utils/thumbnailUtils";
import { useUndoRedo } from "../hooks/useUndoRedo";
import {
  RotatePagesCommand,
  DeletePagesCommand,
  ReorderPageCommand,
  MovePagesCommand,
  ToggleSplitCommand
} from "../commands/pageCommands";
import { pdfExportService } from "../services/pdfExportService";

export interface PageEditorProps {
  file: { file: File; url: string } | null;
  setFile?: (file: { file: File; url: string } | null) => void;
  downloadUrl?: string | null;
  setDownloadUrl?: (url: string | null) => void;
  
  // Optional callbacks to expose internal functions
  onFunctionsReady?: (functions: {
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleRotate: (direction: 'left' | 'right') => void;
    handleDelete: () => void;
    handleSplit: () => void;
    showExportPreview: (selectedOnly: boolean) => void;
    exportLoading: boolean;
    selectionMode: boolean;
    selectedPages: string[];
    closePdf: () => void;
  }) => void;
}

const PageEditor = ({
  file,
  setFile,
  downloadUrl,
  setDownloadUrl,
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();
  const { processPDFFile, loading: pdfLoading } = usePDFProcessor();

  const [pdfDocument, setPdfDocument] = useState<PDFDocument | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [filename, setFilename] = useState<string>("");
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [multiPageDrag, setMultiPageDrag] = useState<{pageIds: string[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPreview, setExportPreview] = useState<{pageCount: number; splitCount: number; estimatedSize: string} | null>(null);
  const [movingPage, setMovingPage] = useState<string | null>(null);
  const [pagePositions, setPagePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [isAnimating, setIsAnimating] = useState(false);
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<() => void>(null);

  // Undo/Redo system
  const { executeCommand, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Process uploaded file
  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    if (!uploadedFile || uploadedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const document = await processPDFFile(uploadedFile);
      setPdfDocument(document);
      setFilename(uploadedFile.name.replace(/\.pdf$/i, ''));
      setSelectedPages([]);

      if (document.pages.length > 0) {
        const thumbnail = await generateThumbnailForFile(uploadedFile);
        await fileStorage.storeFile(uploadedFile, thumbnail);
      }

      if (setFile) {
        const fileUrl = URL.createObjectURL(uploadedFile);
        setFile({ file: uploadedFile, url: fileUrl });
      }

      setStatus(`PDF loaded successfully with ${document.totalPages} pages`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process PDF';
      setError(errorMessage);
      console.error('PDF processing error:', err);
    } finally {
      setLoading(false);
    }
  }, [processPDFFile, setFile]);

  useEffect(() => {
    if (file?.file && !pdfDocument) {
      handleFileUpload(file.file);
    }
  }, [file, pdfDocument, handleFileUpload]);

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
    if (pdfDocument) {
      setSelectedPages(pdfDocument.pages.map(p => p.id));
    }
  }, [pdfDocument]);

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
    if (!pdfDocument) return [];

    const pageIds: string[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= pdfDocument.totalPages; i++) {
          if (i > 0) {
            const page = pdfDocument.pages.find(p => p.pageNumber === i);
            if (page) pageIds.push(page.id);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= pdfDocument.totalPages) {
          const page = pdfDocument.pages.find(p => p.pageNumber === pageNum);
          if (page) pageIds.push(page.id);
        }
      }
    });

    return pageIds;
  }, [pdfDocument]);

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

  const animateReorder = useCallback((pageId: string, targetIndex: number) => {
    if (!pdfDocument || isAnimating) return;

    // In selection mode, if the dragged page is selected, move all selected pages
    const pagesToMove = selectionMode && selectedPages.includes(pageId)
      ? selectedPages
      : [pageId];

    const originalIndex = pdfDocument.pages.findIndex(p => p.id === pageId);
    if (originalIndex === -1 || originalIndex === targetIndex) return;

    setIsAnimating(true);

    // Get current positions of all pages
    const currentPositions = new Map<string, { x: number; y: number }>();
    pdfDocument.pages.forEach((page) => {
      const element = pageRefs.current.get(page.id);
      if (element) {
        const rect = element.getBoundingClientRect();
        currentPositions.set(page.id, { x: rect.left, y: rect.top });
      }
    });

    // Execute the reorder - for multi-page, we use a different command
    if (pagesToMove.length > 1) {
      // Multi-page move - use MovePagesCommand
      const command = new MovePagesCommand(pdfDocument, setPdfDocument, pagesToMove, targetIndex);
      executeCommand(command);
    } else {
      // Single page move
      const command = new ReorderPageCommand(pdfDocument, setPdfDocument, pageId, targetIndex);
      executeCommand(command);
    }

    // Wait for DOM to update, then get new positions and animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const newPositions = new Map<string, { x: number; y: number }>();

        // Get the updated document from the state after command execution
        // The command has already updated the document, so we need to get the new order
        const currentDoc = pdfDocument; // This should be the updated version after command

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
  }, [pdfDocument, isAnimating, executeCommand, selectionMode, selectedPages]);

  const handleDrop = useCallback((e: React.DragEvent, targetPageId: string | 'end') => {
    e.preventDefault();
    if (!draggedPage || !pdfDocument || draggedPage === targetPageId) return;

    let targetIndex: number;
    if (targetPageId === 'end') {
      targetIndex = pdfDocument.pages.length;
    } else {
      targetIndex = pdfDocument.pages.findIndex(p => p.id === targetPageId);
      if (targetIndex === -1) return;
    }

    animateReorder(draggedPage, targetIndex);

    setDraggedPage(null);
    setDropTarget(null);
    setMultiPageDrag(null);
    setDragPosition(null);

    const moveCount = multiPageDrag ? multiPageDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} pages` : 'Page'} reordered`);
  }, [draggedPage, pdfDocument, animateReorder, multiPageDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedPage) {
      setDropTarget('end');
    }
  }, [draggedPage]);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!pdfDocument) return;

    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode
      ? selectedPages
      : pdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new RotatePagesCommand(
      pdfDocument,
      setPdfDocument,
      pagesToRotate,
      rotation
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : pdfDocument.pages.length;
    setStatus(`Rotated ${pageCount} pages ${direction}`);
  }, [pdfDocument, selectedPages, selectionMode, executeCommand]);

  const handleDelete = useCallback(() => {
    if (!pdfDocument) return;

    const pagesToDelete = selectionMode
      ? selectedPages
      : pdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new DeletePagesCommand(
      pdfDocument,
      setPdfDocument,
      pagesToDelete
    );

    executeCommand(command);
    if (selectionMode) {
      setSelectedPages([]);
    }
    const pageCount = selectionMode ? selectedPages.length : pdfDocument.pages.length;
    setStatus(`Deleted ${pageCount} pages`);
  }, [pdfDocument, selectedPages, selectionMode, executeCommand]);

  const handleSplit = useCallback(() => {
    if (!pdfDocument) return;

    const pagesToSplit = selectionMode
      ? selectedPages
      : pdfDocument.pages.map(p => p.id);

    if (selectionMode && selectedPages.length === 0) return;

    const command = new ToggleSplitCommand(
      pdfDocument,
      setPdfDocument,
      pagesToSplit
    );

    executeCommand(command);
    const pageCount = selectionMode ? selectedPages.length : pdfDocument.pages.length;
    setStatus(`Split markers toggled for ${pageCount} pages`);
  }, [pdfDocument, selectedPages, selectionMode, executeCommand]);

  const showExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!pdfDocument) return;

    const exportPageIds = selectedOnly ? selectedPages : [];
    const preview = pdfExportService.getExportInfo(pdfDocument, exportPageIds, selectedOnly);
    setExportPreview(preview);
    setShowExportModal(true);
  }, [pdfDocument, selectedPages]);

  const handleExport = useCallback(async (selectedOnly: boolean = false) => {
    if (!pdfDocument) return;

    setExportLoading(true);
    try {
      const exportPageIds = selectedOnly ? selectedPages : [];
      const errors = pdfExportService.validateExport(pdfDocument, exportPageIds, selectedOnly);
      if (errors.length > 0) {
        setError(errors.join(', '));
        return;
      }

      const hasSplitMarkers = pdfDocument.pages.some(page => page.splitBefore);

      if (hasSplitMarkers) {
        const result = await pdfExportService.exportPDF(pdfDocument, exportPageIds, {
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
        const result = await pdfExportService.exportPDF(pdfDocument, exportPageIds, {
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
  }, [pdfDocument, selectedPages, filename]);

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
    setPdfDocument(null);
    setFile && setFile(null);
  }, [setFile]);

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
        showExportPreview,
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
    exportLoading, 
    selectionMode, 
    selectedPages, 
    closePdf
  ]);

  if (!pdfDocument) {
    return (
      <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={loading || pdfLoading} />

        <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

            <Dropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              accept={["application/pdf"]}
              multiple={false}
              h="60vh"
              style={{ minHeight: 400 }}
            >
              <Center h="100%">
                <Stack align="center" gap="md">
                  <UploadFileIcon style={{ fontSize: 64 }} />
                  <Text size="xl" fw={500}>
                    Drop a PDF file here or click to upload
                  </Text>
                  <Text size="md" c="dimmed">
                    Supports PDF files only
                  </Text>
                </Stack>
              </Center>
            </Dropzone>
        </Container>
      </Box>
    );
  }

  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
      <style>
        {`
          .page-container:hover .page-number {
            opacity: 1 !important;
          }
          .page-container:hover .page-hover-controls {
            opacity: 1 !important;
          }
          .page-container {
            transition: transform 0.2s ease-in-out;
          }
          .page-container:hover {
            transform: scale(1.02);
          }
          .checkbox-container {
            transform: none !important;
            transition: none !important;
          }
          .page-move-animation {
            transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .page-moving {
            z-index: 10;
            transform: scale(1.05);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          }

          .multi-drag-indicator {
            position: fixed;
            background: rgba(59, 130, 246, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            pointer-events: none;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transform: translate(-50%, -50%);
            backdrop-filter: blur(4px);
          }

          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
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
            <Paper p="md" mb="md" withBorder>
              <Group>
                <TextInput
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder="1,3,5-10"
                  label="Page Selection"
                  onBlur={updatePagesFromCSV}
                  onKeyDown={(e) => e.key === 'Enter' && updatePagesFromCSV()}
                  style={{ flex: 1 }}
                />
                <Button onClick={updatePagesFromCSV} mt="xl">
                  Apply
                </Button>
              </Group>
              {selectedPages.length > 0 && (
                <Text size="sm" c="dimmed" mt="sm">
                  Selected: {selectedPages.length} pages
                </Text>
              )}
            </Paper>
          )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            justifyContent: 'flex-start',
            paddingBottom: '100px' // Add space for floating control bar
          }}
        >
          {pdfDocument.pages.map((page, index) => (
            <React.Fragment key={page.id}>
              {page.splitBefore && index > 0 && (
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
              <div
                ref={(el) => {
                  if (el) {
                    pageRefs.current.set(page.id, el);
                  } else {
                    pageRefs.current.delete(page.id);
                  }
                }}
                data-page-id={page.id}
                className={`
        !rounded-lg
        cursor-grab
        select-none
        w-[20rem]
        h-[20rem]
        flex items-center justify-center
        flex-shrink-0
        shadow-sm
        hover:shadow-md
        transition-all
        relative
              ${selectionMode
          ? 'bg-white hover:bg-gray-50'
          : 'bg-white hover:bg-gray-50'}
              ${draggedPage === page.id ? 'opacity-50 scale-95' : ''}
              ${movingPage === page.id ? 'page-moving' : ''}
      `}
              style={{
                transform: (() => {
                  // Only apply drop target indication during drag
                  if (!isAnimating && draggedPage && page.id !== draggedPage && dropTarget === page.id) {
                    return 'translateX(20px)';
                  }
                  return 'translateX(0)';
                })(),
                transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out'
              }}
              draggable
              onDragStart={() => handleDragStart(page.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(page.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, page.id)}
            >
              {/* Selection mode checkbox - positioned outside page-container to avoid transform inheritance */}
              {selectionMode && (
                <div
                  className="checkbox-container"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 4,
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    padding: '2px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    pointerEvents: 'auto' // Ensure checkbox can be clicked
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); // Prevent drag from starting
                  }}
                  onDragStart={(e) => {
                    e.preventDefault(); // Prevent drag on checkbox
                    e.stopPropagation();
                  }}
                >
                  <Checkbox
                    checked={selectedPages.includes(page.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      togglePage(page.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    size="sm"
                  />
                </div>
              )}

              <div className="page-container w-[90%] h-[90%]">
                {/* Image wrapper with simulated border */}
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'var(--mantine-color-gray-1)',
                    borderRadius: 6,
                    border: '1px solid var(--mantine-color-gray-3)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <img
                    src={page.thumbnail}
                    alt={`Page ${page.pageNumber}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 2,
                      transform: `rotate(${page.rotation}deg)`,
                      transition: 'transform 0.3s ease-in-out'
                    }}
                  />
                </div>

                {/* Page number overlay - shows on hover */}
                <Text
                  className="page-number"
                  size="sm"
                  fw={500}
                  c="white"
                  style={{
                    position: 'absolute',
                    top: 5,
                    left: 5,
                    background: 'rgba(162, 201, 255, 0.8)',
                    padding: '6px 8px',
                    borderRadius: 8,
                    zIndex: 2,
                    opacity: 0,
                    transition: 'opacity 0.2s ease-in-out'
                  }}
                >
                  {page.pageNumber}
                </Text>

                {/* Hover controls */}
                <div
                  className="page-hover-controls"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.8)',
                    padding: '6px 12px',
                    borderRadius: 20,
                    opacity: 0,
                    transition: 'opacity 0.2s ease-in-out',
                    zIndex: 3,
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Tooltip label="Move Left">
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      c="white"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (index > 0 && !movingPage && !isAnimating) {
                          setMovingPage(page.id);
                          animateReorder(page.id, index - 1);
                          setTimeout(() => setMovingPage(null), 500);
                          setStatus(`Moved page ${page.pageNumber} left`);
                        }
                      }}
                    >
                      <ArrowBackIcon style={{ fontSize: 20 }} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Move Right">
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      c="white"
                      disabled={index === pdfDocument.pages.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (index < pdfDocument.pages.length - 1 && !movingPage && !isAnimating) {
                          setMovingPage(page.id);
                          animateReorder(page.id, index + 1);
                          setTimeout(() => setMovingPage(null), 500);
                          setStatus(`Moved page ${page.pageNumber} right`);
                        }
                      }}
                    >
                      <ArrowForwardIcon style={{ fontSize: 20 }} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Rotate Left">
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      c="white"
                      onClick={(e) => {
                        e.stopPropagation();
                        const command = new RotatePagesCommand(
                          pdfDocument,
                          setPdfDocument,
                          [page.id],
                          -90
                        );
                        executeCommand(command);
                        setStatus(`Rotated page ${page.pageNumber} left`);
                      }}
                    >
                      <RotateLeftIcon style={{ fontSize: 20 }} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Rotate Right">
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      c="white"
                      onClick={(e) => {
                        e.stopPropagation();
                        const command = new RotatePagesCommand(
                          pdfDocument,
                          setPdfDocument,
                          [page.id],
                          90
                        );
                        executeCommand(command);
                        setStatus(`Rotated page ${page.pageNumber} right`);
                      }}
                    >
                      <RotateRightIcon style={{ fontSize: 20 }} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Delete Page">
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      c="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        const command = new DeletePagesCommand(
                          pdfDocument,
                          setPdfDocument,
                          [page.id]
                        );
                        executeCommand(command);
                        setStatus(`Deleted page ${page.pageNumber}`);
                      }}
                    >
                      <DeleteIcon style={{ fontSize: 20 }} />
                    </ActionIcon>
                  </Tooltip>

                  {index > 0 && (
                    <Tooltip label="Split Here">
                      <ActionIcon
                        size="md"
                        variant="subtle"
                        c="white"
                        onClick={(e) => {
                          e.stopPropagation();
                          const command = new ToggleSplitCommand(
                            pdfDocument,
                            setPdfDocument,
                            [page.id]
                          );
                          executeCommand(command);
                          setStatus(`Split marker toggled for page ${page.pageNumber}`);
                        }}
                      >
                        <ContentCutIcon style={{ fontSize: 20 }} />
                      </ActionIcon>
                    </Tooltip>
                  )}

                </div>

                <DragIndicatorIcon
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    color: 'rgba(0,0,0,0.3)',
                    fontSize: 16,
                    zIndex: 1
                  }}
                />
              </div>
            </div>
            </React.Fragment>
          ))}

          {/* Landing zone at the end */}
          <div className="w-[20rem] h-[20rem] flex items-center justify-center flex-shrink-0">
            <div
              data-drop-zone="end"
              className={`cursor-pointer select-none w-[15rem] h-[15rem] flex items-center justify-center flex-shrink-0 shadow-sm hover:shadow-md transition-all relative ${dropTarget === 'end' ? 'ring-2 ring-green-500 bg-green-50' : 'bg-white hover:bg-blue-50 border-2 border-dashed border-gray-300 hover:border-blue-400'}`}
              style={{
                borderRadius: '12px'
              }}
              onDragOver={handleDragOver}
              onDragEnter={handleEndZoneDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'end')}
            >
              <Text c="dimmed" size="sm" ta="center" fw={500}>
                Drop here to<br />move to end
              </Text>
            </div>
          </div>
        </div>


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

              {pdfDocument && pdfDocument.pages.some(p => p.splitBefore) && (
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
                    const selectedOnly = exportPreview.pageCount < (pdfDocument?.totalPages || 0);
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

        {/* Multi-page drag indicator */}
        {multiPageDrag && dragPosition && (
          <div
            className="multi-drag-indicator"
            style={{
              left: dragPosition.x,
              top: dragPosition.y,
            }}
          >
            {multiPageDrag.count} pages
          </div>
        )}
      </Box>
  );
};

export default PageEditor;
