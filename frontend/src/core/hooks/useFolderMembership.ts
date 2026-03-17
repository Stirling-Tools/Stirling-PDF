/**
 * Returns a map of fileId → folderId[] for all files currently in any smart folder.
 * Both input files (keyed by their FileId in stirling-pdf-files) and their output
 * counterparts (displayFileId) are included so folder tags show on both versions.
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
              // Tag all output files with this folder
              const outputIds = meta?.displayFileIds ?? (meta?.displayFileId ? [meta.displayFileId] : []);
              outputIds.forEach(oid => add(oid, folder.id));
            });
          }
        } catch {
          // ignore individual folder failures
        }
      }
      setMembership(map);
    };

    load();

    return folderStorage.onFolderChange(load);
  }, [folders]);

  return membership;
}
