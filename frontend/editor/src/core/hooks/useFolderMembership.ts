/**
 * Returns a map of fileId → folderId[] for all files currently in any watched folder.
 * Both input files (keyed by their FileId in stirling-pdf-files) and their output
 * counterparts (displayFileId) are included so folder tags show on both versions.
 */

import { useState, useEffect } from "react";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { useAllWatchedFolders } from "@app/hooks/useAllWatchedFolders";

export function useFolderMembership(): Map<string, string[]> {
  const folders = useAllWatchedFolders();
  const [membership, setMembership] = useState<Map<string, string[]>>(
    new Map(),
  );

  useEffect(() => {
    if (folders.length === 0) {
      setMembership(new Map());
      return;
    }

    const load = async () => {
      const map = new Map<string, string[]>();
      const add = (fileId: string, folderId: string) => {
        const existing = map.get(fileId);
        if (existing) {
          if (!existing.includes(folderId)) existing.push(folderId);
        } else map.set(fileId, [folderId]);
      };
      for (const folder of folders) {
        try {
          const record = await watchedFolderFileStorage.getFolderData(
            folder.id,
          );
          if (record) {
            Object.entries(record.files).forEach(([fileId, meta]) => {
              add(fileId, folder.id);
              const outputIds =
                meta?.displayFileIds ??
                (meta?.displayFileId ? [meta.displayFileId] : []);
              outputIds.forEach((oid) => add(oid, folder.id));
            });
          }
        } catch {
          // ignore individual folder failures
        }
      }
      setMembership(map);
    };

    load();
    return watchedFolderFileStorage.onFolderChange(load);
  }, [folders]);

  return membership;
}
