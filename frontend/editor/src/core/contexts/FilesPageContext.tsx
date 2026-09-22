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
import { useNavigate } from "react-router-dom";

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
import { writeIntoMount } from "@app/services/mountWrites";
import { folderSyncService } from "@app/services/folderSyncService";
import { uploadHistoryChain } from "@app/services/serverStorageUpload";
import { reconcileServerFiles } from "@app/services/fileSyncService";
import { pruneMissingRecentFiles } from "@app/services/pruneMissingRecentFiles";
import {
  deleteServerFile,
  type DeleteScope,
} from "@app/services/serverStorageDelete";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useDiskLinkReconcile } from "@app/hooks/useDiskLinkReconcile";
import { useFolders } from "@app/contexts/FolderContext";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";
import { useRoutedLibraryViewState } from "@app/components/filesPage/useRoutedLibraryViewState";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";

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

export type FilesPageTab = "all" | "cloud" | "recent" | "shared" | "sharedByMe";

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

const VIEW_MODE_STORAGE_KEY = "stirling.filesPageViewMode";

function readPersistedViewMode(): FilesPageViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "grid" || stored === "list") return stored;
  } catch {
    // Private mode, or storage denied: the default stands.
  }
  return "list";
}

interface FilesPageContextValue {
  /** Leaf versions only; includes local and server library entries. */
  allFiles: StirlingFileStub[];
  fileMap: Map<FileId, StirlingFileStub>;
  fileCountsByFolder: Map<FolderId | null, number>;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Invalidates disk listings, which cannot observe IndexedDB revisions. */
  diskRevision: number;
  bumpDiskRevision: () => void;

  selectedFileIds: Set<FileId>;
  setSelectedFileIds: React.Dispatch<React.SetStateAction<Set<FileId>>>;
  clearSelection: () => void;

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

  currentTab: FilesPageTab;
  setCurrentTab: (tab: FilesPageTab) => void;
  /** Opens the folder in Stirling library with one browser history entry. */
  openFolder: (id: FolderId | null) => void;

  folderNameDialog: FolderNameDialogState;
  openNewFolderDialog: (parentId?: FolderId | null, kind?: FolderKind) => void;
  openRenameFolderDialog: (folder: FolderRecord) => void;
  closeFolderNameDialog: () => void;
  submitFolderName: (name: string) => Promise<void>;

  moveDialog: MoveDialogState;
  promptMoveFiles: (fileIds: FileId[]) => void;
  closeMoveDialog: () => void;

  /**
   * Server folders upload local files; moving to root uploads only with uploadToRoot.
   * Can reject after partial completion; successful uploads and moves are not rolled back.
   * Mounted and browser-only destinations report skipped files through FolderContext.
   */
  moveFilesTo: (
    fileIds: FileId[],
    folderId: FolderId | null,
    options?: { uploadToRoot?: boolean },
  ) => Promise<void>;
  moveFolderTo: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => Promise<void>;
  /** Prompts for a scope if any selected server copy is owned; otherwise deletes browser copies. */
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
  const navigate = useNavigate();
  const indexedDB = useIndexedDB();
  const indexedDBRevision = useIndexedDBRevision();
  const folders = useFolders();
  const { actions: fileActions } = useFileActions();
  const { config: appConfig } = useAppConfig();
  const { isAnonymous } = useAuth();

  // Refs keep workspace changes from restarting library refreshes.
  const { openFileIdsRef, onOpenFilesDetached } = useDiskLinkReconcile();

  const [allFiles, setAllFiles] = useState<StirlingFileStub[]>([]);
  const [loading, setLoading] = useState(true);
  // Only the newest refresh may publish results or clear loading.
  const refreshGenRef = useRef(0);

  const setFoldersError = folders.setError;
  const storageEnabled = appConfig?.storageEnabled === true;
  const shareLinksEnabled = appConfig?.storageShareLinksEnabled === true;
  const [diskRevision, setDiskRevision] = useState(0);
  const bumpDiskRevision = useCallback(() => setDiskRevision((n) => n + 1), []);

  const refresh = useCallback(async () => {
    const gen = ++refreshGenRef.current;
    setLoading(true);
    try {
      const localStubs = await fileStorage.getAllStirlingFileStubs();
      if (gen !== refreshGenRef.current) return;
      // Reconcile disk deletions before displaying leaves; checking every version repeats the same IO.
      const localLeaf = await pruneMissingRecentFiles(
        localStubs.filter((s) => s.isLeaf !== false),
        {
          openFileIds: new Set(openFileIdsRef.current),
          onOpenFilesDetached,
        },
      );
      if (gen !== refreshGenRef.current) return;
      // Render the cache immediately while the server fetch is in flight.
      setAllFiles(localLeaf);
      const merged = await reconcileServerFiles(localLeaf, {
        storageEnabled,
        shareLinksEnabled,
        isAnonymous,
      });
      if (gen !== refreshGenRef.current) return;
      setAllFiles(merged);
    } catch (err) {
      if (gen !== refreshGenRef.current) return;
      console.error("[FilesPageContext] refresh failed", err);
      setFoldersError(
        err instanceof Error ? err.message : "Failed to load files",
      );
    } finally {
      if (gen === refreshGenRef.current) setLoading(false);
    }
  }, [
    setFoldersError,
    storageEnabled,
    shareLinksEnabled,
    isAnonymous,
    openFileIdsRef,
    onOpenFilesDetached,
  ]);

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
      if (fid === null && getFileOrigin(file) === "local") continue;
      map.set(fid, (map.get(fid) ?? 0) + 1);
    }
    return map;
  }, [allFiles, folders.folders]);

  const {
    selectedFileIds,
    setSelectedFileIds,
    clearSelection,
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
    openFolder,
  } = useRoutedLibraryViewState();

  const [viewMode, setViewModeState] = useState<FilesPageViewMode>(
    readPersistedViewMode,
  );
  const setViewMode = useCallback((mode: FilesPageViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // A browser that refuses storage still gets the choice for this session.
    }
  }, []);

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
        const created = await folders.createFolder(
          name,
          folderNameDialog.parentId ?? folders.currentFolderId,
          folderNameDialog.kind,
        );
        navigate(`/files/${created.id}`);
      } else if (
        folderNameDialog.mode === "rename" &&
        folderNameDialog.folder
      ) {
        await folders.renameFolder(folderNameDialog.folder.id, name);
      }
    },
    [folderNameDialog, folders, navigate],
  );

  const [moveDialog, setMoveDialog] = useState<MoveDialogState>({
    open: false,
    initial: ROOT_FOLDER_ID,
  });

  const promptMoveFiles = useCallback(
    (fileIds: FileId[]) => {
      setMoveDialog({
        open: true,
        fileIds,
        initial: folders.currentFolderId,
      });
    },
    [folders.currentFolderId],
  );

  const closeMoveDialog = useCallback(() => {
    setMoveDialog((m) => ({ ...m, open: false }));
  }, []);

  const moveFilesTo = useCallback(
    async (
      fileIds: FileId[],
      folderId: FolderId | null,
      options?: { uploadToRoot?: boolean },
    ) => {
      if (fileIds.length === 0) return;
      // Newly imported files may not be in the render snapshot yet; read them from storage.
      const fetched = await Promise.all(
        fileIds.map(
          (id) => fileMap.get(id) ?? fileStorage.getStirlingFileStub(id),
        ),
      );
      const stubs = fetched.filter((s): s is StirlingFileStub => Boolean(s));
      const localOnly = stubs.filter((s) => s.remoteStorageId == null);
      const cloudFiles = stubs.filter((s) => s.remoteStorageId != null);

      const targetFolder =
        folderId === null ? null : folders.foldersById.get(folderId);
      const targetKind = targetFolder ? folderKind(targetFolder) : null;

      if (targetKind === "local") {
        // Retire app-side copies only after their bytes have been written into the mounted directory.
        const { written, failedCount } = await writeIntoMount(
          targetFolder?.directory,
          localOnly.map((stub) => ({
            name: stub.name,
            bytes: () => fileStorage.getStirlingFile(stub.id),
          })),
        );
        const movedIds = localOnly
          .filter((_, i) => written[i])
          .map((stub) => stub.id);
        if (movedIds.length > 0) {
          // Superseded versions go too, or their bytes sit in storage unseen.
          const orphans = await fileStorage.orphanedAncestorIds(movedIds);
          await fileActions.removeFiles([...movedIds, ...orphans], true);
        }
        const notices: string[] = [];
        if (failedCount > 0) {
          notices.push(
            t("filesPage.moveIntoMountFailed", {
              count: failedCount,
              defaultValue:
                "{{count}} file(s) could not be written into the folder.",
            }),
          );
        }
        if (cloudFiles.length > 0) {
          notices.push(
            t("filesPage.moveIntoMountCloudSkipped", {
              count: cloudFiles.length,
              defaultValue:
                "{{count}} server file(s) stayed in your files. They live on the server, not on this disk.",
            }),
          );
        }
        if (notices.length > 0) {
          folders.setError(notices.join(" "));
        }
        await refresh();
        return;
      }

      if (targetKind === "virtual") {
        // A browser-owned folder cannot hold server files: the next sync would snap
        // them back, so they are left where they are and reported.
        if (cloudFiles.length > 0) {
          folders.setError(
            t(
              "filesPage.moveIntoVirtualCloudSkipped",
              "{{count}} server file(s) were left in place. Server files can't live in browser-only folders.",
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

      const uploadErrors: string[] = [];
      if (
        (folderId !== null || options?.uploadToRoot) &&
        localOnly.length > 0
      ) {
        // Independent files keep separate server records and can succeed independently.
        for (const stub of localOnly) {
          try {
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
            cloudFiles.push({
              ...stub,
              remoteStorageId: remoteId,
              remoteStorageUpdatedAt: updatedAt,
              remoteOwnedByCurrentUser: true,
              remoteSharedViaLink: false,
            });
          } catch (err) {
            uploadErrors.push(
              `${stub.name}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
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
            const message = t(
              "filesPage.moveSkippedRemote",
              "{{count}} file(s) couldn't be moved on the server (no permission or already deleted).",
              { count: result.skippedFileIds.length },
            );
            folders.setError(message);
            if (options?.uploadToRoot) uploadErrors.push(message);
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

      // Moving a browser copy to root must not implicitly upload it.
      if (folderId === null && !options?.uploadToRoot && localOnly.length > 0) {
        const leaving = localOnly
          .filter((s) => (s.folderId ?? null) !== null)
          .map((s) => s.id);
        if (leaving.length > 0) {
          await indexedDB.moveFilesToFolder(leaving, null);
        }
      }
      await refresh();
      if (uploadErrors.length) throw new Error(uploadErrors.join("\n"));
    },
    [indexedDB, refresh, fileMap, folders, t, fileActions],
  );

  const moveFolderTo = useCallback(
    async (folderId: FolderId, newParentId: FolderId | null) => {
      if (newParentId !== null && folders.isDescendant(newParentId, folderId)) {
        folders.setError(
          t(
            "filesPage.cycleBlocked",
            "Can't move a folder into one of its own subfolders.",
          ),
        );
        return;
      }
      // Each folder kind has its own storage authority, so moves cannot cross kinds.
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

  const [deleteDialogFileIds, setDeleteDialogFileIds] = useState<FileId[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

      // Server/shared placeholders have no IndexedDB row to delete.
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
        // Unmounting only removes the mapping; the directory and its files remain on disk.
        void folders.deleteFolder(folder.id).catch((err) => {
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.removeFolderFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not remove folder: ${err.message}`,
                })
              : t(
                  "filesPage.error.removeFolderFailed",
                  "Could not remove folder.",
                ),
          );
        });
        return;
      }
      const fileCount = filesInSubtree(folder.id).length;
      setDeleteFolderDialog({ folder, fileCount });
    },
    [filesInSubtree, folders, t],
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

  const value = useMemo<FilesPageContextValue>(
    () => ({
      allFiles,
      fileMap,
      fileCountsByFolder,
      loading,
      refresh,
      diskRevision,
      bumpDiskRevision,
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
      openFolder,
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
      diskRevision,
      bumpDiskRevision,
      selectedFileIds,
      setSelectedFileIds,
      clearSelection,
      viewMode,
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
      openFolder,
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
