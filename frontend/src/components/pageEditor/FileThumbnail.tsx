import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Text, Checkbox, Tooltip, ActionIcon, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PreviewIcon from '@mui/icons-material/Preview';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import styles from './PageEditor.module.css';
import { useFileContext } from '../../contexts/FileContext';

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
  onToggleFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onViewFile: (fileId: string) => void;
  onSetStatus: (status: string) => void;
  onReorderFiles?: (sourceFileId: string, targetFileId: string, selectedFileIds: string[]) => void;
  toolMode?: boolean;
  isSupported?: boolean;
}

const FileThumbnail = ({
  file,
  index,
  totalFiles,
  selectedFiles,
  selectionMode,
  onToggleFile,
  onDeleteFile,
  onViewFile,
  onSetStatus,
  onReorderFiles,
  toolMode = false,
  isSupported = true,
}: FileThumbnailProps) => {
  const { t } = useTranslation();
  const { pinnedFiles, pinFile, unpinFile, isFilePinned, activeFiles } = useFileContext();
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragElementRef = useRef<HTMLDivElement | null>(null);

  // Find the actual File object that corresponds to this FileItem
  const actualFile = activeFiles.find(f => f.name === file.name && f.size === file.size);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Setup drag and drop using @atlaskit/pragmatic-drag-and-drop
  const fileElementRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    
    dragElementRef.current = element;
    
    const dragCleanup = draggable({
      element,
      getInitialData: () => ({
        type: 'file',
        fileId: file.id,
        fileName: file.name,
        selectedFiles: selectionMode && selectedFiles.includes(file.id) 
          ? selectedFiles 
          : [file.id]
      }),
      onDragStart: () => {
        setIsDragging(true);
      },
      onDrop: () => {
        setIsDragging(false);
      }
    });
    
    const dropCleanup = dropTargetForElements({
      element,
      getData: () => ({
        type: 'file',
        fileId: file.id
      }),
      canDrop: ({ source }) => {
        const sourceData = source.data;
        return sourceData.type === 'file' && sourceData.fileId !== file.id;
      },
      onDrop: ({ source }) => {
        const sourceData = source.data;
        if (sourceData.type === 'file' && onReorderFiles) {
          const sourceFileId = sourceData.fileId as string;
          const selectedFileIds = sourceData.selectedFiles as string[];
          onReorderFiles(sourceFileId, file.id, selectedFileIds);
        }
      }
    });

    return () => {
      dragCleanup();
      dropCleanup();
    };
  }, [file.id, file.name, selectionMode, selectedFiles, onReorderFiles]);

  return (
    <div
      ref={fileElementRef}
      data-file-id={file.id}
      data-testid="file-thumbnail"
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
        ${isDragging ? 'opacity-50 scale-95' : ''}
      `}
      style={{
        opacity: isSupported ? (isDragging ? 0.5 : 1) : 0.5,
        filter: isSupported ? 'none' : 'grayscale(50%)'
      }}
    >
      {selectionMode && (
        <div
          className={styles.checkboxContainer}
          data-testid="file-thumbnail-checkbox"
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
              if (isSupported) {
                onToggleFile(file.id);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={!isSupported}
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
            draggable={false}
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
          {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
        </Badge>

        {/* Unsupported badge */}
        {!isSupported && (
          <Badge
            size="sm"
            variant="filled"
            color="orange"
            style={{
              position: 'absolute',
              top: 8,
              right: selectionMode ? 48 : 8, // Avoid overlap with checkbox
              zIndex: 3,
            }}
          >
{t("fileManager.unsupported", "Unsupported")}
          </Badge>
        )}

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
          {!toolMode && isSupported && (
            <>
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

            </>
          )}

          <Tooltip label="Preview File">
            <ActionIcon
              size="md"
              variant="subtle"
              c="white"
              onClick={(e) => {
                e.stopPropagation();
                onViewFile(file.id);
                onSetStatus(`Opening preview for ${file.name}`);
              }}
            >
              <PreviewIcon style={{ fontSize: 20 }} />
            </ActionIcon>
          </Tooltip>

          {actualFile && (
            <Tooltip label={isFilePinned(actualFile) ? "Unpin File" : "Pin File"}>
              <ActionIcon
                size="md"
                variant="subtle"
                c={isFilePinned(actualFile) ? "yellow" : "white"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isFilePinned(actualFile)) {
                    unpinFile(actualFile);
                    onSetStatus(`Unpinned ${file.name}`);
                  } else {
                    pinFile(actualFile);
                    onSetStatus(`Pinned ${file.name}`);
                  }
                }}
              >
                {isFilePinned(actualFile) ? (
                  <PushPinIcon style={{ fontSize: 20 }} />
                ) : (
                  <PushPinOutlinedIcon style={{ fontSize: 20 }} />
                )}
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label="Close File">
            <ActionIcon
              size="md"
              variant="subtle"
              c="orange"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(file.id);
                onSetStatus(`Closed ${file.name}`);
              }}
            >
              <CloseIcon style={{ fontSize: 20 }} />
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