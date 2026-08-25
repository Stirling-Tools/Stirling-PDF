import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useFolders } from "@app/contexts/FolderContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { canPickDirectory, pickDirectory } from "@app/services/directoryPicker";
import { useServerFolderBlock } from "@app/hooks/useServerFolderBlock";

/**
 * The folder-creation flows shared by every surface that offers them — the
 * files-page New-folder menu, the empty-state CTA, the sidebar rail — so the
 * surfaces present one behavior instead of drifting copies.
 */
export function useNewFolderFlow() {
  const { t } = useTranslation();
  const folders = useFolders();
  const { openNewFolderDialog } = useFilesPage();
  const navigate = useNavigate();
  const serverFolderBlock = useServerFolderBlock();

  // "Add local folder" needs no dialog at all: the native picker is the
  // whole interaction, and the directory's name is the folder's name.
  // Landing inside the fresh mount is the confirmation.
  const addLocalFolder = useCallback(async () => {
    try {
      const picked = await pickDirectory();
      if (!picked) return;
      const record = await folders.mountLocalFolder(picked.path, picked.name);
      // The URL is the source of truth for folder selection (the pathname →
      // state effect owns currentFolderId). Setting state directly here races
      // that effect — it re-runs on the same commit's foldersById change with
      // the old pathname and snaps the selection back to root.
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

  // Single-click "New folder" for surfaces with no menu: the native picker
  // where the build can see the disk, the server folder on the web. When the
  // server can't take a folder the shortcut is blocked (see
  // createFolderHereBlockedReason) rather than acting silently. Inside a
  // folder the kind is inherited and none of this applies.
  const createFolderHere = useCallback(() => {
    if (folders.currentFolderId !== null) {
      openNewFolderDialog(folders.currentFolderId);
      return;
    }
    if (canPickDirectory) {
      void addLocalFolder();
      return;
    }
    // Backstop for the blocked state — the surfaces disable themselves on
    // createFolderHereBlockedReason, so a click landing here means stale UI.
    if (serverFolderBlock === null) {
      openNewFolderDialog(null, "server");
    }
  }, [
    addLocalFolder,
    folders.currentFolderId,
    openNewFolderDialog,
    serverFolderBlock,
  ]);

  // Why the single-click surfaces should be disabled, or null when they can
  // act. Only the web root can block: desktop always has the picker, and
  // subfolders inherit their parent's kind.
  const createFolderHereBlockedReason =
    folders.currentFolderId === null && !canPickDirectory
      ? serverFolderBlock
      : null;

  return { addLocalFolder, createFolderHere, createFolderHereBlockedReason };
}
