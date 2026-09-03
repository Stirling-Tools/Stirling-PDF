// Seam for keeping desktop files 1:1 with disk. Non-desktop builds get this
// no-op via @app alias order, so web/SaaS keep IndexedDB as sole truth.

/** On-disk state of a linked file. Mirrors the Rust `DiskFileState`. */
export interface DiskFileState {
  exists: boolean;
  size: number;
  /** Epoch ms; 0 when the platform gives us no mtime. */
  modifiedMs: number;
}

// False on web: disk-linked reads, pruning and the missing-file alert are skipped.
export const desktopFileLinkingSupported = false;

// Assume present so the pruner never drops a recent file off the desktop app.
export async function pathExistsOnDisk(_path: string): Promise<boolean> {
  return true;
}

// Assume present and unchanged so web never invalidates its stored copy.
export async function getDiskFileState(_path: string): Promise<DiskFileState> {
  return { exists: true, size: 0, modifiedMs: 0 };
}

// No disk to read from outside the desktop app.
export async function readFileFromDisk(
  _path: string,
): Promise<ArrayBuffer | null> {
  return null;
}

// Nothing to watch: web files have no disk original that can change underneath us.
export async function watchDiskPaths(_paths: string[]): Promise<void> {}

// Never fires off the desktop app; returns a no-op unsubscribe.
export async function onDiskFilesChanged(
  _handler: (paths: string[]) => void,
): Promise<() => void> {
  return () => {};
}
