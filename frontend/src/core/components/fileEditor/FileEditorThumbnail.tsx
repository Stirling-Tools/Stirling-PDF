import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  Text,
  Modal,
  Button,
  Group,
  Stack,
  Loader,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { alert } from "@app/components/toast";
import { useTranslation } from "react-i18next";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LinkIcon from "@mui/icons-material/Link";
import PushPinIcon from "@mui/icons-material/PushPin";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { StirlingFileStub } from "@app/types/fileContext";
import { zipFileService } from "@app/services/zipFileService";

import styles from "@app/components/fileEditor/FileEditorThumbnail.module.css";
import { useFileContext } from "@app/contexts/FileContext";
import { useFileState } from "@app/contexts/file/fileHooks";
import { FileId } from "@app/types/file";
import ToolChain from "@app/components/shared/ToolChain";
import HoverActionMenu, {
  HoverAction,
} from "@app/components/shared/HoverActionMenu";
import { downloadFile } from "@app/services/downloadService";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import UploadToServerModal from "@app/components/shared/UploadToServerModal";
import ShareFileModal from "@app/components/shared/ShareFileModal";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { truncateCenter } from "@app/utils/textUtils";

interface FileEditorThumbnailProps {
  file: StirlingFileStub;
  index: number;
  totalFiles: number;
  onCloseFile: (fileId: FileId) => void;
  onViewFile: (fileId: FileId) => void;
  onReorderFiles?: (
    sourceFileId: FileId,
    targetFileId: FileId,
    selectedFileIds: FileId[],
  ) => void;
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
  const DownloadOutlinedIcon = icons.download;
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

  const actualFile = useMemo(
    () => activeFiles.find((f) => f.fileId === file.id),
    [activeFiles, file.id],
  );
  const isPinned = actualFile ? isFilePinned(actualFile) : false;

  const isZipFile = zipFileService.isZipFileStub(file);

  const hasError = state.ui.errorFileIds.includes(file.id);
  const pageCount = file.processedFile?.totalPages || 0;
  const isEncrypted = Boolean(file.processedFile?.isEncrypted);

  // Aspect ratio from page dimensions, falling back to letter size
  const firstPage = file.processedFile?.pages?.[0];
  const firstPageRotation = firstPage?.rotation ?? 0;
  const isLandscape = firstPageRotation === 90 || firstPageRotation === 270;
  const thumbAspect = (() => {
    const w = firstPage?.width;
    const h = firstPage?.height;
    if (w && h && w > 0 && h > 0) {
      return isLandscape ? `${h} / ${w}` : `${w} / ${h}`;
    }
    return isLandscape ? "11 / 8.5" : "8.5 / 11";
  })();

  const handleRef = useRef<HTMLSpanElement | null>(null);
  const dragElementRef = useRef<HTMLDivElement | null>(null);

  const extUpper = useMemo(() => {
    const m = /\.([a-z0-9]+)$/i.exec(file.name ?? "");
    return (m?.[1] || "").toUpperCase();
  }, [file.name]);

  const extLower = useMemo(() => {
    const m = /\.([a-z0-9]+)$/i.exec(file.name ?? "");
    return (m?.[1] || "").toLowerCase();
  }, [file.name]);

  const isCBZ = extLower === "cbz";
  const isCBR = extLower === "cbr";

  const uploadEnabled = config?.storageEnabled === true;
  const sharingEnabled =
    uploadEnabled && config?.storageSharingEnabled === true;
  const shareLinksEnabled =
    sharingEnabled && config?.storageShareLinksEnabled === true;
  const isOwnedOrLocal = file.remoteOwnedByCurrentUser !== false;
  const isSharedFile =
    file.remoteOwnedByCurrentUser === false || file.remoteSharedViaLink;
  const localUpdatedAt = file.createdAt ?? file.lastModified ?? 0;
  const remoteUpdatedAt = file.remoteStorageUpdatedAt ?? 0;
  const isUploaded = Boolean(file.remoteStorageId);
  const isUpToDate = isUploaded && remoteUpdatedAt >= localUpdatedAt;
  const canUpload =
    uploadEnabled &&
    isOwnedOrLocal &&
    file.isLeaf &&
    (!isUploaded || !isUpToDate);
  const canShare = shareLinksEnabled && isOwnedOrLocal && file.isLeaf;

  const pageLabel = useMemo(
    () =>
      pageCount > 0 ? `${pageCount} ${pageCount === 1 ? "Page" : "Pages"}` : "",
    [pageCount],
  );

  const dateLabel = useMemo(() => {
    const d = new Date(file.lastModified);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(d);
  }, [file.lastModified]);

  const [isDragging, setIsDragging] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedEditNotice, setShowSharedEditNotice] = useState(false);
  const sharedEditNoticeShownRef = useRef(false);

  const fileElementRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;

      dragElementRef.current = element;

      const dragCleanup = draggable({
        element,
        getInitialData: () => ({
          type: "file",
          fileId: file.id,
          fileName: file.name,
          selectedFiles: [file.id],
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      });

      const dropCleanup = dropTargetForElements({
        element,
        getData: () => ({
          type: "file",
          fileId: file.id,
        }),
        canDrop: ({ source }) => {
          const sourceData = source.data;
          return sourceData.type === "file" && sourceData.fileId !== file.id;
        },
        onDrop: ({ source }) => {
          const sourceData = source.data;
          if (sourceData.type === "file" && onReorderFiles) {
            const sourceFileId = sourceData.fileId as FileId;
            const selectedFileIds = sourceData.selectedFiles as FileId[];
            onReorderFiles(sourceFileId, file.id, selectedFileIds);
          }
        },
      });

      return () => {
        dragCleanup();
        dropCleanup();
      };
    },
    [file.id, file.name, onReorderFiles],
  );

  const handleCloseWithConfirmation = useCallback(
    () => setShowCloseModal(true),
    [],
  );
  const handleCancelClose = useCallback(() => setShowCloseModal(false), []);

  const handleConfirmClose = useCallback(() => {
    onCloseFile(file.id);
    alert({
      alertType: "neutral",
      title: `Closed ${file.name}`,
      expandable: false,
      durationMs: 3500,
    });
    setShowCloseModal(false);
  }, [file.id, file.name, onCloseFile]);

  const handleSaveAndClose = useCallback(async () => {
    const fileToSave = selectors.getFile(file.id);
    if (fileToSave) {
      try {
        const result = await downloadFile({
          data: fileToSave,
          filename: file.name,
          localPath: file.localFilePath,
        });
        if (!result.cancelled && result.savedPath) {
          fileActions.updateStirlingFileStub(file.id, {
            localFilePath: file.localFilePath ?? result.savedPath,
            isDirty: false,
          });
        } else if (result.cancelled) {
          setShowCloseModal(false);
          return;
        }
      } catch (error) {
        console.error(`Failed to save ${file.name}:`, error);
        alert({
          alertType: "error",
          title: "Save failed",
          body: `Could not save ${file.name}`,
          expandable: true,
        });
        setShowCloseModal(false);
        return;
      }
    }
    onCloseFile(file.id);
    alert({
      alertType: "success",
      title: `Saved and closed ${file.name}`,
      expandable: false,
      durationMs: 3500,
    });
    setShowCloseModal(false);
  }, [
    file.id,
    file.name,
    file.localFilePath,
    onCloseFile,
    selectors,
    fileActions,
  ]);

  const hoverActions = useMemo<HoverAction[]>(
    () => [
      {
        id: "view",
        icon: <VisibilityIcon style={{ fontSize: 20 }} />,
        label: t("openInViewer", "Open in Viewer"),
        onClick: (e) => {
          e.stopPropagation();
          onViewFile(file.id);
        },
      },
      {
        id: "pin",
        icon: <PushPinIcon style={{ fontSize: 20 }} />,
        label: isPinned
          ? t("unpin", "Unpin File (replace after tool run)")
          : t("pin", "Pin File (keep active after tool run)"),
        onClick: (e) => {
          e.stopPropagation();
          if (actualFile) {
            if (isPinned) {
              unpinFile(actualFile);
              alert({
                alertType: "neutral",
                title: `Unpinned ${file.name}`,
                expandable: false,
                durationMs: 3000,
              });
            } else {
              pinFile(actualFile);
              alert({
                alertType: "success",
                title: `Pinned ${file.name}`,
                expandable: false,
                durationMs: 3000,
              });
            }
          }
        },
      },
      {
        id: "download",
        icon: <DownloadOutlinedIcon style={{ fontSize: 20 }} />,
        label: terminology.download,
        onClick: (e) => {
          e.stopPropagation();
          onDownloadFile(file.id);
        },
      },
      ...(canUpload
        ? [
            {
              id: "upload",
              icon: <CloudUploadIcon style={{ fontSize: 20 }} />,
              label: isUploaded
                ? t("fileManager.updateOnServer", "Update on Server")
                : t("fileManager.uploadToServer", "Upload to Server"),
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setShowUploadModal(true);
              },
            },
          ]
        : []),
      ...(canShare
        ? [
            {
              id: "share",
              icon: <LinkIcon style={{ fontSize: 20 }} />,
              label: t("fileManager.share", "Share"),
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setShowShareModal(true);
              },
            },
          ]
        : []),
      {
        id: "unzip",
        icon: <UnarchiveIcon style={{ fontSize: 20 }} />,
        label: t("fileManager.unzip", "Unzip"),
        onClick: (e) => {
          e.stopPropagation();
          if (onUnzipFile) {
            onUnzipFile(file.id);
            alert({
              alertType: "success",
              title: `Unzipping ${file.name}`,
              expandable: false,
              durationMs: 2500,
            });
          }
        },
        hidden: !isZipFile || !onUnzipFile || isCBZ || isCBR,
      },
      {
        id: "close",
        icon: <CloseIcon style={{ fontSize: 20 }} />,
        label: t("close", "Close"),
        onClick: (e) => {
          e.stopPropagation();
          handleCloseWithConfirmation();
        },
        color: "red",
      },
    ],
    [
      t,
      file.id,
      file.name,
      isZipFile,
      isCBZ,
      isCBR,
      isPinned,
      actualFile,
      terminology,
      DownloadOutlinedIcon,
      onViewFile,
      onDownloadFile,
      onUnzipFile,
      handleCloseWithConfirmation,
      canUpload,
      canShare,
      isUploaded,
      pinFile,
      unpinFile,
    ],
  );

  const handleCardClick = () => {
    if (!isSupported) return;
    if (hasError) {
      try {
        fileActions.clearFileError(file.id);
      } catch (_e) {
        void _e;
      }
    }
    if (isSharedFile && !sharedEditNoticeShownRef.current) {
      sharedEditNoticeShownRef.current = true;
      setShowSharedEditNotice(true);
    }
  };

  const handleCardDoubleClick = () => {
    if (!isSupported) return;
    onViewFile(file.id);
  };

  const metaLine = [dateLabel, extUpper ? `${extUpper} file` : "", pageLabel]
    .filter(Boolean)
    .join(" - ");

  return (
    <div
      ref={fileElementRef}
      data-file-id={file.id}
      data-testid="file-thumbnail"
      data-tour="file-card-checkbox"
      data-supported={isSupported}
      className={`${styles.card} select-none`}
      style={{ opacity: isDragging ? 0.9 : 1 }}
      tabIndex={0}
      role="listitem"
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
    >
      <div className={styles.thumbInner}>
        {/* Thumbnail area */}
        <div className={styles.thumbWrap}>
          {/* thumbUnit groups toolchain + card so they center together, keeping text tight above the card */}
          <div className={styles.thumbUnit}>
            {/* Tool chain bar — always rendered for consistent height, content only when history exists */}
            <div className={styles.toolChainBar}>
              {file.toolHistory && file.toolHistory.length > 0 && (
                <ToolChain
                  toolChain={file.toolHistory}
                  displayStyle="text"
                  size="xs"
                  maxWidth="100%"
                  color="var(--mantine-color-gray-7)"
                />
              )}
            </div>

            <div
              className={styles.thumbContainer}
              data-supported={isSupported}
              style={{ "--thumb-aspect": thumbAspect } as React.CSSProperties}
            >
              {/* Error overlay */}
              {hasError && (
                <div className={styles.errorOverlay}>
                  <span className={styles.errorPill}>
                    {t("error._value", "Error")}
                  </span>
                </div>
              )}

              {/* Thumbnail image or loading state */}
              {file.thumbnailUrl ? (
                <PrivateContent>
                  <img
                    src={file.thumbnailUrl}
                    alt={file.name}
                    className={styles.thumbImage}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </PrivateContent>
              ) : file.type?.startsWith("application/pdf") ? (
                <Stack
                  align="center"
                  justify="center"
                  gap="xs"
                  style={{ height: "100%" }}
                >
                  <Loader size="sm" />
                  <Text size="xs" c="dimmed">
                    Loading thumbnail...
                  </Text>
                </Stack>
              ) : null}

              {/* Badges — visible on hover via CSS */}
              <div className={styles.thumbBadges}>
                <span className={styles.versionBadgeThumb}>
                  v{file.versionNumber}
                </span>
                {isPinned && (
                  <span className={styles.pinnedBadge}>
                    <PushPinIcon style={{ fontSize: 12 }} />
                  </span>
                )}
                {isSharedFile && !isOwnedOrLocal && (
                  <span className={styles.ownershipBadge}>
                    {t("fileManager.sharedWithYou", "Shared")}
                  </span>
                )}
                {isEncrypted && (
                  <Tooltip
                    label={t(
                      "encryptedPdfUnlock.unlockPrompt",
                      "Unlock PDF to continue",
                    )}
                  >
                    <ActionIcon
                      size="xs"
                      variant="filled"
                      color="yellow"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEncryptedUnlockPrompt(file.id);
                      }}
                      style={{ pointerEvents: "auto" }}
                    >
                      <LockOpenIcon style={{ fontSize: 12 }} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
          {/* end thumbUnit */}

          {/* Drag handle */}
          <span ref={handleRef} className={styles.dragHandle} aria-hidden>
            <DragIndicatorIcon fontSize="small" />
          </span>
        </div>

        {/* Hover action menu — visibility driven by CSS on desktop, always shown on mobile */}
        <HoverActionMenu
          show={isMobile}
          actions={hoverActions}
          position="outside"
          visibility="cssHover"
        />
      </div>

      {/* File name + meta */}
      <div className={styles.fileText}>
        <p className={styles.fileName}>
          <PrivateContent>{truncateCenter(file.name, 40)}</PrivateContent>
        </p>
        <p className={styles.fileMeta}>{metaLine}</p>
      </div>

      {/* Close Confirmation Modal */}
      <Modal
        opened={showCloseModal}
        onClose={handleCancelClose}
        title={t("confirmClose", "Confirm Close")}
        centered
        size="auto"
      >
        <Stack gap="md">
          {file.isDirty && file.localFilePath ? (
            <>
              <Text size="md">
                {t("confirmCloseUnsaved", "This file has unsaved changes.")}
              </Text>
              <Text size="sm" c="dimmed" fw={500}>
                <PrivateContent>{file.name}</PrivateContent>
              </Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="light" onClick={handleCancelClose}>
                  {t("confirmCloseCancel", "Cancel")}
                </Button>
                <Button
                  variant="filled"
                  color="red"
                  onClick={handleConfirmClose}
                >
                  {t("confirmCloseDiscard", "Discard changes and close")}
                </Button>
                <Button variant="filled" onClick={handleSaveAndClose}>
                  {t("confirmCloseSave", "Save and close")}
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Text size="md">
                {t(
                  "confirmCloseMessage",
                  "Are you sure you want to close this file?",
                )}
              </Text>
              <Text size="sm" c="dimmed" fw={500}>
                <PrivateContent>{file.name}</PrivateContent>
              </Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="light" onClick={handleCancelClose}>
                  {t("confirmCloseCancel", "Cancel")}
                </Button>
                <Button
                  variant="filled"
                  color="red"
                  onClick={handleConfirmClose}
                >
                  {t("confirmCloseConfirm", "Close File")}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* Shared edit notice modal */}
      <Modal
        opened={showSharedEditNotice}
        onClose={() => setShowSharedEditNotice(false)}
        title={t("fileManager.sharedEditNoticeTitle", "Read-only server copy")}
        centered
        size="auto"
      >
        <Stack gap="md">
          <Text size="sm">
            {t(
              "fileManager.sharedEditNoticeBody",
              "You do not have edit rights to the server version of this file. Any edits you make will be saved as a local copy.",
            )}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button onClick={() => setShowSharedEditNotice(false)}>
              {t("fileManager.sharedEditNoticeConfirm", "Got it")}
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
    </div>
  );
};

export default React.memo(FileEditorThumbnail);
