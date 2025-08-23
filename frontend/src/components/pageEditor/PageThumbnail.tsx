import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Text, Checkbox, Tooltip, ActionIcon } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDFPage, PDFDocument } from '../../types/pageEditor';
import { useThumbnailGeneration } from '../../hooks/useThumbnailGeneration';
import styles from './PageEditor.module.css';

// DOM Command types (match what PageEditor expects)
abstract class DOMCommand {
  abstract execute(): void;
  abstract undo(): void;
  abstract description: string;
}

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
  onExecuteCommand: (command: DOMCommand) => void;
  onSetStatus: (status: string) => void;
  onSetMovingPage: (page: number | null) => void;
  onDeletePage: (pageNumber: number) => void;
  RotatePagesCommand: any;
  DeletePagesCommand: any;
  ToggleSplitCommand: any;
  pdfDocument: PDFDocument;
  setPdfDocument: (doc: PDFDocument) => void;
  splitPositions: Set<number>;
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
  RotatePagesCommand,
  DeletePagesCommand,
  ToggleSplitCommand,
  pdfDocument,
  setPdfDocument,
  splitPositions,
}: PageThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(page.thumbnail);
  const [isDragging, setIsDragging] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{x: number, y: number} | null>(null);
  const dragElementRef = useRef<HTMLDivElement>(null);
  const { getThumbnailFromCache } = useThumbnailGeneration();

  // Update thumbnail URL when page prop changes
  useEffect(() => {
    if (page.thumbnail && page.thumbnail !== thumbnailUrl) {
      setThumbnailUrl(page.thumbnail);
    }
  }, [page.thumbnail, page.id]);

  // Poll for cached thumbnails as they're generated
  useEffect(() => {
    const checkThumbnail = () => {
      const cachedThumbnail = getThumbnailFromCache(page.id);
      if (cachedThumbnail && cachedThumbnail !== thumbnailUrl) {
        setThumbnailUrl(cachedThumbnail);
      }
    };

    // Check immediately
    checkThumbnail();

    // Poll every 500ms for new thumbnails
    const pollInterval = setInterval(checkThumbnail, 500);
    return () => clearInterval(pollInterval);
  }, [page.id, getThumbnailFromCache, thumbnailUrl]);

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
    const command = new RotatePagesCommand([page.id], -90);
    onExecuteCommand(command);
    onSetStatus(`Rotated page ${page.pageNumber} left`);
  }, [page.id, page.pageNumber, onExecuteCommand, onSetStatus, RotatePagesCommand]);

  const handleRotateRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Use the command system for undo/redo support
    const command = new RotatePagesCommand([page.id], 90);
    onExecuteCommand(command);
    onSetStatus(`Rotated page ${page.pageNumber} right`);
  }, [page.id, page.pageNumber, onExecuteCommand, onSetStatus, RotatePagesCommand]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDeletePage(page.pageNumber);
    onSetStatus(`Deleted page ${page.pageNumber}`);
  }, [page.pageNumber, onDeletePage, onSetStatus]);

  const handleSplit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Create a command to toggle split at this position
    const command = new ToggleSplitCommand(index);
    onExecuteCommand(command);
    
    const hasSplit = splitPositions.has(index);
    const action = hasSplit ? 'removed' : 'added';
    onSetStatus(`Split marker ${action} after position ${index + 1}`);
  }, [index, splitPositions, onExecuteCommand, onSetStatus, ToggleSplitCommand]);

  // Handle click vs drag differentiation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode) return;
    
    setIsMouseDown(true);
    setMouseStartPos({ x: e.clientX, y: e.clientY });
  }, [selectionMode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!selectionMode || !isMouseDown || !mouseStartPos) {
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
  }, [selectionMode, isMouseDown, mouseStartPos, isDragging, page.pageNumber, onTogglePage]);

  const handleMouseLeave = useCallback(() => {
    setIsMouseDown(false);
    setMouseStartPos(null);
  }, []);

  return (
    <div
      ref={pageElementRef}
      data-page-number={page.pageNumber}
      data-page-id={page.id}
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
      {selectionMode && (
        <div
          className={styles.checkboxContainer}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            pointerEvents: 'auto',
            cursor: 'pointer'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={Array.isArray(selectedPages) ? selectedPages.includes(page.pageNumber) : false}
            onChange={() => {
              // onChange is handled by the parent div click
            }}
            size="sm"
          />
        </div>
      )}

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
          {thumbnailUrl ? (
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

        <div
          className={styles.pageHoverControls}
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
                  onSetMovingPage(page.pageNumber);
                  onAnimateReorder();
                  setTimeout(() => onSetMovingPage(null), 500);
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
              c="white"
              disabled={index === totalPages - 1}
              onClick={(e) => {
                e.stopPropagation();
                if (index < totalPages - 1 && !movingPage && !isAnimating) {
                  onSetMovingPage(page.pageNumber);
                  onAnimateReorder();
                  setTimeout(() => onSetMovingPage(null), 500);
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
              c="white"
              onClick={handleRotateLeft}
            >
              <RotateLeftIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Rotate Right">
            <ActionIcon
              size="md"
              variant="subtle"
              c="white"
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
                c="white"
                onClick={handleSplit}
              >
                <ContentCutIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>

      </div>

    </div>
  );
};

export default PageThumbnail;