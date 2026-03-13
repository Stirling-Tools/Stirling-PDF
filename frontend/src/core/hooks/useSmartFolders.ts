/**
 * Hook for managing Smart Folders — load, create, update, delete
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartFolder } from '@app/types/smartFolders';
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from '@app/services/smartFolderStorage';
import { folderStorage } from '@app/services/folderStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { fileStorage } from '@app/services/fileStorage';
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
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFolders = useCallback(async () => {
    try {
      const all = await smartFolderStorage.getAllFolders();
      setFolders(all);
    } catch (error) {
      console.error('Failed to load smart folders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    const handler = () => { refreshFolders(); };
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, handler);
  }, [refreshFolders]);

  const createFolder = useCallback(
    async (data: Omit<SmartFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartFolder> => {
      return smartFolderStorage.createFolder(data);
    },
    []
  );

  const updateFolder = useCallback(
    async (folder: SmartFolder): Promise<SmartFolder> => {
      return smartFolderStorage.updateFolder(folder);
    },
    []
  );

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    // Clean up file blobs from the unified file store before clearing the record
    const record = await folderStorage.getFolderData(id);
    if (record) {
      const allFileIds = Object.entries(record.files).flatMap(([inputId, meta]) =>
        meta.displayFileId ? [inputId, meta.displayFileId] : [inputId]
      );
      await Promise.all(allFileIds.map(fid => fileStorage.deleteStirlingFile(fid as FileId).catch(() => {})));
    }
    await folderStorage.clearFolder(id);
    await folderRunStateStorage.clearFolderRunState(id);
    await smartFolderStorage.deleteFolder(id);
  }, []);

  return { folders, loading, createFolder, updateFolder, deleteFolder, refreshFolders };
}
