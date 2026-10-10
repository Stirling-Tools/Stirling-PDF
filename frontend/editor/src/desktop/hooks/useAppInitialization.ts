import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOpenedFile } from "@app/hooks/useOpenedFile";
import { fileOpenService } from "@app/services/fileOpenService";
import {
  useFileActions,
  useFileManagement,
  useFileSelectors,
} from "@app/contexts/file/fileHooks";
import { storedCopiesForNewFiles } from "@app/contexts/file/storedFileReconciler";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { captureDroppedFilePaths } from "@app/services/fileImportPaths";
import { getDiskFileState } from "@app/services/desktopFileLink";
import { diskLastModified } from "@app/services/diskFileSync";
import { endLoadingLaunchFiles } from "@app/services/launchFiles";

/**
 * App initialization hook
 * Desktop version: Handles Tauri-specific file initialization
 * Requires FileContext - must be used inside FileContextProvider
 * - Handles files opened with the app (adds directly to FileContext)
 */
export function useAppInitialization(): void {
  useEffect(captureDroppedFilePaths, []);
  // macOS captures dropped paths via a native swizzle installed against the live
  // webview; no-op on other platforms.
  useEffect(() => {
    void invoke("install_drag_capture").catch(() => {});
  }, []);

  // Get file management actions
  const { addFiles } = useFileManagement();
  const { actions } = useFileActions();
  const selectors = useFileSelectors();

  // Handle files opened with app (Tauri mode)
  const {
    openedFilePaths,
    loading: openedFileLoading,
    consumeOpenedFilePaths,
  } = useOpenedFile();

  // Load opened files and add directly to FileContext
  useEffect(() => {
    if (openedFilePaths.length === 0 || openedFileLoading) {
      return;
    }

    const loadOpenedFiles = async () => {
      const filePaths = consumeOpenedFilePaths();
      if (filePaths.length === 0) {
        return;
      }
      try {
        const loadedFiles = (
          await Promise.all(
            filePaths.map(async (filePath) => {
              try {
                const [fileData, disk] = await Promise.all([
                  fileOpenService.readFileAsArrayBuffer(filePath),
                  getDiskFileState(filePath),
                ]);
                if (!fileData) return null;

                const file = new File(
                  [fileData.arrayBuffer],
                  fileData.fileName,
                  {
                    type: "application/pdf",
                    lastModified: diskLastModified(disk),
                  },
                );

                console.log("[Desktop] Loaded file:", fileData.fileName);
                pendingFilePathMappings.set(file, filePath);
                return file;
              } catch (error) {
                console.error(
                  "[Desktop] Failed to load file:",
                  filePath,
                  error,
                );
                return null;
              }
            }),
          )
        ).filter((file): file is File => Boolean(file));

        if (loadedFiles.length > 0) {
          // Reopen the stored copy of a file disk has not changed, or every
          // open from Explorer stores the same file again.
          const storedCopies = await storedCopiesForNewFiles(loadedFiles);
          const reopened = [...storedCopies.values()];
          if (reopened.length > 0) await actions.addStirlingFileStubs(reopened);
          const fresh = loadedFiles.filter((file) => !storedCopies.has(file));
          // The lookup above is the dedupe for these, by path: the name, size
          // and date key would take an identical copy from another folder for
          // the one already open and never link it.
          const added =
            fresh.length > 0
              ? await addFiles(fresh, { allowDuplicates: true })
              : [];

          // Read after both adds: the selection may have moved while they ran.
          const selected = selectors
            .getSelectedStirlingFileStubs()
            .map((stub) => stub.id);
          actions.setSelectedFiles([
            ...new Set([
              ...selected,
              ...reopened.map((stub) => stub.id),
              ...added.map((file) => file.fileId),
            ]),
          ]);

          console.log(
            `[Desktop] ${loadedFiles.length} opened file(s) added to FileContext (${reopened.length} from storage)`,
          );
        }
      } catch (error) {
        console.error("[Desktop] Failed to load opened files:", error);
      } finally {
        endLoadingLaunchFiles();
      }
    };

    loadOpenedFiles();
  }, [
    openedFilePaths,
    openedFileLoading,
    addFiles,
    actions,
    selectors,
    consumeOpenedFilePaths,
  ]);
}

export function useSetupCompletion(): (completed: boolean) => void {
  const [, setSetupComplete] = useState(false);

  return (completed: boolean) => {
    setSetupComplete(completed);
  };
}
