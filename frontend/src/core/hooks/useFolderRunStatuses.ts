/**
 * Hook that derives per-folder run status from run state entries
 * 'done' automatically reverts to 'idle' after 5 minutes
 */

import { useState, useEffect, useRef } from 'react';
import { SmartFolder } from '@app/types/smartFolders';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';

export type FolderRunStatus = 'idle' | 'processing' | 'done';

const DONE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useFolderRunStatuses(folders: SmartFolder[]): Record<string, FolderRunStatus> {
  const [statuses, setStatuses] = useState<Record<string, FolderRunStatus>>({});
  const doneTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (folders.length === 0) return;

    const load = async () => {
      const newStatuses: Record<string, FolderRunStatus> = {};
      for (const folder of folders) {
        try {
          const runs = await folderRunStateStorage.getFolderRunState(folder.id);
          const hasProcessing = runs.some(r => r.status === 'processing');
          const hasDone = runs.some(r => r.status === 'processed');
          newStatuses[folder.id] = hasProcessing ? 'processing' : hasDone ? 'done' : 'idle';
        } catch {
          newStatuses[folder.id] = 'idle';
        }
      }
      setStatuses(newStatuses);
    };

    load();
  }, [folders]);

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
