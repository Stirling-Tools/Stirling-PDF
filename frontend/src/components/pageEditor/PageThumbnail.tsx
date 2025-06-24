import React, { useCallback } from 'react';
import { Text, Checkbox, Tooltip, ActionIcon } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { PDFPage } from '../../../types/pageEditor';
import styles from './PageEditor.module.css';

interface PageThumbnailProps {
  page: PDFPage;
  index: number;
  totalPages: number;
  selectedPages: string[];
  selectionMode: boolean;
  draggedPage: string | null;
  dropTarget: string | null;
  movingPage: string | null;
  isAnimating: boolean;
  pageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onDragStart: (pageId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (pageId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, pageId: string) => void;
  onTogglePage: (pageId: string) => void;
  onAnimateReorder: (pageId: string, targetIndex: number) => void;
  onExecuteCommand: (command: any) => void;
  onSetStatus: (status: string) => void;
  onSetMovingPage: (pageId: string | null) => void;
  RotatePagesCommand: any;
  DeletePagesCommand: any;
  ToggleSplitCommand: any;
  pdfDocument: any;
  setPdfDocument: any;
}

const PageThumbnail = ({
  page,
  index,
  totalPages,
  selectedPages,
  selectionMode,
  draggedPage,
  dropTarget,
  movingPage,
  isAnimating,
  pageRefs,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onTogglePage,
  onAnimateReorder,
  onExecuteCommand,
  onSetStatus,
  onSetMovingPage,
  RotatePagesCommand,
  DeletePagesCommand,
  ToggleSplitCommand,
  pdfDocument,
  setPdfDocument,
}: PageThumbnailProps) => {
  // Register this component with pageRefs for animations
  const pageElementRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(page.id, element);
    } else {
      pageRefs.current.delete(page.id);
    }
  }, [page.id, pageRefs]);

  return (
    <div
      ref={pageElementRef}
      data-page-id={page.id}
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
        ${draggedPage === page.id ? 'opacity-50 scale-95' : ''}
        ${movingPage === page.id ? 'page-moving' : ''}
      `}
      style={{
        transform: (() => {
          if (!isAnimating && draggedPage && page.id !== draggedPage && dropTarget === page.id) {
            return 'translateX(20px)';
          }
          return 'translateX(0)';
        })(),
        transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out'
      }}
      draggable
      onDragStart={() => onDragStart(page.id)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={() => onDragEnter(page.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, page.id)}
    >
      {selectionMode && (
        <div
          className={styles.checkboxContainer}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 4,
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '2px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={selectedPages.includes(page.id)}
            onChange={(event) => {
              event.stopPropagation();
              onTogglePage(page.id);
            }}
            onClick={(e) => e.stopPropagation()}
            size="sm"
          />
        </div>
      )}

      <div className="page-container w-[90%] h-[90%]">
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
                  onSetMovingPage(page.id);
                  onAnimateReorder(page.id, index - 1);
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
                  onSetMovingPage(page.id);
                  onAnimateReorder(page.id, index + 1);
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
  );
};

export default PageThumbnail;
