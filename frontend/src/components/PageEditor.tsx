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
import { usePDFProcessor } from "../hooks/usePDFProcessor";
import { PDFDocument, PDFPage } from "../types/pageEditor";
import { fileStorage } from "../services/fileStorage";
import { generateThumbnailForFile } from "../utils/thumbnailUtils";
import { useUndoRedo } from "../hooks/useUndoRedo";
import {
  RotatePagesCommand,
  DeletePagesCommand,
  ReorderPageCommand,
  ToggleSplitCommand
} from "../commands/pageCommands";
import { pdfExportService } from "../services/pdfExportService";

export interface PageEditorProps {
  file: { file: File; url: string } | null;
  setFile?: (file: { file: File; url: string } | null) => void;
  downloadUrl?: string | null;
  setDownloadUrl?: (url: string | null) => void;
}

const PageEditor: React.FC<PageEditorProps> = ({
  file,
  setFile,
  downloadUrl,
  setDownloadUrl,
}) => {
  const { t } = useTranslation();
  const { processPDFFile, loading: pdfLoading } = usePDFProcessor();

  const [pdfDocument, setPdfDocument] = useState<PDFDocument | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>("");
  const [showPageSelect, setShowPageSelect] = useState(false);
  const [filename, setFilename] = useState<string>("");
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPreview, setExportPreview] = useState<{pageCount: number; splitCount: number; estimatedSize: string} | null>(null);
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
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedPage) return;
    
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
  }, [draggedPage]);

  const handleDragEnter = useCallback((pageId: string) => {
    if (draggedPage && pageId !== draggedPage) {
      setDropTarget(pageId);
    }
  }, [draggedPage]);

  const handleDragLeave = useCallback(() => {
    // Don't clear drop target on drag leave - let dragover handle it
  }, []);

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

    const command = new ReorderPageCommand(
      pdfDocument,
      setPdfDocument,
      draggedPage,
      targetIndex
    );

    executeCommand(command);
    setDraggedPage(null);
    setDropTarget(null);
    setStatus('Page reordered');
  }, [draggedPage, pdfDocument, executeCommand]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedPage) {
      setDropTarget('end');
    }
  }, [draggedPage]);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!pdfDocument || selectedPages.length === 0) return;

    const rotation = direction === 'left' ? -90 : 90;
    const command = new RotatePagesCommand(
      pdfDocument,
      setPdfDocument,
      selectedPages,
      rotation
    );

    executeCommand(command);
    setStatus(`Rotated ${selectedPages.length} pages ${direction}`);
  }, [pdfDocument, selectedPages, executeCommand]);

  const handleDelete = useCallback(() => {
    if (!pdfDocument || selectedPages.length === 0) return;

    const command = new DeletePagesCommand(
      pdfDocument,
      setPdfDocument,
      selectedPages
    );

    executeCommand(command);
    setSelectedPages([]);
    setStatus(`Deleted ${selectedPages.length} pages`);
  }, [pdfDocument, selectedPages, executeCommand]);

  const handleSplit = useCallback(() => {
    if (!pdfDocument || selectedPages.length === 0) return;

    const command = new ToggleSplitCommand(
      pdfDocument,
      setPdfDocument,
      selectedPages
    );

    executeCommand(command);
    setStatus(`Split markers toggled for ${selectedPages.length} pages`);
  }, [pdfDocument, selectedPages, executeCommand]);

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

  if (!pdfDocument) {
    return (
      <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={loading || pdfLoading} />

        <Box p="xl">
          {error && (
            <Alert color="red" mb="md" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

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
        </Box>
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

        <Box p="md">
          <Group mb="md">
            <TextInput
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename"
              style={{ minWidth: 200 }}
            />
            <Button onClick={() => setShowPageSelect(!showPageSelect)}>
              Select Pages
            </Button>
            <Button onClick={selectAll}>Select All</Button>
            <Button onClick={deselectAll}>Deselect All</Button>
          </Group>

        {showPageSelect && (
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

        <Group mb="md">
          <Tooltip label="Undo">
            <ActionIcon onClick={handleUndo} disabled={!canUndo}>
              <UndoIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Redo">
            <ActionIcon onClick={handleRedo} disabled={!canRedo}>
              <RedoIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Rotate Left">
            <ActionIcon onClick={() => handleRotate('left')} disabled={selectedPages.length === 0}>
              <RotateLeftIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Rotate Right">
            <ActionIcon onClick={() => handleRotate('right')} disabled={selectedPages.length === 0}>
              <RotateRightIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon onClick={handleDelete} disabled={selectedPages.length === 0} color="red">
              <DeleteIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Split">
            <ActionIcon onClick={handleSplit} disabled={selectedPages.length === 0}>
              <ContentCutIcon />
            </ActionIcon>
          </Tooltip>
        </Group>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            justifyContent: 'flex-start'
          }}
        >
          {pdfDocument.pages.map((page, index) => (
            <React.Fragment key={page.id}>
              {page.splitBefore && index > 0 && (
                <div
                  style={{
                    width: '4px',
                    height: '15rem',
                    border: '2px dashed #3b82f6',
                    backgroundColor: 'transparent',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '-0.75rem',
                    marginRight: '-0.75rem',
                    position: 'relative',
                    flexShrink: 0
                  }}
                >
                  <ContentCutIcon 
                    style={{
                      fontSize: 18,
                      color: '#3b82f6',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      padding: '3px'
                    }}
                  />
                </div>
              )}
              <div
                data-page-id={page.id}
                className={`
        !rounded-lg
        cursor-grab
        select-none
        w-[15rem]
        h-[15rem]
        flex items-center justify-center
        flex-shrink-0
        shadow-sm
        hover:shadow-md
        transition-all
        relative
              ${selectedPages.includes(page.id)
          ? 'ring-2 ring-blue-500 bg-blue-50'
          : 'bg-white hover:bg-gray-50'}
              ${draggedPage === page.id ? 'opacity-50 scale-95' : ''}
      `}
                style={{
                  transform: (() => {
                    if (!draggedPage || page.id === draggedPage) return 'translateX(0)';
                    
                    if (dropTarget === page.id) {
                      return 'translateX(20px)'; // Move slightly right to indicate drop position
                    }
                    return 'translateX(0)';
                  })(),
                  transition: 'transform 0.2s ease-in-out'
                }}
              draggable
              onDragStart={() => handleDragStart(page.id)}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(page.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, page.id)}
            >
              <div className="page-container w-[90%] h-[90%]">
                <img
                  src={page.thumbnail}
                  alt={`Page ${page.pageNumber}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: 4,
                    transform: `rotate(${page.rotation}deg)`,
                    transition: 'transform 0.3s ease-in-out'
                  }}
                />

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

                  <Tooltip label="Select Page">
                    <Checkbox
                      size="md"
                      checked={selectedPages.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                      styles={{
                        input: { backgroundColor: 'white' }
                      }}
                    />
                  </Tooltip>
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
          <div
            data-drop-zone="end"
            style={{
              width: '15rem',
              height: '15rem',
              border: '2px dashed #9ca3af',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: dropTarget === 'end' ? '#ecfdf5' : 'transparent',
              borderColor: dropTarget === 'end' ? '#10b981' : '#9ca3af',
              transition: 'all 0.2s ease-in-out'
            }}
            onDragOver={handleDragOver}
            onDragEnter={handleEndZoneDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'end')}
          >
            <Text c="dimmed" size="sm" ta="center">
              Drop here to<br />move to end
            </Text>
          </div>
        </div>

          <Group justify="space-between" mt="md">
            <Button
              color="red"
              variant="light"
              onClick={() => {
                setPdfDocument(null);
                setFile && setFile(null);
              }}
            >
              Close PDF
            </Button>

            <Group>
              <Button
                leftSection={<DownloadIcon />}
                disabled={selectedPages.length === 0 || exportLoading}
                loading={exportLoading}
                onClick={() => showExportPreview(true)}
              >
                Download Selected
              </Button>
              <Button
                leftSection={<DownloadIcon />}
                color="green"
                disabled={exportLoading}
                loading={exportLoading}
                onClick={() => showExportPreview(false)}
              >
                Download All
              </Button>
            </Group>
          </Group>
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
      </Box>
  );
};

export default PageEditor;
