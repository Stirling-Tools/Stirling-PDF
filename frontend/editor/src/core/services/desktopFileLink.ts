// Seam for linking recent files to their real file on disk (desktop only).
// Non-desktop builds resolve to this no-op default via the @app alias order,
// so web/SaaS have no disk-linked recents to prune or reveal.

// False on web: the recent-file pruner and "Show in folder" action are skipped.
export const desktopFileLinkingSupported = false;

// Assume present so the pruner never drops a recent file off the desktop app.
export async function pathExistsOnDisk(_path: string): Promise<boolean> {
  return true;
}

// No OS file manager to reveal into outside the desktop app.
export async function revealPathInFileManager(_path: string): Promise<void> {}
