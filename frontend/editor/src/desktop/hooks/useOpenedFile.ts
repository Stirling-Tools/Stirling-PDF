import { useState, useEffect, useRef, useCallback } from "react";
import { fileOpenService } from "@app/services/fileOpenService";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  beginLoadingLaunchFiles,
  endLoadingLaunchFiles,
  trackLaunchFilePop,
} from "@app/services/launchFiles";

export function useOpenedFile() {
  const [openedFilePaths, setOpenedFilePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const openedFilePathsRef = useRef<string[]>([]);

  const clearOpenedFilePaths = useCallback(() => {
    if (openedFilePathsRef.current.length > 0) endLoadingLaunchFiles();
    openedFilePathsRef.current = [];
    setOpenedFilePaths([]);
  }, []);

  const consumeOpenedFilePaths = useCallback(() => {
    const current = openedFilePathsRef.current;
    openedFilePathsRef.current = [];
    setOpenedFilePaths([]);
    return current;
  }, []);

  useEffect(() => {
    let disposed = false;
    const readFilesFromStorage = async () => {
      // StrictMode replays setup before this resumes; a discarded setup must not drain the queue.
      await Promise.resolve();
      if (disposed) return;
      console.log("🔍 Reading files from storage...");
      try {
        const filePaths = await trackLaunchFilePop(
          fileOpenService.getOpenedFiles(),
        );
        if (disposed) return;
        console.log("🔍 fileOpenService.getOpenedFiles() returned:", filePaths);

        if (filePaths.length > 0) {
          console.log(
            `✅ Found ${filePaths.length} file(s) in storage:`,
            filePaths,
          );
          // A batch replaced before it was consumed is never loaded.
          if (openedFilePathsRef.current.length > 0) endLoadingLaunchFiles();
          beginLoadingLaunchFiles();
          openedFilePathsRef.current = filePaths;
          setOpenedFilePaths(filePaths);
        }
      } catch (error) {
        console.error("❌ Failed to read files from storage:", error);
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    // Read files on mount
    readFilesFromStorage();

    // Listen for files-changed events scoped to THIS window only.
    // Rust emits via window.emit(...) / app.emit_to(label, ...) so each
    // Tauri window sees only its own queue updates.
    let unlisten: (() => void) | undefined;
    const currentWindow = getCurrentWebviewWindow();
    currentWindow
      .listen("files-changed", async () => {
        console.log(
          `📂 files-changed event received on window '${currentWindow.label}', re-reading storage...`,
        );
        await readFilesFromStorage();
      })
      .then((unlistenFn) => {
        if (disposed) unlistenFn();
        else unlisten = unlistenFn;
      });

    return () => {
      disposed = true;
      if (openedFilePathsRef.current.length > 0) {
        endLoadingLaunchFiles();
        openedFilePathsRef.current = [];
      }
      if (unlisten) unlisten();
    };
  }, []);

  return {
    openedFilePaths,
    loading,
    clearOpenedFilePaths,
    consumeOpenedFilePaths,
  };
}
