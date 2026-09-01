import React, { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox, Menu, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { PolicyBadges as PolicyBadgeRow } from "@app/components/shared/PolicyBadges";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";
import FolderIcon from "@mui/icons-material/Folder";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import SearchIcon from "@mui/icons-material/Search";

import { FileId } from "@app/types/file";
import {
  FolderId,
  FolderRecord,
  ROOT_FOLDER_ID,
  folderKind,
} from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
  serialiseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import { useDropTarget } from "@app/components/filesPage/useDropTarget";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";
import { FileOriginBadge } from "@app/components/filesPage/FileOriginBadge";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";
import { findFolderIcon } from "@app/components/filesPage/folderIcons";
import { FolderAppearancePicker } from "@app/components/filesPage/FolderAppearancePicker";
import {
  useLazyThumbnail,
  useDiskThumbnail,
} from "@app/hooks/useLazyThumbnail";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import type { FilesPageSortMode } from "@app/contexts/FilesPageContext";
import { OpenInNewWindowMenuItem } from "@app/components/filesPage/OpenInNewWindowMenuItem";

/**
 * The origin badge a folder wears, mirroring the one its files would: a server folder
 * is Cloud, a virtual folder is Local (this browser), a mounted folder is On disk.
 */
function useFolderOriginBadge(folder: FolderRecord): {
  origin: "cloud" | "local";
  tooltip: string;
} {
  const { t } = useTranslation();
  switch (folderKind(folder)) {
    case "virtual":
      return {
        origin: "local",
        tooltip: t(
          "filesPage.folderOrigin.virtualHint",
          "A folder that lives only in this browser",
        ),
      };
    case "local":
      return {
        // Same mark as a virtual folder: what matters is that it lives on
        // this device, not which corner of it. The tooltip says which.
        origin: "local",
        tooltip: t(
          "filesPage.folderOrigin.diskHint",
          "A folder mounted from a directory on your disk",
        ),
      };
    default:
      return {
        origin: "cloud",
        tooltip: t(
          "filesPage.folderOrigin.serverHint",
          "A folder stored on the Stirling server",
        ),
      };
  }
}

export type FilesPageViewMode = "grid" | "list";

export interface FilesPageEntry {
  kind: "folder" | "file" | "diskFile";
  folder?: FolderRecord;
  /** Number of files inside this folder (folder entries only). */
  folderFileCount?: number;
  file?: StirlingFileStub;
  /** A file read straight off a mounted directory (kind "diskFile"). */
  disk?: DiskFileEntry;
  /** Parent breadcrumb path for search results outside the current folder. */
  parentPath?: string;
}

interface FileGridProps {
  entries: FilesPageEntry[];
  selectedFileIds: Set<FileId>;
  /** Ids of files loaded in the active workspace. */
  activeWorkspaceFileIds?: Set<string>;
  viewMode: FilesPageViewMode;
  onSelectFile: (id: FileId, shiftKey: boolean, ctrlKey: boolean) => void;
  /** Replace the entire selection set. */
  onSetSelection?: (ids: Set<FileId>) => void;
  onOpenFolder: (id: FolderId) => void;
  /** "Add to workspace". */
  onOpenFile: (file: StirlingFileStub) => void;
  onOpenDiskFile?: (entry: DiskFileEntry) => void;
  onMoveFiles: (
    fileIds: FileId[],
    targetFolderId: FolderId | null,
  ) => void | Promise<void>;
  onMoveFolder: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => void | Promise<void>;
  onRenameFolder: (folder: FolderRecord) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  onChangeFolderAppearance: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => void;
  onRemoveFiles: (fileIds: FileId[]) => void;
  onPromptMoveFiles: (fileIds: FileId[]) => void;
  /** Per-file Save to server; hidden when file already has remoteStorageId. */
  onSaveToServer?: (file: StirlingFileStub) => void;
  /** Open the version-history modal for a file (only when it has >1 version). */
  onVersionHistory?: (file: StirlingFileStub) => void;
  /** Download a copy (desktop: save a copy). */
  onDownloadFile?: (file: StirlingFileStub) => void;
  /** Open the rename dialog for a file. */
  onRenameFile?: (file: StirlingFileStub) => void;
  /** Save a second copy of the file into the library. */
  onDuplicateFile?: (file: StirlingFileStub) => void;
  /** When set, the Save to server item renders disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
  /** When supplied the list-view column headers become sortable. */
  sortMode?: FilesPageSortMode;
  onChangeSortMode?: (mode: FilesPageSortMode) => void;
  /** Drives the empty-state copy. */
  currentTab?: "all" | "local" | "cloud" | "recent" | "shared" | "sharedByMe";
  /** A filter is applied; an empty result then means "no matches", not "no files". */
  searchActive?: boolean;
  /** Cloud reachability; switches the cloud empty-state copy. */
  serverReachable?: boolean;
  /** Empty-state CTA handlers; if absent the matching button hides. */
  onEmptyUpload?: () => void;
  onEmptyCreateFolder?: () => void;
  /** Non-null disables the New folder CTA with this reason as tooltip. */
  newFolderDisabledReason?: string | null;
  /**
   * Where a failed drop reports its message. A prop rather than the folder
   * context so the grid renders without a FolderProvider (its tests do), and
   * so no item needs a context subscription that memoization would then fight.
   */
  onActionError?: (message: string) => void;
}

/**
 * One stable dispatch object shared by every card and row. The grid's
 * callback props change identity on every parent render, and per-item
 * closures would too — either defeats React.memo and turns each selection
 * click or landed thumbnail into a full-list re-render. Items call these
 * with their own id/record instead; the ref always sees the current props,
 * so behavior stays live while identity stays fixed. Selection-aware
 * behavior (drag payloads, multi-move) lives here too, so items never hold
 * the selection Set — whose identity changes on every click — as a prop.
 */
interface FileGridActions {
  selectFile: (id: FileId, shiftKey: boolean, ctrlKey: boolean) => void;
  openFolder: (id: FolderId) => void;
  openFile: (file: StirlingFileStub) => void;
  openDiskFile: (entry: DiskFileEntry) => void;
  renameFolder: (folder: FolderRecord) => void;
  deleteFolder: (folder: FolderRecord) => void;
  changeFolderAppearance: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => void;
  /**
   * Failures surface here, not in the item: the memoized folder items would
   * otherwise each need the folder context for its error banner, and one
   * context subscription inside an item undoes what the memo buys.
   */
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
    onEmptyCreateFolder,
    newFolderDisabledReason,
  } = props;

  const latest = useRef(props);
  latest.current = props;
  const { t } = useTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;
  // One subscription for the whole grid: every row calling the badge hook
  // would rebuild the full badge map per row on any file or run change. The
  // hook keeps per-file array identity stable across rebuilds, so memoized
  // items re-render only when their own badges change.
  const policyBadges = usePolicyFileBadges();
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
      selectFile: (id, shiftKey, ctrlKey) =>
        latest.current.onSelectFile(id, shiftKey, ctrlKey),
      openFolder: (id) => latest.current.onOpenFolder(id),
      openFile: (file) => latest.current.onOpenFile(file),
      openDiskFile: (entry) => latest.current.onOpenDiskFile?.(entry),
      renameFolder: (folder) => latest.current.onRenameFolder(folder),
      deleteFolder: (folder) => latest.current.onDeleteFolder(folder),
      changeFolderAppearance: (folderId, appearance) =>
        latest.current.onChangeFolderAppearance(folderId, appearance),
      dropFilesOnFolder: (fileIds, target) => {
        Promise.resolve(latest.current.onMoveFiles(fileIds, target)).catch(
          (err) => reportDrop(err, "move files into folder"),
        );
      },
      dropFolderOnFolder: (folderId, target) => {
        Promise.resolve(latest.current.onMoveFolder(folderId, target)).catch(
          (err) => reportDrop(err, "move folder"),
        );
      },
      removeFile: (id) => latest.current.onRemoveFiles([id]),
      requestMoveFile: (id) => {
        const selected = latest.current.selectedFileIds;
        latest.current.onPromptMoveFiles(
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

  if (entries.length === 0) {
    const emptyState = (
      <EmptyState
        tab={currentTab}
        searchActive={searchActive}
        serverReachable={serverReachable}
        onUpload={onEmptyUpload}
        onCreateFolder={onEmptyCreateFolder}
        newFolderDisabledReason={newFolderDisabledReason}
      />
    );
    // When a filter empties the list view, keep the column headers in place and
    // show the no-results message beneath them, rather than replacing the whole
    // table. Grid view (cards, no headers) just shows the empty state.
    if (viewMode === "list" && searchActive) {
      return (
        <>
          <ListView {...props} actions={actions} policyBadges={policyBadges} />
          {emptyState}
        </>
      );
    }
    return emptyState;
  }

  if (viewMode === "list") {
    return (
      <ListView {...props} actions={actions} policyBadges={policyBadges} />
    );
  }
  return <GridView {...props} actions={actions} policyBadges={policyBadges} />;
}

function SkeletonGrid({ viewMode }: { viewMode: FilesPageViewMode }) {
  // Six placeholders mirroring the card layout while IDB resolves.
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
  /** Drives copy + iconography. */
  tab?: "all" | "local" | "cloud" | "recent" | "shared" | "sharedByMe";
  /** When true the empty list is the result of a filter, not a bare folder. */
  searchActive?: boolean;
  /** Switches the cloud empty-state copy. */
  serverReachable?: boolean;
  /** CTA handlers; absent => button hidden. */
  onUpload?: () => void;
  onCreateFolder?: () => void;
  /** Non-null disables New folder CTA with this reason. */
  newFolderDisabledReason?: string | null;
}

function EmptyState({
  tab = "all",
  searchActive = false,
  serverReachable = true,
  onUpload,
  onCreateFolder,
  newFolderDisabledReason,
}: EmptyStateProps) {
  const { t } = useTranslation();

  // A filter with no matches isn't an empty folder - say so, and skip the
  // upload / new-folder CTAs since clearing the filter is the way out.
  if (searchActive) {
    return (
      <div className="files-page-empty">
        <span className="files-page-empty-icon">
          <SearchIcon style={{ fontSize: "2.5rem" }} />
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
      case "local":
        return {
          titleKey: "filesPage.empty.local.title",
          titleFallback: "No local-only files",
          hintKey: "filesPage.empty.local.hint",
          hintFallback:
            "Files saved without uploading stay here. Drop a file to add one.",
        };
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
  // Recent/Shared tabs are read-only filters; Local is cloud-only for folders.
  const readOnlyTab =
    tab === "recent" || tab === "shared" || tab === "sharedByMe";
  const showUpload = Boolean(onUpload) && !readOnlyTab;
  const showCreateFolder =
    Boolean(onCreateFolder) && !readOnlyTab && tab !== "local";
  const showCtas = showUpload || showCreateFolder;
  return (
    <div className="files-page-empty">
      <span className="files-page-empty-icon">
        <FolderIcon style={{ fontSize: "2.5rem" }} />
      </span>
      <div className="files-page-empty-title">{t(titleKey, titleFallback)}</div>
      <div className="files-page-empty-hint">{t(hintKey, hintFallback)}</div>
      {showCtas && (
        <div className="files-page-empty-actions">
          {showUpload && (
            <Button
              size="md"
              leftSection={<UploadFileIcon fontSize="small" />}
              onClick={onUpload}
            >
              {t("filesPage.empty.uploadCta", "Upload files")}
            </Button>
          )}
          {showCreateFolder &&
            (newFolderDisabledReason ? (
              <Tooltip
                label={newFolderDisabledReason}
                withinPortal
                multiline
                w={260}
              >
                {/* Wrap so tooltip hovers while button is disabled. */}
                <span style={{ display: "inline-flex" }}>
                  <Button
                    size="md"
                    variant="secondary"
                    leftSection={<CreateNewFolderIcon fontSize="small" />}
                    disabled
                    style={{ pointerEvents: "auto" }}
                  >
                    {t("filesPage.empty.newFolderCta", "Create folder")}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                size="md"
                variant="secondary"
                leftSection={<CreateNewFolderIcon fontSize="small" />}
                onClick={onCreateFolder}
              >
                {t("filesPage.empty.newFolderCta", "Create folder")}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

function GridView({
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
}: FileGridProps & {
  actions: FileGridActions;
  policyBadges: Map<string, FileItemPolicyRef[]>;
}) {
  return (
    <div className="files-page-grid" role="list">
      {entries.map((entry) => {
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderCard
              key={`folder-${entry.folder.id}`}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              serverReachable={serverReachable ?? false}
              actions={actions}
            />
          );
        }
        if (entry.kind === "diskFile" && entry.disk) {
          return (
            <DiskFileCard
              key={`disk-${entry.disk.path}`}
              entry={entry.disk}
              actions={actions}
            />
          );
        }
        if (entry.kind === "file" && entry.file) {
          return (
            <FileCard
              key={`file-${entry.file.id}`}
              file={entry.file}
              parentPath={entry.parentPath}
              isSelected={selectedFileIds.has(entry.file.id)}
              isInWorkspace={
                activeWorkspaceFileIds?.has(entry.file.id) ?? false
              }
              multiSelectActive={selectedFileIds.size >= 2}
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
    </div>
  );
}

interface FolderCardProps {
  folder: FolderRecord;
  fileCount: number;
  /** Subtitle for search results outside current folder. */
  parentPath?: string;
  serverReachable: boolean;
  actions: FileGridActions;
}

const FolderCard = React.memo(function FolderCard({
  folder,
  fileCount,
  parentPath,
  serverReachable,
  actions,
}: FolderCardProps) {
  const { t } = useTranslation();
  const onOpen = () => actions.openFolder(folder.id);
  // Only a server folder can go offline: the other kinds take their name, look and
  // lifetime from elsewhere, so their edit items are hidden rather than disabled.
  const kind = folderKind(folder);
  const originBadge = useFolderOriginBadge(folder);
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
      draggable
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
      {...dropHandlers}
      className={`files-page-card is-folder${isDropTarget ? " is-drop-target" : ""}`}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        kebabRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
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
          <FileOriginBadge
            origin={originBadge.origin}
            tooltip={originBadge.tooltip}
            compact
          />
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
          {fileCount === 0
            ? t("filesPage.folder", "Folder")
            : t("filesPage.folderItems", "{{count}} items", {
                count: fileCount,
              })}
        </div>
      </div>
      <div className="files-page-card-actions">
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              ref={kebabRef}
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("filesPage.folderMenu", "Folder actions")}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<OpenInNewIcon fontSize="small" />}
              onClick={onOpen}
            >
              {t("filesPage.open", "Open")}
            </Menu.Item>
            {/* Only a mount root can be removed; a subdirectory is the
                disk's, and the app never deletes directories. */}
            {editsHidden && folder.parentFolderId === null && (
              <Menu.Item
                color="red"
                leftSection={<DeleteIcon fontSize="small" />}
                onClick={() => actions.deleteFolder(folder)}
              >
                {t(
                  "filesPage.removeLocalFolder",
                  "Remove (files stay on disk)",
                )}
              </Menu.Item>
            )}
            {!editsHidden && (
              <>
                <Menu.Item
                  leftSection={<DriveFileRenameOutlineIcon fontSize="small" />}
                  onClick={() => actions.renameFolder(folder)}
                  disabled={editsDisabled}
                  title={editsDisabled ? offlineHint : undefined}
                >
                  {t("filesPage.rename", "Rename")}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>
                  {t("filesPage.appearance.title", "Appearance")}
                </Menu.Label>
                <FolderAppearancePicker
                  folder={folder}
                  onChange={(appearance) =>
                    actions.changeFolderAppearance(folder.id, appearance)
                  }
                  disabled={editsDisabled}
                />
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<DeleteIcon fontSize="small" />}
                  onClick={() => actions.deleteFolder(folder)}
                  disabled={editsDisabled}
                  title={editsDisabled ? offlineHint : undefined}
                >
                  {t("filesPage.deleteFolder", "Delete folder")}
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
});

/** Stable empty value so badge-less rows keep identical props across renders. */
const NO_BADGES: FileItemPolicyRef[] = [];

/** Per-file actions. Shared verbatim by the grid card and the list row, and
 *  kept in step with the file sidebar's kebab so both surfaces offer the same. */
interface FileActionsMenuProps {
  file: StirlingFileStub;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Download / rename / duplicate menu items offered. */
  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;
  /** Kebab Save to server offered; only fires when file is local-only. */
  saveToServerAvailable: boolean;
  /** Version-history menu item offered; shown only when file has >1 version. */
  versionHistoryAvailable: boolean;
  /** When set, the kebab Save to server is disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
  actions: FileGridActions;
}

function FileActionsMenu({
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
  const DownloadIcon = useFileActionIcons().download;
  const showSaveToServer =
    saveToServerAvailable && file.remoteStorageId == null;
  const showVersionHistory =
    versionHistoryAvailable && (file.versionNumber ?? 1) > 1;
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
          <MoreVertIcon fontSize="small" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<OpenInNewIcon fontSize="small" />}
          onClick={(e) => {
            e.stopPropagation();
            actions.openFile(file);
          }}
        >
          {t("filesPage.addToWorkspace", "Add to workspace")}
        </Menu.Item>
        <OpenInNewWindowMenuItem file={file} />
        <Menu.Item
          leftSection={<DriveFileMoveIcon fontSize="small" />}
          onClick={(e) => {
            e.stopPropagation();
            actions.requestMoveFile(file.id);
          }}
          data-testid="file-menu-move-to"
        >
          {t("filesPage.moveTo", "Move to…")}
        </Menu.Item>

        {(downloadAvailable || renameAvailable || duplicateAvailable) && (
          <Menu.Divider />
        )}
        {downloadAvailable && (
          <Menu.Item
            leftSection={<DownloadIcon fontSize="small" />}
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
            leftSection={<DriveFileRenameOutlineIcon fontSize="small" />}
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
            leftSection={<ContentCopyOutlinedIcon fontSize="small" />}
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
        {/* Per-file Save to server; shown for local-only files. When
            storage is off it stays visible but disabled with a tooltip. */}
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
              leftSection={<CloudUploadIcon fontSize="small" />}
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
              {t("filesPage.saveToServer", "Save to server")}
            </Menu.Item>
          </Tooltip>
        )}
        {showVersionHistory && (
          <Menu.Item
            leftSection={<HistoryIcon fontSize="small" />}
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
          leftSection={<DeleteIcon fontSize="small" />}
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
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;
  /** Subtitle for search results outside current folder. */
  parentPath?: string;
  /** Shows the checkbox once 2+ files are selected. */
  multiSelectActive: boolean;
  /** Download / rename / duplicate menu items offered. */
  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;
  /** Kebab Save to server offered; only fires when file is local-only. */
  saveToServerAvailable: boolean;
  /** Version-history menu item offered; shown only when file has >1 version. */
  versionHistoryAvailable: boolean;
  /** When set, the kebab Save to server is disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
  badges: FileItemPolicyRef[];
  actions: FileGridActions;
}

const FileCard = React.memo(function FileCard({
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
  actions,
}: FileCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileSize = useMemo(() => formatFileSize(file.size), [file.size]);
  const fileDate = useMemo(
    () => getFileDate({ lastModified: file.lastModified }),
    [file.lastModified],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) =>
      actions.selectFile(file.id, e.shiftKey, e.metaKey || e.ctrlKey),
    [actions, file.id],
  );
  const onDoubleClick = useCallback(
    () => actions.openFile(file),
    [actions, file],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(
        FILES_PAGE_DRAG_TYPE,
        actions.fileDragPayload(file.id),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [actions, file.id],
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
      // Right-click on unselected card selects first, then opens menu.
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
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
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
      {/* Checkbox only renders once the user is explicitly in multi-select
          mode (2+ files chosen via Ctrl/Shift-click, or one file then
          another). For single-select the highlight border on the card is
          the only state indicator - avoids the always-on-checkbox
          visual noise and matches the file-explorer model. */}
      {multiSelectActive && (
        <div className="files-page-card-selector">
          <Checkbox
            checked={isSelected}
            onClick={(e) => {
              // Ctrl-click semantics: toggle this file in/out of the selection.
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
              <PictureAsPdfIcon style={{ fontSize: "2rem" }} />
            ) : (
              <InsertDriveFileIcon style={{ fontSize: "2rem" }} />
            )}
            <span>{extension || "FILE"}</span>
          </div>
        )}
        <div className="files-page-card-origin">
          <FileOriginBadge origin={getFileOrigin(file)} compact />
        </div>
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
        <FileActionsMenu
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
      </div>
    </div>
  );
});

function ListView({
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
}: FileGridProps & {
  sortMode?: FilesPageSortMode;
  onChangeSortMode?: (next: FilesPageSortMode) => void;
  actions: FileGridActions;
  policyBadges: Map<string, FileItemPolicyRef[]>;
}) {
  const { t } = useTranslation();

  // Tri-state header checkbox state - computed from current entries.
  const visibleFileIds = useMemo(
    () =>
      entries
        .filter(
          (e): e is FilesPageEntry & { file: StirlingFileStub } =>
            e.kind === "file" && !!e.file,
        )
        .map((e) => e.file.id),
    [entries],
  );
  const allSelected =
    visibleFileIds.length > 0 &&
    visibleFileIds.every((id) => selectedFileIds.has(id));
  const someSelected =
    !allSelected && visibleFileIds.some((id) => selectedFileIds.has(id));

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

  return (
    <div className="files-page-list" role="grid">
      {/* Each direct child is a columnheader: a role="row" may only own cells, so
          the sort controls and the select-all box have to sit inside one. */}
      <div className="files-page-list-row is-header" role="row">
        {onSetSelection && visibleFileIds.length > 0 ? (
          <span role="columnheader">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={() => {
                onSetSelection(
                  allSelected ? new Set() : new Set(visibleFileIds),
                );
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
            {t("filesPage.column.modified", "Modified")}
            {sortIndicator("modified-asc", "modified-desc")}
          </span>
        </span>
        <span aria-hidden="true" />
      </div>
      {entries.map((entry) => {
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderRow
              key={`folder-${entry.folder.id}`}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              serverReachable={serverReachable ?? false}
              actions={actions}
            />
          );
        }
        if (entry.kind === "diskFile" && entry.disk) {
          return (
            <DiskFileRow
              key={`disk-${entry.disk.path}`}
              entry={entry.disk}
              actions={actions}
            />
          );
        }
        if (entry.kind === "file" && entry.file) {
          return (
            <FileRow
              key={`file-${entry.file.id}`}
              file={entry.file}
              parentPath={entry.parentPath}
              isSelected={selectedFileIds.has(entry.file.id)}
              isInWorkspace={
                activeWorkspaceFileIds?.has(entry.file.id) ?? false
              }
              multiSelectActive={selectedFileIds.size >= 2}
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
    </div>
  );
}

interface FolderRowProps {
  folder: FolderRecord;
  fileCount: number;
  parentPath?: string;
  serverReachable: boolean;
  actions: FileGridActions;
}

const FolderRow = React.memo(function FolderRow({
  folder,
  fileCount,
  parentPath,
  serverReachable,
  actions,
}: FolderRowProps) {
  const { t } = useTranslation();
  const onOpen = () => actions.openFolder(folder.id);
  // Kinds gate the edit items, as in FolderCard.
  const kind = folderKind(folder);
  const originBadge = useFolderOriginBadge(folder);
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
      draggable
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
      {...dropHandlers}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        kebabRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={`files-page-list-row${isDropTarget ? " is-drop-target" : ""}`}
    >
      <span aria-hidden="true" />
      {/* Each direct child is a gridcell: a role="row" may only own cells, so the
          actions menu has to sit inside one. */}
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
        <FileOriginBadge
          origin={originBadge.origin}
          tooltip={originBadge.tooltip}
          compact
        />
      </span>
      <span role="gridcell">
        {kind === "virtual"
          ? t("filesPage.folderKind.virtual", "Browser folder")
          : kind === "local"
            ? t("filesPage.folderKind.local", "Local folder")
            : t("filesPage.folder", "Folder")}
      </span>
      <span role="gridcell">
        {fileCount === 0
          ? "-"
          : t("filesPage.folderItems", "{{count}} items", { count: fileCount })}
      </span>
      <span role="gridcell">
        {getFileDate({ lastModified: folder.updatedAt })}
      </span>
      <span role="gridcell">
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              ref={kebabRef}
              variant="tertiary"
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("filesPage.folderMenu", "Folder actions")}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<OpenInNewIcon fontSize="small" />}
              onClick={onOpen}
            >
              {t("filesPage.open", "Open")}
            </Menu.Item>
            {/* Only a mount root can be removed; a subdirectory is the
                disk's, and the app never deletes directories. */}
            {editsHidden && folder.parentFolderId === null && (
              <Menu.Item
                color="red"
                leftSection={<DeleteIcon fontSize="small" />}
                onClick={() => actions.deleteFolder(folder)}
              >
                {t(
                  "filesPage.removeLocalFolder",
                  "Remove (files stay on disk)",
                )}
              </Menu.Item>
            )}
            {!editsHidden && (
              <>
                <Menu.Item
                  leftSection={<DriveFileRenameOutlineIcon fontSize="small" />}
                  onClick={() => actions.renameFolder(folder)}
                  disabled={editsDisabled}
                  title={editsDisabled ? offlineHint : undefined}
                >
                  {t("filesPage.rename", "Rename")}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>
                  {t("filesPage.appearance.title", "Appearance")}
                </Menu.Label>
                <FolderAppearancePicker
                  folder={folder}
                  onChange={(appearance) =>
                    actions.changeFolderAppearance(folder.id, appearance)
                  }
                  disabled={editsDisabled}
                />
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<DeleteIcon fontSize="small" />}
                  onClick={() => actions.deleteFolder(folder)}
                  disabled={editsDisabled}
                  title={editsDisabled ? offlineHint : undefined}
                >
                  {t("filesPage.deleteFolder", "Delete folder")}
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </span>
    </div>
  );
});

interface FileRowProps {
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;
  parentPath?: string;
  /** Shows the checkbox once 2+ files are selected. */
  multiSelectActive: boolean;
  /** Download / rename / duplicate menu items offered. */
  downloadAvailable: boolean;
  renameAvailable: boolean;
  duplicateAvailable: boolean;
  /** Kebab Save to server offered; only fires when file is local-only. */
  saveToServerAvailable: boolean;
  /** Version-history menu item offered; shown only when file has >1 version. */
  versionHistoryAvailable: boolean;
  /** When set, the kebab Save to server is disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
  badges: FileItemPolicyRef[];
  actions: FileGridActions;
}

const FileRow = React.memo(function FileRow({
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
  actions,
}: FileRowProps) {
  const { t } = useTranslation();
  const kebabRef = useRef<HTMLButtonElement>(null);
  const fileSize = useMemo(() => formatFileSize(file.size), [file.size]);
  const fileDate = useMemo(
    () => getFileDate({ lastModified: file.lastModified }),
    [file.lastModified],
  );
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const resolvedThumbnail = useLazyThumbnail(
    file.id,
    file.size,
    file.thumbnailUrl,
  );
  const onClick = (e: React.MouseEvent) =>
    actions.selectFile(file.id, e.shiftKey, e.metaKey || e.ctrlKey);
  const onOpen = () => actions.openFile(file);
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={0}
      draggable
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
        if (e.key === "Enter") onOpen();
      }}
      className={`files-page-list-row${isSelected ? " is-selected" : ""}${isInWorkspace ? " is-in-workspace" : ""}`}
    >
      {/* Each direct child is a gridcell: a role="row" may only own cells, so the
          checkbox and the actions menu have to sit inside one.

          The checkbox only shows in multi-select mode (see FileCard). When it is
          hidden the first grid column collapses, but the row's CSS grid keeps the
          columns aligned via the named template, so no empty cell shows. */}
      {multiSelectActive ? (
        <span role="gridcell">
          <Checkbox
            checked={isSelected}
            onClick={(e) => {
              // Toggle this file in/out of the selection without modifier keys.
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
        // Empty cell preserves grid column alignment.
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
        {resolvedThumbnail ? (
          <img
            src={resolvedThumbnail}
            alt=""
            // draggable={false} so row's onDragStart fires, not native image drag.
            draggable={false}
            style={{
              width: "1.5rem",
              height: "1.5rem",
              objectFit: "cover",
              borderRadius: "0.25rem",
            }}
          />
        ) : (
          <PictureAsPdfIcon fontSize="small" />
        )}
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
        <FileOriginBadge origin={getFileOrigin(file)} compact />
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
      <span role="gridcell">
        <FileActionsMenu
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
      </span>
    </div>
  );
});

// Re-export root constant for caller convenience
export { ROOT_FOLDER_ID };

/**
 * No stub behind it, so no selection, move, rename or delete: the disk owns the
 * file and the only affordance is adding it to the workspace.
 */
const DiskFileCard = React.memo(function DiskFileCard({
  entry,
  actions,
}: {
  entry: DiskFileEntry;
  actions: FileGridActions;
}) {
  const onOpen = () => actions.openDiskFile(entry);
  const { t } = useTranslation();
  const thumbnail = useDiskThumbnail(entry);
  const extension = entry.name.includes(".")
    ? entry.name.split(".").pop()!.toUpperCase()
    : "";
  const isPdf = extension === "PDF";
  return (
    <div
      className="files-page-card"
      role="listitem"
      tabIndex={0}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      title={entry.path}
    >
      <div className="files-page-card-thumb">
        {thumbnail ? (
          <img src={thumbnail} alt="" draggable={false} />
        ) : (
          <div className="files-page-card-thumb-fallback">
            {isPdf ? (
              <PictureAsPdfIcon style={{ fontSize: "2rem" }} />
            ) : (
              <InsertDriveFileIcon style={{ fontSize: "2rem" }} />
            )}
            <span>{extension || "FILE"}</span>
          </div>
        )}
        <div className="files-page-card-origin">
          <FileOriginBadge
            origin="local"
            tooltip={t(
              "filesPage.origin.diskHint",
              "A file in the mounted folder on your disk",
            )}
            compact
          />
        </div>
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
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("filesPage.fileMenu", "File actions")}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<OpenInNewIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            >
              {t("filesPage.addToWorkspace", "Add to workspace")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
});

/** List-view sibling of {@link DiskFileCard}; same single affordance. */
const DiskFileRow = React.memo(function DiskFileRow({
  entry,
  actions,
}: {
  entry: DiskFileEntry;
  actions: FileGridActions;
}) {
  const onOpen = () => actions.openDiskFile(entry);
  const { t } = useTranslation();
  const thumbnail = useDiskThumbnail(entry);
  const ext = entry.name.includes(".")
    ? entry.name.split(".").pop()!.toUpperCase()
    : "";
  return (
    <div
      role="row"
      tabIndex={0}
      className="files-page-list-row"
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      title={entry.path}
    >
      <span aria-hidden="true" />
      <span
        role="gridcell"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minWidth: 0,
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            draggable={false}
            style={{
              width: "1.5rem",
              height: "1.5rem",
              objectFit: "cover",
              borderRadius: "0.25rem",
            }}
          />
        ) : ext === "PDF" ? (
          <PictureAsPdfIcon fontSize="small" />
        ) : (
          <InsertDriveFileIcon fontSize="small" />
        )}
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
      <span role="gridcell">
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="tertiary"
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("filesPage.fileMenu", "File actions")}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<OpenInNewIcon fontSize="small" />}
              onClick={onOpen}
            >
              {t("filesPage.addToWorkspace", "Add to workspace")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </span>
    </div>
  );
});
