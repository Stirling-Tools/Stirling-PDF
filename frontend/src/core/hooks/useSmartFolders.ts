/**
 * Hook for managing Smart Folders — load, create, update, delete
 */

import { useState, useEffect, useCallback } from "react";
import { SmartFolder, isServerFolderInput } from "@app/types/smartFolders";

import { fileStorage } from "@app/services/fileStorage";
import { deleteServerFolder } from "@app/services/serverFolderApiService";
import { folderRetryScheduleStorage } from "@app/services/folderRetryScheduleStorage";
import { folderSeenFilesStorage } from "@app/services/folderSeenFilesStorage";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";
import { useWatchFolderStore } from "@app/contexts/WatchFolderStorageContext";
import { FileId } from "@app/types/fileContext";

interface UseSmartFoldersReturn {
  folders: SmartFolder[];
  loading: boolean;
  createFolder: (data: Omit<SmartFolder, "id" | "createdAt" | "updatedAt">) => Promise<SmartFolder>;
  updateFolder: (folder: SmartFolder) => Promise<SmartFolder>;
  deleteFolder: (id: string) => Promise<void>;
  refreshFolders: () => Promise<void>;
}

export function useSmartFolders(): UseSmartFoldersReturn {
  const store = useWatchFolderStore();
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFolders = useCallback(async () => {
    try {
      const all = await store.getAllFolders();
      setFolders(all);
    } catch (error) {
      console.error("Failed to load smart folders:", error);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    return store.onChange(() => refreshFolders());
  }, [store, refreshFolders]);

  const createFolder = useCallback(
    async (data: Omit<SmartFolder, "id" | "createdAt" | "updatedAt">): Promise<SmartFolder> => {
      return store.createFolder(data);
    },
    [store],
  );

  const updateFolder = useCallback(
    async (folder: SmartFolder): Promise<SmartFolder> => {
      return store.updateFolder(folder);
    },
    [store],
  );

  const deleteFolder = useCallback(
    async (id: string): Promise<void> => {
      // Clean up server watch folder first (best-effort)
      const folderMeta = await store.getFolder(id);
      if (folderMeta && isServerFolderInput(folderMeta)) {
        await deleteServerFolder(id).catch(() => {});
      }

      const record = await store.getFolderData(id);
      if (record) {
        // Only delete input files the folder created from disk
        const ownedInputIds = Object.entries(record.files)
          .filter(([, meta]) => meta.ownedByFolder === true)
          .map(([fid]) => fid);
        // Always delete every output the folder produced
        const outputIds = Object.values(record.files).flatMap(
          (meta) => meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []),
        );
        const toDelete = [...new Set([...ownedInputIds, ...outputIds])];
        await Promise.all(toDelete.map((fid) => fileStorage.deleteStirlingFile(fid as FileId).catch(() => {})));
      }

      await store.clearFolder(id);
      await store.clearFolderRunState(id);
      // These are always IDB-only (browser API objects / ephemeral state)
      await folderRetryScheduleStorage.clearFolder(id).catch(() => {});
      await folderSeenFilesStorage.clearFolder(id).catch(() => {});
      await folderDirectoryHandleStorage.remove(id).catch(() => {});
      await folderDirectoryHandleStorage.removeInput(id).catch(() => {});
      await store.deleteFolder(id);
      // Notify the sidebar file list that files have been removed.
      window.dispatchEvent(new CustomEvent("stirling:files-changed"));
    },
    [store],
  );

  return { folders, loading, createFolder, updateFolder, deleteFolder, refreshFolders };
}
