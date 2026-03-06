/**
 * Returns a map of fileId → folderId for all files currently in any smart folder.
 * Used to verify folder-scoped file isolation — a file in this map is owned by a folder
 * and must not appear in the global file context.
 */

import { useState, useEffect } from 'react';
import { folderStorage } from '@app/services/folderStorage';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';

export function useFolderMembership(): Map<string, string> {
  const folders = useAllSmartFolders();
  const [membership, setMembership] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (folders.length === 0) {
      setMembership(new Map());
      return;
    }

    const load = async () => {
      const map = new Map<string, string>();
      for (const folder of folders) {
        try {
          const record = await folderStorage.getFolderData(folder.id);
          if (record) {
            Object.keys(record.files).forEach(fileId => {
              map.set(fileId, folder.id);
            });
          }
        } catch {
          // ignore individual folder failures
        }
      }
      setMembership(map);
    };

    load();
  }, [folders]);

  return membership;
}
