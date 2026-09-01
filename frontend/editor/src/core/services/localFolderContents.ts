/** Reading a mounted folder's contents straight off the disk. */

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
 * The regular files and subdirectories directly inside `directory` — one level, never
 * recursive; a subdirectory is listed only when entered.
 */
export async function listDirectory(
  _directory: string,
): Promise<DiskListing | null> {
  return null;
}

/** Create a subdirectory inside a mounted directory. */
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

/** Write a file into a mounted directory, under a name that never clobbers an existing one. */
export async function writeDiskFile(
  _directory: string,
  _name: string,
  _bytes: Blob,
): Promise<string | null> {
  return null;
}
