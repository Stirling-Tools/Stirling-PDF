import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { Text, Checkbox } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import AddIcon from '@mui/icons-material/Add';
import { PDFPage, PDFDocument } from '../../types/pageEditor';
import { useThumbnailGeneration } from '../../hooks/useThumbnailGeneration';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { getFileColorWithOpacity } from './fileColors';
import styles from './PageEditor.module.css';
import HoverActionMenu, { HoverAction } from '../shared/HoverActionMenu';
import { StirlingFileStub } from '../../types/fileContext';


interface PageThumbnailProps {
  page: PDFPage;
  index: number;
  totalPages: number;
  originalFile?: File;
  fileColorIndex: number;
  selectedPageIds: string[];
  selectionMode: boolean;
  movingPage: number | null;
  isAnimating: boolean;
  isBoxSelected?: boolean;
  boxSelectedPageIds?: string[];
  clearBoxSelection?: () => void;
  getBoxSelection?: () => string[];
  activeId: string | null;
  activeDragIds: string[];
  justMoved?: boolean;
  isOver: boolean;
  pageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  dragHandleProps?: any;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => void;
  onTogglePage: (pageId: string) => void;
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
  onInsertFiles?: (files: File[] | StirlingFileStub[], insertAfterPage: number, isFromStorage?: boolean) => void;
  zoomLevel?: number;
}

const PageThumbnail: React.FC<PageThumbnailProps> = ({
  page,
  index,
  totalPages,
  originalFile,
  fileColorIndex,
  selectedPageIds,
  selectionMode,
  movingPage,
  isAnimating,
  isBoxSelected = false,
  // boxSelectedPageIds,
  clearBoxSelection,
  // getBoxSelection,
  activeId,
  activeDragIds,
  // isOver,
  pageRefs,
  dragHandleProps,
  onReorderPages,
  onTogglePage,
  onExecuteCommand,
  onSetStatus,
  onSetMovingPage,
  onDeletePage,
  createRotateCommand,
  createSplitCommand,
  pdfDocument,
  splitPositions,
  onInsertFiles,
  zoomLevel = 1.0,
  justMoved = false,
}: PageThumbnailProps) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{x: number, y: number} | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const lastClickTimeRef = useRef<number>(0);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(page.thumbnail);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const { getThumbnailFromCache, requestThumbnail} = useThumbnailGeneration();
  const { openFilesModal } = useFilesModalContext();

  // Check if this page is currently being dragged
  const isDragging = activeDragIds.includes(page.id);

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

  // Merge refs - combine our ref tracking with dnd-kit's ref
  const mergedRef = useCallback((element: HTMLDivElement | null) => {
    // Track in our refs map
    elementRef.current = element;
    if (element) {
      pageRefs.current.set(page.id, element);
    } else {
      pageRefs.current.delete(page.id);
    }

    // Call dnd-kit's ref if provided
    if (dragHandleProps?.ref) {
      dragHandleProps.ref(element);
    }
  }, [page.id, pageRefs, dragHandleProps]);


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
        customHandler: (files: File[] | StirlingFileStub[], insertAfterPage?: number, isFromStorage?: boolean) => {
          if (insertAfterPage !== undefined) {
            onInsertFiles(files, insertAfterPage, isFromStorage);
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

    // If mouse moved less than 2 pixels, consider it a click (not a drag)
    if (distance < 2 && !isDragging) {
      // Prevent rapid double-clicks from causing issues (debounce with 100ms threshold)
      const now = Date.now();
      if (now - lastClickTimeRef.current > 100) {
        lastClickTimeRef.current = now;

        // Clear box selection when clicking on a non-selected page
        if (!isBoxSelected && clearBoxSelection) {
          clearBoxSelection();
        }

        // Don't toggle page selection if it's box-selected (just keep the box selection)
        if (!isBoxSelected) {
          onTogglePage(page.id);
        }
      }
    }

    setIsMouseDown(false);
    setMouseStartPos(null);
  }, [isMouseDown, mouseStartPos, isDragging, page.id, isBoxSelected, clearBoxSelection, onTogglePage]);

  const handleMouseLeave = useCallback(() => {
    setIsMouseDown(false);
    setMouseStartPos(null);
    setIsHovered(false);
  }, []);

  const fileColorBorder = page.isBlankPage ? 'transparent' : getFileColorWithOpacity(fileColorIndex, 0.3);

  // Spread dragHandleProps but use our merged ref
  const { ref: _, ...restDragProps } = dragHandleProps || {};

  // Build hover menu actions
  const hoverActions = useMemo<HoverAction[]>(() => [
    {
      id: 'move-left',
      icon: <ArrowBackIcon style={{ fontSize: 20 }} />,
      label: 'Move Left',
      onClick: (e) => {
        e.stopPropagation();
        if (index > 0 && !movingPage && !isAnimating) {
          onSetMovingPage(page.pageNumber);
          onReorderPages(page.pageNumber, index - 1);
          setTimeout(() => onSetMovingPage(null), 650);
          onSetStatus(`Moved page ${page.pageNumber} left`);
        }
      },
      disabled: index === 0
    },
    {
      id: 'move-right',
      icon: <ArrowForwardIcon style={{ fontSize: 20 }} />,
      label: 'Move Right',
      onClick: (e) => {
        e.stopPropagation();
        if (index < totalPages - 1 && !movingPage && !isAnimating) {
          onSetMovingPage(page.pageNumber);
          onReorderPages(page.pageNumber, index + 1);
          setTimeout(() => onSetMovingPage(null), 650);
          onSetStatus(`Moved page ${page.pageNumber} right`);
        }
      },
      disabled: index === totalPages - 1
    },
    {
      id: 'rotate-left',
      icon: <RotateLeftIcon style={{ fontSize: 20 }} />,
      label: 'Rotate Left',
      onClick: handleRotateLeft,
    },
    {
      id: 'rotate-right',
      icon: <RotateRightIcon style={{ fontSize: 20 }} />,
      label: 'Rotate Right',
      onClick: handleRotateRight,
    },
    {
      id: 'delete',
      icon: <DeleteIcon style={{ fontSize: 20 }} />,
      label: 'Delete Page',
      onClick: handleDelete,
      color: 'red',
    },
    {
      id: 'split',
      icon: <ContentCutIcon style={{ fontSize: 20 }} />,
      label: 'Split After',
      onClick: handleSplit,
      hidden: index >= totalPages - 1,
    },
    {
      id: 'insert',
      icon: <AddIcon style={{ fontSize: 20 }} />,
      label: 'Insert File After',
      onClick: handleInsertFileAfter,
    }
  ], [index, totalPages, movingPage, isAnimating, page.pageNumber, handleRotateLeft, handleRotateRight, handleDelete, handleSplit, handleInsertFileAfter, onReorderPages, onSetMovingPage, onSetStatus]);

  return (
    <div
      ref={mergedRef}
      {...restDragProps}
      data-page-id={page.id}
      data-page-number={page.pageNumber}
      className={`
        ${styles.pageContainer}
        !rounded-lg
        ${selectionMode ? 'cursor-pointer' : 'cursor-grab'}
        select-none
        flex items-center justify-center
        flex-shrink-0
        shadow-sm
        hover:shadow-md
        transition-all
        relative
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${movingPage === page.pageNumber ? 'page-moving' : ''}
        ${isBoxSelected ? 'ring-4 ring-blue-400 ring-offset-2' : ''}
      `}
      style={{
        width: `calc(20rem * ${zoomLevel})`,
        height: `calc(20rem * ${zoomLevel})`,
        transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out',
        zIndex: isHovered ? 50 : 1,
        ...(isBoxSelected && {
          boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.5)',
        }),
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setIsHovered(true)}
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
            onTogglePage(page.id);
          }}
          onMouseUp={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={Array.isArray(selectedPageIds) ? selectedPageIds.includes(page.id) : false}
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
          className={`${styles.pageSurface} ${justMoved ? styles.pageJustMoved : ''}`}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--mantine-color-gray-1)',
            borderRadius: 6,
            boxShadow: page.isBlankPage ? 'none' : `0 0 ${4 + 4 * zoomLevel}px 3px ${fileColorBorder}`,
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
              className="ph-no-capture"
              src={thumbnailUrl}
              alt={`Page ${page.pageNumber}`}
              draggable={false}
              data-original-rotation={page.rotation}
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

        <HoverActionMenu
          show={isHovered || isMobile}
          actions={hoverActions}
          position="inside"
          className={styles.pageHoverControls}
        />

      </div>

    </div>
  );
};

export default PageThumbnail;
