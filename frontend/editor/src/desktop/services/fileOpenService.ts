import { invoke, isTauri } from "@tauri-apps/api/core";

export interface FileOpenService {
  getOpenedFiles(): Promise<string[]>;
  readFileAsArrayBuffer(
    filePath: string,
  ): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null>;
  clearOpenedFiles(): Promise<void>;
  onFileOpened(callback: (filePath: string) => void): () => void; // Returns unlisten function
  openInNewWindow(paths?: string[]): Promise<void>;
  /** Open already-stored files (by IndexedDB id) in a new window. */
  openFilesInNewWindow(fileIds: string[]): Promise<void>;
  /** Pop the stored-file ids queued for the current window (consumed on mount). */
  popWindowFileIds(): Promise<string[]>;
}

class TauriFileOpenService implements FileOpenService {
  async getOpenedFiles(): Promise<string[]> {
    try {
      console.log("🔍 Calling invoke(pop_opened_files)...");
      const result = await invoke<string[]>("pop_opened_files");
      console.log("🔍 invoke(pop_opened_files) returned:", result);
      return result;
    } catch (error) {
      console.error("❌ Failed to get opened files:", error);
      return [];
    }
  }

  async readFileAsArrayBuffer(
    filePath: string,
  ): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");

      const fileData = await readFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || "opened-file.pdf";

      // readFile usually returns a tightly-packed buffer; in that case hand it
      // over directly instead of slicing, which would copy the entire file
      // (a transient 2x memory spike for large PDFs). Only slice when the view
      // is a window over a larger ArrayBuffer.
      const arrayBuffer =
        fileData.byteOffset === 0 &&
        fileData.byteLength === fileData.buffer.byteLength
          ? fileData.buffer
          : fileData.buffer.slice(
              fileData.byteOffset,
              fileData.byteOffset + fileData.byteLength,
            );

      return { fileName, arrayBuffer };
    } catch (error) {
      console.error("Failed to read file:", error);
      return null;
    }
  }

  async clearOpenedFiles(): Promise<void> {
    try {
      console.log("🔍 Calling invoke(clear_opened_files)...");
      await invoke("clear_opened_files");
      console.log("✅ Successfully cleared opened files");
    } catch (error) {
      console.error("❌ Failed to clear opened files:", error);
    }
  }

  async openInNewWindow(paths: string[] = []): Promise<void> {
    try {
      const label = await invoke<string>("open_in_new_window", { paths });
      console.log(`🪟 Spawned new window: ${label}`);
    } catch (error) {
      console.error("❌ Failed to open in new window:", error);
    }
  }

  async openFilesInNewWindow(fileIds: string[]): Promise<void> {
    try {
      const label = await invoke<string>("open_files_in_new_window", {
        fileIds,
      });
      console.log(`🪟 Spawned new window ${label} for stored files:`, fileIds);
    } catch (error) {
      console.error("❌ Failed to open files in new window:", error);
    }
  }

  async popWindowFileIds(): Promise<string[]> {
    try {
      return await invoke<string[]>("pop_window_file_ids");
    } catch (error) {
      console.error("❌ Failed to pop window file ids:", error);
      return [];
    }
  }

  onFileOpened(callback: (filePath: string) => void): () => void {
    let cleanup: (() => void) | null = null;
    let isCleanedUp = false;

    const setupEventListeners = async () => {
      try {
        // Check if already cleaned up before async setup completes
        if (isCleanedUp) {
          return;
        }

        // Only import if in Tauri environment
        if (isTauri()) {
          const { listen } = await import("@tauri-apps/api/event");

          // Check again after async import
          if (isCleanedUp) {
            return;
          }

          // Listen for unified file open events (all platforms)
          const unlisten = await listen("file-opened", (event) => {
            console.log("📂 File open event received:", event.payload);
            callback(event.payload as string);
          });

          // Set up cleanup function only if not already cleaned up
          if (!isCleanedUp) {
            cleanup = () => {
              try {
                unlisten();
                console.log("✅ File event listeners cleaned up");
              } catch (error) {
                console.error("❌ Error during file event cleanup:", error);
              }
            };
          } else {
            // Clean up immediately if cleanup was called during setup
            try {
              unlisten();
            } catch (error) {
              console.error("❌ Error during immediate cleanup:", error);
            }
          }
        }
      } catch (error) {
        console.error("❌ Failed to setup file event listeners:", error);
      }
    };

    setupEventListeners();

    // Return cleanup function
    return () => {
      isCleanedUp = true;
      if (cleanup) {
        cleanup();
      }
    };
  }
}

class WebFileOpenService implements FileOpenService {
  async getOpenedFiles(): Promise<string[]> {
    // In web mode, there's no file association support
    return [];
  }

  async readFileAsArrayBuffer(
    _filePath: string,
  ): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    // In web mode, cannot read arbitrary file paths
    return null;
  }

  async clearOpenedFiles(): Promise<void> {
    // In web mode, no file clearing needed
  }

  onFileOpened(_callback: (filePath: string) => void): () => void {
    // In web mode, no file events - return no-op cleanup function
    console.log("ℹ️ Web mode: File event listeners not supported");
    return () => {
      // No-op cleanup for web mode
    };
  }

  async openInNewWindow(_paths: string[] = []): Promise<void> {
    // Multi-window isn't a thing in browser mode.
  }

  async openFilesInNewWindow(_fileIds: string[]): Promise<void> {
    // Multi-window isn't a thing in browser mode.
  }

  async popWindowFileIds(): Promise<string[]> {
    return [];
  }
}

// Export the appropriate service based on environment
export const fileOpenService: FileOpenService = isTauri()
  ? new TauriFileOpenService()
  : new WebFileOpenService();
