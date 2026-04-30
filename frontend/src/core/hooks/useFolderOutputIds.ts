/**
 * Returns the set of file IDs that are outputs produced by any watch folder automation.
 * Reactive: re-evaluates whenever folder records change.
 */

import { useState, useEffect } from 'react';
import { folderStorage } from '@app/services/folderStorage';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';
import { useWatchFolderStore } from '@app/contexts/WatchFolderStorageContext';

export function useFolderOutputIds(): Set<string> {
  const folders = useAllSmartFolders();
  const store = useWatchFolderStore();
  const [outputIds, setOutputIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (folders.length === 0) { setOutputIds(new Set()); return; }

    const load = async () => {
      const ids = new Set<string>();
      for (const folder of folders) {
        try {
          const record = await store.getFolderData(folder.id);
          if (record) {
            Object.values(record.files).forEach(meta => {
              const oids = meta?.displayFileIds ?? (meta?.displayFileId ? [meta.displayFileId] : []);
              oids.forEach(id => ids.add(id));
            });
          }
        } catch { /* ignore individual folder failures */ }
      }
      setOutputIds(ids);
    };

    load();
    // Server backend mirrors writes to IDB so this fires for both backends.
    return folderStorage.onFolderChange(load);
  }, [folders, store]);

  return outputIds;
}
