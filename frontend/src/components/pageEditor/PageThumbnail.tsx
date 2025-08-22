import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Text, Checkbox, Tooltip, ActionIcon, Loader } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDFPage, PDFDocument } from '../../types/pageEditor';
import { RotatePagesCommand, DeletePagesCommand, ToggleSplitCommand } from '../../commands/pageCommands';
import { Command } from '../../hooks/useUndoRedo';
import { useFileState } from '../../contexts/FileContext';
import { useThumbnailGeneration } from '../../hooks/useThumbnailGeneration';
import styles from './PageEditor.module.css';

interface PageThumbnailProps {
  page: PDFPage;
  index: number;
  totalPages: number;
  originalFile?: File; // For lazy thumbnail generation
  selectedPages: number[];
  selectionMode: boolean;
  movingPage: number | null;
  isAnimating: boolean;
  pageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onTogglePage: (pageNumber: number) => void;
  onAnimateReorder: (pageNumber: number, targetIndex: number) => void;
  onExecuteCommand: (command: Command) => void;
  onSetStatus: (status: string) => void;
  onSetMovingPage: (pageNumber: number | null) => void;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => void;
  RotatePagesCommand: typeof RotatePagesCommand;
  DeletePagesCommand: typeof DeletePagesCommand;
  ToggleSplitCommand: typeof ToggleSplitCommand;
  pdfDocument: PDFDocument;
  setPdfDocument: (doc: PDFDocument) => void;
}

const PageThumbnail = React.memo(({
  page,
  index,
  totalPages,
  originalFile,
  selectedPages,
  selectionMode,
  movingPage,
  isAnimating,
  pageRefs,
  onTogglePage,
  onAnimateReorder,
  onExecuteCommand,
  onSetStatus,
  onSetMovingPage,
  onReorderPages,
  RotatePagesCommand,
  DeletePagesCommand,
  ToggleSplitCommand,
  pdfDocument,
  setPdfDocument,
}: PageThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(page.thumbnail);
  const [isDragging, setIsDragging] = useState(false);
  const dragElementRef = useRef<HTMLDivElement>(null);
  const { state, selectors } = useFileState();
  const { getThumbnailFromCache, requestThumbnail } = useThumbnailGeneration();

  // Update thumbnail URL when page prop changes - prevent redundant updates
  useEffect(() => {
    if (page.thumbnail && page.thumbnail !== thumbnailUrl) {
      console.log(`📸 PageThumbnail: Updating thumbnail URL for page ${page.pageNumber}`, page.thumbnail.substring(0, 50) + '...');
      setThumbnailUrl(page.thumbnail);
    }
  }, [page.thumbnail, page.id]); // Remove thumbnailUrl dependency to prevent redundant cycles

  // Request thumbnail generation if not available (optimized for performance)
  useEffect(() => {
    if (thumbnailUrl || !originalFile) {
      return; // Skip if we already have a thumbnail or no original file
    }

    // Check cache first without async call
    const cachedThumbnail = getThumbnailFromCache(page.id);
    if (cachedThumbnail) {
      setThumbnailUrl(cachedThumbnail);
      return;
    }

    let cancelled = false;

    const loadThumbnail = async () => {
      try {
        const thumbnail = await requestThumbnail(page.id, originalFile, page.pageNumber);
        
        // Only update if component is still mounted and we got a result
        if (!cancelled && thumbnail) {
          setThumbnailUrl(thumbnail);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(`📸 PageThumbnail: Failed to load thumbnail for page ${page.pageNumber}:`, error);
        }
      }
    };

    loadThumbnail();

    // Cleanup function to prevent state updates after unmount
    return () => {
      cancelled = true;
    };
  }, [page.id, originalFile, requestThumbnail, getThumbnailFromCache]); // Removed thumbnailUrl to prevent loops


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


  return (
    <div
      ref={pageElementRef}
      data-page-number={page.pageNumber}
      className={`
        ${styles.pageContainer}
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
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${movingPage === page.pageNumber ? 'page-moving' : ''}
      `}
      style={{
        transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out'
      }}
      draggable={false}
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
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePage(page.pageNumber);
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
                  onAnimateReorder(page.pageNumber, index - 1);
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
                  onAnimateReorder(page.pageNumber, index + 1);
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
              onClick={(e) => {
                e.stopPropagation();
                const command = new RotatePagesCommand(
                  pdfDocument,
                  setPdfDocument,
                  [page.id],
                  -90
                );
                onExecuteCommand(command);
                onSetStatus(`Rotated page ${page.pageNumber} left`);
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
                onExecuteCommand(command);
                onSetStatus(`Rotated page ${page.pageNumber} right`);
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
                onExecuteCommand(command);
                onSetStatus(`Deleted page ${page.pageNumber}`);
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
                  onExecuteCommand(command);
                  onSetStatus(`Split marker toggled for page ${page.pageNumber}`);
                }}
              >
                <ContentCutIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>

      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Helper for shallow array comparison
  const arraysEqual = (a: number[], b: number[]) => {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  };

  // Only re-render if essential props change
  return (
    prevProps.page.id === nextProps.page.id &&
    prevProps.page.pageNumber === nextProps.page.pageNumber &&
    prevProps.page.rotation === nextProps.page.rotation &&
    prevProps.page.thumbnail === nextProps.page.thumbnail &&
    // Shallow compare selectedPages array for better stability
    (prevProps.selectedPages === nextProps.selectedPages || 
     arraysEqual(prevProps.selectedPages, nextProps.selectedPages)) &&
    prevProps.selectionMode === nextProps.selectionMode &&
    prevProps.movingPage === nextProps.movingPage &&
    prevProps.isAnimating === nextProps.isAnimating
  );
});

export default PageThumbnail;
