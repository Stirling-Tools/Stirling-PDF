/**
 * Returns the set of file IDs that are outputs produced by any watched folder automation.
 * Reactive: re-evaluates whenever folder records change.
 */

import { useState, useEffect } from "react";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { useAllWatchedFolders } from "@app/hooks/useAllWatchedFolders";

export function useFolderOutputIds(): Set<string> {
  const folders = useAllWatchedFolders();
  const [outputIds, setOutputIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (folders.length === 0) {
      setOutputIds(new Set());
      return;
    }

    const load = async () => {
      const ids = new Set<string>();
      for (const folder of folders) {
        try {
          const record = await watchedFolderFileStorage.getFolderData(
            folder.id,
          );
          if (record) {
            Object.values(record.files).forEach((meta) => {
              const oids =
                meta?.displayFileIds ??
                (meta?.displayFileId ? [meta.displayFileId] : []);
              oids.forEach((id) => ids.add(id));
            });
          }
        } catch {
          /* ignore individual folder failures */
        }
      }
      setOutputIds(ids);
    };

    load();
    return watchedFolderFileStorage.onFolderChange(load);
  }, [folders]);

  return outputIds;
}
