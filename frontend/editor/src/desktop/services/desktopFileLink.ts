import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DiskFileState } from "@core/services/desktopFileLink";

// Desktop implementation of the file-link seam. Overrides the core no-op in
// desktop builds (see @app alias order) so a file opened from disk stays 1:1
// with the real file rather than drifting from its IndexedDB copy.

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

/**
 * Watch the given linked files for external changes. Replaces any previous
 * watch set; an empty list stops watching. Failure is non-fatal - detection
 * falls back to the checks made at list-build and open time.
 */
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

/**
 * Read the live bytes of a linked file. Returns null when the file is gone or
 * unreadable so callers can fall back to the stored copy rather than showing an
 * empty document.
 */
export async function readFileFromDisk(
  path: string,
): Promise<ArrayBuffer | null> {
  if (!isTauri()) return null;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    // readFile usually hands back a tightly-packed buffer; use it directly
    // instead of slicing, which would copy the whole file (a transient 2x
    // memory spike on large PDFs). Only slice a view over a larger buffer.
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
