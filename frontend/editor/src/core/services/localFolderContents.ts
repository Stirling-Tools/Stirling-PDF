/**
 * Reading a mounted local folder's contents straight off the disk.
 *
 * A local folder is read-through: the directory is the source of truth and
 * nothing is ingested to show it — the listing IS the directory, taken fresh
 * on every look. Only an environment that can see the filesystem can do
 * this, so core reports the capability absent and the desktop build shadows
 * this module with the Tauri filesystem plugin.
 */

/** One file inside a mounted directory, as the file manager lists it. */
export interface DiskFileEntry {
  /** Absolute path — the file's identity here; nothing about it is stored. */
  path: string;
  name: string;
  sizeBytes: number;
  lastModified: number;
}

/** Whether this build can list a directory at all. */
export const canListDirectory = false;

/**
 * The regular files directly inside `directory` (no recursion — a mount's
 * subdirectories are the filesystem's business). Null when unsupported.
 */
export async function listDirectory(
  _directory: string,
): Promise<DiskFileEntry[] | null> {
  return null;
}

/** Read one listed file's bytes as a File, ready for the workbench. */
export async function readDiskFile(
  _entry: DiskFileEntry,
): Promise<File | null> {
  return null;
}
