/**
 * Hook for reading and managing files within a Smart Folder
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { FolderFileMetadata, FolderRecord } from "@app/types/smartFolders";
import { folderStorage } from "@app/services/folderStorage";
import { useWatchFolderStore } from "@app/contexts/WatchFolderStorageContext";

interface UseFolderDataReturn {
  folderRecord: FolderRecord | null;
  fileIds: string[];
  processingFileIds: string[];
  processedFileIds: string[];
  pendingFileIds: string[];
  addFile: (fileId: string, metadata?: Partial<FolderFileMetadata>) => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;
  updateFileMetadata: (fileId: string, updates: Partial<FolderFileMetadata>) => Promise<void>;
  clearFolder: () => Promise<void>;
  getFileMetadata: (fileId: string) => FolderFileMetadata | null;
  isFileProcessed: (fileId: string) => boolean;
  isFileProcessing: (fileId: string) => boolean;
}

export function useFolderData(folderId: string): UseFolderDataReturn {
  const store = useWatchFolderStore();
  const [folderRecord, setFolderRecord] = useState<FolderRecord | null>(null);

  const refresh = useCallback(async () => {
    if (!folderId) return;
    try {
      const record = await store.getFolderData(folderId);
      setFolderRecord(record);
    } catch (error) {
      console.error("Failed to load folder data:", error);
    }
  }, [folderId, store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to IDB change events — the server backend also writes to IDB,
  // so this picks up changes from both local and server-backed operations.
  useEffect(() => {
    const unsubscribe = folderStorage.onFolderChange((changedFolderId) => {
      if (changedFolderId === folderId) {
        refresh();
      }
    });
    return unsubscribe;
  }, [folderId, refresh]);

  const files = folderRecord?.files ?? {};
  const fileIds = useMemo(() => Object.keys(files), [files]);
  const processingFileIds = useMemo(() => fileIds.filter((id) => files[id]?.status === "processing"), [fileIds, files]);
  const processedFileIds = useMemo(() => fileIds.filter((id) => files[id]?.status === "processed"), [fileIds, files]);
  const pendingFileIds = useMemo(() => fileIds.filter((id) => files[id]?.status === "pending"), [fileIds, files]);

  const addFile = useCallback(
    async (fileId: string, metadata?: Partial<FolderFileMetadata>) => {
      await store.addFileToFolder(folderId, fileId, metadata);
    },
    [folderId, store],
  );

  const removeFile = useCallback(
    async (fileId: string) => {
      await store.removeFileFromFolder(folderId, fileId);
    },
    [folderId, store],
  );

  const updateFileMetadata = useCallback(
    async (fileId: string, updates: Partial<FolderFileMetadata>) => {
      await store.updateFileMetadata(folderId, fileId, updates);
    },
    [folderId, store],
  );

  const clearFolder = useCallback(async () => {
    await store.clearFolder(folderId);
  }, [folderId, store]);

  const getFileMetadata = useCallback(
    (fileId: string): FolderFileMetadata | null => {
      return folderRecord?.files[fileId] ?? null;
    },
    [folderRecord],
  );

  const isFileProcessed = useCallback((fileId: string) => folderRecord?.files[fileId]?.status === "processed", [folderRecord]);

  const isFileProcessing = useCallback(
    (fileId: string) => folderRecord?.files[fileId]?.status === "processing",
    [folderRecord],
  );

  return {
    folderRecord,
    fileIds,
    processingFileIds,
    processedFileIds,
    pendingFileIds,
    addFile,
    removeFile,
    updateFileMetadata,
    clearFolder,
    getFileMetadata,
    isFileProcessed,
    isFileProcessing,
  };
}
