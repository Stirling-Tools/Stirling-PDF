/**
 * Hook that derives per-folder run status from run state entries
 * 'done' automatically reverts to 'idle' after 5 minutes
 */

import { useState, useEffect, useRef } from 'react';
import { SmartFolder, SmartFolderRunEntry } from '@app/types/smartFolders';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { useWatchFolderStorage } from '@app/contexts/WatchFolderStorageContext';

export type FolderRunStatus = 'idle' | 'processing' | 'done';

const DONE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function deriveStatus(runs: SmartFolderRunEntry[]): FolderRunStatus {
  if (runs.some(r => r.status === 'processing')) return 'processing';
  // Only treat recent runs (within TTL) as 'done' — avoids permanent green tick on old folders
  if (runs.some(r => r.status === 'processed' && r.processedAt != null && (Date.now() - r.processedAt.getTime()) < DONE_TTL_MS)) return 'done';
  return 'idle';
}

export function useFolderRunStatuses(folders: SmartFolder[]): Record<string, FolderRunStatus> {
  const backend = useWatchFolderStorage();
  const [statuses, setStatuses] = useState<Record<string, FolderRunStatus>>({});
  const doneTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  useEffect(() => {
    if (folders.length === 0) return;

    const load = async () => {
      const results = await Promise.all(
        folders.map(async (folder) => {
          try {
            const runs = backend
              ? await backend.getFolderRunState(folder.id)
              : await folderRunStateStorage.getFolderRunState(folder.id);
            return [folder.id, deriveStatus(runs)] as const;
          } catch {
            return [folder.id, 'idle' as FolderRunStatus] as const;
          }
        })
      );
      const newStatuses: Record<string, FolderRunStatus> = {};
      for (const [id, status] of results) {
        newStatuses[id] = status;
      }
      setStatuses(newStatuses);
    };

    load();
  }, [folders]);

  // Update individual folder status live when new run entries are appended
  useEffect(() => {
    return folderRunStateStorage.onRunStateChange((changedFolderId) => {
      if (!foldersRef.current.find(f => f.id === changedFolderId)) return;
      folderRunStateStorage.getFolderRunState(changedFolderId)
        .then((runs) => { setStatuses(prev => ({ ...prev, [changedFolderId]: deriveStatus(runs) })); })
        .catch((err) => console.error('Failed to update run status:', err));
    });
  }, []);

  // When a folder becomes 'done', revert to 'idle' after TTL
  useEffect(() => {
    const timers = doneTimersRef.current;
    Object.entries(statuses).forEach(([folderId, status]) => {
      if (status === 'done' && !timers.has(folderId)) {
        const timer = setTimeout(() => {
          setStatuses(prev => ({ ...prev, [folderId]: 'idle' }));
          timers.delete(folderId);
        }, DONE_TTL_MS);
        timers.set(folderId, timer);
      } else if (status !== 'done' && timers.has(folderId)) {
        clearTimeout(timers.get(folderId)!);
        timers.delete(folderId);
      }
    });
  }, [statuses]);

  // Clean up timers on unmount
  useEffect(() => {
    const timers = doneTimersRef.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return statuses;
}
