/**
 * Read-only hook that returns all smart folders, kept in sync with storage changes.
 * Use this when you only need to read the folder list without CRUD operations.
 * For full CRUD, use useSmartFolders instead.
 */

import { useState, useEffect } from 'react';
import { SmartFolder } from '@app/types/smartFolders';
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from '@app/services/smartFolderStorage';
import { useWatchFolderStorage } from '@app/contexts/WatchFolderStorageContext';

export function useAllSmartFolders(): SmartFolder[] {
  const backend = useWatchFolderStorage();
  const [folders, setFolders] = useState<SmartFolder[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const all = backend
          ? await backend.getAllFolders()
          : await smartFolderStorage.getAllFolders();
        setFolders(all);
      } catch (err) {
        console.error('Failed to load smart folders:', err);
      }
    };

    load();
    if (backend) {
      return backend.onChange(load);
    }
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, load);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, load);
  }, [backend]);

  return folders;
}
