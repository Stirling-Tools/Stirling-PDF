import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import UnarchiveIcon from '@mui/icons-material/Unarchive';

import type { StirlingFileStub } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import HoverActionMenu, { type HoverAction } from '@app/components/shared/HoverActionMenu';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { useFileActionIcons } from '@app/hooks/useFileActionIcons';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { useFileContext } from '@app/contexts/FileContext';
import { useFileState } from '@app/contexts/file/fileHooks';
import { alert } from '@app/components/toast';
import { zipFileService } from '@app/services/zipFileService';
import { formatFileSize } from '@app/utils/fileUtils';
import { downloadFile } from '@app/services/downloadService';

import styles from '@app/components/fileEditor/FileEditorThumbnail.module.css';

interface FileEditorThumbnailProps {
  file: StirlingFileStub;
  index: number;
  totalFiles: number;
  onCloseFile: (fileId: FileId) => void;
  onViewFile: (fileId: FileId) => void;
  onReorderFiles?: (sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => void;
  onDownloadFile: (fileId: FileId) => void;
  onUnzipFile?: (fileId: FileId) => void;
  toolMode?: boolean;
  isSupported?: boolean;
}

const FileEditorThumbnail = ({
  file,
  onCloseFile,
  onViewFile,
  onReorderFiles,
  onDownloadFile,
  onUnzipFile,
  isSupported = true,
}: FileEditorThumbnailProps) => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const DownloadIcon = icons.download;
  const { actions: fileActions, selectors } = useFileContext();
  const { state } = useFileState();
  const isMobile = useIsMobile();

  const hasError = state.ui.errorFileIds.includes(file.id);
  const isZipFile = zipFileService.isZipFileStub(file);
  const extLower = useMemo(() => (/\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1] || '').toLowerCase(), [file.name]);
  const isCBZ = extLower === 'cbz';
  const isCBR = extLower === 'cbr';

  const [isDragging, setIsDragging] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Thumbnail aspect ratio
  const firstPageRotation = file.processedFile?.pages?.[0]?.rotation ?? 0;
  const normalizedRotation = ((firstPageRotation % 360) + 360) % 360;
  const isLandscapeRotation = normalizedRotation === 90 || normalizedRotation === 270;

  const [thumbAspect, setThumbAspect] = useState<number | null>(null);

  const metaAspect = useMemo(() => {
    const page0 = file.processedFile?.pages?.[0];
    const w = page0?.width;
    const h = page0?.height;
    if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) return null;
    const r = w / h;
    return isLandscapeRotation ? 1 / r : r;
  }, [file.processedFile?.pages, isLandscapeRotation]);

  const effectiveThumbAspect = thumbAspect ?? metaAspect ?? (8.5 / 11);
  const slotAspect = 8.5 / 11;
  const fitByHeight = effectiveThumbAspect < slotAspect;

  const handleThumbLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      let r = w / h;
      if (isLandscapeRotation && r < 1) r = 1 / r;
      if (!Number.isFinite(r) || r <= 0) return;
      setThumbAspect(r);
    },
    [isLandscapeRotation]
  );

  // Drag & drop
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const dragCleanup = draggable({
      element,
      getInitialData: () => ({ type: 'file', fileId: file.id, selectedFiles: [file.id] }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const dropCleanup = dropTargetForElements({
      element,
      getData: () => ({ type: 'file', fileId: file.id }),
      canDrop: ({ source }) => source.data.type === 'file' && source.data.fileId !== file.id,
      onDrop: ({ source }) => {
        const sourceData = source.data;
        if (sourceData.type === 'file' && onReorderFiles) {
          onReorderFiles(sourceData.fileId as FileId, file.id, sourceData.selectedFiles as FileId[]);
        }
      },
    });

    return () => { dragCleanup(); dropCleanup(); };
  }, [file.id, onReorderFiles]);

  // Close confirmation
  const handleCloseWithConfirmation = useCallback(() => setShowCloseModal(true), []);
  const handleCancelClose = useCallback(() => setShowCloseModal(false), []);
  const handleConfirmClose = useCallback(() => {
    onCloseFile(file.id);
    alert({ alertType: 'neutral', title: `Closed ${file.name}`, expandable: false, durationMs: 3500 });
    setShowCloseModal(false);
  }, [file.id, file.name, onCloseFile]);

  const handleSaveAndClose = useCallback(async () => {
    const fileToSave = selectors.getFile(file.id);
    if (fileToSave) {
      try {
        const result = await downloadFile({ data: fileToSave, filename: file.name, localPath: file.localFilePath });
        if (!result.cancelled && result.savedPath) {
          fileActions.updateStirlingFileStub(file.id, { localFilePath: file.localFilePath ?? result.savedPath, isDirty: false });
        } else if (result.cancelled) {
          setShowCloseModal(false);
          return;
        }
      } catch {
        alert({ alertType: 'error', title: 'Save failed', body: `Could not save ${file.name}`, expandable: true });
        setShowCloseModal(false);
        return;
      }
    }
    onCloseFile(file.id);
    alert({ alertType: 'success', title: `Saved and closed ${file.name}`, expandable: false, durationMs: 3500 });
    setShowCloseModal(false);
  }, [file.id, file.name, file.localFilePath, onCloseFile, selectors, fileActions]);

  // Meta line
  const metaLabel = useMemo(() => {
    const parts: string[] = [];
    const pages = file.processedFile?.totalPages;
    if (pages) parts.push(`${pages}p`);
    parts.push(formatFileSize(file.size));
    return parts.join(' · ');
  }, [file.processedFile?.totalPages, file.size]);

  // Hover actions
  const hoverActions = useMemo<HoverAction[]>(() => [
    {
      id: 'view',
      icon: <VisibilityIcon style={{ fontSize: 18 }} />,
      label: t('openInViewer', 'Open in Viewer'),
      onClick: (e) => { e.stopPropagation(); onViewFile(file.id); },
    },
    {
      id: 'download',
      icon: <DownloadIcon style={{ fontSize: 18 }} />,
      label: terminology.download,
      onClick: (e) => {
        e.stopPropagation();
        onDownloadFile(file.id);
        alert({ alertType: 'success', title: `Downloading ${file.name}`, expandable: false, durationMs: 2500 });
      },
    },
    {
      id: 'unzip',
      icon: <UnarchiveIcon style={{ fontSize: 18 }} />,
      label: t('fileManager.unzip', 'Unzip'),
      onClick: (e) => {
        e.stopPropagation();
        if (onUnzipFile) {
          onUnzipFile(file.id);
          alert({ alertType: 'success', title: `Unzipping ${file.name}`, expandable: false, durationMs: 2500 });
        }
      },
      hidden: !isZipFile || !onUnzipFile || isCBZ || isCBR,
    },
    {
      id: 'close',
      icon: <CloseIcon style={{ fontSize: 18 }} />,
      label: t('close', 'Close'),
      color: 'var(--mantine-color-red-6)',
      onClick: (e) => { e.stopPropagation(); handleCloseWithConfirmation(); },
    },
  ], [DownloadIcon, file.id, file.name, isZipFile, isCBR, isCBZ, onViewFile, onDownloadFile, onUnzipFile, handleCloseWithConfirmation, t, terminology.download]);

  return (
    <>
      <div
        ref={cardRef}
        className={styles.card}
        data-file-id={file.id}
        data-supported={isSupported}
        style={{ opacity: isDragging ? 0.85 : 1 }}
        onClick={() => { if (isSupported && !hasError) onViewFile(file.id); }}
        onDoubleClick={() => { if (isSupported) onViewFile(file.id); }}
        role="listitem"
      >
        <div className={styles.thumbWrap}>
          <div
            className={styles.thumbContainer}
            data-supported={isSupported}
            style={{
              ['--thumb-aspect' as any]: String(effectiveThumbAspect),
              ...(fitByHeight
                ? { height: '100%', width: 'auto', maxWidth: '100%' }
                : { width: '100%', height: 'auto', maxHeight: '100%' }),
            }}
          >
            {file.thumbnailUrl ? (
              <PrivateContent>
                <img
                  src={file.thumbnailUrl}
                  alt={file.name}
                  className={styles.thumbImage}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onLoad={handleThumbLoad}
                />
              </PrivateContent>
            ) : null}

          </div>

          <HoverActionMenu
            show={isMobile}
            visibility="cssHover"
            actions={hoverActions}
            position="inside"
          />
        </div>

        <div className={styles.fileText}>
          <p className={styles.fileName} title={file.name}>{file.name}</p>
          <p className={styles.fileMeta}>{metaLabel}</p>
        </div>
      </div>

      {/* Close confirmation modal */}
      <Modal
        opened={showCloseModal}
        onClose={handleCancelClose}
        title={t('confirmClose', 'Confirm Close')}
        centered
        size="auto"
      >
        <Stack gap="md">
          {file.isDirty && file.localFilePath ? (
            <>
              <Text size="md">{t('confirmCloseUnsaved', 'This file has unsaved changes.')}</Text>
              <Text size="sm" c="dimmed" fw={500}>{file.name}</Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="light" onClick={handleCancelClose}>{t('confirmCloseCancel', 'Cancel')}</Button>
                <Button variant="filled" color="red" onClick={handleConfirmClose}>{t('confirmCloseDiscard', 'Discard changes and close')}</Button>
                <Button variant="filled" onClick={handleSaveAndClose}>{t('confirmCloseSave', 'Save and close')}</Button>
              </Group>
            </>
          ) : (
            <>
              <Text size="md">{t('confirmCloseMessage', 'Are you sure you want to close this file?')}</Text>
              <Text size="sm" c="dimmed" fw={500}>{file.name}</Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="light" onClick={handleCancelClose}>{t('confirmCloseCancel', 'Cancel')}</Button>
                <Button variant="filled" color="red" onClick={handleConfirmClose}>{t('confirmCloseConfirm', 'Close File')}</Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
};

export default React.memo(FileEditorThumbnail);
