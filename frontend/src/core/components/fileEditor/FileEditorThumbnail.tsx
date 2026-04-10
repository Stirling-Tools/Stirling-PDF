import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LinkIcon from '@mui/icons-material/Link';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import LockOpenIcon from '@mui/icons-material/LockOpen';

import type { StirlingFileStub } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import HoverActionMenu, { type HoverAction } from '@app/components/shared/HoverActionMenu';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { useFileActionIcons } from '@app/hooks/useFileActionIcons';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { useFileContext } from '@app/contexts/FileContext';
import { useFileState } from '@app/contexts/file/fileHooks';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { alert } from '@app/components/toast';
import { zipFileService } from '@app/services/zipFileService';
import { formatFileSize } from '@app/utils/fileUtils';
import { downloadFile } from '@app/services/downloadService';
import ToolChain from '@app/components/shared/ToolChain';
import UploadToServerModal from '@app/components/shared/UploadToServerModal';
import ShareFileModal from '@app/components/shared/ShareFileModal';

import styles from '@app/components/fileEditor/FileEditorThumbnail.module.css';

interface FileEditorThumbnailProps {
  file: StirlingFileStub;
  index: number;
  totalFiles: number;
  onCloseFile: (fileId: FileId) => void;
  onViewFile: (fileId: FileId) => void;
  _onSetStatus?: (status: string) => void;
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
  const { config } = useAppConfig();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const DownloadIcon = icons.download;
  const {
    pinFile,
    unpinFile,
    isFilePinned,
    activeFiles,
    actions: fileActions,
    openEncryptedUnlockPrompt,
  } = useFileContext();
  const { state, selectors } = useFileState();
  const isMobile = useIsMobile();

  const hasError = state.ui.errorFileIds.includes(file.id);
  const isZipFile = zipFileService.isZipFileStub(file);

  const extLower = useMemo(() => (/\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1] || '').toLowerCase(), [file.name]);
  const extUpper = useMemo(() => (/\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1] || '').toUpperCase(), [file.name]);
  const isCBZ = extLower === 'cbz';
  const isCBR = extLower === 'cbr';

  // ---- Upload / share config ----
  const uploadEnabled = config?.storageEnabled === true;
  const sharingEnabled = uploadEnabled && config?.storageSharingEnabled === true;
  const shareLinksEnabled = sharingEnabled && config?.storageShareLinksEnabled === true;
  const isOwnedOrLocal = file.remoteOwnedByCurrentUser !== false;
  const isSharedFile = file.remoteOwnedByCurrentUser === false || file.remoteSharedViaLink;
  const localUpdatedAt = file.createdAt ?? file.lastModified ?? 0;
  const remoteUpdatedAt = file.remoteStorageUpdatedAt ?? 0;
  const isUploaded = Boolean(file.remoteStorageId);
  const isUpToDate = isUploaded && remoteUpdatedAt >= localUpdatedAt;
  const isEncrypted = Boolean(file.processedFile?.isEncrypted);
  const pageCount = file.processedFile?.totalPages || 0;

  const canUpload = uploadEnabled && isOwnedOrLocal && file.isLeaf && (!isUploaded || !isUpToDate);
  const canShare = shareLinksEnabled && isOwnedOrLocal && file.isLeaf;

  // ---- Pin state ----
  const actualFile = useMemo(() => activeFiles.find(f => f.fileId === file.id), [activeFiles, file.id]);
  const isPinned = actualFile ? isFilePinned(actualFile) : false;

  // ---- Drag state ----
  const [isDragging, setIsDragging] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedEditNotice, setShowSharedEditNotice] = useState(false);
  const sharedEditNoticeShownRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ---- Thumbnail aspect ratio + rotation ----
  const firstPageRotation = file.processedFile?.pages?.[0]?.rotation ?? 0;
  const normalizedRotation = ((firstPageRotation % 360) + 360) % 360;
  const isLandscapeRotation = normalizedRotation === 90 || normalizedRotation === 270;

  const [thumbAspect, setThumbAspect] = useState<number | null>(null);
  const [thumbNeedsCssRotation, setThumbNeedsCssRotation] = useState(false);

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

  // Reserve 22px (16px text + 6px gap) when tool history exists so thumbContainer
  // shrinks to make room, keeping the tool chain flush above the thumbnail.
  const thumbWrapHeight = 260;
  const thumbMaxHeight = file.toolHistory?.length ? thumbWrapHeight - 22 : thumbWrapHeight;

  const handleThumbLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      const naturalRatio = w / h;
      const thumbnailIsPortrait = naturalRatio < 1;
      if (isLandscapeRotation && thumbnailIsPortrait) {
        setThumbAspect(1 / naturalRatio);
        setThumbNeedsCssRotation(true);
      } else {
        setThumbAspect(naturalRatio);
        setThumbNeedsCssRotation(false);
      }
    },
    [isLandscapeRotation]
  );

  // ---- Drag & drop ----
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

  // ---- Close confirmation ----
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
      } catch (error) {
        console.error(`Failed to save ${file.name}:`, error);
        alert({ alertType: 'error', title: 'Save failed', body: `Could not save ${file.name}`, expandable: true });
        setShowCloseModal(false);
        return;
      }
    }
    onCloseFile(file.id);
    alert({ alertType: 'success', title: `Saved and closed ${file.name}`, expandable: false, durationMs: 3500 });
    setShowCloseModal(false);
  }, [file.id, file.name, file.localFilePath, onCloseFile, selectors, fileActions]);


  // ---- Meta line (format: Apr 10, 2026 - PDF file - 3 Pages) ----
  const dateLabel = useMemo(() => {
    const d = new Date(file.lastModified);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).format(d);
  }, [file.lastModified]);

  const pageLabel = useMemo(
    () => pageCount > 0 ? t('fileEditor.pageCount', { count: pageCount }) : '',
    [pageCount, t]
  );

  const metaLabel = useMemo(() => {
    const parts: string[] = [];
    if (dateLabel) parts.push(dateLabel);
    if (extUpper) parts.push(`${extUpper} file`);
    if (pageLabel) parts.push(pageLabel);
    if (!parts.length) parts.push(formatFileSize(file.size));
    return parts.join(' - ');
  }, [dateLabel, extUpper, pageLabel, file.size]);

  // ---- Hover actions ----
  const hoverActions = useMemo<HoverAction[]>(() => [
    {
      id: 'view',
      icon: <VisibilityIcon style={{ fontSize: 18 }} />,
      label: t('openInViewer', 'Open in Viewer'),
      onClick: (e) => { e.stopPropagation(); onViewFile(file.id); },
    },
    {
      id: 'pin',
      icon: isPinned ? <PushPinIcon style={{ fontSize: 18 }} /> : <PushPinOutlinedIcon style={{ fontSize: 18 }} />,
      label: isPinned
        ? t('unpin', 'Unpin File (replace after tool run)')
        : t('pin', 'Pin File (keep active after tool run)'),
      onClick: (e) => {
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
      },
    },
    {
      id: 'unlock',
      icon: <LockOpenIcon style={{ fontSize: 18 }} />,
      label: t('encryptedPdfUnlock.unlockPrompt', 'Unlock PDF to continue'),
      onClick: (e) => { e.stopPropagation(); openEncryptedUnlockPrompt(file.id); },
      hidden: !isEncrypted,
    },
    {
      id: 'upload',
      icon: <CloudUploadIcon style={{ fontSize: 18 }} />,
      label: isUploaded
        ? t('fileManager.updateOnServer', 'Update on Server')
        : t('fileManager.uploadToServer', 'Upload to Server'),
      onClick: (e) => { e.stopPropagation(); setShowUploadModal(true); },
      hidden: !canUpload,
    },
    {
      id: 'share',
      icon: <LinkIcon style={{ fontSize: 18 }} />,
      label: t('fileManager.share', 'Share'),
      onClick: (e) => { e.stopPropagation(); setShowShareModal(true); },
      hidden: !canShare,
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
  ], [
    DownloadIcon,
    file.id,
    file.name,
    isZipFile,
    isCBR,
    isCBZ,
    isPinned,
    actualFile,
    isEncrypted,
    canUpload,
    canShare,
    isUploaded,
    onViewFile,
    onDownloadFile,
    onUnzipFile,
    handleCloseWithConfirmation,
    pinFile,
    unpinFile,
    openEncryptedUnlockPrompt,
    t,
    terminology.download,
  ]);

  return (
    <>
      <div
        ref={cardRef}
        className={styles.card}
        data-file-id={file.id}
        data-supported={isSupported}
        data-has-error={hasError}
        style={{ opacity: isDragging ? 0.85 : 1 }}
        onClick={() => {
          if (!isSupported) return;
          if (isSharedFile && !sharedEditNoticeShownRef.current) {
            sharedEditNoticeShownRef.current = true;
            setShowSharedEditNotice(true);
          }
          if (isSupported && !hasError) onViewFile(file.id);
        }}
        onDoubleClick={() => { if (isSupported) onViewFile(file.id); }}
        role="listitem"
      >
        <div className={styles.thumbWrap}>
          <div className={styles.thumbInner}>
            {/* ToolChain sits directly above thumbnail; space always reserved when present */}
            {file.toolHistory && file.toolHistory.length > 0 && (
              <div className={styles.toolChainBar}>
                <ToolChain
                  toolChain={file.toolHistory}
                  displayStyle="text"
                  size="xs"
                  maxWidth="100%"
                  color="var(--text-secondary)"
                />
              </div>
            )}

            <div
              className={styles.thumbContainer}
              data-supported={isSupported}
              style={{
                ['--thumb-aspect' as any]: String(effectiveThumbAspect),
                ...(fitByHeight
                  ? { height: `${thumbMaxHeight}px`, width: 'auto', maxWidth: '100%' }
                  : { width: '100%', height: 'auto', maxHeight: `${thumbMaxHeight}px` }),
              }}
            >
              {/* Error overlay */}
              {hasError && (
                <div className={styles.errorOverlay}>
                  <span className={styles.errorPill}>{t('error._value', 'Error')}</span>
                </div>
              )}

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
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                      img.parentElement?.setAttribute('data-thumb-missing', 'true');
                    }}
                    style={thumbNeedsCssRotation ? {
                      transform: `rotate(${normalizedRotation}deg)`,
                      width: '100%',
                      height: '100%',
                    } : undefined}
                  />
                </PrivateContent>
              ) : null}

              {/* Badges: shared + version + pinned — visible on hover */}
              {(isSharedFile || file.versionNumber != null || isPinned) && (
                <div className={styles.thumbBadges}>
                  {isSharedFile && (
                    <span className={styles.ownershipBadge}>
                      {t('fileManager.shared', 'Shared')}
                    </span>
                  )}
                  {file.versionNumber != null && (
                    <span className={styles.versionBadgeThumb}>
                      v{file.versionNumber}
                    </span>
                  )}
                  {isPinned && (
                    <span className={styles.pinnedBadge}>
                      <PushPinIcon style={{ fontSize: 10 }} />
                    </span>
                  )}
                </div>
              )}
            </div>

            <HoverActionMenu
              show={isMobile}
              visibility="cssHover"
              actions={hoverActions}
              position="inside"
            />
          </div>
        </div>

        <div className={styles.fileText}>
          <p className={styles.fileName} title={file.name}>{file.name}</p>
          <p className={styles.fileMeta}>{metaLabel}</p>
        </div>
      </div>

      {/* Close Confirmation Modal */}
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

      {/* Shared edit notice modal */}
      <Modal
        opened={showSharedEditNotice}
        onClose={() => setShowSharedEditNotice(false)}
        title={t('fileManager.sharedEditNoticeTitle', 'Read-only server copy')}
        centered
        size="auto"
      >
        <Stack gap="md">
          <Text size="sm">
            {t(
              'fileManager.sharedEditNoticeBody',
              'You do not have edit rights to the server version of this file. Any edits you make will be saved as a local copy.'
            )}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button onClick={() => setShowSharedEditNotice(false)}>
              {t('fileManager.sharedEditNoticeConfirm', 'Got it')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {canUpload && (
        <UploadToServerModal
          opened={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          file={file}
        />
      )}
      {canShare && (
        <ShareFileModal
          opened={showShareModal}
          onClose={() => setShowShareModal(false)}
          file={file}
        />
      )}
    </>
  );
};

export default React.memo(FileEditorThumbnail);
