import React, { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox, Menu, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { PolicyBadges as PolicyBadgeRow } from "@app/components/shared/PolicyBadges";
import FolderIcon from "@mui/icons-material/Folder";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import SearchIcon from "@mui/icons-material/Search";

import { FileId } from "@app/types/file";
import { FolderId, FolderRecord, ROOT_FOLDER_ID } from "@app/types/folder";
import { useFolders } from "@app/contexts/FolderContext";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";
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
import { useLazyThumbnail } from "@app/hooks/useLazyThumbnail";
import type { FilesPageSortMode } from "@app/contexts/FilesPageContext";
import { OpenInNewWindowMenuItem } from "@app/components/filesPage/OpenInNewWindowMenuItem";

export type FilesPageViewMode = "grid" | "list";

/**
 * A folder mounted from a directory on disk. It is not a {@link FolderRecord}: there is no stored
 * folder behind it, and its id is a processing-folder id rather than the branded UUID a
 * FolderRecord carries — so it is kept as its own entry kind instead of being faked into one.
 */
export interface MountedFolderEntry {
  /** The processing folder's id, for reading its contents and acting on it. */
  id: string;
  name: string;
  /** The directory it mirrors, shown as the folder's subtitle. */
  directory: string;
  enabled: boolean;
}

export interface FilesPageEntry {
  kind: "folder" | "file" | "mounted";
  folder?: FolderRecord;
  /** Number of files inside this folder (folder entries only). */
  folderFileCount?: number;
  file?: StirlingFileStub;
  /** Set for `kind: "mounted"` — a folder backed by a directory on disk. */
  mounted?: MountedFolderEntry;
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
  /** Open a folder mounted from disk, by its processing-folder id. */
  onOpenMountedFolder?: (id: string) => void;
  /** "Add to workspace". */
  onOpenFile: (file: StirlingFileStub) => void;
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
          <ListView {...props} />
          {emptyState}
        </>
      );
    }
    return emptyState;
  }

  if (viewMode === "list") {
    return <ListView {...props} />;
  }
  return <GridView {...props} />;
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
  onSelectFile,
  onOpenFolder,
  onOpenMountedFolder,
  onOpenFile,
  onMoveFiles,
  onMoveFolder,
  onRenameFolder,
  onDeleteFolder,
  onChangeFolderAppearance,
  onRemoveFiles,
  onPromptMoveFiles,
  onSaveToServer,
  onVersionHistory,
  saveToServerDisabledReason,
}: FileGridProps) {
  return (
    <div className="files-page-grid" role="list">
      {entries.map((entry) => {
        if (entry.kind === "mounted" && entry.mounted) {
          return (
            <MountedFolderCard
              key={`mounted-${entry.mounted.id}`}
              mounted={entry.mounted}
              onOpen={() => onOpenMountedFolder?.(entry.mounted!.id)}
            />
          );
        }
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderCard
              key={`folder-${entry.folder.id}`}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              selectedFileIds={selectedFileIds}
              onOpen={() => onOpenFolder(entry.folder!.id)}
              onRename={() => onRenameFolder(entry.folder!)}
              onDelete={() => onDeleteFolder(entry.folder!)}
              onChangeAppearance={(appearance) =>
                onChangeFolderAppearance(entry.folder!.id, appearance)
              }
              onMoveFiles={(fileIds) => onMoveFiles(fileIds, entry.folder!.id)}
              onMoveFolder={(folderId) =>
                onMoveFolder(folderId, entry.folder!.id)
              }
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
                activeWorkspaceFileIds?.has(entry.file.id as string) ?? false
              }
              selectedFileIds={selectedFileIds}
              multiSelectActive={selectedFileIds.size >= 2}
              onClick={(e) =>
                onSelectFile(entry.file!.id, e.shiftKey, e.metaKey || e.ctrlKey)
              }
              onDoubleClick={() => onOpenFile(entry.file!)}
              onRemove={() => onRemoveFiles([entry.file!.id])}
              onMove={() => {
                const target = selectedFileIds.has(entry.file!.id)
                  ? Array.from(selectedFileIds)
                  : [entry.file!.id];
                onPromptMoveFiles(target);
              }}
              onSaveToServer={
                onSaveToServer ? () => onSaveToServer(entry.file!) : undefined
              }
              onVersionHistory={
                onVersionHistory
                  ? () => onVersionHistory(entry.file!)
                  : undefined
              }
              saveToServerDisabledReason={saveToServerDisabledReason}
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
  selectedFileIds: Set<FileId>;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeAppearance: (appearance: {
    color?: string;
    icon?: string | null;
  }) => void;
  onMoveFiles: (fileIds: FileId[]) => void | Promise<void>;
  onMoveFolder: (folderId: FolderId) => void | Promise<void>;
}

function FolderCard({
  folder,
  fileCount,
  parentPath,
  onOpen,
  onRename,
  onDelete,
  onChangeAppearance,
  onMoveFiles,
  onMoveFolder,
}: FolderCardProps) {
  const { t } = useTranslation();
  const { serverReachable, setError } = useFolders();
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const surfaceDrop = (err: unknown, label: string) => {
    console.error(`[FolderCard] ${label}`, err);
    setError(
      err instanceof Error
        ? `Could not ${label}: ${err.message}`
        : `Could not ${label}.`,
    );
  };
  const {
    byFolderId: processingFolders,
    enable: enableProcessing,
    disable: disableProcessing,
    sweep: sweepProcessing,
  } = useProcessingFolders();
  const processing = processingFolders.get(folder.id as string);
  // Each action surfaces its own failure the way a failed drop does; the
  // backend's reason (invalid pipeline, storage disabled) is the useful part.
  const startProcessing = (label: string) =>
    Promise.resolve(enableProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const stopProcessing = (label: string) =>
    Promise.resolve(disableProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const runProcessing = (label: string) =>
    Promise.resolve(sweepProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const kebabRef = useRef<HTMLButtonElement>(null);
  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      // Surface rejections instead of silent no-op on IDB failures.
      if (payload.kind === "files") {
        Promise.resolve(onMoveFiles(payload.fileIds)).catch((err) =>
          surfaceDrop(err, "move files into folder"),
        );
      } else if (payload.kind === "folder") {
        Promise.resolve(onMoveFolder(payload.folderId)).catch((err) =>
          surfaceDrop(err, "move folder"),
        );
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
      className={`files-page-card is-folder${
        isDropTarget ? " is-drop-target" : ""
      }`}
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
            <span className="files-page-processing-tag">
              {processing.enabled
                ? t("filesPage.processing.active", "Processing folder")
                : t("filesPage.processing.paused", "Processing paused")}
            </span>
          ) : fileCount === 0 ? (
            t("filesPage.folder", "Folder")
          ) : (
            t("filesPage.folderItems", "{{count}} items", {
              count: fileCount,
            })
          )}
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
            <Menu.Item
              leftSection={<DriveFileRenameOutlineIcon fontSize="small" />}
              onClick={onRename}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.rename", "Rename")}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>
              {t("filesPage.appearance.title", "Appearance")}
            </Menu.Label>
            <FolderAppearancePicker
              folder={folder}
              onChange={onChangeAppearance}
              disabled={!serverReachable}
            />
            <Menu.Divider />
            {processing ? (
              <>
                <Menu.Item
                  leftSection={<AutoModeIcon fontSize="small" />}
                  onClick={() => void runProcessing("process folder now")}
                >
                  {t("filesPage.processing.sweep", "Process files now")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<AutoModeIcon fontSize="small" />}
                  onClick={() => void stopProcessing("stop processing folder")}
                >
                  {t(
                    "filesPage.processing.stop",
                    "Stop processing this folder",
                  )}
                </Menu.Item>
              </>
            ) : (
              <Menu.Item
                leftSection={<AutoModeIcon fontSize="small" />}
                onClick={() => void startProcessing("process folder")}
                disabled={!serverReachable}
                title={!serverReachable ? offlineHint : undefined}
              >
                {t(
                  "filesPage.processing.start",
                  "Process files in this folder…",
                )}
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<DeleteIcon fontSize="small" />}
              onClick={onDelete}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.deleteFolder", "Delete folder")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}

/**
 * A folder mirrored from a directory on disk. Read-only here: the directory is the source of
 * truth, so this shows what is in it rather than offering the storage-folder actions (rename,
 * appearance, delete) that would have no meaning on someone's own filesystem.
 */
function MountedFolderCard({
  mounted,
  onOpen,
}: {
  mounted: MountedFolderEntry;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="listitem"
      tabIndex={0}
      className="files-page-card is-folder is-mounted"
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      title={mounted.directory}
    >
      <div className="files-page-card-thumb">
        <FolderThumbnail color={undefined} fileCount={0} />
      </div>
      <div className="files-page-card-body">
        <div className="files-page-card-name" title={mounted.name}>
          {mounted.name}
        </div>
        <div className="files-page-card-path" title={mounted.directory}>
          {mounted.directory}
        </div>
        <div className="files-page-card-meta">
          <span className="files-page-processing-tag">
            {mounted.enabled
              ? t("filesPage.processing.active", "Processing folder")
              : t("filesPage.processing.paused", "Processing paused")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** List-view counterpart of {@link MountedFolderCard}. */
function MountedFolderRow({
  mounted,
  onOpen,
}: {
  mounted: MountedFolderEntry;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="row"
      tabIndex={0}
      className="files-page-list-row is-folder is-mounted"
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      title={mounted.directory}
    >
      <span aria-hidden="true" />
      <span className="files-page-list-name">
        <FolderIcon fontSize="small" />
        <span>
          {mounted.name}
          <span className="files-page-card-path"> {mounted.directory}</span>
        </span>
      </span>
      <span>
        <span className="files-page-processing-tag">
          {mounted.enabled
            ? t("filesPage.processing.active", "Processing folder")
            : t("filesPage.processing.paused", "Processing paused")}
        </span>
      </span>
      <span>-</span>
      <span>-</span>
      <span aria-hidden="true" />
    </div>
  );
}

/** Shield badges for the policies that have run on a file. */
function PolicyBadges({ fileId }: { fileId: string }) {
  const badges = usePolicyFileBadges().get(fileId) ?? [];
  return <PolicyBadgeRow policies={badges} />;
}

interface FileCardProps {
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;
  /** Subtitle for search results outside current folder. */
  parentPath?: string;
  selectedFileIds: Set<FileId>;
  /** Shows the checkbox once 2+ files are selected. */
  multiSelectActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onRemove: () => void;
  onMove: () => void;
  /** Kebab Save to server; only fires when file is local-only. */
  onSaveToServer?: () => void;
  /** Open the version-history modal; shown only when file has >1 version. */
  onVersionHistory?: () => void;
  /** When set, the kebab Save to server is disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
}

function FileCard({
  file,
  parentPath,
  isSelected,
  isInWorkspace,
  selectedFileIds,
  multiSelectActive,
  onClick,
  onDoubleClick,
  onRemove,
  onMove,
  onSaveToServer,
  onVersionHistory,
  saveToServerDisabledReason,
}: FileCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileSize = useMemo(() => formatFileSize(file.size), [file.size]);
  const fileDate = useMemo(
    () => getFileDate({ lastModified: file.lastModified }),
    [file.lastModified],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const fileIds = isSelected ? Array.from(selectedFileIds) : [file.id];
      e.dataTransfer.setData(
        FILES_PAGE_DRAG_TYPE,
        serialiseFilesPageDragPayload({ kind: "files", fileIds }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [file.id, isSelected, selectedFileIds],
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
      className={`files-page-card${isSelected ? " is-selected" : ""}${
        isInWorkspace ? " is-in-workspace" : ""
      }`}
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
              // Synthesise ctrl-click so parent takes the toggle branch.
              e.stopPropagation();
              onClick({
                ...e,
                shiftKey: false,
                ctrlKey: true,
                metaKey: true,
              } as unknown as React.MouseEvent);
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
          <span>·</span>
          <span>{fileDate}</span>
          <PolicyBadges fileId={file.id as string} />
        </div>
      </div>
      <div className="files-page-card-actions">
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              ref={kebabRef}
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
                onDoubleClick();
              }}
            >
              {t("filesPage.addToWorkspace", "Add to workspace")}
            </Menu.Item>
            <OpenInNewWindowMenuItem file={file} />
            <Menu.Item
              leftSection={<DriveFileMoveIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onMove();
              }}
              data-testid="file-menu-move-to"
            >
              {t("filesPage.moveTo", "Move to…")}
            </Menu.Item>
            {/* Per-file Save to server; shown for local-only files. When
                storage is off it stays visible but disabled with a tooltip. */}
            {onSaveToServer && file.remoteStorageId == null && (
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
                    onSaveToServer();
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
            {onVersionHistory && (file.versionNumber ?? 1) > 1 && (
              <Menu.Item
                leftSection={<HistoryIcon fontSize="small" />}
                onClick={(e) => {
                  e.stopPropagation();
                  onVersionHistory();
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
                onRemove();
              }}
            >
              {t("filesPage.remove", "Delete")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}

function ListView({
  entries,
  selectedFileIds,
  activeWorkspaceFileIds,
  onSelectFile,
  onSetSelection,
  onOpenFolder,
  onOpenMountedFolder,
  onOpenFile,
  onMoveFiles,
  onMoveFolder,
  onRenameFolder,
  onDeleteFolder,
  onSaveToServer,
  onVersionHistory,
  saveToServerDisabledReason,
  onChangeFolderAppearance,
  onRemoveFiles,
  onPromptMoveFiles,
  sortMode,
  onChangeSortMode,
}: FileGridProps & {
  sortMode?: FilesPageSortMode;
  onChangeSortMode?: (next: FilesPageSortMode) => void;
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
        if (entry.kind === "mounted" && entry.mounted) {
          return (
            <MountedFolderRow
              key={`mounted-${entry.mounted.id}`}
              mounted={entry.mounted}
              onOpen={() => onOpenMountedFolder?.(entry.mounted!.id)}
            />
          );
        }
        if (entry.kind === "folder" && entry.folder) {
          return (
            <FolderRow
              key={`folder-${entry.folder.id}`}
              folder={entry.folder}
              fileCount={entry.folderFileCount ?? 0}
              parentPath={entry.parentPath}
              onOpen={() => onOpenFolder(entry.folder!.id)}
              onRename={() => onRenameFolder(entry.folder!)}
              onDelete={() => onDeleteFolder(entry.folder!)}
              onChangeAppearance={(appearance) =>
                onChangeFolderAppearance(entry.folder!.id, appearance)
              }
              onDropFiles={(fileIds) => onMoveFiles(fileIds, entry.folder!.id)}
              onDropFolder={(folderId) =>
                onMoveFolder(folderId, entry.folder!.id)
              }
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
                activeWorkspaceFileIds?.has(entry.file.id as string) ?? false
              }
              selectedFileIds={selectedFileIds}
              multiSelectActive={selectedFileIds.size >= 2}
              onClick={(e) =>
                onSelectFile(entry.file!.id, e.shiftKey, e.metaKey || e.ctrlKey)
              }
              onOpen={() => onOpenFile(entry.file!)}
              onRemove={() => onRemoveFiles([entry.file!.id])}
              onMove={() => {
                const target = selectedFileIds.has(entry.file!.id)
                  ? Array.from(selectedFileIds)
                  : [entry.file!.id];
                onPromptMoveFiles(target);
              }}
              onSaveToServer={
                onSaveToServer ? () => onSaveToServer(entry.file!) : undefined
              }
              onVersionHistory={
                onVersionHistory
                  ? () => onVersionHistory(entry.file!)
                  : undefined
              }
              saveToServerDisabledReason={saveToServerDisabledReason}
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
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeAppearance: (appearance: {
    color?: string;
    icon?: string | null;
  }) => void;
  onDropFiles: (fileIds: FileId[]) => void | Promise<void>;
  onDropFolder: (folderId: FolderId) => void | Promise<void>;
}

function FolderRow({
  folder,
  fileCount,
  parentPath,
  onOpen,
  onRename,
  onDelete,
  onChangeAppearance,
  onDropFiles,
  onDropFolder,
}: FolderRowProps) {
  const { t } = useTranslation();
  const { serverReachable, setError } = useFolders();
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const surfaceDrop = (err: unknown, label: string) => {
    console.error(`[FolderRow] ${label}`, err);
    setError(
      err instanceof Error
        ? t("filesPage.error.actionFailedDetail", {
            action: label,
            message: err.message,
            defaultValue: `Could not ${label}: ${err.message}`,
          })
        : t("filesPage.error.actionFailed", {
            action: label,
            defaultValue: `Could not ${label}.`,
          }),
    );
  };
  const {
    byFolderId: processingFolders,
    enable: enableProcessing,
    disable: disableProcessing,
    sweep: sweepProcessing,
  } = useProcessingFolders();
  const processing = processingFolders.get(folder.id as string);
  const startProcessing = (label: string) =>
    Promise.resolve(enableProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const stopProcessing = (label: string) =>
    Promise.resolve(disableProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const runProcessing = (label: string) =>
    Promise.resolve(sweepProcessing(folder.id as string)).catch((err) =>
      surfaceDrop(err, label),
    );
  const kebabRef = useRef<HTMLButtonElement>(null);
  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        Promise.resolve(onDropFiles(payload.fileIds)).catch((err) =>
          surfaceDrop(err, "move files into folder"),
        );
      } else if (payload.kind === "folder") {
        Promise.resolve(onDropFolder(payload.folderId)).catch((err) =>
          surfaceDrop(err, "move folder"),
        );
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
      </span>
      <span role="gridcell">
        {processing ? (
          <span className="files-page-processing-tag">
            {processing.enabled
              ? t("filesPage.processing.active", "Processing folder")
              : t("filesPage.processing.paused", "Processing paused")}
          </span>
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
            <Menu.Item
              leftSection={<DriveFileRenameOutlineIcon fontSize="small" />}
              onClick={onRename}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.rename", "Rename")}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>
              {t("filesPage.appearance.title", "Appearance")}
            </Menu.Label>
            <FolderAppearancePicker
              folder={folder}
              onChange={onChangeAppearance}
              disabled={!serverReachable}
            />
            <Menu.Divider />
            {processing ? (
              <>
                <Menu.Item
                  leftSection={<AutoModeIcon fontSize="small" />}
                  onClick={() => void runProcessing("process folder now")}
                >
                  {t("filesPage.processing.sweep", "Process files now")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<AutoModeIcon fontSize="small" />}
                  onClick={() => void stopProcessing("stop processing folder")}
                >
                  {t("filesPage.processing.stop", "Stop processing this folder")}
                </Menu.Item>
              </>
            ) : (
              <Menu.Item
                leftSection={<AutoModeIcon fontSize="small" />}
                onClick={() => void startProcessing("process folder")}
                disabled={!serverReachable}
                title={!serverReachable ? offlineHint : undefined}
              >
                {t("filesPage.processing.start", "Process files in this folder…")}
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<DeleteIcon fontSize="small" />}
              onClick={onDelete}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.deleteFolder", "Delete folder")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </span>
    </div>
  );
}

interface FileRowProps {
  file: StirlingFileStub;
  isSelected: boolean;
  isInWorkspace: boolean;
  parentPath?: string;
  selectedFileIds: Set<FileId>;
  /** Shows the checkbox once 2+ files are selected. */
  multiSelectActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onRemove: () => void;
  onMove: () => void;
  /** Kebab Save to server; only fires when file is local-only. */
  onSaveToServer?: () => void;
  /** Open the version-history modal; shown only when file has >1 version. */
  onVersionHistory?: () => void;
  /** When set, the kebab Save to server is disabled with this tooltip. */
  saveToServerDisabledReason?: string | null;
}

function FileRow({
  file,
  isSelected,
  isInWorkspace,
  parentPath,
  selectedFileIds,
  multiSelectActive,
  onClick,
  onOpen,
  onRemove,
  onMove,
  onSaveToServer,
  onVersionHistory,
  saveToServerDisabledReason,
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
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        const fileIds = isSelected ? Array.from(selectedFileIds) : [file.id];
        e.dataTransfer.setData(
          FILES_PAGE_DRAG_TYPE,
          serialiseFilesPageDragPayload({ kind: "files", fileIds }),
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
      className={`files-page-list-row${isSelected ? " is-selected" : ""}${
        isInWorkspace ? " is-in-workspace" : ""
      }`}
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
              onClick({
                ...e,
                shiftKey: false,
                ctrlKey: true,
                metaKey: true,
              } as unknown as React.MouseEvent);
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
        <PolicyBadges fileId={file.id as string} />
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
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              ref={kebabRef}
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
                onOpen();
              }}
            >
              {t("filesPage.addToWorkspace", "Add to workspace")}
            </Menu.Item>
            <OpenInNewWindowMenuItem file={file} />
            <Menu.Item
              leftSection={<DriveFileMoveIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onMove();
              }}
            >
              {t("filesPage.moveTo", "Move to…")}
            </Menu.Item>
            {/* Per-file Save to server; shown for local-only files. When
              storage is off it stays visible but disabled with a tooltip. */}
            {onSaveToServer && file.remoteStorageId == null && (
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
                    onSaveToServer();
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
            {onVersionHistory && (file.versionNumber ?? 1) > 1 && (
              <Menu.Item
                leftSection={<HistoryIcon fontSize="small" />}
                onClick={(e) => {
                  e.stopPropagation();
                  onVersionHistory();
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
                onRemove();
              }}
            >
              {t("filesPage.remove", "Delete")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </span>
    </div>
  );
}

// Re-export root constant for caller convenience
export { ROOT_FOLDER_ID };
