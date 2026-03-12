/**
 * Returns a map of fileId → folderId for all files currently in any smart folder.
 * Used to verify folder-scoped file isolation — a file in this map is owned by a folder
 * and must not appear in the global file context.
 */

import { useState, useEffect } from 'react';
import { folderStorage } from '@app/services/folderStorage';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';

export function useFolderMembership(): Map<string, string[]> {
  const folders = useAllSmartFolders();
  const [membership, setMembership] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (folders.length === 0) {
      setMembership(new Map());
      return;
    }

    const load = async () => {
      const map = new Map<string, string[]>();
      const add = (fileId: string, folderId: string) => {
        const existing = map.get(fileId);
        if (existing) { if (!existing.includes(folderId)) existing.push(folderId); }
        else map.set(fileId, [folderId]);
      };
      for (const folder of folders) {
        try {
          const record = await folderStorage.getFolderData(folder.id);
          if (record) {
            Object.entries(record.files).forEach(([fileId, meta]) => {
              add(fileId, folder.id);
              if (meta?.originalFileId) add(meta.originalFileId, folder.id);
            });
          }
        } catch {
          // ignore individual folder failures
        }
      }
      setMembership(map);
    };

    load();

    window.addEventListener('folder-storage-changed', load);
    return () => window.removeEventListener('folder-storage-changed', load);
  }, [folders]);

  return membership;
}
