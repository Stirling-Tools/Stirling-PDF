import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Text, ActionIcon, CheckboxIndicator, Tooltip, Modal, Button, Group, Stack } from '@mantine/core';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { alert } from '@app/components/toast';
import { useTranslation } from 'react-i18next';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { useFileActionIcons } from '@app/hooks/useFileActionIcons';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { StirlingFileStub } from '@app/types/fileContext';
import { zipFileService } from '@app/services/zipFileService';

import styles from '@app/components/fileEditor/FileEditor.module.css';
import { useFileContext } from '@app/contexts/FileContext';
import { useFileState } from '@app/contexts/file/fileHooks';
import { FileId } from '@app/types/file';
import { formatFileSize } from '@app/utils/fileUtils';
import ToolChain from '@app/components/shared/ToolChain';
import HoverActionMenu, { HoverAction } from '@app/components/shared/HoverActionMenu';
import { PrivateContent } from '@app/components/shared/PrivateContent';



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
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const DownloadOutlinedIcon = icons.download;
  const {
    pinFile,
    unpinFile,
    isFilePinned,
    activeFiles,
    actions: fileActions,
    openEncryptedUnlockPrompt,
  } = useFileContext();
  const { state } = useFileState();
  const hasError = state.ui.errorFileIds.includes(file.id);

  // ---- Drag state ----
  const [isDragging, setIsDragging] = useState(false);
  const dragElementRef = useRef<HTMLDivElement | null>(null);
  const [showHoverMenu, setShowHoverMenu] = useState(false);
  const isMobile = useIsMobile();
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Resolve the actual File object for pin/unpin operations
  const actualFile = useMemo(() => {
    return activeFiles.find(f => f.fileId === file.id);
  }, [activeFiles, file.id]);
  const isPinned = actualFile ? isFilePinned(actualFile) : false;

  // Check if this is a ZIP file
  const isZipFile = zipFileService.isZipFileStub(file);

  const pageCount = file.processedFile?.totalPages || 0;
  const isEncrypted = Boolean(file.processedFile?.isEncrypted);

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

  const extLower = useMemo(() => {
    const m = /\.([a-z0-9]+)$/i.exec(file.name ?? '');
    return (m?.[1] || '').toLowerCase();
  }, [file.name]);

  const isCBZ = extLower === 'cbz';

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

  // Handle close with confirmation
  const handleCloseWithConfirmation = useCallback(() => {
    setShowCloseModal(true);
  }, []);

  const handleConfirmClose = useCallback(() => {
    onCloseFile(file.id);
    alert({ alertType: 'neutral', title: `Closed ${file.name}`, expandable: false, durationMs: 3500 });
    setShowCloseModal(false);
  }, [file.id, file.name, onCloseFile]);

  const handleCancelClose = useCallback(() => {
    setShowCloseModal(false);
  }, []);

  // Build hover menu actions
  const hoverActions = useMemo<HoverAction[]>(() => [
    {
      id: 'view',
      icon: <VisibilityIcon style={{ fontSize: 20 }} />,
      label: t('openInViewer', 'Open in Viewer'),
      onClick: (e) => {
        e.stopPropagation();
        onViewFile(file.id);
      },
    },
    {
      id: 'download',
      icon: <DownloadOutlinedIcon style={{ fontSize: 20 }} />,
      label: terminology.download,
      onClick: (e) => {
        e.stopPropagation();
        onDownloadFile(file.id);
        alert({ alertType: 'success', title: `Downloading ${file.name}`, expandable: false, durationMs: 2500 });
      },
    },
    {
      id: 'unzip',
      icon: <UnarchiveIcon style={{ fontSize: 20 }} />,
      label: t('fileManager.unzip', 'Unzip'),
      onClick: (e) => {
        e.stopPropagation();
        if (onUnzipFile) {
          onUnzipFile(file.id);
          alert({ alertType: 'success', title: `Unzipping ${file.name}`, expandable: false, durationMs: 2500 });
        }
      },
      hidden: !isZipFile || !onUnzipFile || isCBZ,
    },
    {
      id: 'close',
      icon: <CloseIcon style={{ fontSize: 20 }} />,
      label: t('close', 'Close'),
      onClick: (e) => {
        e.stopPropagation();
        handleCloseWithConfirmation();
      },
      color: 'red',
    }
  ], [t, file.id, file.name, isZipFile, onViewFile, onDownloadFile, onUnzipFile, handleCloseWithConfirmation]);

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
      data-tour="file-card-checkbox"
      data-selected={isSelected}
      data-supported={isSupported}
      className={`${styles.card} w-[18rem] h-[22rem] select-none flex flex-col shadow-sm transition-all relative`}
      style={{opacity: isDragging ? 0.9 : 1}}
      tabIndex={0}
      role="listitem"
      aria-selected={isSelected}
      onClick={handleCardClick}
      onMouseEnter={() => setShowHoverMenu(true)}
      onMouseLeave={() => setShowHoverMenu(false)}
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
          {isEncrypted && (
            <Tooltip label={t('encryptedPdfUnlock.unlockPrompt', 'Unlock PDF to continue')}>
              <ActionIcon
                aria-label={t('encryptedPdfUnlock.unlockPrompt', 'Unlock PDF to continue')}
                variant="subtle"
                className={styles.headerIconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  openEncryptedUnlockPrompt(file.id);
                }}
              >
                <LockOpenIcon fontSize="small" />
              </ActionIcon>
            </Tooltip>
          )}
          {/* Pin/Unpin icon */}
          <Tooltip label={isPinned ? t('unpin', 'Unpin File (replace after tool run)') : t('pin', 'Pin File (keep active after tool run)')}>
            <ActionIcon
              aria-label={isPinned ? t('unpin', 'Unpin File (replace after tool run)') : t('pin', 'Pin File (keep active after tool run)')}
              variant="subtle"
              className={isPinned ? styles.pinned : styles.headerIconButton}
              data-tour="file-card-pin"
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
        </div>
      </div>

      {/* Title + meta line */}
      <div
      style={{
        padding: '0.5rem',
        textAlign: 'center',
        background: 'var(--file-card-bg)',
        marginTop: '0.5rem',
        marginBottom: '0.5rem',
      }}>
        <Text  size="lg" fw={700} className={styles.title}  lineClamp={2}>
          <PrivateContent>{file.name}</PrivateContent>
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
          {file.thumbnailUrl ? (
            <PrivateContent>
              <img
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
            </PrivateContent>
          ) : file.type?.startsWith('application/pdf') ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '8px'
            }}>
              <div style={{
                width: 24,
                height: 24,
                border: '3px solid #e0e0e0',
                borderTop: '3px solid #666',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ fontSize: '0.875rem', color: '#666' }}>Loading thumbnail...</span>
            </div>
          ) : null}
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

      {/* Hover Menu */}
      <HoverActionMenu
        show={showHoverMenu || isMobile}
        actions={hoverActions}
        position="outside"
      />

      {/* Close Confirmation Modal */}
      <Modal
        opened={showCloseModal}
        onClose={handleCancelClose}
        title={t('confirmClose', 'Confirm Close')}
        centered
        size="auto"
      >
        <Stack gap="md">
          <Text size="md">{t('confirmCloseMessage', 'Are you sure you want to close this file?')}</Text>
          <Text size="sm" c="dimmed" fw={500}>
            {file.name}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={handleCancelClose}>
              {t('confirmCloseCancel', 'Cancel')}
            </Button>
            <Button variant="filled" color="red" onClick={handleConfirmClose}>
              {t('confirmCloseConfirm', 'Close File')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default React.memo(FileEditorThumbnail);
