import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { writeIntoMount } from "@app/services/mountWrites";
import { folderKind } from "@app/types/folder";

/** Imports into the current folder without opening the editor; root imports appear in Recents. */
export function useLibraryUpload() {
  const { t } = useTranslation();
  const folders = useFolders();
  const { currentFolderId } = folders;
  const { addFiles } = useFileHandler();
  const {
    currentTab,
    moveFilesTo,
    refresh,
    bumpDiskRevision,
    setCurrentTab,
    setOriginFilter,
    setSearch,
  } = useFilesPage();

  return useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const target =
        currentTab === "all" || currentTab === "cloud" ? currentFolderId : null;
      const targetFolder = target ? folders.foldersById.get(target) : undefined;
      if (targetFolder && folderKind(targetFolder) === "local") {
        const { failedCount } = await writeIntoMount(
          targetFolder.directory,
          files.map((file) => ({ name: file.name, bytes: async () => file })),
        );
        if (failedCount > 0) {
          folders.setError(
            t("filesPage.moveIntoMountFailed", {
              count: failedCount,
              defaultValue:
                "{{count}} file(s) could not be written into the folder.",
            }),
          );
        }
        bumpDiskRevision();
        return;
      }
      // Keep folder membership if the server upload fails, so the local copy stays reachable.
      const added = await addFiles(files, {
        selectFiles: false,
        skipWorkspaceDispatch: true,
        ...(target ? { folderId: target } : {}),
      });
      const fileIds = added.map((f) => f.fileId);
      if (
        target !== null &&
        fileIds.length > 0 &&
        targetFolder &&
        folderKind(targetFolder) === "server"
      ) {
        await moveFilesTo(fileIds, target);
      }
      await refresh();
      if (target === null && fileIds.length > 0) {
        setCurrentTab("recent");
        setOriginFilter("all");
        setSearch("");
      }
    },
    [
      addFiles,
      currentFolderId,
      currentTab,
      folders,
      moveFilesTo,
      refresh,
      bumpDiskRevision,
      setCurrentTab,
      setOriginFilter,
      setSearch,
      t,
    ],
  );
}
