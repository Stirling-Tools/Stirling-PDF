import { invoke, isTauri } from "@tauri-apps/api/core";

// Desktop implementation of the file-link seam. Overrides the core no-op in
// desktop builds (see @app alias order) so recent files stay tied to disk.

export const desktopFileLinkingSupported = true;

// True if the path still exists on disk. On any error we assume it exists so a
// transient failure never prunes a valid recent file.
export async function pathExistsOnDisk(path: string): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch (error) {
    console.error("[desktopFileLink] path_exists failed:", error);
    return true;
  }
}

// Reveal the file in Explorer/Finder, highlighting it.
export async function revealPathInFileManager(path: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("reveal_in_file_manager", { path });
  } catch (error) {
    console.error("[desktopFileLink] reveal_in_file_manager failed:", error);
  }
}
