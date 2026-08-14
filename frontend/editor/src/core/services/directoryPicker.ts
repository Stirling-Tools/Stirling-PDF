/**
 * Picking a directory on the machine, as a real filesystem path.
 *
 * Only an environment that can see the filesystem can offer this — a browser
 * deliberately cannot reveal paths (the File System Access API deals in
 * handles, not locations), so core reports the capability absent and the
 * desktop build shadows this module with the Tauri dialog.
 */

export interface PickedDirectory {
  /** Absolute path, as the platform writes it. */
  path: string;
  /** The directory's own name — the mounted folder's display name. */
  name: string;
}

/** Whether this build can produce a directory path at all. */
export const canPickDirectory = false;

/** Ask the user for a directory; null when cancelled (or unsupported). */
export async function pickDirectory(): Promise<PickedDirectory | null> {
  return null;
}
