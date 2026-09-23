import { useState, useEffect, useRef, useCallback } from "react";
import { fileOpenService } from "@app/services/fileOpenService";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function useOpenedFile() {
  const [openedFilePaths, setOpenedFilePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const openedFilePathsRef = useRef<string[]>([]);

  const clearOpenedFilePaths = useCallback(() => {
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
    // Function to read and process files from storage
    const readFilesFromStorage = async () => {
      console.log("🔍 Reading files from storage...");
      try {
        const filePaths = await fileOpenService.getOpenedFiles();
        console.log("🔍 fileOpenService.getOpenedFiles() returned:", filePaths);

        if (filePaths.length > 0) {
          console.log(
            `✅ Found ${filePaths.length} file(s) in storage:`,
            filePaths,
          );
          openedFilePathsRef.current = filePaths;
          setOpenedFilePaths(filePaths);
        }
      } catch (error) {
        console.error("❌ Failed to read files from storage:", error);
      } finally {
        setLoading(false);
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
        unlisten = unlistenFn;
      });

    return () => {
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
