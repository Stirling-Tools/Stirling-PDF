import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Thrown when the OS refuses read access to an opened file's path even after
 * attempting a copy-to-temp fallback. The canonical trigger is double-clicking a
 * PDF straight from an Outlook attachment: Outlook drops it into a read-protected
 * `INetCache\Content.Outlook\...` folder and hands us that path, so the read fails
 * with `os error 5` (access denied). Callers should surface a user-facing message
 * (e.g. "save the file locally first") rather than failing silently.
 */
export class FileAccessDeniedError extends Error {
  readonly filePath: string;
  readonly fileName: string;

  constructor(filePath: string, cause?: unknown) {
    super(`Access denied reading file: ${filePath}`);
    this.name = "FileAccessDeniedError";
    this.filePath = filePath;
    this.fileName = filePath.split(/[\\/]/).pop() || "opened-file.pdf";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Heuristic for OS-level access-denied errors (Windows `os error 5`, POSIX EACCES). */
function isAccessDeniedError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("os error 5") ||
    message.includes("access is denied") ||
    message.includes("access denied") ||
    message.includes("permission denied") ||
    message.includes("eacces")
  );
}

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
    const fileName = filePath.split(/[\\/]/).pop() || "opened-file.pdf";

    try {
      const arrayBuffer = await this.readPathAsArrayBuffer(filePath);
      return { fileName, arrayBuffer };
    } catch (error) {
      // Windows denies direct reads of Outlook's `INetCache\Content.Outlook`
      // attachment cache (`os error 5`). Copying the file into a temp location
      // we own often succeeds where a direct read does not, so try that before
      // giving up.
      if (isAccessDeniedError(error)) {
        try {
          return await this.readViaTempCopy(filePath, fileName);
        } catch (copyError) {
          // Signal the caller so it can prompt the user to save the file
          // locally, instead of failing silently and capturing an exception.
          throw new FileAccessDeniedError(filePath, copyError);
        }
      }

      console.error("Failed to read file:", error);
      return null;
    }
  }

  /**
   * Read a path via the fs plugin and normalise the result to an ArrayBuffer.
   * readFile usually returns a tightly-packed buffer; in that case hand it over
   * directly instead of slicing, which would copy the entire file (a transient
   * 2x memory spike for large PDFs). Only slice when the view is a window over a
   * larger ArrayBuffer.
   */
  private async readPathAsArrayBuffer(path: string): Promise<ArrayBuffer> {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const fileData = await readFile(path);
    return fileData.byteOffset === 0 &&
      fileData.byteLength === fileData.buffer.byteLength
      ? fileData.buffer
      : fileData.buffer.slice(
          fileData.byteOffset,
          fileData.byteOffset + fileData.byteLength,
        );
  }

  /**
   * Fallback for read-protected source paths (e.g. Outlook attachments): copy
   * the file into the app's temp dir, read the copy, then clean it up. The OS
   * copy uses more permissive sharing than a direct read, so it can succeed
   * where reading the original path fails.
   */
  private async readViaTempCopy(
    filePath: string,
    fileName: string,
  ): Promise<{ fileName: string; arrayBuffer: ArrayBuffer }> {
    const { copyFile, remove } = await import("@tauri-apps/plugin-fs");
    const { tempDir, join } = await import("@tauri-apps/api/path");

    const tempPath = await join(
      await tempDir(),
      `stirling-opened-${Date.now()}-${fileName}`,
    );

    await copyFile(filePath, tempPath);
    try {
      const arrayBuffer = await this.readPathAsArrayBuffer(tempPath);
      return { fileName, arrayBuffer };
    } finally {
      // Best-effort cleanup; the copy lives in a temp dir either way.
      remove(tempPath).catch(() => {});
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
