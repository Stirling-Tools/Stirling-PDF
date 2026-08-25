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

/** One subdirectory inside a mounted directory. */
export interface DiskDirEntry {
  path: string;
  name: string;
}

/** What one look at a mounted directory yields. */
export interface DiskListing {
  files: DiskFileEntry[];
  directories: DiskDirEntry[];
}

/** Whether this build can list a directory at all. */
export const canListDirectory = false;

/**
 * The regular files and subdirectories directly inside `directory` — one
 * level, never recursive; a subdirectory is listed only when entered. Null
 * when unsupported.
 */
export async function listDirectory(
  _directory: string,
): Promise<DiskListing | null> {
  return null;
}

/**
 * Create a subdirectory inside a mounted directory. Returns its path, or
 * null when unsupported.
 */
export async function makeDiskDirectory(
  _parent: string,
  _name: string,
): Promise<string | null> {
  return null;
}

/** Read one listed file's bytes as a File, ready for the workbench. */
export async function readDiskFile(
  _entry: DiskFileEntry,
): Promise<File | null> {
  return null;
}

/**
 * Write a file into a mounted directory, under a name that never clobbers an
 * existing one. Moving an app file INTO a mount means putting it on the
 * filesystem — only a build that can see the filesystem can. Returns the
 * name the file landed under, or null when unsupported.
 */
export async function writeDiskFile(
  _directory: string,
  _name: string,
  _bytes: Blob,
): Promise<string | null> {
  return null;
}
