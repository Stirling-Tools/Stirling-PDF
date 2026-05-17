/**
 * FilesPageContext - shared state for the My Files view.
 *
 * The tree navigator (rendered next to the FileSidebar) and the main file
 * grid (rendered inside the Workbench area) both need access to:
 *   - the cached file list and file-counts per folder
 *   - the current selection
 *   - dialog state (new folder / rename / move)
 *   - shared action helpers (move files, move folder, delete folder)
 *
 * Hoisting these into a context lets the two views render as independent
 * siblings without prop-drilling.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import { FolderId, FolderRecord, ROOT_FOLDER_ID } from "@app/types/folder";
import { fileStorage } from "@app/services/fileStorage";
import { folderSyncService } from "@app/services/folderSyncService";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useFolders } from "@app/contexts/FolderContext";

/**
 * Allowed values for the view-toggle in the files-page toolbar. Kept as a
 * `as const` tuple so consumers can iterate the modes (`FILES_PAGE_VIEW_MODES`)
 * without restating them, and the union `FilesPageViewMode` stays the single
 * source of truth.
 */
export const FILES_PAGE_VIEW_MODES = ["grid", "list"] as const;
export type FilesPageViewMode = (typeof FILES_PAGE_VIEW_MODES)[number];
export type FilesPageSortMode =
  | "name-asc"
  | "name-desc"
  | "modified-desc"
  | "modified-asc"
  | "size-desc"
  | "size-asc";
export type FilesPageOriginFilter = "all" | "local" | "cloud" | "shared-with-me";

/**
 * Tab views are presets that filter+navigate the file manager at once.
 *
 * - `all`    → tree visible; folder = currentFolderId (cloud)
 * - `local`  → only files with `remoteStorageId == null`; folders disabled
 * - `cloud`  → only cloud files; Local pseudo-folder hidden from tree
 * - `recent` → flat last-50-modified across both; folder context ignored
 * - `shared` → only files `remoteOwnedByCurrentUser === false`
 */
export type FilesPageTab = "all" | "local" | "cloud" | "recent" | "shared";

export interface FolderNameDialogState {
  mode: "new" | "rename" | null;
  parentId?: FolderId | null;
  folder?: FolderRecord;
}

export interface MoveDialogState {
  open: boolean;
  fileIds?: FileId[];
  folderId?: FolderId;
  initial: FolderId | null;
}

interface FilesPageContextValue {
  // Cached files (leaf-only)
  allFiles: StirlingFileStub[];
  fileMap: Map<FileId, StirlingFileStub>;
  fileCountsByFolder: Map<FolderId | null, number>;
  loading: boolean;
  refresh: () => Promise<void>;

  // Selection
  selectedFileIds: Set<FileId>;
  setSelectedFileIds: React.Dispatch<React.SetStateAction<Set<FileId>>>;
  clearSelection: () => void;

  // View + sort + search + filters
  viewMode: FilesPageViewMode;
  setViewMode: (mode: FilesPageViewMode) => void;
  sortMode: FilesPageSortMode;
  setSortMode: (mode: FilesPageSortMode) => void;
  search: string;
  setSearch: (value: string) => void;
  originFilter: FilesPageOriginFilter;
  setOriginFilter: (filter: FilesPageOriginFilter) => void;
  /** Selected file extensions (uppercased, e.g. ["PDF", "DOCX"]).
   *  Empty array = no type filter applied. */
  typeFilter: string[];
  setTypeFilter: (next: string[]) => void;

  /** Active filter-tab. Drives which files appear and which UI affordances enable. */
  currentTab: FilesPageTab;
  setCurrentTab: (tab: FilesPageTab) => void;

  // Dialog state
  folderNameDialog: FolderNameDialogState;
  openNewFolderDialog: (parentId?: FolderId | null) => void;
  openRenameFolderDialog: (folder: FolderRecord) => void;
  closeFolderNameDialog: () => void;
  submitFolderName: (name: string) => Promise<void>;

  moveDialog: MoveDialogState;
  promptMoveFiles: (fileIds: FileId[]) => void;
  closeMoveDialog: () => void;

  // Action helpers
  moveFilesTo: (
    fileIds: FileId[],
    folderId: FolderId | null,
  ) => Promise<void>;
  moveFolderTo: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => Promise<void>;
  removeFiles: (fileIds: FileId[]) => Promise<void>;
  deleteFolder: (folder: FolderRecord) => Promise<void>;
  setFolderAppearance: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => Promise<void>;
}

const FilesPageContext = createContext<FilesPageContextValue | null>(null);

export function FilesPageProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const indexedDB = useIndexedDB();
  const folders = useFolders();
  const { actions: fileActions } = useFileActions();

  const [allFiles, setAllFiles] = useState<StirlingFileStub[]>([]);
  const [loading, setLoading] = useState(true);

  // Narrow the dep - only setError is read, and useState setters are
  // identity-stable across renders, so refresh ends up effectively dep-less.
  // Earlier [folders] dep caused refresh to be recreated whenever any
  // FolderContext field changed → IDB re-read on every folder navigation.
  const setFoldersError = folders.setError;
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stubs = await fileStorage.getAllStirlingFileStubs();
      setAllFiles(stubs.filter((s) => s.isLeaf !== false));
      // Don't setError(null) on success - refresh fires after every file
      // mutation and from a useEffect; clearing here wiped folder-sync
      // errors a heartbeat after they appeared. Errors live until either
      // the user dismisses them or pullFromServer itself succeeds.
    } catch (err) {
      console.error("[FilesPageContext] refresh failed", err);
      setFoldersError(
        err instanceof Error ? err.message : "Failed to load files",
      );
    } finally {
      setLoading(false);
    }
  }, [setFoldersError]);

  useEffect(() => {
    void refresh();
  }, [refresh, indexedDB.revision]);

  const fileMap = useMemo(() => {
    const map = new Map<FileId, StirlingFileStub>();
    for (const f of allFiles) map.set(f.id, f);
    return map;
  }, [allFiles]);

  const fileCountsByFolder = useMemo(() => {
    const map = new Map<FolderId | null, number>();
    map.set(ROOT_FOLDER_ID, 0);
    for (const f of folders.folders) map.set(f.id, 0);
    for (const file of allFiles) {
      const fid = file.folderId ?? null;
      map.set(fid, (map.get(fid) ?? 0) + 1);
    }
    return map;
  }, [allFiles, folders.folders]);

  // Selection ---------------------------------------------------------------
  const [selectedFileIds, setSelectedFileIds] = useState<Set<FileId>>(
    () => new Set(),
  );
  const clearSelection = useCallback(() => setSelectedFileIds(new Set()), []);

  // Clear selection when folder changes.
  useEffect(() => {
    clearSelection();
  }, [folders.currentFolderId, clearSelection]);

  // View + sort + search + filters ----------------------------------------
  const [viewMode, setViewMode] = useState<FilesPageViewMode>("grid");
  const [sortMode, setSortMode] = useState<FilesPageSortMode>("modified-desc");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<FilesPageOriginFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<FilesPageTab>("all");

  // Dialog: folder name -----------------------------------------------------
  const [folderNameDialog, setFolderNameDialog] = useState<FolderNameDialogState>(
    { mode: null },
  );

  const openNewFolderDialog = useCallback(
    (parentId: FolderId | null = folders.currentFolderId) => {
      setFolderNameDialog({ mode: "new", parentId });
    },
    [folders.currentFolderId],
  );

  const openRenameFolderDialog = useCallback((folder: FolderRecord) => {
    setFolderNameDialog({ mode: "rename", folder });
  }, []);

  const closeFolderNameDialog = useCallback(() => {
    setFolderNameDialog({ mode: null });
  }, []);

  const submitFolderName = useCallback(
    async (name: string) => {
      if (folderNameDialog.mode === "new") {
        await folders.createFolder(
          name,
          folderNameDialog.parentId ?? folders.currentFolderId,
        );
      } else if (
        folderNameDialog.mode === "rename" &&
        folderNameDialog.folder
      ) {
        await folders.renameFolder(folderNameDialog.folder.id, name);
      }
    },
    [folderNameDialog, folders],
  );

  // Dialog: move ------------------------------------------------------------
  const [moveDialog, setMoveDialog] = useState<MoveDialogState>({
    open: false,
    initial: ROOT_FOLDER_ID,
  });

  const promptMoveFiles = useCallback(
    (fileIds: FileId[]) => {
      setMoveDialog({ open: true, fileIds, initial: folders.currentFolderId });
    },
    [folders.currentFolderId],
  );

  const closeMoveDialog = useCallback(() => {
    setMoveDialog((m) => ({ ...m, open: false }));
  }, []);

  // Action helpers ----------------------------------------------------------

  /**
   * Move files. Cloud files go through the server first (so cross-PC sync
   * sees the move); local-only files moving to ROOT are a no-op (they have
   * no folder concept); local-only files moving INTO a cloud folder are
   * rejected with an actionable error - they need to be uploaded first.
   */
  const moveFilesTo = useCallback(
    async (fileIds: FileId[], folderId: FolderId | null) => {
      if (fileIds.length === 0) return;
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      const localOnly = stubs.filter((s) => s.remoteStorageId == null);
      const cloudFiles = stubs.filter((s) => s.remoteStorageId != null);

      if (folderId !== null && localOnly.length > 0) {
        // Throw so dialog callers (MoveToFolderDialog) stay open with the
        // error visible inline. The banner still appears as a fallback.
        const message = t(
          "filesPage.moveLocalToCloudBlocked",
          "Local-only files can't be moved into cloud folders. Save them to the cloud first.",
        );
        folders.setError(message);
        throw new Error(message);
      }

      if (cloudFiles.length > 0) {
        try {
          const remoteIds = cloudFiles
            .map((s) => s.remoteStorageId!)
            .filter((id): id is number => typeof id === "number");
          const result = await folderSyncService.bulkMoveFiles(
            remoteIds,
            folderId,
          );
          if (result.skippedFileIds.length > 0) {
            folders.setError(
              t(
                "filesPage.moveSkippedRemote",
                "{{count}} file(s) couldn't be moved on the server (no permission or already deleted).",
                { count: result.skippedFileIds.length },
              ),
            );
          }
          const movedRemoteSet = new Set(result.movedFileIds);
          const idsToCacheMove = cloudFiles
            .filter((s) => movedRemoteSet.has(s.remoteStorageId!))
            .map((s) => s.id);
          if (idsToCacheMove.length > 0) {
            await indexedDB.moveFilesToFolder(idsToCacheMove, folderId);
          }
        } catch (err) {
          folders.setError(
            err instanceof Error
              ? `Could not move files: ${err.message}`
              : "Could not move files.",
          );
          throw err;
        }
      }

      // Local-only files moving to ROOT (folderId == null) is a no-op in terms
      // of cloud state; nothing to write either. Falls through.
      await refresh();
    },
    [indexedDB, refresh, fileMap, folders, t],
  );

  const moveFolderTo = useCallback(
    async (folderId: FolderId, newParentId: FolderId | null) => {
      // Optimistic cycle guard - server enforces too, but blocking here
      // avoids the round-trip and surfaces a clear, immediate message.
      if (newParentId !== null && folders.isDescendant(newParentId, folderId)) {
        folders.setError(
          t(
            "filesPage.cycleBlocked",
            "Can't move a folder into one of its own subfolders.",
          ),
        );
        return;
      }
      await folders.moveFolder(folderId, newParentId);
    },
    [folders, t],
  );

  const removeFiles = useCallback(
    async (fileIds: FileId[]) => {
      if (fileIds.length === 0) return;
      const ok = window.confirm(
        t(
          "filesPage.removeConfirm",
          "Remove {{count}} file(s) from storage? This deletes them permanently.",
          { count: fileIds.length },
        ),
      );
      if (!ok) return;
      await fileActions.removeFiles(fileIds, true);
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        for (const id of fileIds) next.delete(id);
        return next;
      });
      await refresh();
    },
    [fileActions, refresh, t],
  );

  const setFolderAppearance = useCallback(
    async (
      folderId: FolderId,
      appearance: { color?: string; icon?: string | null },
    ) => {
      await folders.updateFolderAppearance(folderId, appearance);
    },
    [folders],
  );

  const deleteFolder = useCallback(
    async (folder: FolderRecord) => {
      // Walk the full subtree, not just direct children - recursive delete
      // affects every nested file, so showing only the direct-count was
      // misleading users into approving destructive operations blind.
      const subtreeIds = new Set<FolderId>([folder.id]);
      const stack: FolderId[] = [folder.id];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const childId of folders.getChildFolderIds(cur)) {
          if (subtreeIds.has(childId)) continue;
          subtreeIds.add(childId);
          stack.push(childId);
        }
      }
      const filesInside = allFiles.filter((f) => {
        const fid = f.folderId ?? null;
        return fid !== null && subtreeIds.has(fid);
      }).length;
      const ok = window.confirm(
        t(
          "filesPage.deleteFolderConfirm",
          'Delete folder "{{name}}"? Files inside will be moved to All files. {{count}} file(s) affected.',
          { name: folder.name, count: filesInside },
        ),
      );
      if (!ok) return;
      await folders.deleteFolder(folder.id);
      await refresh();
    },
    [allFiles, folders, refresh, t],
  );

  // Memoise the value object so consumers don't re-render when an unrelated
  // ancestor renders. Without this every keystroke in the search input
  // produced a fresh context value and re-rendered every FileCard.
  const value = useMemo<FilesPageContextValue>(
    () => ({
      allFiles,
      fileMap,
      fileCountsByFolder,
      loading,
      refresh,
      selectedFileIds,
      setSelectedFileIds,
      clearSelection,
      viewMode,
      setViewMode,
      sortMode,
      setSortMode,
      search,
      setSearch,
      originFilter,
      setOriginFilter,
      typeFilter,
      setTypeFilter,
      currentTab,
      setCurrentTab,
      folderNameDialog,
      openNewFolderDialog,
      openRenameFolderDialog,
      closeFolderNameDialog,
      submitFolderName,
      moveDialog,
      promptMoveFiles,
      closeMoveDialog,
      moveFilesTo,
      moveFolderTo,
      removeFiles,
      deleteFolder,
      setFolderAppearance,
    }),
    [
      allFiles,
      fileMap,
      fileCountsByFolder,
      loading,
      refresh,
      selectedFileIds,
      clearSelection,
      viewMode,
      sortMode,
      search,
      originFilter,
      typeFilter,
      currentTab,
      folderNameDialog,
      openNewFolderDialog,
      openRenameFolderDialog,
      closeFolderNameDialog,
      submitFolderName,
      moveDialog,
      promptMoveFiles,
      closeMoveDialog,
      moveFilesTo,
      moveFolderTo,
      removeFiles,
      deleteFolder,
      setFolderAppearance,
    ],
  );

  return (
    <FilesPageContext.Provider value={value}>
      {children}
    </FilesPageContext.Provider>
  );
}

export function useFilesPage(): FilesPageContextValue {
  const ctx = useContext(FilesPageContext);
  if (!ctx) {
    throw new Error("useFilesPage must be used within a FilesPageProvider");
  }
  return ctx;
}
