/**
 * Read-only hook that returns all smart folders, kept in sync with storage changes.
 * Use this when you only need to read the folder list without CRUD operations.
 * For full CRUD, use useWatchedFolders instead.
 */

import { useState, useEffect } from "react";
import { WatchedFolder } from "@app/types/watchedFolders";
import {
  watchedFolderStorage,
  WATCHED_FOLDER_STORAGE_CHANGE_EVENT,
} from "@app/services/watchedFolderStorage";

export function useAllWatchedFolders(): WatchedFolder[] {
  const [folders, setFolders] = useState<WatchedFolder[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setFolders(await watchedFolderStorage.getAllFolders());
      } catch (err) {
        console.error("Failed to load smart folders:", err);
      }
    };

    load();
    window.addEventListener(WATCHED_FOLDER_STORAGE_CHANGE_EVENT, load);
    return () =>
      window.removeEventListener(WATCHED_FOLDER_STORAGE_CHANGE_EVENT, load);
  }, []);

  return folders;
}
