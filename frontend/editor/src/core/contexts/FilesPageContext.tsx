/** Shared state for the My Files view. */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import {
  FolderId,
  FolderKind,
  FolderRecord,
  ROOT_FOLDER_ID,
  folderKind,
} from "@app/types/folder";
import { fileStorage } from "@app/services/fileStorage";
import { folderSyncService } from "@app/services/folderSyncService";
import { uploadHistoryChain } from "@app/services/serverStorageUpload";
import { reconcileServerFiles } from "@app/services/fileSyncService";
import {
  deleteServerFile,
  type DeleteScope,
} from "@app/services/serverStorageDelete";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useFolders } from "@app/contexts/FolderContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";

/** View-toggle modes; tuple keeps the union and iterator in sync. */
export const FILES_PAGE_VIEW_MODES = ["grid", "list"] as const;
export type FilesPageViewMode = (typeof FILES_PAGE_VIEW_MODES)[number];
export type FilesPageSortMode =
  | "name-asc"
  | "name-desc"
  | "modified-desc"
  | "modified-asc"
  | "size-desc"
  | "size-asc";
export type FilesPageOriginFilter =
  | "all"
  | "local"
  | "cloud"
  | "shared-with-me";

/** all|local|cloud|recent|shared filter presets. */
export type FilesPageTab =
  | "all"
  | "local"
  | "cloud"
  | "recent"
  | "shared"
  | "sharedByMe";

export interface FolderNameDialogState {
  mode: "new" | "rename" | null;
  parentId?: FolderId | null;
  /** For a root-level create: the kind the caller chose (menu, not dialog). */
  kind?: FolderKind;
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
  openNewFolderDialog: (parentId?: FolderId | null, kind?: FolderKind) => void;
  openRenameFolderDialog: (folder: FolderRecord) => void;
  closeFolderNameDialog: () => void;
  submitFolderName: (name: string) => Promise<void>;

  moveDialog: MoveDialogState;
  promptMoveFiles: (fileIds: FileId[]) => void;
  closeMoveDialog: () => void;

  // Action helpers
  moveFilesTo: (fileIds: FileId[], folderId: FolderId | null) => Promise<void>;
  moveFolderTo: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => Promise<void>;
  /** Queue files for deletion - opens the DeleteFilesDialog. */
  removeFiles: (fileIds: FileId[]) => Promise<void>;
  /** Files currently queued in the delete dialog (empty when closed). */
  deleteDialogFileIds: FileId[];
  deleteDialogOpen: boolean;
  closeDeleteDialog: () => void;
  /** Confirmed delete; scope picks local, cloud, or both. */
  confirmRemoveFiles: (scope: DeleteScope) => Promise<void>;
  /** Open the confirmation dialog; consumer renders DeleteFolderDialog. */
  promptDeleteFolder: (folder: FolderRecord) => void;
  /** Confirmed delete; pass deleteContents=true to also remove files inside. */
  deleteFolder: (
    folder: FolderRecord,
    deleteContents: boolean,
  ) => Promise<void>;
  deleteFolderDialog: {
    folder: FolderRecord | null;
    fileCount: number;
  };
  closeDeleteFolderDialog: () => void;
  setFolderAppearance: (
    folderId: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => Promise<void>;
}

const FilesPageContext = createContext<FilesPageContextValue | null>(null);

export function FilesPageProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const indexedDB = useIndexedDB();
  const indexedDBRevision = useIndexedDBRevision();
  const folders = useFolders();
  const { actions: fileActions } = useFileActions();
  const { config: appConfig } = useAppConfig();
  const { isAnonymous } = useAuth();

  const [allFiles, setAllFiles] = useState<StirlingFileStub[]>([]);
  const [loading, setLoading] = useState(true);
  // Generation counter to drop stale reconcile results when a second refresh
  // overlaps the first. Mirrors the pattern FolderContext.pullFromServer uses
  // via pullInFlight, but kept as a counter so we can also discard results
  // from clearly-out-of-date calls instead of just serializing them.
  const refreshGenRef = useRef(0);

  // Narrow dep so refresh isn't recreated on every folders field change.
  const setFoldersError = folders.setError;
  const storageEnabled = appConfig?.storageEnabled === true;
  const shareLinksEnabled = appConfig?.storageShareLinksEnabled === true;
  const refresh = useCallback(async () => {
    const gen = ++refreshGenRef.current;
    setLoading(true);
    try {
      const localStubs = await fileStorage.getAllStirlingFileStubs();
      // Bail if a newer refresh started while IDB was reading.
      if (gen !== refreshGenRef.current) return;
      const localLeaf = localStubs.filter((s) => s.isLeaf !== false);
      // Render the cache immediately while the server fetch is in flight.
      setAllFiles(localLeaf);
      const merged = await reconcileServerFiles(localLeaf, {
        storageEnabled,
        shareLinksEnabled,
        isAnonymous,
      });
      // Drop the merged result if a newer refresh has already started -
      // otherwise its stale snapshot will clobber the newer one's state.
      if (gen !== refreshGenRef.current) return;
      setAllFiles(merged);
    } catch (err) {
      if (gen !== refreshGenRef.current) return;
      console.error("[FilesPageContext] refresh failed", err);
      setFoldersError(
        err instanceof Error ? err.message : "Failed to load files",
      );
    } finally {
      // Only the latest refresh should clear the loading state.
      if (gen === refreshGenRef.current) setLoading(false);
    }
  }, [setFoldersError, storageEnabled, shareLinksEnabled, isAnonymous]);

  useEffect(() => {
    void refresh();
  }, [refresh, indexedDBRevision]);

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
  const [originFilter, setOriginFilter] =
    useState<FilesPageOriginFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<FilesPageTab>("all");

  // Dialog: folder name -----------------------------------------------------
  const [folderNameDialog, setFolderNameDialog] =
    useState<FolderNameDialogState>({ mode: null });

  const openNewFolderDialog = useCallback(
    (
      parentId: FolderId | null = folders.currentFolderId,
      kind?: FolderKind,
    ) => {
      setFolderNameDialog({ mode: "new", parentId, kind });
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
        // The kind was chosen before the dialog opened (the New-folder menu);
        // it only matters at the root — a subfolder inherits its parent's.
        await folders.createFolder(
          name,
          folderNameDialog.parentId ?? folders.currentFolderId,
          folderNameDialog.kind,
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

  /** Cloud files move server-first; local files auto-upload then move. */
  const moveFilesTo = useCallback(
    async (fileIds: FileId[], folderId: FolderId | null) => {
      if (fileIds.length === 0) return;
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      const localOnly = stubs.filter((s) => s.remoteStorageId == null);
      // Cloud list is mutated below with newly-promoted local files.
      const cloudFiles = stubs.filter((s) => s.remoteStorageId != null);

      const targetFolder =
        folderId === null ? null : folders.foldersById.get(folderId);
      const targetKind = targetFolder ? folderKind(targetFolder) : null;

      if (targetKind === "local") {
        // A local folder's contents are whatever its directory contains on
        // disk; putting an app file there means writing to the filesystem,
        // which is a different feature from membership, not a move.
        folders.setError(
          t(
            "filesPage.moveIntoLocalBlocked",
            "Files can't be moved into a folder that mirrors a directory on disk.",
          ),
        );
        return;
      }

      if (targetKind === "virtual") {
        // A virtual folder is browser-owned, so membership is too: local
        // files just point their folderId at it — no upload, no server call.
        // Server files stay out: their folder membership belongs to the
        // server, and the next sync would silently snap them back.
        if (cloudFiles.length > 0) {
          folders.setError(
            t(
              "filesPage.moveIntoVirtualCloudSkipped",
              "{{count}} server file(s) were left in place — server files can't live in browser-only folders.",
              { count: cloudFiles.length },
            ),
          );
        }
        if (localOnly.length > 0) {
          await indexedDB.moveFilesToFolder(
            localOnly.map((s) => s.id),
            folderId,
          );
        }
        await refresh();
        return;
      }

      if (folderId !== null && localOnly.length > 0) {
        // Per-file uploadHistoryChain so each gets its own remoteStorageId.
        try {
          for (const stub of localOnly) {
            const rootId = (stub.originalFileId || stub.id) as FileId;
            const { remoteId, updatedAt, chain } =
              await uploadHistoryChain(rootId);
            for (const chainStub of chain) {
              fileActions.updateStirlingFileStub(chainStub.id, {
                remoteStorageId: remoteId,
                remoteStorageUpdatedAt: updatedAt,
                remoteOwnedByCurrentUser: true,
                remoteSharedViaLink: false,
              });
              await fileStorage.updateFileMetadata(chainStub.id, {
                remoteStorageId: remoteId,
                remoteStorageUpdatedAt: updatedAt,
                remoteOwnedByCurrentUser: true,
                remoteSharedViaLink: false,
              });
            }
            // Promoted file joins the bulk-move round.
            cloudFiles.push({
              ...stub,
              remoteStorageId: remoteId,
              remoteStorageUpdatedAt: updatedAt,
              remoteOwnedByCurrentUser: true,
              remoteSharedViaLink: false,
            });
          }
        } catch (err) {
          folders.setError(
            err instanceof Error
              ? `Could not save files to server: ${err.message}`
              : "Could not save files to server.",
          );
          throw err;
        }
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

      // Local files moving to the root DO need a write when they are leaving a
      // folder — their membership is a browser-side folderId that nothing
      // above has touched (the upload branch only runs for a non-null
      // target). Without this, a file placed in a virtual folder could never
      // be taken out of it.
      if (folderId === null && localOnly.length > 0) {
        const leaving = localOnly
          .filter((s) => (s.folderId ?? null) !== null)
          .map((s) => s.id);
        if (leaving.length > 0) {
          await indexedDB.moveFilesToFolder(leaving, null);
        }
      }
      await refresh();
    },
    [indexedDB, refresh, fileMap, folders, t, fileActions],
  );

  const moveFolderTo = useCallback(
    async (folderId: FolderId, newParentId: FolderId | null) => {
      // Client-side cycle guard.
      if (newParentId !== null && folders.isDescendant(newParentId, folderId)) {
        folders.setError(
          t(
            "filesPage.cycleBlocked",
            "Can't move a folder into one of its own subfolders.",
          ),
        );
        return;
      }
      // A subtree is one kind throughout (each kind has its own system of
      // record), so a cross-kind drop is refused here as a message rather
      // than surfacing as a thrown error from the context.
      if (newParentId !== null) {
        const source = folders.foldersById.get(folderId);
        const target = folders.foldersById.get(newParentId);
        if (source && target && folderKind(source) !== folderKind(target)) {
          folders.setError(
            t(
              "filesPage.moveAcrossKindsBlocked",
              "These folders live in different places, so one can't go inside the other.",
            ),
          );
          return;
        }
      }
      await folders.moveFolder(folderId, newParentId);
    },
    [folders, t],
  );

  // Delete dialog state. removeFiles only queues + opens when a cloud copy is
  // involved; local-only deletes skip the dialog and run immediately.
  const [deleteDialogFileIds, setDeleteDialogFileIds] = useState<FileId[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // The actual deletion for a chosen scope. Shared by the direct (local-only)
  // path and the dialog's confirm.
  const performDelete = useCallback(
    async (fileIds: FileId[], scope: DeleteScope) => {
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));

      // Cloud delete (owner-only). Dedup by remoteStorageId since a history
      // chain shares a single server file.
      if (scope === "cloud" || scope === "everywhere") {
        const remoteIds = Array.from(
          new Set(
            stubs
              .filter(
                (s) =>
                  typeof s.remoteStorageId === "number" &&
                  s.remoteOwnedByCurrentUser === true,
              )
              .map((s) => s.remoteStorageId as number),
          ),
        );
        if (remoteIds.length > 0) {
          const results = await Promise.allSettled(
            remoteIds.map((id) => deleteServerFile(id)),
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            folders.setError(
              t(
                "filesPage.error.cloudDeleteFailed",
                "Couldn't delete {{count}} file(s) from the cloud.",
                { count: failed },
              ),
            );
          }
        }
      }

      // Local delete - skip ephemeral server-/shared- stubs (no IDB row).
      if (scope === "device" || scope === "everywhere") {
        const localIds = stubs
          .filter((s) => {
            const id = String(s.id);
            return !id.startsWith("server-") && !id.startsWith("shared-");
          })
          .map((s) => s.id);
        if (localIds.length > 0) {
          // Take the superseded versions with it, or their bytes sit in storage
          // forever - invisible, because listings only show leaves.
          const orphans = await fileStorage.orphanedAncestorIds(localIds);
          await fileActions.removeFiles([...localIds, ...orphans], true);
        }
      }

      const removedIds = new Set(fileIds);
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        for (const id of removedIds) next.delete(id);
        return next;
      });
      // reconcile picks up the cloud deletions and strips stale remote pointers.
      await refresh();
    },
    [fileMap, fileActions, folders, refresh, t],
  );

  const removeFiles = useCallback(
    async (fileIds: FileId[]) => {
      if (fileIds.length === 0) return;
      // Only prompt when a cloud copy is in play (the user must pick where to
      // delete). Local-only files have nothing to choose - delete immediately.
      const hasDeletableCloud = fileIds.some((id) => {
        const s = fileMap.get(id);
        return (
          s != null &&
          typeof s.remoteStorageId === "number" &&
          s.remoteOwnedByCurrentUser === true
        );
      });
      if (!hasDeletableCloud) {
        await performDelete(fileIds, "device");
        return;
      }
      setDeleteDialogFileIds(fileIds);
      setDeleteDialogOpen(true);
    },
    [fileMap, performDelete],
  );

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteDialogFileIds([]);
  }, []);

  const confirmRemoveFiles = useCallback(
    async (scope: DeleteScope) => {
      await performDelete(deleteDialogFileIds, scope);
      setDeleteDialogOpen(false);
      setDeleteDialogFileIds([]);
    },
    [deleteDialogFileIds, performDelete],
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

  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{
    folder: FolderRecord | null;
    fileCount: number;
  }>({ folder: null, fileCount: 0 });
  const closeDeleteFolderDialog = useCallback(
    () => setDeleteFolderDialog({ folder: null, fileCount: 0 }),
    [],
  );

  const filesInSubtree = useCallback(
    (folderId: FolderId): FileId[] => {
      const subtreeIds = new Set<FolderId>([folderId]);
      const stack: FolderId[] = [folderId];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const childId of folders.getChildFolderIds(cur)) {
          if (subtreeIds.has(childId)) continue;
          subtreeIds.add(childId);
          stack.push(childId);
        }
      }
      return allFiles
        .filter((f) => {
          const fid = f.folderId ?? null;
          return fid !== null && subtreeIds.has(fid);
        })
        .map((f) => f.id);
    },
    [allFiles, folders],
  );

  const promptDeleteFolder = useCallback(
    (folder: FolderRecord) => {
      if (folderKind(folder) === "local") {
        // Removing a mount destroys nothing — the record goes, the directory
        // and every file in it stay — so there is nothing to warn about and
        // the delete dialog's "what about the files?" question would be a
        // scary lie. Remove directly.
        void folders.deleteFolder(folder.id).catch((err) => {
          folders.setError(
            err instanceof Error
              ? `Could not remove folder: ${err.message}`
              : "Could not remove folder.",
          );
        });
        return;
      }
      const fileCount = filesInSubtree(folder.id).length;
      setDeleteFolderDialog({ folder, fileCount });
    },
    [filesInSubtree, folders],
  );

  const deleteFolder = useCallback(
    async (folder: FolderRecord, deleteContents: boolean) => {
      if (deleteContents) {
        const fileIds = filesInSubtree(folder.id);
        if (fileIds.length > 0) {
          await fileActions.removeFiles(fileIds, true);
        }
      }
      await folders.deleteFolder(folder.id);
      await refresh();
    },
    [fileActions, filesInSubtree, folders, refresh],
  );

  // Memoise to avoid re-rendering every FileCard on unrelated state churn.
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
      deleteDialogFileIds,
      deleteDialogOpen,
      closeDeleteDialog,
      confirmRemoveFiles,
      promptDeleteFolder,
      deleteFolder,
      deleteFolderDialog,
      closeDeleteFolderDialog,
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
      deleteDialogFileIds,
      deleteDialogOpen,
      closeDeleteDialog,
      confirmRemoveFiles,
      promptDeleteFolder,
      deleteFolder,
      deleteFolderDialog,
      closeDeleteFolderDialog,
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
