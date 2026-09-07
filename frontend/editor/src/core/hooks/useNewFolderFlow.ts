import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useFolders } from "@app/contexts/FolderContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { canPickDirectory, pickDirectory } from "@app/services/directoryPicker";
import { useServerFolderBlock } from "@app/hooks/useServerFolderBlock";

/** The folder-creation flows, shared by every surface that offers them so they
 *  cannot drift apart. */
export function useNewFolderFlow() {
  const { t } = useTranslation();
  const folders = useFolders();
  const { openNewFolderDialog } = useFilesPage();
  const navigate = useNavigate();
  const serverFolderBlock = useServerFolderBlock();

  // No dialog: the picker is the whole interaction and the directory names the folder.
  const addLocalFolder = useCallback(async () => {
    try {
      const picked = await pickDirectory();
      if (!picked) return;
      const record = await folders.mountLocalFolder(picked.path, picked.name);
      // The path owns folder selection: setting state here races the effect that
      // re-runs with the old pathname and snaps back to root.
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

  // Single-click New folder for surfaces with no menu: the picker where the build
  // can see the disk, a server folder on the web, and blocked rather than silent
  // when the server cannot take one. Inside a folder the kind is inherited.
  const createFolderHere = useCallback(() => {
    if (folders.currentFolderId !== null) {
      openNewFolderDialog(folders.currentFolderId);
      return;
    }
    if (canPickDirectory) {
      void addLocalFolder();
      return;
    }
    // Backstop: surfaces disable themselves, so a click here means stale UI.
    if (serverFolderBlock === null) {
      openNewFolderDialog(null, "server");
    }
  }, [
    addLocalFolder,
    folders.currentFolderId,
    openNewFolderDialog,
    serverFolderBlock,
  ]);

  // Why the single-click surfaces are disabled, or null. Only the web root blocks:
  // desktop always has the picker, and subfolders inherit their kind.
  const createFolderHereBlockedReason =
    folders.currentFolderId === null && !canPickDirectory
      ? serverFolderBlock
      : null;

  return { addLocalFolder, createFolderHere, createFolderHereBlockedReason };
}
