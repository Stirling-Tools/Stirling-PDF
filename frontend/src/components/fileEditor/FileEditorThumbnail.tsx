import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Text, ActionIcon, CheckboxIndicator } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import styles from './FileEditor.module.css';
import { useFileContext } from '../../contexts/FileContext';
import { FileId } from '../../types/file';
import ToolChain from '../shared/ToolChain';

interface FileItem {
  id: FileId;
  name: string;
  pageCount: number;
  thumbnail: string | null;
  size: number;
  modifiedAt?: number | string | Date;
}

interface FileEditorThumbnailProps {
  file: FileItem;
  index: number;
  totalFiles: number;
  selectedFiles: FileId[];
  selectionMode: boolean;
  onToggleFile: (fileId: FileId) => void;
  onDeleteFile: (fileId: FileId) => void;
  onViewFile: (fileId: FileId) => void;
  onSetStatus: (status: string) => void;
  onReorderFiles?: (sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => void;
  onDownloadFile?: (fileId: FileId) => void;
  toolMode?: boolean;
  isSupported?: boolean;
}

const FileEditorThumbnail = ({
  file,
  index,
  selectedFiles,
  onToggleFile,
  onDeleteFile,
  onSetStatus,
  onReorderFiles,
  onDownloadFile,
  isSupported = true,
}: FileEditorThumbnailProps) => {
  const { t } = useTranslation();
  const { pinFile, unpinFile, isFilePinned, activeFiles, selectors } = useFileContext();

  // ---- Drag state ----
  const [isDragging, setIsDragging] = useState(false);
  const dragElementRef = useRef<HTMLDivElement | null>(null);
  const [actionsWidth, setActionsWidth] = useState<number | undefined>(undefined);
  const [showActions, setShowActions] = useState(false);

  // Resolve the actual File object for pin/unpin operations
  const actualFile = useMemo(() => {
    return activeFiles.find(f => f.fileId === file.id);
  }, [activeFiles, file.id]);
  const isPinned = actualFile ? isFilePinned(actualFile) : false;

  // Get file record to access tool history
  const fileRecord = selectors.getStirlingFileStub(file.id);
  const toolHistory = fileRecord?.toolHistory || [];
  const hasToolHistory = toolHistory.length > 0;
  const versionNumber = fileRecord?.versionNumber || 1;


  const downloadSelectedFile = useCallback(() => {
    // Prefer parent-provided handler if available
    if (typeof onDownloadFile === 'function') {
      onDownloadFile(file.id);
      return;
    }

    // Fallback: attempt to download using the File object if provided
    const maybeFile = (file as unknown as { file?: File }).file;
    if (maybeFile instanceof File) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(maybeFile);
      link.download = maybeFile.name || file.name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      return;
    }

    // If we can't find a way to download, surface a status message
    onSetStatus?.(typeof t === 'function' ? t('downloadUnavailable', 'Download unavailable for this item') : 'Download unavailable for this item');
  }, [file, onDownloadFile, onSetStatus, t]);
  const handleRef = useRef<HTMLSpanElement | null>(null);

  // ---- Selection ----
  const isSelected = selectedFiles.includes(file.id);

  // ---- Meta formatting ----
  const prettySize = useMemo(() => {
    const bytes = file.size ?? 0;
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }, [file.size]);

  const extUpper = useMemo(() => {
    const m = /\.([a-z0-9]+)$/i.exec(file.name ?? '');
    return (m?.[1] || '').toUpperCase();
  }, [file.name]);

  const pageLabel = useMemo(
    () =>
      file.pageCount > 0
        ? `${file.pageCount} ${file.pageCount === 1 ? 'Page' : 'Pages'}`
        : '',
    [file.pageCount]
  );

  const dateLabel = useMemo(() => {
    const d =
      file.modifiedAt != null ? new Date(file.modifiedAt) : new Date(); // fallback
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(d);
  }, [file.modifiedAt]);

  // ---- Drag & drop wiring ----
  const fileElementRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;

    dragElementRef.current = element;

    const dragCleanup = draggable({
      element,
      getInitialData: () => ({
        type: 'file',
        fileId: file.id,
        fileName: file.name,
        selectedFiles: [file.id]  // Always drag only this file, ignore selection state
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
          const sourceFileId = sourceData.fileId as FileId;
          const selectedFileIds = sourceData.selectedFiles as FileId[];
          onReorderFiles(sourceFileId, file.id, selectedFileIds);
        }
      }
    });

    return () => {
      dragCleanup();
      dropCleanup();
    };
  }, [file.id, file.name, selectedFiles, onReorderFiles]);

  // Update dropdown width on resize
  useEffect(() => {
    const update = () => {
      if (dragElementRef.current) setActionsWidth(dragElementRef.current.offsetWidth);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Close the actions dropdown when hovering outside this file card (and its dropdown)
  useEffect(() => {
    if (!showActions) return;

    const isInsideCard = (target: EventTarget | null) => {
      const container = dragElementRef.current;
      if (!container) return false;
      return target instanceof Node && container.contains(target);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isInsideCard(e.target)) {
        setShowActions(false);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      // On touch devices, close if the touch target is outside the card
      if (!isInsideCard(e.target)) {
        setShowActions(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, [showActions]);

  // ---- Card interactions ----
  const handleCardClick = () => {
    if (!isSupported) return;
    onToggleFile(file.id);
  };


  return (
    <div
      ref={fileElementRef}
      data-file-id={file.id}
      data-testid="file-thumbnail"
      data-selected={isSelected}
      data-supported={isSupported}
      className={`${styles.card} w-[18rem] h-[22rem] select-none flex flex-col shadow-sm transition-all relative`}
      style={{
        opacity: isSupported ? (isDragging ? 0.9 : 1) : 0.5,
        filter: isSupported ? 'none' : 'grayscale(50%)',
      }}
      tabIndex={0}
      role="listitem"
      aria-selected={isSelected}
      onClick={handleCardClick}
    >
      {/* Header bar */}
      <div
        className={`${styles.header} ${
          isSelected ? styles.headerSelected : styles.headerResting
        }`}
      >
        {/* Logo/checkbox area */}
        <div className={styles.logoMark}>
          {isSupported ? (
            <CheckboxIndicator
              checked={isSelected}
              onChange={() => onToggleFile(file.id)}
              color="var(--checkbox-checked-bg)"
            />
          ) : (
            <div className={styles.unsupportedPill}>
              <span>
                {t('unsupported', 'Unsupported')}
              </span>
            </div>
          )}
        </div>

        {/* Centered index */}
        <div className={styles.headerIndex} aria-label={`Position ${index + 1}`}>
          {index + 1}
        </div>

        {/* Kebab menu */}
        <ActionIcon
          aria-label={t('moreOptions', 'More options')}
          variant="subtle"
          className={styles.kebab}
          onClick={(e) => {
            e.stopPropagation();
            setShowActions((v) => !v);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </ActionIcon>
      </div>

      {/* Actions overlay */}
      {showActions && (
        <div
          className={styles.actionsOverlay}
          style={{ width: actionsWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.actionRow}
            onClick={() => {
              if (actualFile) {
                if (isPinned) {
                  unpinFile(actualFile);
                  onSetStatus?.(`Unpinned ${file.name}`);
                } else {
                  pinFile(actualFile);
                  onSetStatus?.(`Pinned ${file.name}`);
                }
              }
              setShowActions(false);
            }}
          >
            {isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            <span>{isPinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}</span>
          </button>

          <button
            className={styles.actionRow}
            onClick={() => { downloadSelectedFile(); setShowActions(false); }}
          >
            <DownloadOutlinedIcon fontSize="small" />
            <span>{t('download', 'Download')}</span>
          </button>

          <div className={styles.actionsDivider} />

          <button
            className={`${styles.actionRow} ${styles.actionDanger}`}
            onClick={() => {
              onDeleteFile(file.id);
              onSetStatus(`Deleted ${file.name}`);
              setShowActions(false);
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
            <span>{t('delete', 'Delete')}</span>
          </button>
        </div>
      )}

      {/* Title + meta line */}
      <div
      style={{
        padding: '0.5rem',
        textAlign: 'center',
        background: 'var(--file-card-bg)',
        marginTop: '0.5rem',
        marginBottom: '0.5rem',
      }}>
        <Text size="lg" fw={700} className={styles.title} lineClamp={2}>
          {file.name}
        </Text>
        <Text
          size="sm"
          c="dimmed"
          className={styles.meta}
          lineClamp={3}
          title={`${extUpper || 'FILE'} • ${prettySize}`}
        >
          {/* e.g.,  v2 - Jan 29, 2025 - PDF file - 3 Pages */}
          {hasToolHistory ? ` v${versionNumber} - ` : ''}
          {dateLabel}
          {extUpper ? ` - ${extUpper} file` : ''}
          {pageLabel ? ` - ${pageLabel}` : ''}
        </Text>
      </div>

      {/* Preview area */}
      <div className={`${styles.previewBox} mx-6 mb-4 relative flex-1`}>
        <div className={styles.previewPaper}>
          {file.thumbnail && (
            <img
              src={file.thumbnail}
              alt={file.name}
              draggable={false}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                img.parentElement?.setAttribute('data-thumb-missing', 'true');
              }}
              style={{
                maxWidth: '80%',
                maxHeight: '80%',
                objectFit: 'contain',
                borderRadius: 0,
                background: '#ffffff',
                border: '1px solid var(--border-default)',
                display: 'block',
                marginLeft: 'auto',
                marginRight: 'auto',
                alignSelf: 'start'
              }}
            />
          )}
        </div>

        {/* Pin indicator (bottom-left) */}
        {isPinned && (
          <span className={styles.pinIndicator} aria-hidden>
            <PushPinIcon fontSize="small" />
          </span>
        )}

        {/* Drag handle (span wrapper so we can attach a ref reliably) */}
        <span ref={handleRef} className={styles.dragHandle} aria-hidden>
          <DragIndicatorIcon fontSize="small" />
        </span>

        {/* Tool chain display at bottom */}
        {hasToolHistory && (
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            right: '4px',
            padding: '4px 6px',
            textAlign: 'center',
            fontWeight: 600,
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}>
            <ToolChain
              toolChain={toolHistory}
              displayStyle="text"
              size="xs"
              maxWidth={'100%'}
              color='var(--mantine-color-gray-7)'
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(FileEditorThumbnail);
