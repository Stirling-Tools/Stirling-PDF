/**
 * Hook for managing Smart Folder run state (recent run entries)
 */

import { useState, useEffect, useCallback } from 'react';
import { SmartFolderRunEntry } from '@app/types/smartFolders';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';

interface UseFolderRunStateReturn {
  recentRuns: SmartFolderRunEntry[];
  setRecentRuns: (runs: SmartFolderRunEntry[]) => Promise<void>;
  clearRecentRuns: () => Promise<void>;
  isLoading: boolean;
}

export function useFolderRunState(folderId: string): UseFolderRunStateReturn {
  const [recentRuns, setRecentRunsState] = useState<SmartFolderRunEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe before loading to close the race window between load completing
  // and the listener being established (writes in that gap would be missed).
  useEffect(() => {
    if (!folderId) return;
    setIsLoading(true);
    const unsub = folderRunStateStorage.onRunStateChange((changedFolderId) => {
      if (changedFolderId !== folderId) return;
      folderRunStateStorage
        .getFolderRunState(folderId)
        .then(setRecentRunsState)
        .catch((err) => console.error('Failed to reload folder run state:', err));
    });
    folderRunStateStorage
      .getFolderRunState(folderId)
      .then(setRecentRunsState)
      .catch((err) => console.error('Failed to load folder run state:', err))
      .finally(() => setIsLoading(false));
    return unsub;
  }, [folderId]);

  const setRecentRuns = useCallback(
    async (runs: SmartFolderRunEntry[]) => {
      await folderRunStateStorage.setFolderRunState(folderId, runs);
      setRecentRunsState(runs);
    },
    [folderId]
  );

  const clearRecentRuns = useCallback(async () => {
    await folderRunStateStorage.clearFolderRunState(folderId);
    setRecentRunsState([]);
  }, [folderId]);

  return { recentRuns, setRecentRuns, clearRecentRuns, isLoading };
}
