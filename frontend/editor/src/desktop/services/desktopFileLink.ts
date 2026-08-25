import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DiskFileState } from "@core/services/desktopFileLink";

// Desktop side of the file-link seam; overrides the core no-op via @app alias
// order so disk-opened files stay 1:1 instead of drifting from IndexedDB.

export type { DiskFileState };

export const desktopFileLinkingSupported = true;

// Treat a file as present/unchanged when we can't tell, so a transient failure
// never prunes a valid recent or discards a good stored copy.
const ASSUME_PRESENT: DiskFileState = {
  exists: true,
  size: 0,
  modifiedMs: 0,
};

export async function getDiskFileState(path: string): Promise<DiskFileState> {
  if (!isTauri()) return ASSUME_PRESENT;
  try {
    return await invoke<DiskFileState>("file_disk_state", { path });
  } catch (error) {
    console.error("[desktopFileLink] file_disk_state failed:", error);
    return ASSUME_PRESENT;
  }
}

export async function pathExistsOnDisk(path: string): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch (error) {
    console.error("[desktopFileLink] path_exists failed:", error);
    return true;
  }
}

/** Replaces the watch set; empty list stops watching. Failure is non-fatal -
 * list-build and open-time checks still catch changes. */
export async function watchDiskPaths(paths: string[]): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke(paths.length > 0 ? "watch_disk_paths" : "unwatch_disk_paths", {
      paths,
    });
  } catch (error) {
    console.error("[desktopFileLink] watch_disk_paths failed:", error);
  }
}

/** Subscribe to watcher events. Resolves to an unsubscribe function. */
export async function onDiskFilesChanged(
  handler: (paths: string[]) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<{ paths: string[] }>("disk-files-changed", (event) =>
      handler(event.payload?.paths ?? []),
    );
  } catch (error) {
    console.error("[desktopFileLink] disk change listener failed:", error);
    return () => {};
  }
}

/** Live bytes of a linked file, or null when gone/unreadable so callers fall
 * back to the stored copy instead of showing an empty document. */
export async function readFileFromDisk(
  path: string,
): Promise<ArrayBuffer | null> {
  if (!isTauri()) return null;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    // Use a tightly-packed buffer directly; slicing copies the whole file
    // (2x memory spike on large PDFs). Only slice a view over a larger buffer.
    return bytes.byteOffset === 0 &&
      bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
  } catch (error) {
    console.error("[desktopFileLink] readFileFromDisk failed:", path, error);
    return null;
  }
}
