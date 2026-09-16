// Seam for keeping desktop files 1:1 with disk. Non-desktop builds get this
// no-op via @app alias order, so web/SaaS keep IndexedDB as sole truth.

export type DiskUnavailableReason = "permission" | "offline" | "unknown";

export type DiskFileState =
  | { availability: "present"; size: number; modifiedMs: number }
  | { availability: "gone" }
  | { availability: "unavailable"; reason: DiskUnavailableReason };

export type PresentDiskFileState = Extract<
  DiskFileState,
  { availability: "present" }
>;

// False on web: disk-linked reads, pruning and the missing-file alert are skipped.
export const desktopFileLinkingSupported = false;

export async function getDiskFileState(_path: string): Promise<DiskFileState> {
  return { availability: "unavailable", reason: "unknown" };
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
