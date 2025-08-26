import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Text, Checkbox, Tooltip, ActionIcon } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import AddIcon from '@mui/icons-material/Add';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDFPage, PDFDocument } from '../../types/pageEditor';
import { useThumbnailGeneration } from '../../hooks/useThumbnailGeneration';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import styles from './PageEditor.module.css';


interface PageThumbnailProps {
  page: PDFPage;
  index: number;
  totalPages: number;
  originalFile?: File;
  selectedPages: number[];
  selectionMode: boolean;
  movingPage: number | null;
  isAnimating: boolean;
  pageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => void;
  onTogglePage: (pageNumber: number) => void;
  onAnimateReorder: () => void;
  onExecuteCommand: (command: { execute: () => void }) => void;
  onSetStatus: (status: string) => void;
  onSetMovingPage: (page: number | null) => void;
  onDeletePage: (pageNumber: number) => void;
  createRotateCommand: (pageIds: string[], rotation: number) => { execute: () => void };
  createDeleteCommand: (pageIds: string[]) => { execute: () => void };
  createSplitCommand: (position: number) => { execute: () => void };
  pdfDocument: PDFDocument;
  setPdfDocument: (doc: PDFDocument) => void;
  splitPositions: Set<number>;
  onInsertFiles?: (files: File[], insertAfterPage: number) => void;
}

const PageThumbnail: React.FC<PageThumbnailProps> = ({
  page,
  index,
  totalPages,
  originalFile,
  selectedPages,
  selectionMode,
  movingPage,
  isAnimating,
  pageRefs,
  onReorderPages,
  onTogglePage,
  onAnimateReorder,
  onExecuteCommand,
  onSetStatus,
  onSetMovingPage,
  onDeletePage,
  createRotateCommand,
  createDeleteCommand,
  createSplitCommand,
  pdfDocument,
  setPdfDocument,
  splitPositions,
  onInsertFiles,
}: PageThumbnailProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{x: number, y: number} | null>(null);
  const dragElementRef = useRef<HTMLDivElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(page.thumbnail);
  const { getThumbnailFromCache, requestThumbnail } = useThumbnailGeneration();
  const { openFilesModal } = useFilesModalContext();

  // Calculate document aspect ratio from first non-blank page
  const getDocumentAspectRatio = useCallback(() => {
    // Find first non-blank page with a thumbnail to get aspect ratio
    const firstRealPage = pdfDocument.pages.find(p => !p.isBlankPage && p.thumbnail);
    if (firstRealPage?.thumbnail) {
      // Try to get aspect ratio from an actual thumbnail image
      // For now, default to A4 but could be enhanced to measure image dimensions
      return '1 / 1.414'; // A4 ratio as fallback
    }
    return '1 / 1.414'; // Default A4 ratio
  }, [pdfDocument.pages]);

  // Update thumbnail URL when page prop changes
  useEffect(() => {
    if (page.thumbnail && page.thumbnail !== thumbnailUrl) {
      setThumbnailUrl(page.thumbnail);
    }
  }, [page.thumbnail, thumbnailUrl]);

  // Request thumbnail if missing (on-demand, virtualized approach)
  useEffect(() => {
    let isCancelled = false;

    // If we already have a thumbnail, use it
    if (page.thumbnail) {
      setThumbnailUrl(page.thumbnail);
      return;
    }

    // Check cache first
    const cachedThumbnail = getThumbnailFromCache(page.id);
    if (cachedThumbnail) {
      setThumbnailUrl(cachedThumbnail);
      return;
    }

    // Request thumbnail generation if we have the original file
    if (originalFile) {
      const pageNumber = page.originalPageNumber;

      requestThumbnail(page.id, originalFile, pageNumber)
        .then(thumbnail => {
          if (!isCancelled && thumbnail) {
            setThumbnailUrl(thumbnail);
          }
        })
        .catch(error => {
          console.warn(`Failed to generate thumbnail for ${page.id}:`, error);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [page.id, page.thumbnail, originalFile, getThumbnailFromCache, requestThumbnail]);

  const pageElementRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(page.id, element);
      dragElementRef.current = element;

      const dragCleanup = draggable({
        element,
        getInitialData: () => ({
          pageNumber: page.pageNumber,
          pageId: page.id,
          selectedPages: selectionMode && selectedPages.includes(page.pageNumber)
            ? selectedPages
            : [page.pageNumber]
        }),
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: ({ location }) => {
          setIsDragging(false);

          if (location.current.dropTargets.length === 0) {
            return;
          }

          const dropTarget = location.current.dropTargets[0];
          const targetData = dropTarget.data;

          if (targetData.type === 'page') {
            const targetPageNumber = targetData.pageNumber as number;
            const targetIndex = pdfDocument.pages.findIndex(p => p.pageNumber === targetPageNumber);
            if (targetIndex !== -1) {
              const pagesToMove = selectionMode && selectedPages.includes(page.pageNumber)
                ? selectedPages
                : undefined;
              // Trigger animation for drag & drop
              onAnimateReorder();
              onReorderPages(page.pageNumber, targetIndex, pagesToMove);
            }
          }
        }
      });

      element.style.cursor = 'grab';

      const dropCleanup = dropTargetForElements({
        element,
        getData: () => ({
          type: 'page',
          pageNumber: page.pageNumber
        }),
        onDrop: ({ source }) => {}
      });

      (element as any).__dragCleanup = () => {
        dragCleanup();
        dropCleanup();
      };
    } else {
      pageRefs.current.delete(page.id);
      if (dragElementRef.current && (dragElementRef.current as any).__dragCleanup) {
        (dragElementRef.current as any).__dragCleanup();
      }
    }
  }, [page.id, page.pageNumber, pageRefs, selectionMode, selectedPages, pdfDocument.pages, onReorderPages]);

  // DOM command handlers
  const handleRotateLeft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Use the command system for undo/redo support
    const command = createRotateCommand([page.id], -90);
    onExecuteCommand(command);
    onSetStatus(`Rotated page ${page.pageNumber} left`);
  }, [page.id, page.pageNumber, onExecuteCommand, onSetStatus, createRotateCommand]);

  const handleRotateRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Use the command system for undo/redo support
    const command = createRotateCommand([page.id], 90);
    onExecuteCommand(command);
    onSetStatus(`Rotated page ${page.pageNumber} right`);
  }, [page.id, page.pageNumber, onExecuteCommand, onSetStatus, createRotateCommand]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDeletePage(page.pageNumber);
    onSetStatus(`Deleted page ${page.pageNumber}`);
  }, [page.pageNumber, onDeletePage, onSetStatus]);

  const handleSplit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    // Create a command to toggle split at this position
    const command = createSplitCommand(index);
    onExecuteCommand(command);

    const hasSplit = splitPositions.has(index);
    const action = hasSplit ? 'removed' : 'added';
    onSetStatus(`Split marker ${action} after position ${index + 1}`);
  }, [index, splitPositions, onExecuteCommand, onSetStatus, createSplitCommand]);

  const handleInsertFileAfter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (onInsertFiles) {
      // Open file manager modal with custom handler for page insertion
      openFilesModal({
        insertAfterPage: page.pageNumber,
        customHandler: (files: File[], insertAfterPage?: number) => {
          if (insertAfterPage !== undefined) {
            onInsertFiles(files, insertAfterPage);
          }
        }
      });
      onSetStatus(`Select files to insert after page ${page.pageNumber}`);
    } else {
      // Fallback to normal file handling
      openFilesModal({ insertAfterPage: page.pageNumber });
      onSetStatus(`Select files to insert after page ${page.pageNumber}`);
    }
  }, [openFilesModal, page.pageNumber, onSetStatus, onInsertFiles]);

  // Handle click vs drag differentiation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsMouseDown(true);
    setMouseStartPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isMouseDown || !mouseStartPos) {
      setIsMouseDown(false);
      setMouseStartPos(null);
      return;
    }

    // Calculate distance moved
    const deltaX = Math.abs(e.clientX - mouseStartPos.x);
    const deltaY = Math.abs(e.clientY - mouseStartPos.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // If mouse moved less than 5 pixels, consider it a click (not a drag)
    if (distance < 5 && !isDragging) {
      onTogglePage(page.pageNumber);
    }

    setIsMouseDown(false);
    setMouseStartPos(null);
  }, [isMouseDown, mouseStartPos, isDragging, page.pageNumber, onTogglePage]);

  const handleMouseLeave = useCallback(() => {
    setIsMouseDown(false);
    setMouseStartPos(null);
  }, []);

  return (
    <div
      ref={pageElementRef}
      data-page-id={page.id}
      data-page-number={page.pageNumber}
      className={`
        ${styles.pageContainer}
        !rounded-lg
        ${selectionMode ? 'cursor-pointer' : 'cursor-grab'}
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
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${movingPage === page.pageNumber ? 'page-moving' : ''}
      `}
      style={{
        transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out'
      }}
      draggable={false}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {
        <div
          className={styles.checkboxContainer}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '2px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onTogglePage(page.pageNumber);
          }}
          onMouseUp={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={Array.isArray(selectedPages) ? selectedPages.includes(page.pageNumber) : false}
            onChange={() => {
              // Selection is handled by container mouseDown
            }}
            size="sm"
            style={{ pointerEvents: 'none' }}
          />
        </div>
      }

      <div className="page-container w-[90%] h-[90%]" draggable={false}>
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
          {page.isBlankPage ? (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '70%',
                aspectRatio: getDocumentAspectRatio(),
                backgroundColor: 'white',
                border: '1px solid #e9ecef',
                borderRadius: 2
              }}></div>
            </div>
          ) : thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={`Page ${page.pageNumber}`}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: 2,
                transform: `rotate(${page.rotation}deg)`,
                transition: 'transform 0.3s ease-in-out'
              }}
            />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Text size="lg" c="dimmed">📄</Text>
              <Text size="xs" c="dimmed" mt={4}>Page {page.pageNumber}</Text>
            </div>
          )}
        </div>

        <Text
          className={styles.pageNumber}
          size="sm"
          fw={500}
          style={{
            color: 'var(--mantine-color-white)', // Use theme token for consistency
            position: 'absolute',
            top: 5,
            left: 5,
            background: page.isBlankPage ? 'rgba(255, 165, 0, 0.8)' : 'rgba(162, 201, 255, 0.8)',
            padding: '6px 8px',
            borderRadius: 8,
            zIndex: 2,
            opacity: 0,
            transition: 'opacity 0.2s ease-in-out'
          }}
        >
          {page.pageNumber}
        </Text>

        <div
          className={styles.pageHoverControls}
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-toolbar)',
            border: '1px solid var(--border-default)',
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
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip label="Move Left">
            <ActionIcon
              size="md"
              variant="subtle"
              style={{ color: 'var(--mantine-color-dimmed)' }}
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                if (index > 0 && !movingPage && !isAnimating) {
                  onSetMovingPage(page.pageNumber);
                  // Trigger animation
                  onAnimateReorder();
                  // Actually move the page left (swap with previous page)
                  onReorderPages(page.pageNumber, index - 1);
                  setTimeout(() => onSetMovingPage(null), 650);
                  onSetStatus(`Moved page ${page.pageNumber} left`);
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
              style={{ color: 'var(--mantine-color-dimmed)' }}
              disabled={index === totalPages - 1}
              onClick={(e) => {
                e.stopPropagation();
                if (index < totalPages - 1 && !movingPage && !isAnimating) {
                  onSetMovingPage(page.pageNumber);
                  // Trigger animation
                  onAnimateReorder();
                  // Actually move the page right (swap with next page)
                  onReorderPages(page.pageNumber, index + 1);
                  setTimeout(() => onSetMovingPage(null), 650);
                  onSetStatus(`Moved page ${page.pageNumber} right`);
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
              style={{ color: 'var(--mantine-color-dimmed)' }}
              onClick={handleRotateLeft}
            >
              <RotateLeftIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Rotate Right">
            <ActionIcon
              size="md"
              variant="subtle"
              style={{ color: 'var(--mantine-color-dimmed)' }}
              onClick={handleRotateRight}
            >
              <RotateRightIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Delete Page">
            <ActionIcon
              size="md"
              variant="subtle"
              c="red"
              onClick={handleDelete}
            >
              <DeleteIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          {index < totalPages - 1 && (
            <Tooltip label="Split After">
              <ActionIcon
                size="md"
                variant="subtle"
                style={{ color: 'var(--mantine-color-dimmed)' }}
                onClick={handleSplit}
              >
                <ContentCutIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label="Insert File After">
            <ActionIcon
              size="md"
              variant="subtle"
              style={{ color: 'var(--mantine-color-dimmed)' }}
              onClick={handleInsertFileAfter}
            >
              <AddIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>
        </div>

      </div>

    </div>
  );
};

export default PageThumbnail;
