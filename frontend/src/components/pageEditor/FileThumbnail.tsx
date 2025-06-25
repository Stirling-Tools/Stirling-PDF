import React from 'react';
import { Text, Checkbox, Tooltip, ActionIcon, Badge } from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MergeIcon from '@mui/icons-material/Merge';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import styles from './PageEditor.module.css';

interface FileItem {
  id: string;
  name: string;
  pageCount: number;
  thumbnail: string;
  size: number;
  splitBefore?: boolean;
}

interface FileThumbnailProps {
  file: FileItem;
  index: number;
  totalFiles: number;
  selectedFiles: string[];
  selectionMode: boolean;
  draggedFile: string | null;
  dropTarget: string | null;
  isAnimating: boolean;
  fileRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onDragStart: (fileId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (fileId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, fileId: string) => void;
  onToggleFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onViewFile: (fileId: string) => void;
  onMergeFromHere: (fileId: string) => void;
  onSplitFile: (fileId: string) => void;
  onSetStatus: (status: string) => void;
}

const FileThumbnail = ({
  file,
  index,
  totalFiles,
  selectedFiles,
  selectionMode,
  draggedFile,
  dropTarget,
  isAnimating,
  fileRefs,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onToggleFile,
  onDeleteFile,
  onViewFile,
  onMergeFromHere,
  onSplitFile,
  onSetStatus,
}: FileThumbnailProps) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div
      ref={(el) => {
        if (el) {
          fileRefs.current.set(file.id, el);
        } else {
          fileRefs.current.delete(file.id);
        }
      }}
      data-file-id={file.id}
      className={`
        ${styles.pageContainer}
        !rounded-lg
        cursor-grab
        select-none
        w-[20rem]
        h-[24rem]
        flex flex-col items-center justify-center
        flex-shrink-0
        shadow-sm
        hover:shadow-md
        transition-all
        relative
        ${selectionMode
          ? 'bg-white hover:bg-gray-50'
          : 'bg-white hover:bg-gray-50'}
        ${draggedFile === file.id ? 'opacity-50 scale-95' : ''}
      `}
      style={{
        transform: (() => {
          if (!isAnimating && draggedFile && file.id !== draggedFile && dropTarget === file.id) {
            return 'translateX(20px)';
          }
          return 'translateX(0)';
        })(),
        transition: isAnimating ? 'none' : 'transform 0.2s ease-in-out'
      }}
      draggable
      onDragStart={() => onDragStart(file.id)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={() => onDragEnter(file.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, file.id)}
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
            checked={selectedFiles.includes(file.id)}
            onChange={(event) => {
              event.stopPropagation();
              onToggleFile(file.id);
            }}
            onClick={(e) => e.stopPropagation()}
            size="sm"
          />
        </div>
      )}

      {/* File content area */}
      <div className="file-container w-[90%] h-[80%] relative">
        {/* Stacked file effect - multiple shadows to simulate pages */}
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
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '2px 2px 0 rgba(0,0,0,0.1), 4px 4px 0 rgba(0,0,0,0.05)'
          }}
        >
          <img
            src={file.thumbnail}
            alt={file.name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 2,
            }}
          />
        </div>

        {/* Page count badge */}
        <Badge
          size="sm"
          variant="filled"
          color="blue"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 3,
          }}
        >
          {file.pageCount} pages
        </Badge>

        {/* File name overlay */}
        <Text
          className={styles.pageNumber}
          size="xs"
          fw={500}
          c="white"
          style={{
            position: 'absolute',
            bottom: 5,
            left: 5,
            right: 5,
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '4px 6px',
            borderRadius: 4,
            zIndex: 2,
            opacity: 0,
            transition: 'opacity 0.2s ease-in-out',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}
        >
          {file.name}
        </Text>

        {/* Hover controls */}
        <div
          className={styles.pageHoverControls}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '8px 12px',
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
          <Tooltip label="View File">
            <ActionIcon
              size="md"
              variant="subtle"
              c="white"
              onClick={(e) => {
                e.stopPropagation();
                onViewFile(file.id);
                onSetStatus(`Opened ${file.name}`);
              }}
            >
              <VisibilityIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Merge from here">
            <ActionIcon
              size="md"
              variant="subtle"
              c="white"
              onClick={(e) => {
                e.stopPropagation();
                onMergeFromHere(file.id);
                onSetStatus(`Starting merge from ${file.name}`);
              }}
            >
              <MergeIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Split File">
            <ActionIcon
              size="md"
              variant="subtle"
              c="white"
              onClick={(e) => {
                e.stopPropagation();
                onSplitFile(file.id);
                onSetStatus(`Opening ${file.name} in page editor`);
              }}
            >
              <SplitscreenIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Delete File">
            <ActionIcon
              size="md"
              variant="subtle"
              c="red"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(file.id);
                onSetStatus(`Deleted ${file.name}`);
              }}
            >
              <DeleteIcon style={{ fontSize: 20 }} />
            </ActionIcon>
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

      {/* File info */}
      <div className="w-full px-4 py-2 text-center">
        <Text size="sm" fw={500} truncate>
          {file.name}
        </Text>
        <Text size="xs" c="dimmed">
          {formatFileSize(file.size)}
        </Text>
      </div>
    </div>
  );
};

export default FileThumbnail;