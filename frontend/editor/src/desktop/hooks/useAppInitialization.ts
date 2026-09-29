import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOpenedFile } from "@app/hooks/useOpenedFile";
import { fileOpenService } from "@app/services/fileOpenService";
import { useFileManagement } from "@app/contexts/file/fileHooks";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { captureDroppedFilePaths } from "@app/services/fileImportPaths";

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
                const fileData =
                  await fileOpenService.readFileAsArrayBuffer(filePath);
                if (!fileData) return null;

                const file = new File(
                  [fileData.arrayBuffer],
                  fileData.fileName,
                  {
                    type: "application/pdf",
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
          await addFiles(loadedFiles, { selectFiles: true });

          console.log(
            `[Desktop] ${loadedFiles.length} opened file(s) added to FileContext`,
          );
        }
      } catch (error) {
        console.error("[Desktop] Failed to load opened files:", error);
      }
    };

    loadOpenedFiles();
  }, [openedFilePaths, openedFileLoading, addFiles, consumeOpenedFilePaths]);
}

export function useSetupCompletion(): (completed: boolean) => void {
  const [, setSetupComplete] = useState(false);

  return (completed: boolean) => {
    setSetupComplete(completed);
  };
}
