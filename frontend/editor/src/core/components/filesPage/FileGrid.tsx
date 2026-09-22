import React, { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox, Loader, Menu, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { PolicyBadges as PolicyBadgeRow } from "@app/components/shared/PolicyBadges";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";
import { FileId } from "@app/types/file";
import {
  FolderId,
  FolderRecord,
  ROOT_FOLDER_ID,
  folderKind,
} from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";
import {
  useVirtualFileRows,
  rowHeightPx,
} from "@app/components/filesPage/useVirtualFileRows";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
  serialiseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import { useDropTarget } from "@app/components/filesPage/useDropTarget";
import {
  getFileOrigin,
  isBrowserOnlyFile,
} from "@app/components/filesPage/fileOrigin";
import { libraryFileDate } from "@app/components/filesPage/libraryFileDate";
import { FileOriginBadge } from "@app/components/filesPage/FileOriginBadge";
import { FolderProcessingTag } from "@app/components/filesPage/FolderProcessingTag";
import { FolderOriginBadge } from "@app/components/filesPage/FolderOriginBadge";
import { DiskLinkBadge } from "@app/components/filesPage/DiskLinkBadge";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";
import { useProcessingFolderCounts } from "@app/components/filesPage/processingFolderCounts";
import { findFolderIcon } from "@app/components/filesPage/folderIcons";
import { FolderMenu } from "@app/components/filesPage/FolderMenu";
import {
  useLazyThumbnail,
  useDiskThumbnail,
} from "@app/hooks/useLazyThumbnail";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import type { FilesPageSortMode } from "@app/contexts/FilesPageContext";
import { OpenInNewWindowMenuItem } from "@app/components/filesPage/OpenInNewWindowMenuItem";

export type FilesPageViewMode = "grid" | "list";

/** A disk file's place in its working folder's pipeline, when one is attached. */
export type DiskFileState = "done" | "processing" | "failed" | "waiting";

export interface FilesPageEntry {
  kind: "folder" | "file" | "diskFile";
  folder?: FolderRecord;

  folderFileCount?: number;
  file?: StirlingFileStub;

  disk?: DiskFileEntry;
  /** The disk file's processing state; absent on a folder with no pipeline. */
  diskState?: DiskFileState;
  hasOriginal?: boolean;
  /** Parent breadcrumb path for search results outside the current folder. */
  parentPath?: string;
}

/** Picker mode hides library mutations; opening a file confirms its selection. */
export interface FileGridPicker {
  foldersOnly?: boolean;
  /** Format and processing eligibility only; capacity and busy state must not change the selection count. */
  isEligible: (entry: FilesPageEntry) => boolean;
  selectionDisabled: boolean;
  disabledReason: (entry: FilesPageEntry) => string | undefined;
  selectedDiskPaths: ReadonlySet<string>;
  onSelectDiskFile: (entry: DiskFileEntry, shift: boolean) => void;
  onSetDiskSelection: (entries: DiskFileEntry[]) => void;
  onUnzipFile: (file: StirlingFileStub) => void;
}

interface FileGridProps {
  picker?: FileGridPicker;
  entries: FilesPageEntry[];
  selectedFileIds: Set<FileId>;

  activeWorkspaceFileIds?: Set<string>;
  viewMode: FilesPageViewMode;
  onSelectFile: (id: FileId, shiftKey: boolean, ctrlKey: boolean) => void;

  onSetSelection?: (ids: Set<FileId>) => void;
  onOpenFolder: (id: FolderId) => void;
  onOpenFile: (file: StirlingFileStub) => void;
  onOpenDiskFile?: (entry: DiskFileEntry) => void;

  onStartProcessing?: (folder: FolderRecord) => void;
  /** Retry one failed file, by its name in the open folder. */
  onRetryFile?: (name: string) => void;
  /** Restore one file's archived original, by its name in the open folder. */
  onRevertFile?: (name: string) => void;
  /** Ask to restore every original in a folder; the confirm dialog lives upstream. */
  onRequestRevertAll?: (folder: FolderRecord) => void;
  onMoveFiles?: (
    fileIds: FileId[],
    targetFolderId: FolderId | null,
  ) => void | Promise<void>;
  onMoveFolder?: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => void | Promise<void>;
  onRenameFolder?: (folder: FolderRecord) => void;
  onDeleteFolder?: (folder: FolderRecord) => void;
  onChangeFolderAppearance?: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => void;
  onRemoveFiles?: (fileIds: FileId[]) => void;
  onPromptMoveFiles?: (fileIds: FileId[]) => void;
  /** Per-file library upload; hidden when file already has remoteStorageId. */
  onSaveToServer?: (file: StirlingFileStub) => void;
  /** Open the version-history modal for a file (only when it has >1 version). */
  onVersionHistory?: (file: StirlingFileStub) => void;

  onDownloadFile?: (file: StirlingFileStub) => void;

  onRenameFile?: (file: StirlingFileStub) => void;

  onDuplicateFile?: (file: StirlingFileStub) => void;
  /** When set, the library upload item renders disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
  /** When supplied the list-view column headers become sortable. */
  sortMode?: FilesPageSortMode;
  onChangeSortMode?: (mode: FilesPageSortMode) => void;

  currentTab?: "all" | "cloud" | "recent" | "shared" | "sharedByMe";
  /** A filter is applied; an empty result then means "no matches", not "no files". */
  searchActive?: boolean;
  /** Cloud reachability; switches the cloud empty-state copy. */
  serverReachable?: boolean;
  /** Empty-state CTA handlers; if absent the matching button hides. */
  onEmptyUpload?: () => void;
  /** Reuse the host's folder control so header and empty-state destinations agree. */
  emptyNewFolderControl?: React.ReactNode;
  /** Non-null disables the New folder CTA with this reason as tooltip. */
  newFolderDisabledReason?: string | null;
  /** Report failures through the host; per-row context subscriptions defeat memoization. */
  onActionError?: (message: string) => void;
}

/**
 * Stable callbacks read current props through refs so selection changes do not rerender every row.
 * Keep selection-aware actions here: passing the selection Set to each row defeats React.memo.
 */
interface FileGridActions {
  selectFile: (id: FileId, shiftKey: boolean, ctrlKey: boolean) => void;
  openFolder: (id: FolderId) => void;
  openFile: (file: StirlingFileStub) => void;
  openDiskFile: (entry: DiskFileEntry) => void;
  startProcessing: (folder: FolderRecord) => void;
  retryFile: (name: string) => void;
  revertFile: (name: string) => void;
  requestRevertAll: (folder: FolderRecord) => void;

  reportError: (err: unknown, label: string) => void;
  renameFolder: (folder: FolderRecord) => void;
  deleteFolder: (folder: FolderRecord) => void;
  changeFolderAppearance: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => void;

  dropFilesOnFolder: (fileIds: FileId[], target: FolderId) => void;
  dropFolderOnFolder: (folderId: FolderId, target: FolderId) => void;
  removeFile: (id: FileId) => void;
  /** Move this file — or the whole selection when it is part of one. */
  requestMoveFile: (id: FileId) => void;
  /** Drag payload for this file — or the whole selection when selected. */
  fileDragPayload: (id: FileId) => string;
  saveToServer: (file: StirlingFileStub) => void;
  versionHistory: (file: StirlingFileStub) => void;
  downloadFile: (file: StirlingFileStub) => void;
  renameFile: (file: StirlingFileStub) => void;
  duplicateFile: (file: StirlingFileStub) => void;
  selectDiskFile: (entry: DiskFileEntry, shift: boolean) => void;
  unzipFile: (file: StirlingFileStub) => void;
}

export function FileGrid(props: FileGridProps & { loading?: boolean }) {
  const {
    viewMode,
    entries,
    loading,
    currentTab,
    searchActive,
    serverReachable,
    onEmptyUpload,
    emptyNewFolderControl,
  } = props;

  const latest = useRef(props);
  latest.current = props;
  const { t } = useTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;
  // One badge subscription avoids rebuilding the full map per row.
  const policyBadges = usePolicyFileBadges();
  const processingBlock = useServerProcessingBlock();
  const actions = useMemo<FileGridActions>(() => {
    const reportDrop = (err: unknown, label: string) => {
      console.error(`[FileGrid] ${label}`, err);
      const translate = translateRef.current;
      latest.current.onActionError?.(
        err instanceof Error
          ? translate("filesPage.error.actionFailedDetail", {
              action: label,
              message: err.message,
              defaultValue: `Could not ${label}: ${err.message}`,
            })
          : translate("filesPage.error.actionFailed", {
              action: label,
              defaultValue: `Could not ${label}.`,
            }),
      );
    };
    return {
      selectDiskFile: (entry, shift) =>
        latest.current.picker?.onSelectDiskFile(entry, shift),
      unzipFile: (file) => latest.current.picker?.onUnzipFile(file),
      selectFile: (id, shiftKey, ctrlKey) =>
        latest.current.onSelectFile(id, shiftKey, ctrlKey),
      openFolder: (id) => latest.current.onOpenFolder(id),
      openFile: (file) => latest.current.onOpenFile(file),
      openDiskFile: (entry) => latest.current.onOpenDiskFile?.(entry),
      startProcessing: (folder) => latest.current.onStartProcessing?.(folder),
      retryFile: (name) => latest.current.onRetryFile?.(name),
      revertFile: (name) => latest.current.onRevertFile?.(name),
      requestRevertAll: (folder) => latest.current.onRequestRevertAll?.(folder),
      reportError: (err, label) => reportDrop(err, label),
      renameFolder: (folder) => latest.current.onRenameFolder?.(folder),
      deleteFolder: (folder) => latest.current.onDeleteFolder?.(folder),
      changeFolderAppearance: (folderId, appearance) =>
        latest.current.onChangeFolderAppearance?.(folderId, appearance),
      dropFilesOnFolder: (fileIds, target) => {
        Promise.resolve(latest.current.onMoveFiles?.(fileIds, target)).catch(
          (err) => reportDrop(err, "move files into folder"),
        );
      },
      dropFolderOnFolder: (folderId, target) => {
        Promise.resolve(latest.current.onMoveFolder?.(folderId, target)).catch(
          (err) => reportDrop(err, "move folder"),
        );
      },
      removeFile: (id) => latest.current.onRemoveFiles?.([id]),
      requestMoveFile: (id) => {
        const selected = latest.current.selectedFileIds;
        latest.current.onPromptMoveFiles?.(
          selected.has(id) ? Array.from(selected) : [id],
        );
      },
      fileDragPayload: (id) => {
        const selected = latest.current.selectedFileIds;
        return serialiseFilesPageDragPayload({
          kind: "files",
          fileIds: selected.has(id) ? Array.from(selected) : [id],
        });
      },
      saveToServer: (file) => latest.current.onSaveToServer?.(file),
      versionHistory: (file) => latest.current.onVersionHistory?.(file),
      downloadFile: (file) => latest.current.onDownloadFile?.(file),
      renameFile: (file) => latest.current.onRenameFile?.(file),
      duplicateFile: (file) => latest.current.onDuplicateFile?.(file),
    };
  }, []);

  if (loading && entries.length === 0) {
    return <SkeletonGrid viewMode={viewMode} />;
  }

  const emptyState =
    entries.length === 0 ? (
      <EmptyState
        tab={currentTab}
        searchActive={searchActive}
        serverReachable={serverReachable}
        onUpload={onEmptyUpload}
        newFolderControl={emptyNewFolderControl}
      />
    ) : null;

  if (viewMode === "list" && (entries.length > 0 || searchActive)) {
    return (
      <ListView
        {...props}
        actions={actions}
        policyBadges={policyBadges}
        processingBlock={processingBlock}
        emptyState={emptyState}
      />
    );
  }
  if (emptyState) return emptyState;
  return (
    <GridView
      {...props}
      actions={actions}
      policyBadges={policyBadges}
      processingBlock={processingBlock}
    />
  );
}

function SkeletonGrid({ viewMode }: { viewMode: FilesPageViewMode }) {
  const placeholders = Array.from({ length: 6 });
  if (viewMode === "list") {
    return (
      <div className="files-page-list" role="grid" aria-busy="true">
        {placeholders.map((_, i) => (
          <div key={i} className="files-page-list-row files-page-skeleton-row">
            <span />
            <span
              className="files-page-skeleton-bar"
              style={{ width: "60%" }}
            />
            <span
              className="files-page-skeleton-bar"
              style={{ width: "40%" }}
            />
            <span
              className="files-page-skeleton-bar"
              style={{ width: "50%" }}
            />
            <span
              className="files-page-skeleton-bar"
              style={{ width: "55%" }}
            />
            <span />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="files-page-grid" role="list" aria-busy="true">
      {placeholders.map((_, i) => (
        <div key={i} className="files-page-card files-page-skeleton-card">
          <div className="files-page-card-thumb files-page-skeleton-bar" />
          <div className="files-page-card-body">
            <div
              className="files-page-skeleton-bar"
              style={{ height: "0.9rem", width: "70%" }}
            />
            <div
              className="files-page-skeleton-bar"
              style={{ height: "0.7rem", width: "40%", marginTop: "0.4rem" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  tab?: "all" | "cloud" | "recent" | "shared" | "sharedByMe";
  /** When true the empty list is the result of a filter, not a bare folder. */
  searchActive?: boolean;
  /** Switches the cloud empty-state copy. */
  serverReachable?: boolean;
  /** CTA handlers; absent => button hidden. */
  onUpload?: () => void;
  /** Absent => no New folder CTA. */
  newFolderControl?: React.ReactNode;
}

function EmptyState({
  tab = "all",
  searchActive = false,
  serverReachable = true,
  onUpload,
  newFolderControl,
}: EmptyStateProps) {
  const { t } = useTranslation();

  if (searchActive) {
    return (
      <div className="files-page-empty">
        <span className="files-page-empty-icon">
          <Icon name="search" size={"2.5rem"} />
        </span>
        <div className="files-page-empty-title">
          {t("filesPage.empty.noResults.title", "No matching files")}
        </div>
        <div className="files-page-empty-hint">
          {t(
            "filesPage.empty.noResults.hint",
            "No files in this folder match your filter. Try a different term or clear the filter.",
          )}
        </div>
      </div>
    );
  }

  const { titleKey, titleFallback, hintKey, hintFallback } = (() => {
    switch (tab) {
      case "cloud":
        return serverReachable
          ? {
              titleKey: "filesPage.empty.cloud.title",
              titleFallback: "No cloud files yet",
              hintKey: "filesPage.empty.cloud.hint",
              hintFallback:
                "Upload a file to start, or create a folder to organise.",
            }
          : {
              titleKey: "filesPage.empty.cloud.offlineTitle",
              titleFallback: "No cached cloud files",
              hintKey: "filesPage.empty.cloud.offlineHint",
              hintFallback: "Reconnect to load your cloud library.",
            };
      case "recent":
        return {
          titleKey: "filesPage.empty.recent.title",
          titleFallback: "Nothing modified yet",
          hintKey: "filesPage.empty.recent.hint",
          hintFallback: "Files you open or edit will appear here.",
        };
      case "shared":
        return {
          titleKey: "filesPage.empty.shared.title",
          titleFallback: "Nothing shared with you",
          hintKey: "filesPage.empty.shared.hint",
          hintFallback: "When someone shares a file via link, it appears here.",
        };
      case "sharedByMe":
        return {
          titleKey: "filesPage.empty.sharedByMe.title",
          titleFallback: "You haven't shared any files yet",
          hintKey: "filesPage.empty.sharedByMe.hint",
          hintFallback:
            "Create a share link or invite a teammate from any of your files to see it here.",
        };
      case "all":
      default:
        return {
          titleKey: "filesPage.empty.title",
          titleFallback: "This folder is empty",
          hintKey: "filesPage.empty.hint",
          hintFallback:
            "Drop PDFs anywhere on this page to upload, or use the New folder button to organise your files.",
        };
    }
  })();

  const readOnlyTab =
    tab === "recent" || tab === "shared" || tab === "sharedByMe";
  const showUpload = Boolean(onUpload) && !readOnlyTab;
  const showCreateFolder = Boolean(newFolderControl) && !readOnlyTab;
  const showCtas = showUpload || showCreateFolder;
  return (
    <div className="files-page-empty">
      <span className="files-page-empty-icon">
        <Icon name="folder" size={"2.5rem"} />
      </span>
      <div className="files-page-empty-title">{t(titleKey, titleFallback)}</div>
      <div className="files-page-empty-hint">{t(hintKey, hintFallback)}</div>
      {showCtas && (
        <div className="files-page-empty-actions">
          {showUpload && (
            <Button
              size="md"
              leftSection={<Icon name="file-up" size={20} />}
              onClick={onUpload}
            >
              {t("filesPage.empty.uploadCta", "Upload files")}
            </Button>
          )}
          {showCreateFolder && newFolderControl}
        </div>
      )}
    </div>
  );
}

type FileGridLayoutProps = FileGridProps & {
  actions: FileGridActions;
  policyBadges: Map<string, FileItemPolicyRef[]>;
  processingBlock: string | null;
};

function GridView({
  picker,
  currentTab,
  entries,
  selectedFileIds,
  activeWorkspaceFileIds,
  onSaveToServer,
  onVersionHistory,
  onDownloadFile,
  onRenameFile,
  onDuplicateFile,
  saveToServerDisabledReason,
  serverReachable,
  actions,
  policyBadges,
  processingBlock,
}: FileGridLayoutProps) {
  const { range, padTop, padBottom, setContainer } = useVirtualFileRows(
    entries.length,
    rowHeightPx(true),
    true,
  );
  return (
    <div className="files-page-grid" role="list" ref={setContainer}>
      {padTop > 0 && (
        <div
          aria-hidden="true"
          className="files-page-virtual-pad"
          style={{ height: padTop }}
        />
      )}
      {entries.slice(range.start, range.end).map((entry) => {
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderCard
              key={`folder-${entry.folder.id}`}
              selectionOnly={Boolean(picker)}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              serverReachable={serverReachable ?? false}
              processingBlock={processingBlock}
              actions={actions}
            />
          );
        }
        if (entry.kind === "diskFile" && entry.disk) {
          return (
            <DiskFileCard
              key={`disk-${entry.disk.path}`}
              selectionOnly={Boolean(picker)}
              isSelected={picker?.selectedDiskPaths.has(entry.disk.path)}
              disabledReason={picker?.disabledReason(entry)}
              entry={entry.disk}
              state={entry.diskState}
              hasOriginal={entry.hasOriginal}
              actions={actions}
            />
          );
        }
        if (entry.kind === "file" && entry.file) {
          return (
            <FileCard
              key={`file-${entry.file.id}`}
              selectionOnly={Boolean(picker)}
              disabledReason={picker?.disabledReason(entry)}
              folderPicker={picker?.foldersOnly}
              file={entry.file}
              date={libraryFileDate(entry.file, currentTab)}
              parentPath={entry.parentPath}
              processingState={entry.diskState}
              isSelected={selectedFileIds.has(entry.file.id)}
              isInWorkspace={
                activeWorkspaceFileIds?.has(entry.file.id) ?? false
              }
              multiSelectActive={
                !picker?.foldersOnly &&
                (Boolean(picker) || selectedFileIds.size >= 2)
              }
              downloadAvailable={Boolean(onDownloadFile)}
              renameAvailable={Boolean(onRenameFile)}
              duplicateAvailable={Boolean(onDuplicateFile)}
              saveToServerAvailable={Boolean(onSaveToServer)}
              versionHistoryAvailable={Boolean(onVersionHistory)}
              saveToServerDisabledReason={saveToServerDisabledReason}
              badges={policyBadges.get(entry.file.id) ?? NO_BADGES}
              actions={actions}
            />
          );
        }
        return null;
      })}
      {padBottom > 0 && (
        <div
          aria-hidden="true"
          className="files-page-virtual-pad"
          style={{ height: padBottom }}
        />
      )}
    </div>
  );
}

interface FolderItemProps {
  selectionOnly?: boolean;
  folder: FolderRecord;
  fileCount: number;

  parentPath?: string;
  serverReachable: boolean;
  processingBlock: string | null;
  actions: FileGridActions;
}

const FolderCard = React.memo(function FolderCard({
  selectionOnly,
  folder,
  fileCount,
  parentPath,
  serverReachable,
  processingBlock,
  actions,
}: FolderItemProps) {
  const { t } = useTranslation();
  const onOpen = () => actions.openFolder(folder.id);
  // Mounted folders are managed on disk; only server folders can be offline.
  const kind = folderKind(folder);
  const {
    stateFor: processingStateFor,
    enable: enableProcessing,
    disable: disableProcessing,
    remove: removeProcessingFolder,
    sweep: sweepProcessing,
    listFiles: listProcessingFiles,
  } = useProcessingFolders();
  const processing = processingStateFor(folder);

  const resumeProcessing = (label: string) =>
    Promise.resolve(enableProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const stopProcessing = (label: string) =>
    Promise.resolve(disableProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const runProcessing = (label: string) =>
    Promise.resolve(sweepProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const removeProcessing = (label: string) =>
    Promise.resolve(removeProcessingFolder(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const editsDisabled = kind === "server" && !serverReachable;
  const editsHidden = kind === "local";
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const kebabRef = useRef<HTMLButtonElement>(null);
  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        actions.dropFilesOnFolder(payload.fileIds, folder.id);
      } else if (payload.kind === "folder") {
        actions.dropFolderOnFolder(payload.folderId, folder.id);
      }
    },
  });

  return (
    <div
      role="listitem"
      tabIndex={0}
      draggable={!selectionOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          FILES_PAGE_DRAG_TYPE,
          serialiseFilesPageDragPayload({
            kind: "folder",
            folderId: folder.id,
          }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      {...(selectionOnly ? {} : dropHandlers)}
      className={`files-page-card is-folder${isDropTarget ? " is-drop-target" : ""}`}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        kebabRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter") onOpen();
      }}
    >
      <div
        className="files-page-card-thumb"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${folder.color ?? "var(--c-primary)"} 18%, var(--c-surface)), color-mix(in srgb, ${folder.color ?? "var(--c-primary)"} 6%, var(--c-surface)))`,
        }}
      >
        <FolderThumbnail
          color={folder.color}
          fileCount={fileCount}
          iconGlyph={findFolderIcon(folder.icon)?.glyph}
        />
        <div className="files-page-card-origin">
          <FolderOriginBadge folder={folder} />
        </div>
      </div>
      <div className="files-page-card-body">
        <div className="files-page-card-name" title={folder.name}>
          {folder.name}
        </div>
        {parentPath && (
          <div className="files-page-card-path" title={parentPath}>
            {t("filesPage.inPath", "in {{path}}", { path: parentPath })}
          </div>
        )}
        <div className="files-page-card-meta">
          {processing ? (
            <>
              <FolderProcessingTag enabled={processing.enabled} />
              {fileCount > 0 && (
                <span>
                  {" · "}
                  {t("filesPage.folderItems", "{{count}} items", {
                    count: fileCount,
                  })}
                </span>
              )}
            </>
          ) : fileCount === 0 ? (
            t("filesPage.folder", "Folder")
          ) : (
            t("filesPage.folderItems", "{{count}} items", {
              count: fileCount,
            })
          )}
        </div>
        {processing && !selectionOnly && (
          <ProcessingFolderStats
            recordId={processing.id}
            listFiles={listProcessingFiles}
          />
        )}
      </div>
      <div
        className="files-page-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {!selectionOnly && (
          <FolderMenu
            folder={folder}
            processing={processing}
            continuous={kind === "virtual"}
            isMount={editsHidden}
            canUnmount={folder.parentFolderId === null}
            editsDisabled={editsDisabled}
            editsDisabledHint={offlineHint}
            processingBlock={processingBlock}
            variant="kebab"
            triggerRef={kebabRef}
            onOpen={onOpen}
            onStartProcessing={() => actions.startProcessing(folder)}
            onRunProcessing={() => void runProcessing("process folder now")}
            onStopProcessing={() =>
              void stopProcessing("pause processing folder")
            }
            onResumeProcessing={() =>
              void resumeProcessing("resume processing")
            }
            onRemoveProcessing={() =>
              void removeProcessing("remove processing folder")
            }
            onEditProcessing={() => actions.startProcessing(folder)}
            onRevertAll={
              kind === "local"
                ? () => actions.requestRevertAll(folder)
                : undefined
            }
            onRename={() => actions.renameFolder(folder)}
            onChangeAppearance={(appearance) =>
              actions.changeFolderAppearance(folder.id, appearance)
            }
            onDelete={() => actions.deleteFolder(folder)}
          />
        )}
      </div>
    </div>
  );
});

/** Put actionable states first because narrow rows clip the breakdown. */
function ProcessingFolderStats({
  recordId,
  listFiles,
  variant = "card",
}: {
  recordId: string;
  listFiles: (recordId: string) => Promise<{ state: string }[]>;
  variant?: "card" | "row";
}) {
  const { t } = useTranslation();
  const counts = useProcessingFolderCounts(recordId, listFiles);
  if (!counts) return null;
  const labels = {
    done: t("filesPage.diskState.done", "Ready"),
    processing: t("filesPage.diskState.processing", "Processing"),
    failed: t("filesPage.diskState.failed", "Failed"),
    waiting: t("filesPage.diskState.waiting", "Queued"),
  } as const;
  const order =
    variant === "row"
      ? (["failed", "done", "processing", "waiting"] as const)
      : (["done", "processing", "failed", "waiting"] as const);
  const parts = order.filter((state) => (counts[state] ?? 0) > 0);
  if (parts.length === 0) return null;
  return (
    <div
      className={`files-page-folder-stats${variant === "row" ? " is-row" : ""}`}
      title={parts
        .map((state) => `${counts[state]} ${labels[state]}`)
        .join(" · ")}
    >
      {parts.map((state) => (
        <span key={state} className={`files-page-folder-stat is-${state}`}>
          {counts[state]} {labels[state]}
        </span>
      ))}
    </div>
  );
}

function FileStateBadge({
  state,
  onRetry,
}: {
  state?: DiskFileState;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  if (!state) return null;
  if (state === "done") {
    return (
      <span className="files-page-state-badge is-done">
        <Icon name="circle-check-big" size="0.85rem" />
        {t("filesPage.diskState.done", "Ready")}
      </span>
    );
  }
  if (state === "processing") {
    return (
      <span className="files-page-state-badge">
        <Loader size="0.7rem" />
        {t("filesPage.diskState.processing", "Processing")}
      </span>
    );
  }
  if (state === "failed") {
    const failed = t("filesPage.diskState.failed", "Failed");
    if (!onRetry) {
      return <span className="files-page-state-badge is-failed">{failed}</span>;
    }
    const retryHint = t("filesPage.diskState.retryHint", "Run this file again");
    return (
      <button
        type="button"
        className="files-page-state-badge is-failed files-page-state-retry"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        title={retryHint}
        aria-label={`${failed}: ${retryHint}`}
      >
        {/* Reserve both labels' widths to prevent a hover layout shift. */}
        <span className="files-page-state-retry-rest" aria-hidden="true">
          {failed}
        </span>
        <span className="files-page-state-retry-hover" aria-hidden="true">
          <Icon name="rotate-ccw" size="0.8rem" />
          {t("filesPage.diskState.retry", "Retry")}
        </span>
      </button>
    );
  }
  return (
    <span className="files-page-state-badge">
      {t("filesPage.diskState.waiting", "Queued")}
    </span>
  );
}

/** Stable empty value so badge-less rows keep identical props across renders. */
const NO_BADGES: FileItemPolicyRef[] = [];

interface FileActionsMenuProps {
  selectionOnly?: boolean;
  file: StirlingFileStub;
  triggerRef: React.RefObject<HTMLButtonElement | null>;

  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;

  saveToServerAvailable: boolean;

  versionHistoryAvailable: boolean;

  saveToServerDisabledReason?: string | null;
  actions: FileGridActions;
}

function FileActionsMenu({
  selectionOnly,
  file,
  triggerRef,
  downloadAvailable,
  renameAvailable,
  duplicateAvailable,
  saveToServerAvailable,
  versionHistoryAvailable,
  saveToServerDisabledReason,
  actions,
}: FileActionsMenuProps) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const downloadIcon = useFileActionIcons().download;
  const showSaveToServer =
    saveToServerAvailable && file.remoteStorageId == null;
  const showVersionHistory =
    versionHistoryAvailable && (file.versionNumber ?? 1) > 1;
  if (selectionOnly) {
    if (!file.name.toLowerCase().endsWith(".zip")) return null;
    return (
      <Tooltip label={t("fileManager.unzip", "Unzip")} withinPortal>
        <ActionIcon
          variant="tertiary"
          aria-label={t("fileManager.unzip", "Unzip")}
          onClick={(event) => {
            event.stopPropagation();
            actions.unzipFile(file);
          }}
        >
          <Icon name="archive-restore" size={20} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Menu shadow="md" position="bottom-end" withinPortal width={220}>
      <Menu.Target>
        <ActionIcon
          ref={triggerRef}
          variant="tertiary"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("filesPage.fileMenu", "File actions")}
          data-testid="file-card-actions"
        >
          <Icon name="ellipsis-vertical" size={20} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="external-link" size={20} />}
          onClick={(e) => {
            e.stopPropagation();
            actions.openFile(file);
          }}
        >
          {t("filesPage.addToWorkspace", "Add to workspace")}
        </Menu.Item>
        <OpenInNewWindowMenuItem file={file} />
        {!isBrowserOnlyFile(file) && (
          <Menu.Item
            leftSection={<Icon name="folder-input" size={20} />}
            onClick={(e) => {
              e.stopPropagation();
              actions.requestMoveFile(file.id);
            }}
            data-testid="file-menu-move-to"
          >
            {t("filesPage.moveTo", "Move to…")}
          </Menu.Item>
        )}

        {(downloadAvailable || renameAvailable || duplicateAvailable) && (
          <Menu.Divider />
        )}
        {downloadAvailable && (
          <Menu.Item
            leftSection={<Icon name={downloadIcon} size={20} />}
            onClick={(e) => {
              e.stopPropagation();
              actions.downloadFile(file);
            }}
            data-testid="file-menu-download"
          >
            {terminology.download}
          </Menu.Item>
        )}
        {renameAvailable && (
          <Menu.Item
            leftSection={<Icon name="file-pen" size={20} />}
            onClick={(e) => {
              e.stopPropagation();
              actions.renameFile(file);
            }}
            data-testid="file-menu-rename"
          >
            {t("filesPage.rename", "Rename")}
          </Menu.Item>
        )}
        {duplicateAvailable && (
          <Menu.Item
            leftSection={<Icon name="copy" size={20} />}
            onClick={(e) => {
              e.stopPropagation();
              actions.duplicateFile(file);
            }}
            data-testid="file-menu-duplicate"
          >
            {t("filesPage.duplicate", "Duplicate")}
          </Menu.Item>
        )}

        {(showSaveToServer || showVersionHistory) && <Menu.Divider />}

        {showSaveToServer && (
          <Tooltip
            label={saveToServerDisabledReason}
            disabled={!saveToServerDisabledReason}
            withinPortal
            position="left"
            multiline
            w={240}
          >
            <Menu.Item
              leftSection={<Icon name="cloud-upload" size={20} />}
              disabled={Boolean(saveToServerDisabledReason)}
              onClick={(e) => {
                e.stopPropagation();
                actions.saveToServer(file);
              }}
              style={
                saveToServerDisabledReason
                  ? { pointerEvents: "auto" }
                  : undefined
              }
            >
              {t("filesPage.addToLibrary", "Add to Stirling library…")}
            </Menu.Item>
          </Tooltip>
        )}
        {showVersionHistory && (
          <Menu.Item
            leftSection={<Icon name="rotate-ccw-clock" size={20} />}
            onClick={(e) => {
              e.stopPropagation();
              actions.versionHistory(file);
            }}
          >
            {t("filesPage.versionHistory", "Version history")}
          </Menu.Item>
        )}

        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<Icon name="trash" size={20} />}
          onClick={(e) => {
            e.stopPropagation();
            actions.removeFile(file.id);
          }}
        >
          {t("filesPage.remove", "Delete")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

interface FileCardProps {
  date: number;
  folderPicker?: boolean;
  selectionOnly?: boolean;
  disabledReason?: string;
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;

  parentPath?: string;

  multiSelectActive: boolean;

  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;

  saveToServerAvailable: boolean;

  versionHistoryAvailable: boolean;

  saveToServerDisabledReason?: string | null;
  badges: FileItemPolicyRef[];
  processingState?: DiskFileState;
  actions: FileGridActions;
}

const FileCard = React.memo(function FileCard({
  date,
  folderPicker,
  selectionOnly,
  disabledReason,
  file,
  parentPath,
  isSelected,
  isInWorkspace,
  multiSelectActive,
  downloadAvailable,
  renameAvailable,
  duplicateAvailable,
  saveToServerAvailable,
  versionHistoryAvailable,
  saveToServerDisabledReason,
  badges,
  processingState,
  actions,
}: FileCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileSize = useMemo(() => formatFileSize(file.size), [file.size]);
  const fileDate = useMemo(() => getFileDate({ lastModified: date }), [date]);

  const onClick = useCallback(
    (e: React.MouseEvent) =>
      !disabledReason &&
      actions.selectFile(file.id, e.shiftKey, e.metaKey || e.ctrlKey),
    [actions, file.id, disabledReason],
  );
  const onDoubleClick = useCallback(() => {
    if (!disabledReason) actions.openFile(file);
  }, [actions, file, disabledReason]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(
        FILES_PAGE_DRAG_TYPE,
        actions.fileDragPayload(file.id),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [actions, file.id, disabledReason],
  );

  const extension = file.name.split(".").pop()?.toUpperCase() ?? "";
  const isPdf = extension === "PDF";
  const resolvedThumbnail = useLazyThumbnail(
    file.id,
    file.size,
    file.thumbnailUrl,
  );

  const kebabRef = useRef<HTMLButtonElement>(null);
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      if (!isSelected) onClick(e);
      kebabRef.current?.click();
    },
    [isSelected, onClick],
  );

  return (
    <div
      ref={cardRef}
      role="listitem"
      tabIndex={0}
      draggable={!selectionOnly}
      aria-disabled={Boolean(disabledReason)}
      title={disabledReason}
      onDragStart={handleDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === " " && selectionOnly) {
          e.preventDefault();
          if (!disabledReason) actions.selectFile(file.id, e.shiftKey, true);
        }
        if (e.key === "Enter") onDoubleClick();
      }}
      className={`files-page-card${isSelected ? " is-selected" : ""}${isInWorkspace ? " is-in-workspace" : ""}`}
    >
      {isInWorkspace && (
        <span
          className="files-page-card-open-badge"
          aria-label={t("filesPage.inWorkspaceAria", "Already in workspace")}
        >
          <span className="files-page-card-open-dot" />
          {t("filesPage.inWorkspace", "Open")}
        </span>
      )}

      {multiSelectActive && (
        <div className="files-page-card-selector">
          <Checkbox
            disabled={Boolean(disabledReason)}
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              actions.selectFile(file.id, false, true);
            }}
            onChange={() => {
              /* handled by onClick */
            }}
            aria-label={t("filesPage.selectFile", "Select file {{name}}", {
              name: file.name,
            })}
          />
        </div>
      )}
      <div className="files-page-card-thumb">
        {resolvedThumbnail ? (
          // draggable={false} so card's onDragStart fires, not native image drag.
          <img src={resolvedThumbnail} alt="" draggable={false} />
        ) : (
          <div className="files-page-card-thumb-fallback">
            {isPdf ? (
              <Icon name="file-pdf" size={"2rem"} />
            ) : (
              <Icon name="file" size={"2rem"} />
            )}
            <span>{extension || "FILE"}</span>
          </div>
        )}
        <div className="files-page-card-origin">
          <FileOriginBadge
            origin={getFileOrigin(file)}
            onDisk={Boolean(file.localFilePath)}
            compact
          />
          <DiskLinkBadge file={file} compact />
        </div>
        <FileStateBadge
          state={processingState}
          onRetry={
            selectionOnly ? undefined : () => actions.retryFile(file.name)
          }
        />
      </div>
      <div className="files-page-card-body">
        <div className="files-page-card-name" title={file.name}>
          {file.name}
        </div>
        {parentPath && (
          <div className="files-page-card-path" title={parentPath}>
            {t("filesPage.inPath", "in {{path}}", { path: parentPath })}
          </div>
        )}
        <div className="files-page-card-meta">
          <span>{fileSize}</span>
          <span className="files-page-card-meta-sep" aria-hidden="true">
            ·
          </span>
          <span>{fileDate}</span>
          <PolicyBadgeRow policies={badges} />
        </div>
      </div>
      <div className="files-page-card-actions">
        {!folderPicker && (
          <FileActionsMenu
            selectionOnly={selectionOnly}
            file={file}
            triggerRef={kebabRef}
            downloadAvailable={downloadAvailable}
            renameAvailable={renameAvailable}
            duplicateAvailable={duplicateAvailable}
            saveToServerAvailable={saveToServerAvailable}
            versionHistoryAvailable={versionHistoryAvailable}
            saveToServerDisabledReason={saveToServerDisabledReason}
            actions={actions}
          />
        )}
      </div>
    </div>
  );
});

/** Grid rows must own cells: wrap checkboxes, sort controls and menus in gridcell/columnheader elements. */
function ListView({
  picker,
  currentTab,
  entries,
  selectedFileIds,
  activeWorkspaceFileIds,
  onSetSelection,
  onSaveToServer,
  onVersionHistory,
  onDownloadFile,
  onRenameFile,
  onDuplicateFile,
  saveToServerDisabledReason,
  sortMode,
  onChangeSortMode,
  serverReachable,
  actions,
  policyBadges,
  processingBlock,
  emptyState,
}: FileGridLayoutProps & { emptyState?: React.ReactNode }) {
  const { t } = useTranslation();

  // Reaching a pick limit leaves the header mixed while other eligible files remain unselected.
  const selectableEntries = entries.filter(
    (entry) => !picker || picker.isEligible(entry),
  );
  const visibleFileIds = selectableEntries.flatMap((entry) =>
    entry.file ? [entry.file.id] : [],
  );
  const visibleDiskFiles = picker
    ? selectableEntries.flatMap((entry) => (entry.disk ? [entry.disk] : []))
    : [];
  const visibleCount = visibleFileIds.length + visibleDiskFiles.length;
  const selectedCount =
    visibleFileIds.filter((id) => selectedFileIds.has(id)).length +
    visibleDiskFiles.filter((disk) => picker?.selectedDiskPaths.has(disk.path))
      .length;
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;
  const someSelected = selectedCount > 0 && !allSelected;

  const sortIndicator = (asc: FilesPageSortMode, desc: FilesPageSortMode) => {
    if (sortMode === asc) return " ↑";
    if (sortMode === desc) return " ↓";
    return "";
  };

  const headerProps = (asc: FilesPageSortMode, desc: FilesPageSortMode) => ({
    role: "button",
    tabIndex: onChangeSortMode ? 0 : undefined,
    "data-sortable": onChangeSortMode ? "true" : undefined,
    onClick: () => {
      if (!onChangeSortMode) return;
      onChangeSortMode(sortMode === asc ? desc : asc);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!onChangeSortMode) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChangeSortMode(sortMode === asc ? desc : asc);
      }
    },
  });

  const { range, padTop, padBottom, setContainer } = useVirtualFileRows(
    entries.length,
    rowHeightPx(false),
    false,
  );
  return (
    <div className="files-page-list" role="grid" ref={setContainer}>
      <div className="files-page-list-row is-header" role="row">
        {onSetSelection && visibleCount > 0 ? (
          <span role="columnheader">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              disabled={picker?.selectionDisabled}
              onChange={(event) => {
                // A click clears the native mixed state even when the pick limit prevents a selection change.
                event.currentTarget.indeterminate = someSelected;
                if (picker) {
                  const next = new Set(selectedFileIds);
                  for (const id of visibleFileIds) {
                    if (allSelected) next.delete(id);
                    else next.add(id);
                  }
                  onSetSelection(next);
                  picker.onSetDiskSelection(
                    allSelected ? [] : visibleDiskFiles,
                  );
                } else {
                  onSetSelection(
                    allSelected ? new Set() : new Set(visibleFileIds),
                  );
                }
              }}
              aria-label={
                allSelected
                  ? t("filesPage.deselectAll", "Clear selection")
                  : t("filesPage.selectAll", "Select all")
              }
            />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span role="columnheader">
          <span {...headerProps("name-asc", "name-desc")}>
            {t("filesPage.column.name", "Name")}
            {sortIndicator("name-asc", "name-desc")}
          </span>
        </span>
        <span role="columnheader">{t("filesPage.column.type", "Type")}</span>
        <span role="columnheader">
          <span {...headerProps("size-asc", "size-desc")}>
            {t("filesPage.column.size", "Size")}
            {sortIndicator("size-asc", "size-desc")}
          </span>
        </span>
        <span role="columnheader">
          <span {...headerProps("modified-asc", "modified-desc")}>
            {currentTab === "recent"
              ? t("filesPage.column.added", "Added")
              : t("filesPage.column.modified", "Modified")}
            {sortIndicator("modified-asc", "modified-desc")}
          </span>
        </span>
        {!picker && (
          <span role="columnheader">
            {t("filesPage.column.status", "Status")}
          </span>
        )}
        <span aria-hidden="true" />
      </div>
      {padTop > 0 && (
        <div
          aria-hidden="true"
          className="files-page-virtual-pad"
          style={{ height: padTop }}
        />
      )}
      {emptyState && (
        <div role="row">
          <div role="gridcell">{emptyState}</div>
        </div>
      )}
      {entries.slice(range.start, range.end).map((entry) => {
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderRow
              key={`folder-${entry.folder.id}`}
              selectionOnly={Boolean(picker)}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              serverReachable={serverReachable ?? false}
              processingBlock={processingBlock}
              actions={actions}
            />
          );
        }
        if (entry.kind === "diskFile" && entry.disk) {
          return (
            <DiskFileRow
              key={`disk-${entry.disk.path}`}
              selectionOnly={Boolean(picker)}
              isSelected={picker?.selectedDiskPaths.has(entry.disk.path)}
              disabledReason={picker?.disabledReason(entry)}
              entry={entry.disk}
              state={entry.diskState}
              hasOriginal={entry.hasOriginal}
              actions={actions}
            />
          );
        }
        if (entry.kind === "file" && entry.file) {
          return (
            <FileRow
              key={`file-${entry.file.id}`}
              selectionOnly={Boolean(picker)}
              disabledReason={picker?.disabledReason(entry)}
              folderPicker={picker?.foldersOnly}
              file={entry.file}
              date={libraryFileDate(entry.file, currentTab)}
              parentPath={entry.parentPath}
              processingState={entry.diskState}
              isSelected={selectedFileIds.has(entry.file.id)}
              isInWorkspace={
                activeWorkspaceFileIds?.has(entry.file.id) ?? false
              }
              multiSelectActive={
                !picker?.foldersOnly &&
                (Boolean(picker) || selectedFileIds.size >= 2)
              }
              downloadAvailable={Boolean(onDownloadFile)}
              renameAvailable={Boolean(onRenameFile)}
              duplicateAvailable={Boolean(onDuplicateFile)}
              saveToServerAvailable={Boolean(onSaveToServer)}
              versionHistoryAvailable={Boolean(onVersionHistory)}
              saveToServerDisabledReason={saveToServerDisabledReason}
              badges={policyBadges.get(entry.file.id) ?? NO_BADGES}
              actions={actions}
            />
          );
        }
        return null;
      })}
      {padBottom > 0 && (
        <div
          aria-hidden="true"
          className="files-page-virtual-pad"
          style={{ height: padBottom }}
        />
      )}
    </div>
  );
}

const FolderRow = React.memo(function FolderRow({
  selectionOnly,
  folder,
  fileCount,
  parentPath,
  serverReachable,
  processingBlock,
  actions,
}: FolderItemProps) {
  const { t } = useTranslation();
  const onOpen = () => actions.openFolder(folder.id);

  const kind = folderKind(folder);
  const {
    stateFor: processingStateFor,
    enable: enableProcessing,
    disable: disableProcessing,
    remove: removeProcessingFolder,
    sweep: sweepProcessing,
    listFiles: listProcessingFiles,
  } = useProcessingFolders();
  const processing = processingStateFor(folder);

  const resumeProcessing = (label: string) =>
    Promise.resolve(enableProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const stopProcessing = (label: string) =>
    Promise.resolve(disableProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const runProcessing = (label: string) =>
    Promise.resolve(sweepProcessing(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const removeProcessing = (label: string) =>
    Promise.resolve(removeProcessingFolder(folder)).catch((err) =>
      actions.reportError(err, label),
    );
  const editsDisabled = kind === "server" && !serverReachable;
  const editsHidden = kind === "local";
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const kebabRef = useRef<HTMLButtonElement>(null);
  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        actions.dropFilesOnFolder(payload.fileIds, folder.id);
      } else if (payload.kind === "folder") {
        actions.dropFolderOnFolder(payload.folderId, folder.id);
      }
    },
  });

  return (
    <div
      role="row"
      tabIndex={0}
      draggable={!selectionOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          FILES_PAGE_DRAG_TYPE,
          serialiseFilesPageDragPayload({
            kind: "folder",
            folderId: folder.id,
          }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      {...(selectionOnly ? {} : dropHandlers)}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        kebabRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter") onOpen();
      }}
      className={`files-page-list-row${isDropTarget ? " is-drop-target" : ""}`}
    >
      <span aria-hidden="true" />

      <span
        role="gridcell"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <FolderThumbnail
          color={folder.color}
          size="row"
          iconGlyph={findFolderIcon(folder.icon)?.glyph}
        />
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {folder.name}
          </span>
          {parentPath && (
            <span
              className="files-page-card-path"
              style={{ marginTop: 0 }}
              title={parentPath}
            >
              {t("filesPage.inPath", "in {{path}}", { path: parentPath })}
            </span>
          )}
        </span>
        <FolderOriginBadge folder={folder} />
      </span>
      <span role="gridcell">
        {processing ? (
          <span className="files-page-processing-tag">
            {processing.enabled
              ? t("filesPage.processing.active", "Processing folder")
              : t("filesPage.processing.paused", "Processing paused")}
          </span>
        ) : kind === "virtual" ? (
          t("filesPage.folderKind.virtual", "Browser folder")
        ) : kind === "local" ? (
          t("filesPage.folderKind.local", "Local folder")
        ) : (
          t("filesPage.folder", "Folder")
        )}
      </span>
      <span role="gridcell">
        {fileCount === 0
          ? "-"
          : t("filesPage.folderItems", "{{count}} items", { count: fileCount })}
      </span>
      <span role="gridcell">
        {getFileDate({ lastModified: folder.updatedAt })}
      </span>
      {!selectionOnly && (
        <span role="gridcell" className="files-page-list-status">
          {processing && (
            <ProcessingFolderStats
              recordId={processing.id}
              listFiles={listProcessingFiles}
              variant="row"
            />
          )}
        </span>
      )}
      <span role="gridcell" onClick={(e) => e.stopPropagation()}>
        {!selectionOnly && (
          <FolderMenu
            folder={folder}
            processing={processing}
            continuous={kind === "virtual"}
            isMount={editsHidden}
            canUnmount={folder.parentFolderId === null}
            editsDisabled={editsDisabled}
            editsDisabledHint={offlineHint}
            processingBlock={processingBlock}
            variant="kebab"
            triggerRef={kebabRef}
            onOpen={onOpen}
            onStartProcessing={() => actions.startProcessing(folder)}
            onRunProcessing={() => void runProcessing("process folder now")}
            onStopProcessing={() =>
              void stopProcessing("pause processing folder")
            }
            onResumeProcessing={() =>
              void resumeProcessing("resume processing")
            }
            onRemoveProcessing={() =>
              void removeProcessing("remove processing folder")
            }
            onEditProcessing={() => actions.startProcessing(folder)}
            onRevertAll={
              kind === "local"
                ? () => actions.requestRevertAll(folder)
                : undefined
            }
            onRename={() => actions.renameFolder(folder)}
            onChangeAppearance={(appearance) =>
              actions.changeFolderAppearance(folder.id, appearance)
            }
            onDelete={() => actions.deleteFolder(folder)}
          />
        )}
      </span>
    </div>
  );
});

interface FileRowProps {
  date: number;
  folderPicker?: boolean;
  selectionOnly?: boolean;
  disabledReason?: string;
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;
  parentPath?: string;

  multiSelectActive: boolean;

  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;

  saveToServerAvailable: boolean;

  versionHistoryAvailable: boolean;

  saveToServerDisabledReason?: string | null;
  badges: FileItemPolicyRef[];
  processingState?: DiskFileState;
  actions: FileGridActions;
}

const FileRow = React.memo(function FileRow({
  date,
  folderPicker,
  selectionOnly,
  disabledReason,
  file,
  isSelected,
  isInWorkspace,
  parentPath,
  multiSelectActive,
  downloadAvailable,
  renameAvailable,
  duplicateAvailable,
  saveToServerAvailable,
  versionHistoryAvailable,
  saveToServerDisabledReason,
  badges,
  processingState,
  actions,
}: FileRowProps) {
  const { t } = useTranslation();
  const kebabRef = useRef<HTMLButtonElement>(null);
  const fileSize = useMemo(() => formatFileSize(file.size), [file.size]);
  const fileDate = useMemo(() => getFileDate({ lastModified: date }), [date]);
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const resolvedThumbnail = useLazyThumbnail(
    file.id,
    file.size,
    file.thumbnailUrl,
  );
  const onClick = (e: React.MouseEvent) =>
    !disabledReason &&
    actions.selectFile(file.id, e.shiftKey, e.metaKey || e.ctrlKey);
  const onOpen = () => {
    if (!disabledReason) actions.openFile(file);
  };
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={0}
      draggable={!selectionOnly}
      aria-disabled={Boolean(disabledReason)}
      title={disabledReason}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          FILES_PAGE_DRAG_TYPE,
          actions.fileDragPayload(file.id),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!isSelected) onClick(e);
        kebabRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === " " && selectionOnly) {
          e.preventDefault();
          if (!disabledReason) actions.selectFile(file.id, e.shiftKey, true);
        }
        if (e.key === "Enter") onOpen();
      }}
      className={`files-page-list-row${isSelected ? " is-selected" : ""}${isInWorkspace ? " is-in-workspace" : ""}`}
    >
      {multiSelectActive ? (
        <span role="gridcell">
          <Checkbox
            disabled={Boolean(disabledReason)}
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              actions.selectFile(file.id, false, true);
            }}
            onChange={() => {
              /* handled by onClick */
            }}
            aria-label={t("filesPage.selectFile", "Select file {{name}}", {
              name: file.name,
            })}
          />
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <span
        role="gridcell"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minWidth: 0,
        }}
      >
        {/* Reserve thumbnail width so names do not shift when images load. */}
        <span className="files-page-list-thumb">
          {resolvedThumbnail ? (
            <img
              src={resolvedThumbnail}
              alt=""
              // draggable={false} so row's onDragStart fires, not native image drag.
              draggable={false}
            />
          ) : (
            <Icon name="file-pdf" size={20} />
          )}
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </span>
          {parentPath && (
            <span
              className="files-page-card-path"
              style={{ marginTop: 0 }}
              title={parentPath}
            >
              {t("filesPage.inPath", "in {{path}}", { path: parentPath })}
            </span>
          )}
        </span>
        <FileOriginBadge
          origin={getFileOrigin(file)}
          onDisk={Boolean(file.localFilePath)}
          compact
        />
        <DiskLinkBadge file={file} compact />
        <PolicyBadgeRow policies={badges} />
        {isInWorkspace && (
          <span className="files-page-row-open-pill">
            <span className="files-page-card-open-dot" />
            {t("filesPage.inWorkspace", "Open")}
          </span>
        )}
      </span>
      <span role="gridcell">{ext || t("filesPage.file", "File")}</span>
      <span role="gridcell">{fileSize}</span>
      <span role="gridcell">{fileDate}</span>
      {!selectionOnly && (
        <span role="gridcell" className="files-page-list-status">
          <FileStateBadge
            state={processingState}
            onRetry={() => actions.retryFile(file.name)}
          />
        </span>
      )}
      <span role="gridcell">
        {!folderPicker && (
          <FileActionsMenu
            selectionOnly={selectionOnly}
            file={file}
            triggerRef={kebabRef}
            downloadAvailable={downloadAvailable}
            renameAvailable={renameAvailable}
            duplicateAvailable={duplicateAvailable}
            saveToServerAvailable={saveToServerAvailable}
            versionHistoryAvailable={versionHistoryAvailable}
            saveToServerDisabledReason={saveToServerDisabledReason}
            actions={actions}
          />
        )}
      </span>
    </div>
  );
});

export { ROOT_FOLDER_ID };

const DiskFileCard = React.memo(function DiskFileCard({
  selectionOnly,
  isSelected,
  disabledReason,
  entry,
  state,
  hasOriginal,
  actions,
}: {
  selectionOnly?: boolean;
  isSelected?: boolean;
  disabledReason?: string;
  entry: DiskFileEntry;
  state?: DiskFileState;
  hasOriginal?: boolean;
  actions: FileGridActions;
}) {
  // Processing replaces the bytes, so opening is blocked until it finishes.
  const locked = state === "processing" || Boolean(disabledReason);
  const onOpen = () => {
    if (!locked) actions.openDiskFile(entry);
  };
  const { t } = useTranslation();
  const thumbnail = useDiskThumbnail(entry);
  const extension = entry.name.includes(".")
    ? entry.name.split(".").pop()!.toUpperCase()
    : "";
  const isPdf = extension === "PDF";
  return (
    <div
      className={`files-page-card${locked ? " is-locked" : ""}${isSelected ? " is-selected" : ""}`}
      role="listitem"
      tabIndex={0}
      aria-selected={isSelected}
      aria-disabled={locked}
      onClick={(event) => {
        if (selectionOnly && !locked)
          actions.selectDiskFile(entry, event.shiftKey);
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === " " && selectionOnly) {
          e.preventDefault();
          if (!locked) actions.selectDiskFile(entry, e.shiftKey);
        }
        if (e.key === "Enter") onOpen();
      }}
      title={
        disabledReason ??
        (locked
          ? t(
              "filesPage.diskState.processingHint",
              "Processing - available when it finishes",
            )
          : entry.path)
      }
    >
      {selectionOnly && (
        <div className="files-page-card-selector">
          <Checkbox
            checked={Boolean(isSelected)}
            disabled={locked}
            onClick={(event) => {
              event.stopPropagation();
              actions.selectDiskFile(entry, event.shiftKey);
            }}
            onChange={() => {}}
            aria-label={t("filesPage.selectFile", "Select file {{name}}", {
              name: entry.name,
            })}
          />
        </div>
      )}
      <div className="files-page-card-thumb">
        {thumbnail ? (
          <img src={thumbnail} alt="" draggable={false} />
        ) : (
          <div className="files-page-card-thumb-fallback">
            {isPdf ? (
              <Icon name="file-pdf" size={"2rem"} />
            ) : (
              <Icon name="file" size={"2rem"} />
            )}
            <span>{extension || "FILE"}</span>
          </div>
        )}
        <div className="files-page-card-origin">
          <FileOriginBadge
            origin="local"
            onDisk
            tooltip={t(
              "filesPage.origin.diskHint",
              "A file in the mounted folder on your disk",
            )}
            compact
          />
        </div>
        <FileStateBadge
          state={state}
          onRetry={
            selectionOnly ? undefined : () => actions.retryFile(entry.name)
          }
        />
      </div>
      <div className="files-page-card-body">
        <div className="files-page-card-name" title={entry.name}>
          {entry.name}
        </div>
        <div className="files-page-card-meta">
          <span>{formatFileSize(entry.sizeBytes)}</span>
          <span>·</span>
          <span>{getFileDate({ lastModified: entry.lastModified })}</span>
        </div>
      </div>
      <div className="files-page-card-actions">
        {!selectionOnly && (
          <Menu shadow="md" position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                size="sm"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("filesPage.fileMenu", "File actions")}
              >
                <Icon name="ellipsis-vertical" size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="external-link" size={20} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
              >
                {t("filesPage.addToWorkspace", "Add to workspace")}
              </Menu.Item>
              {hasOriginal && (
                <Menu.Item
                  leftSection={<Icon name="rotate-ccw-clock" size={20} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.revertFile(entry.name);
                  }}
                >
                  {t("filesPage.processing.restore", "Restore original")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
    </div>
  );
});

const DiskFileRow = React.memo(function DiskFileRow({
  selectionOnly,
  isSelected,
  disabledReason,
  entry,
  state,
  hasOriginal,
  actions,
}: {
  selectionOnly?: boolean;
  isSelected?: boolean;
  disabledReason?: string;
  entry: DiskFileEntry;
  state?: DiskFileState;
  hasOriginal?: boolean;
  actions: FileGridActions;
}) {
  // Processing replaces the bytes, so opening is blocked until it finishes.
  const locked = state === "processing" || Boolean(disabledReason);
  const onOpen = () => {
    if (!locked) actions.openDiskFile(entry);
  };
  const { t } = useTranslation();
  const thumbnail = useDiskThumbnail(entry);
  const ext = entry.name.includes(".")
    ? entry.name.split(".").pop()!.toUpperCase()
    : "";
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
      aria-disabled={locked}
      onClick={(event) => {
        if (selectionOnly && !locked)
          actions.selectDiskFile(entry, event.shiftKey);
      }}
      className={`files-page-list-row${locked ? " is-locked" : ""}${isSelected ? " is-selected" : ""}`}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === " " && selectionOnly) {
          e.preventDefault();
          if (!locked) actions.selectDiskFile(entry, e.shiftKey);
        }
        if (e.key === "Enter") onOpen();
      }}
      title={disabledReason ?? entry.path}
    >
      <span role="gridcell">
        {selectionOnly && (
          <Checkbox
            checked={Boolean(isSelected)}
            disabled={locked}
            onClick={(event) => {
              event.stopPropagation();
              actions.selectDiskFile(entry, event.shiftKey);
            }}
            onChange={() => {}}
            aria-label={t("filesPage.selectFile", "Select file {{name}}", {
              name: entry.name,
            })}
          />
        )}
      </span>
      <span
        role="gridcell"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minWidth: 0,
        }}
      >
        <span className="files-page-list-thumb">
          {thumbnail ? (
            <img src={thumbnail} alt="" draggable={false} />
          ) : ext === "PDF" ? (
            <Icon name="file-pdf" size={20} />
          ) : (
            <Icon name="file" size={20} />
          )}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={entry.name}
        >
          {entry.name}
        </span>
        <FileOriginBadge
          origin="local"
          onDisk
          tooltip={t(
            "filesPage.origin.diskHint",
            "A file in the mounted folder on your disk",
          )}
          compact
        />
      </span>
      <span role="gridcell">{ext || t("filesPage.file", "File")}</span>
      <span role="gridcell">{formatFileSize(entry.sizeBytes)}</span>
      <span role="gridcell">
        {getFileDate({ lastModified: entry.lastModified })}
      </span>
      {!selectionOnly && (
        <span role="gridcell" className="files-page-list-status">
          <FileStateBadge
            state={state}
            onRetry={() => actions.retryFile(entry.name)}
          />
        </span>
      )}
      <span role="gridcell">
        {!selectionOnly && (
          <Menu shadow="md" position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="tertiary"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("filesPage.fileMenu", "File actions")}
              >
                <Icon name="ellipsis-vertical" size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="external-link" size={20} />}
                onClick={onOpen}
              >
                {t("filesPage.addToWorkspace", "Add to workspace")}
              </Menu.Item>
              {hasOriginal && (
                <Menu.Item
                  leftSection={<Icon name="rotate-ccw-clock" size={20} />}
                  onClick={() => actions.revertFile(entry.name)}
                >
                  {t("filesPage.processing.restore", "Restore original")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </span>
    </div>
  );
});
