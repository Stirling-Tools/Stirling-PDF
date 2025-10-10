import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Text, ActionIcon, CheckboxIndicator, Tooltip } from '@mantine/core';
import { alert } from '../toast';
import { useTranslation } from 'react-i18next';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { StirlingFileStub } from '../../types/fileContext';
import { zipFileService } from '../../services/zipFileService';

import styles from './FileEditor.module.css';
import { useFileContext } from '../../contexts/FileContext';
import { useFileState } from '../../contexts/file/fileHooks';
import { FileId } from '../../types/file';
import { formatFileSize } from '../../utils/fileUtils';
import ToolChain from '../shared/ToolChain';



interface FileEditorThumbnailProps {
  file: StirlingFileStub;
  index: number;
  totalFiles: number;
  selectedFiles: FileId[];
  selectionMode: boolean;
  onToggleFile: (fileId: FileId) => void;
  onCloseFile: (fileId: FileId) => void;
  onViewFile: (fileId: FileId) => void;
  _onSetStatus: (status: string) => void;
  onReorderFiles?: (sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => void;
  onDownloadFile: (fileId: FileId) => void;
  onUnzipFile?: (fileId: FileId) => void;
  toolMode?: boolean;
  isSupported?: boolean;
}

const FileEditorThumbnail = ({
  file,
  index,
  selectedFiles,
  onToggleFile,
  onCloseFile,
  onViewFile,
  _onSetStatus,
  onReorderFiles,
  onDownloadFile,
  onUnzipFile,
  isSupported = true,
}: FileEditorThumbnailProps) => {
  const { t } = useTranslation();
  const { pinFile, unpinFile, isFilePinned, activeFiles, actions: fileActions } = useFileContext();
  const { state } = useFileState();
  const hasError = state.ui.errorFileIds.includes(file.id);

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

  // Check if this is a ZIP file
  const isZipFile = zipFileService.isZipFileStub(file);

  const pageCount = file.processedFile?.totalPages || 0;

  const handleRef = useRef<HTMLSpanElement | null>(null);

  // ---- Selection ----
  const isSelected = selectedFiles.includes(file.id);

  // ---- Meta formatting ----
  const prettySize = useMemo(() => {
    return formatFileSize(file.size);
  }, [file.size]);

  const extUpper = useMemo(() => {
    const m = /\.([a-z0-9]+)$/i.exec(file.name ?? '');
    return (m?.[1] || '').toUpperCase();
  }, [file.name]);

  const pageLabel = useMemo(
    () =>
      pageCount > 0
        ? `${pageCount} ${pageCount === 1 ? 'Page' : 'Pages'}`
        : '',
    [pageCount]
  );

  const dateLabel = useMemo(() => {
    const d = new Date(file.lastModified);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(d);
  }, [file.lastModified]);

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
    // Clear error state if file has an error (click to clear error)
    if (hasError) {
      try { fileActions.clearFileError(file.id); } catch (_e) { void _e; }
    }
    onToggleFile(file.id);
  };

  const handleCardDoubleClick = () => {
    if (!isSupported) return;
    onViewFile(file.id);
  };

  // ---- Style helpers ----
  const getHeaderClassName = () => {
    if (hasError) return styles.headerError;
    if (!isSupported) return styles.headerUnsupported;
    return isSelected ? styles.headerSelected : styles.headerResting;
  };


  return (
    <div
      ref={fileElementRef}
      data-file-id={file.id}
      data-testid="file-thumbnail"
      data-selected={isSelected}
      data-supported={isSupported}
      className={`${styles.card} w-[18rem] h-[22rem] select-none flex flex-col shadow-sm transition-all relative`}
      style={{opacity: isDragging ? 0.9 : 1}}
      tabIndex={0}
      role="listitem"
      aria-selected={isSelected}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
    >
      {/* Header bar */}
      <div
        className={`${styles.header} ${getHeaderClassName()}`}
        data-has-error={hasError}
      >
        {/* Logo/checkbox area */}
        <div className={styles.logoMark}>
          {hasError ? (
            <div className={styles.errorPill}>
              <span>{t('error._value', 'Error')}</span>
            </div>
          ) : isSupported ? (
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

        {/* Action buttons group */}
        <div className={styles.headerActions}>
          {/* Pin/Unpin icon */}
          <Tooltip label={isPinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}>
            <ActionIcon
              aria-label={isPinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}
              variant="subtle"
              className={isPinned ? styles.pinned : styles.headerIconButton}
              onClick={(e) => {
                e.stopPropagation();
                if (actualFile) {
                  if (isPinned) {
                    unpinFile(actualFile);
                    alert({ alertType: 'neutral', title: `Unpinned ${file.name}`, expandable: false, durationMs: 3000 });
                  } else {
                    pinFile(actualFile);
                    alert({ alertType: 'success', title: `Pinned ${file.name}`, expandable: false, durationMs: 3000 });
                  }
                }
              }}
            >
              {isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            </ActionIcon>
          </Tooltip>

          {/* Download icon */}
          <Tooltip label={t('download', 'Download')}>
            <ActionIcon
              aria-label={t('download', 'Download')}
              variant="subtle"
              className={styles.headerIconButton}
              onClick={(e) => {
                e.stopPropagation();
                onDownloadFile(file.id);
                alert({ alertType: 'success', title: `Downloading ${file.name}`, expandable: false, durationMs: 2500 });
              }}
            >
              <DownloadOutlinedIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>

          {/* Kebab menu */}
          <ActionIcon
            aria-label={t('moreOptions', 'More options')}
            variant="subtle"
            className={styles.headerIconButton}
            onClick={(e) => {
              e.stopPropagation();
              setShowActions((v) => !v);
            }}
          >
            <MoreVertIcon fontSize="small" />
          </ActionIcon>
        </div>
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
                  alert({ alertType: 'neutral', title: `Unpinned ${file.name}`, expandable: false, durationMs: 3000 });
                } else {
                  pinFile(actualFile);
                  alert({ alertType: 'success', title: `Pinned ${file.name}`, expandable: false, durationMs: 3000 });
                }
              }
              setShowActions(false);
            }}
          >
            {isPinned ? <PushPinIcon className={styles.pinned} fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            <span>{isPinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}</span>
          </button>

          <button
            className={styles.actionRow}
            onClick={() => { onDownloadFile(file.id); alert({ alertType: 'success', title: `Downloading ${file.name}`, expandable: false, durationMs: 2500 }); setShowActions(false); }}
          >
            <DownloadOutlinedIcon fontSize="small" />
            <span>{t('download', 'Download')}</span>
          </button>

          {isZipFile && onUnzipFile && (
            <button
              className={styles.actionRow}
              onClick={() => { onUnzipFile(file.id); alert({ alertType: 'success', title: `Unzipping ${file.name}`, expandable: false, durationMs: 2500 }); setShowActions(false); }}
            >
              <UnarchiveIcon fontSize="small" />
              <span>{t('fileManager.unzip', 'Unzip')}</span>
            </button>
          )}

          <div className={styles.actionsDivider} />

          <button
            className={`${styles.actionRow} ${styles.actionDanger}`}
            onClick={() => {
              onCloseFile(file.id);
              alert({ alertType: 'neutral', title: `Closed ${file.name}`, expandable: false, durationMs: 3500 });
              setShowActions(false);
            }}
          >
            <CloseIcon fontSize="small" />
            <span>{t('close', 'Close')}</span>
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
        <Text  size="lg" fw={700} className={`${styles.title}  ph-no-capture `}  lineClamp={2}>
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
          {`v${file.versionNumber} - `}
          {dateLabel}
          {extUpper ? ` - ${extUpper} file` : ''}
          {pageLabel ? ` - ${pageLabel}` : ''}
        </Text>
      </div>

      {/* Preview area */}
      <div
        className={`${styles.previewBox} mx-6 mb-4 relative flex-1`}
        style={isSupported || hasError ? undefined : { filter: 'grayscale(80%)', opacity: 0.6 }}
      >
        <div className={styles.previewPaper}>
          {file.thumbnailUrl && (
            <img
              className="ph-no-capture"
              src={file.thumbnailUrl}
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

        {/* Drag handle (span wrapper so we can attach a ref reliably) */}
        <span ref={handleRef} className={styles.dragHandle} aria-hidden>
          <DragIndicatorIcon fontSize="small" />
        </span>

        {/* Tool chain display at bottom */}
        {file.toolHistory && (
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
              toolChain={file.toolHistory}
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
