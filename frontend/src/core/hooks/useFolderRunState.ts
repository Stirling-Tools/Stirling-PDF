/**
 * Hook for managing Smart Folder run state (recent run entries)
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartFolderRunEntry } from '@app/types/smartFolders';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { useWatchFolderStore } from '@app/contexts/WatchFolderStorageContext';

interface UseFolderRunStateReturn {
  recentRuns: SmartFolderRunEntry[];
  clearRecentRuns: () => Promise<void>;
  isLoading: boolean;
}

export function useFolderRunState(folderId: string): UseFolderRunStateReturn {
  const store = useWatchFolderStore();
  const [recentRuns, setRecentRunsState] = useState<SmartFolderRunEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe before loading to close the race window between load completing
  // and the listener being established (writes in that gap would be missed).
  // Server backend mirrors writes to IDB so this fires for both backends.
  useEffect(() => {
    if (!folderId) return;
    setIsLoading(true);
    const unsub = folderRunStateStorage.onRunStateChange((changedFolderId) => {
      if (changedFolderId !== folderId) return;
      store
        .getFolderRunState(folderId)
        .then(setRecentRunsState)
        .catch((err) => console.error('Failed to reload folder run state:', err));
    });
    store
      .getFolderRunState(folderId)
      .then(setRecentRunsState)
      .catch((err) => console.error('Failed to load folder run state:', err))
      .finally(() => setIsLoading(false));
    return unsub;
  }, [folderId, store]);

  const clearRecentRuns = useCallback(async () => {
    await store.clearFolderRunState(folderId);
    setRecentRunsState([]);
  }, [folderId, store]);

  return { recentRuns, clearRecentRuns, isLoading };
}
