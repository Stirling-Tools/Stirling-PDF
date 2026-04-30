/**
 * Read-only hook that returns all smart folders, kept in sync with storage changes.
 * Use this when you only need to read the folder list without CRUD operations.
 * For full CRUD, use useSmartFolders instead.
 */

import { useState, useEffect } from "react";
import { SmartFolder } from "@app/types/smartFolders";
import { useWatchFolderStore } from "@app/contexts/WatchFolderStorageContext";

export function useAllSmartFolders(): SmartFolder[] {
  const store = useWatchFolderStore();
  const [folders, setFolders] = useState<SmartFolder[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setFolders(await store.getAllFolders());
      } catch (err) {
        console.error("Failed to load smart folders:", err);
      }
    };

    load();
    return store.onChange(load);
  }, [store]);

  return folders;
}
