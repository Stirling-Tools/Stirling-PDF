import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useFolders } from "@editor/contexts/FolderContext";
import { useFilesPage } from "@editor/contexts/FilesPageContext";
import {
  canPickDirectory,
  pickDirectory,
} from "@editor/services/directoryPicker";
import { useServerFolderBlock } from "@editor/hooks/useServerFolderBlock";
import { folderKind } from "@editor/types/folder";

/**
 * Mounts and opens picked directories; otherwise opens the creation dialog.
 * Reports picker and mount failures through FolderContext.
 */
export function useNewFolderFlow() {
  const { t } = useTranslation();
  const folders = useFolders();
  const { currentTab, openNewFolderDialog } = useFilesPage();
  const navigate = useNavigate();
  const serverFolderBlock = useServerFolderBlock();
  const currentFolder = folders.currentFolderId
    ? folders.foldersById.get(folders.currentFolderId)
    : undefined;
  const needsServer =
    (currentFolder && folderKind(currentFolder) === "server") ||
    (folders.currentFolderId === null && !canPickDirectory);
  const createFolderHereBlockedReason =
    currentTab !== "all" && currentTab !== "cloud"
      ? t(
          "filesPage.newFolderTabUnavailable",
          "Switch to Stirling library to create folders.",
        )
      : needsServer
        ? serverFolderBlock
        : null;

  const addLocalFolder = useCallback(async () => {
    try {
      const picked = await pickDirectory();
      if (!picked) return;
      const record = await folders.mountLocalFolder(picked.path, picked.name);
      // The URL owns folder selection; updating folder state first races navigation.
      navigate(`/files/${record.id}`);
    } catch (err) {
      folders.setError(
        err instanceof Error
          ? t("filesPage.error.addFolderFailedDetail", {
              message: err.message,
              defaultValue: `Could not add the folder: ${err.message}`,
            })
          : t("filesPage.error.addFolderFailed", "Could not add the folder."),
      );
    }
  }, [folders, navigate, t]);

  const createFolderHere = useCallback(() => {
    if (createFolderHereBlockedReason !== null) return;
    if (folders.currentFolderId !== null) {
      openNewFolderDialog(folders.currentFolderId);
      return;
    }
    if (canPickDirectory) {
      void addLocalFolder();
      return;
    }
    openNewFolderDialog(null, "server");
  }, [
    addLocalFolder,
    createFolderHereBlockedReason,
    folders.currentFolderId,
    openNewFolderDialog,
  ]);

  return {
    addLocalFolder,
    createFolderHere,
    createFolderHereBlockedReason,
    serverFolderBlock,
  };
}
