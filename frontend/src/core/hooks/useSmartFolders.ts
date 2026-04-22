/**
 * Hook for managing Smart Folders — load, create, update, delete
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartFolder, isServerFolderInput } from '@app/types/smartFolders';
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from '@app/services/smartFolderStorage';
import { folderStorage } from '@app/services/folderStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { fileStorage } from '@app/services/fileStorage';
import { deleteServerFolder } from '@app/services/serverFolderApiService';
import { folderRetryScheduleStorage } from '@app/services/folderRetryScheduleStorage';
import { folderSeenFilesStorage } from '@app/services/folderSeenFilesStorage';
import { folderDirectoryHandleStorage } from '@app/services/folderDirectoryHandleStorage';
import { useWatchFolderStorage } from '@app/contexts/WatchFolderStorageContext';
import { FileId } from '@app/types/fileContext';

interface UseSmartFoldersReturn {
  folders: SmartFolder[];
  loading: boolean;
  createFolder: (data: Omit<SmartFolder, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SmartFolder>;
  updateFolder: (folder: SmartFolder) => Promise<SmartFolder>;
  deleteFolder: (id: string) => Promise<void>;
  refreshFolders: () => Promise<void>;
}

export function useSmartFolders(): UseSmartFoldersReturn {
  const backend = useWatchFolderStorage();
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFolders = useCallback(async () => {
    try {
      const store = backend ?? { getAllFolders: () => smartFolderStorage.getAllFolders() };
      const all = await store.getAllFolders();
      setFolders(all);
    } catch (error) {
      console.error('Failed to load smart folders:', error);
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    if (backend) {
      return backend.onChange(() => refreshFolders());
    }
    const handler = () => { refreshFolders(); };
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, handler);
  }, [backend, refreshFolders]);

  const createFolder = useCallback(
    async (data: Omit<SmartFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartFolder> => {
      if (backend) return backend.createFolder(data);
      return smartFolderStorage.createFolder(data);
    },
    [backend]
  );

  const updateFolder = useCallback(
    async (folder: SmartFolder): Promise<SmartFolder> => {
      if (backend) return backend.updateFolder(folder);
      return smartFolderStorage.updateFolder(folder);
    },
    [backend]
  );

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    const store = backend ?? {
      getFolder: (fid: string) => smartFolderStorage.getFolder(fid),
      deleteFolder: (fid: string) => smartFolderStorage.deleteFolder(fid),
      getFolderData: (fid: string) => folderStorage.getFolderData(fid),
      clearFolder: (fid: string) => folderStorage.clearFolder(fid),
      clearFolderRunState: (fid: string) => folderRunStateStorage.clearFolderRunState(fid),
    };

    // Clean up server watch folder first (best-effort — don't block if server is down)
    const folderMeta = await store.getFolder(id);
    if (folderMeta && isServerFolderInput(folderMeta)) {
      await deleteServerFolder(id).catch(() => {});
    }

    const record = await (backend ? backend.getFolderData(id) : folderStorage.getFolderData(id));
    if (record) {
      // Only delete input files the folder created from disk — never touch sidebar-sourced files.
      const ownedInputIds = Object.entries(record.files)
        .filter(([, meta]) => meta.ownedByFolder === true)
        .map(([fid]) => fid);
      // Always delete every output the folder produced (folder always owns those).
      const outputIds = Object.values(record.files)
        .flatMap(meta => meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []));
      const toDelete = [...new Set([...ownedInputIds, ...outputIds])];
      await Promise.all(toDelete.map(fid => fileStorage.deleteStirlingFile(fid as FileId).catch(() => {})));
    }

    if (backend) {
      await backend.clearFolder(id);
      await backend.clearFolderRunState(id);
    } else {
      await folderStorage.clearFolder(id);
      await folderRunStateStorage.clearFolderRunState(id);
    }
    // These are always IDB-only (browser API objects / ephemeral state)
    await folderRetryScheduleStorage.clearFolder(id).catch(() => {});
    await folderSeenFilesStorage.clearFolder(id).catch(() => {});
    await folderDirectoryHandleStorage.remove(id).catch(() => {});
    await folderDirectoryHandleStorage.removeInput(id).catch(() => {});

    if (backend) {
      await backend.deleteFolder(id);
    } else {
      await smartFolderStorage.deleteFolder(id);
    }
    // Notify the sidebar file list that files have been removed.
    window.dispatchEvent(new CustomEvent('stirling:files-changed'));
  }, [backend]);

  return { folders, loading, createFolder, updateFolder, deleteFolder, refreshFolders };
}
