/**
 * Hook for managing Watched Folders — load, create, update, delete
 */

import { useState, useEffect, useCallback } from "react";
import { WatchedFolder } from "@app/types/watchedFolders";
import {
  watchedFolderStorage,
  WATCHED_FOLDER_STORAGE_CHANGE_EVENT,
} from "@app/services/watchedFolderStorage";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { folderRunStateStorage } from "@app/services/folderRunStateStorage";
import { fileStorage } from "@app/services/fileStorage";
import { folderRetryScheduleStorage } from "@app/services/folderRetryScheduleStorage";
import { folderSeenFilesStorage } from "@app/services/folderSeenFilesStorage";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";
import { FileId } from "@app/types/fileContext";

interface UseWatchedFoldersReturn {
  folders: WatchedFolder[];
  loading: boolean;
  createFolder: (
    data: Omit<WatchedFolder, "id" | "createdAt" | "updatedAt">,
  ) => Promise<WatchedFolder>;
  updateFolder: (folder: WatchedFolder) => Promise<WatchedFolder>;
  deleteFolder: (id: string) => Promise<void>;
  refreshFolders: () => Promise<void>;
}

export function useWatchedFolders(): UseWatchedFoldersReturn {
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFolders = useCallback(async () => {
    try {
      // Policy-owned folders are managed by Policies, not shown here.
      const all = await watchedFolderStorage.getAllFolders();
      setFolders(all.filter((f) => !f.policyCategoryId));
    } catch (error) {
      console.error("Failed to load smart folders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    const handler = () => {
      refreshFolders();
    };
    window.addEventListener(WATCHED_FOLDER_STORAGE_CHANGE_EVENT, handler);
    return () =>
      window.removeEventListener(WATCHED_FOLDER_STORAGE_CHANGE_EVENT, handler);
  }, [refreshFolders]);

  const createFolder = useCallback(
    async (
      data: Omit<WatchedFolder, "id" | "createdAt" | "updatedAt">,
    ): Promise<WatchedFolder> => {
      return watchedFolderStorage.createFolder(data);
    },
    [],
  );

  const updateFolder = useCallback(
    async (folder: WatchedFolder): Promise<WatchedFolder> => {
      return watchedFolderStorage.updateFolder(folder);
    },
    [],
  );

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    const record = await watchedFolderFileStorage.getFolderData(id);
    if (record) {
      // Only delete input files the folder created from disk — never touch sidebar-sourced files.
      const ownedInputIds = Object.entries(record.files)
        .filter(([, meta]) => meta.ownedByFolder === true)
        .map(([fid]) => fid);
      // Always delete every output the folder produced (folder always owns those).
      const outputIds = Object.values(record.files).flatMap(
        (meta) =>
          meta.displayFileIds ??
          (meta.displayFileId ? [meta.displayFileId] : []),
      );
      const toDelete = [...new Set([...ownedInputIds, ...outputIds])];
      await Promise.all(
        toDelete.map((fid) =>
          fileStorage.deleteStirlingFile(fid as FileId).catch(() => {}),
        ),
      );
    }
    await watchedFolderFileStorage.clearFolder(id);
    await folderRunStateStorage.clearFolderRunState(id);
    await folderRetryScheduleStorage.clearFolder(id).catch(() => {});
    await folderSeenFilesStorage.clearFolder(id).catch(() => {});
    await folderDirectoryHandleStorage.remove(id).catch(() => {});
    await folderDirectoryHandleStorage.removeInput(id).catch(() => {});
    await watchedFolderStorage.deleteFolder(id);
    window.dispatchEvent(new CustomEvent("stirling:files-changed"));
  }, []);

  return {
    folders,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    refreshFolders,
  };
}
