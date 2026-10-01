import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";

/**
 * Pull the server's folders and files again. Shared by every surface that offers
 * it, so a refresh from one is the same work as a refresh from another.
 */
export function useLibraryRefresh(): {
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const { t } = useTranslation();
  const folders = useFolders();
  const { refresh, bumpDiskRevision } = useFilesPage();
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    setRefreshing(true);
    try {
      // pullFromServer bumps the folder revision, which the FolderProvider's effect
      // reacts to by re-running refresh() - no need to await folders.refresh() here.
      const result = await folders.pullFromServer();
      if (!result.ok && result.reason !== "endpoint-missing") {
        folders.setError(
          result.reason === "network"
            ? t("filesPage.syncError.network", "Could not reach the server.")
            : result.reason === "server"
              ? t(
                  "filesPage.syncError.server",
                  "Server error during folder sync.",
                )
              : t("filesPage.syncError.client", "Folder sync failed."),
        );
      }
      // A mount is listed from the disk, which no amount of server syncing re-reads.
      bumpDiskRevision();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [folders, refresh, bumpDiskRevision, t]);

  return { refreshing, refresh: run };
}
