import { FileId, StirlingFileStub } from "@app/types/fileContext";
import {
  DiskFileState,
  desktopFileLinkingSupported,
  getDiskFileState,
  readFileFromDisk,
} from "@app/services/desktopFileLink";
import { fileStorage } from "@app/services/fileStorage";

/**
 * Keeps a desktop file 1:1 with the real file on disk.
 *
 * A file opened from disk is copied into IndexedDB so the workbench has bytes to
 * work with, but that copy is a cache, not the truth. Left alone it drifts: edit
 * the PDF in another app and Stirling would keep serving the stale copy forever,
 * and delete it and Stirling would keep offering a file that no longer exists.
 * Every read of a linked file goes through here so disk stays authoritative.
 *
 * No-op off the desktop app, where there is no disk path and the stored copy IS
 * the only copy.
 */

/** What a linked file's disk state means for the copy we are holding. */
export type DiskSyncOutcome =
  /** Not a desktop-linked file: the stored copy is the only truth. */
  | { status: "not-linked" }
  /** The disk file is gone. */
  | { status: "missing" }
  /** Disk matches what we last read; the stored copy is current. */
  | { status: "unchanged" }
  /** Disk moved on, but we hold unsaved in-app edits, so we keep ours. */
  | { status: "conflict" }
  /** Disk moved on and we had nothing unsaved, so these are the live bytes. */
  | { status: "updated"; file: File; state: DiskFileState };

/**
 * How a file stands relative to its disk original. Derived rather than stored so
 * there is one answer to "is this backed by a real file" for every surface that
 * asks - badge, save shortcut, exit warning - instead of each re-deriving it
 * from a different subset of the fields.
 */
export type DiskLinkState =
  /** Never came from disk: a web upload, or a tool output. */
  | "none"
  /** Backed by a real file that is present and matches what we hold. */
  | "linked"
  /** Came from disk, but the original is gone. Saving needs a new location. */
  | "orphaned"
  /** Disk moved on while we held unsaved edits; two real versions exist. */
  | "conflict";

export function diskLinkState(
  stub: Pick<
    StirlingFileStub,
    "localFilePath" | "orphanedFilePath" | "diskConflictAt"
  >,
): DiskLinkState {
  if (stub.localFilePath) {
    return stub.diskConflictAt ? "conflict" : "linked";
  }
  return stub.orphanedFilePath ? "orphaned" : "none";
}

/**
 * Did the disk file move on since we last read it?
 *
 * A record with no baseline predates disk sync (or was written by a build that
 * did not stamp one), so we cannot prove its copy is current - re-read it once
 * and let the read stamp a baseline. Size alone settles it when the platform
 * gives us no mtime.
 */
export function hasDiskChanged(
  stub: Pick<StirlingFileStub, "diskSyncedSize" | "diskSyncedModifiedMs">,
  state: DiskFileState,
): boolean {
  if (stub.diskSyncedSize == null || stub.diskSyncedModifiedMs == null) {
    return true;
  }
  if (state.size !== stub.diskSyncedSize) return true;
  if (state.modifiedMs === 0) return false;
  return state.modifiedMs !== stub.diskSyncedModifiedMs;
}

/** The fields a fresh disk read stamps onto the stub and the stored record. */
export function diskBaseline(
  state: DiskFileState,
): Pick<StirlingFileStub, "diskSyncedSize" | "diskSyncedModifiedMs"> {
  return {
    diskSyncedSize: state.size,
    diskSyncedModifiedMs: state.modifiedMs,
  };
}

/**
 * The stub fields that mark a file as having lost its disk original. Applied
 * both in storage and in the workbench so every surface agrees: the file list
 * badge, and - the part that actually matters - the save paths, which read the
 * in-memory stub and would otherwise keep writing to the deleted path.
 */
export function detachedFields(
  path: string | undefined,
): Pick<
  StirlingFileStub,
  | "localFilePath"
  | "diskSyncedSize"
  | "diskSyncedModifiedMs"
  | "diskConflictAt"
  | "orphanedFilePath"
> {
  return {
    localFilePath: undefined,
    diskSyncedSize: undefined,
    diskSyncedModifiedMs: undefined,
    diskConflictAt: undefined,
    orphanedFilePath: path,
  };
}

/**
 * Compare a linked stub against its file on disk and, when the disk copy has
 * moved on, read the live bytes.
 *
 * Unsaved in-app edits always win: we report a conflict rather than overwriting
 * work the user has not saved. An unreadable file (locked by another process,
 * permissions) reports `unchanged` so the stored copy still opens.
 */
export async function syncLinkedFileFromDisk(
  stub: StirlingFileStub,
): Promise<DiskSyncOutcome> {
  if (!desktopFileLinkingSupported || !stub.localFilePath) {
    return { status: "not-linked" };
  }

  const state = await getDiskFileState(stub.localFilePath);
  if (!state.exists) return { status: "missing" };
  if (!hasDiskChanged(stub, state)) return { status: "unchanged" };
  if (stub.isDirty) return { status: "conflict" };

  const bytes = await readFileFromDisk(stub.localFilePath);
  if (!bytes) return { status: "unchanged" };

  const file = new File([bytes], stub.name, {
    type: stub.type || "application/pdf",
    lastModified: state.modifiedMs || Date.now(),
  });
  return { status: "updated", file, state };
}

/**
 * Read the disk version of a file we are in conflict with, discarding the
 * unsaved in-app edits that were shadowing it. Only ever called from the
 * "Use disk version" action, never automatically - losing unsaved work has to
 * be something the user asked for.
 */
export async function loadDiskVersion(
  stub: StirlingFileStub,
): Promise<{ file: File; state: DiskFileState } | null> {
  if (!desktopFileLinkingSupported || !stub.localFilePath) return null;
  const state = await getDiskFileState(stub.localFilePath);
  if (!state.exists) return null;
  const bytes = await readFileFromDisk(stub.localFilePath);
  if (!bytes) return null;
  const file = new File([bytes], stub.name, {
    type: stub.type || "application/pdf",
    lastModified: state.modifiedMs || Date.now(),
  });
  return { file, state };
}

/**
 * Replace a record's stored bytes with what we just read from disk and stamp the
 * new baseline, so the next session starts from the current file.
 *
 * The cached page metadata and thumbnail describe the old bytes, so both are
 * cleared and regenerate on demand - keeping them would show the previous
 * document's pages under the new file.
 */
export async function persistDiskUpdate(
  fileId: FileId,
  file: File,
  state: DiskFileState,
  reloadedAt: number,
): Promise<void> {
  await fileStorage.updateFileMetadata(fileId, {
    data: file,
    size: file.size,
    lastModified: file.lastModified,
    quickKey: `${file.name}|${file.size}|${file.lastModified}`,
    thumbnail: undefined,
    thumbnailStoredAt: undefined,
    // The disk version is now the one on screen, so any earlier divergence is
    // settled and the pickup is recorded where the UI can show it.
    isDirty: false,
    diskConflictAt: undefined,
    diskReloadedAt: reloadedAt,
    ...diskBaseline(state),
  });
}

/**
 * After the app writes a file back to its disk path, the file on disk IS the
 * copy we hold, so re-stamp the baseline. Skipping this leaves the next open
 * believing the file changed externally and re-reading it for nothing.
 *
 * Returns the new baseline so the caller can also update the in-memory stub, or
 * null when there is nothing to stamp.
 */
export async function refreshDiskBaselineAfterSave(
  fileId: FileId,
  path: string,
): Promise<Pick<
  StirlingFileStub,
  "diskSyncedSize" | "diskSyncedModifiedMs" | "diskConflictAt"
> | null> {
  if (!desktopFileLinkingSupported) return null;
  const state = await getDiskFileState(path);
  if (!state.exists) return null;
  // Writing our version out is one way of resolving a divergence, so the
  // conflict marker goes with it.
  const baseline = { ...diskBaseline(state), diskConflictAt: undefined };
  await fileStorage.updateFileMetadata(fileId, baseline);
  return baseline;
}

/** Drop a linked file whose disk original is gone, copy and all. */
export async function deleteVanishedFile(fileId: FileId): Promise<void> {
  try {
    await fileStorage.deleteStirlingFile(fileId);
  } catch (error) {
    console.error("[diskFileSync] Failed to delete vanished file:", error);
  }
}

/**
 * Write an orphaned file somewhere new, then re-link it there. This is what the
 * "Save as…" action on the deleted-on-disk toast runs: the user is told the
 * original is gone, and the toast can act on it rather than leaving them to
 * find the save command and discover the file picker for themselves.
 *
 * Returns the new path, or null if the user cancelled or the save failed.
 */
export async function saveOrphanAsCopy(
  stub: StirlingFileStub,
): Promise<{ path: string; updates: Partial<StirlingFileStub> } | null> {
  try {
    // Only the export gateway is lazy - it is heavy and this path is rare.
    // fileStorage is already a module-level import.
    const { downloadFileWithPolicy } =
      await import("@app/services/exportWithPolicy");
    const file = await fileStorage.getStirlingFile(stub.id);
    if (!file) return null;

    // No localPath, so this always prompts for a location - which is the point.
    const result = await downloadFileWithPolicy({
      data: file,
      filename: stub.name,
      fileId: stub.id,
    });
    if (result.cancelled || !result.savedPath) return null;

    const state = await getDiskFileState(result.savedPath);
    const updates: Partial<StirlingFileStub> = {
      localFilePath: result.savedPath,
      orphanedFilePath: undefined,
      diskConflictAt: undefined,
      isDirty: false,
      ...(state.exists ? diskBaseline(state) : {}),
    };
    await fileStorage.updateFileMetadata(stub.id, updates);
    return { path: result.savedPath, updates };
  } catch (error) {
    console.error("[diskFileSync] Save as copy failed:", error);
    return null;
  }
}

/**
 * Best-effort translation without a hard dependency on i18n being initialised —
 * this module runs from storage/hydration paths that have no React context. The
 * English default is already interpolated, so an untranslated toast still reads
 * correctly. Mirrors the approach in specialErrorToasts.
 */
function translate(
  key: string,
  defaultValue: string,
  params?: Record<string, string>,
): string {
  try {
    const i18next = (globalThis as Record<string, any>)?.i18next;
    if (i18next && typeof i18next.t === "function") {
      return i18next.t(key, { defaultValue, ...params });
    }
  } catch {
    /* translation is best-effort; the English default still reads fine */
  }
  return defaultValue;
}

interface ToastSpec {
  title: string;
  body: string;
  durationMs?: number;
  isPersistentPopup?: boolean;
  alertType?: "warning" | "neutral";
  buttonText?: string;
  buttonCallback?: () => void;
}

/**
 * Toast lazily. This module sits on the hydration path, and the toast barrel
 * pulls in the whole icon set - importing it eagerly cost every file open ~3s of
 * module load for a notification that almost never fires.
 */
function toast({ alertType = "warning", ...options }: ToastSpec): void {
  void import("@app/components/toast")
    .then(({ alert }) => alert({ alertType, expandable: false, ...options }))
    .catch((error) => console.error("[diskFileSync] toast failed:", error));
}

/**
 * Tell the user a file they were opening no longer exists. This is the race the
 * list-time prune cannot catch: the file was there when the list was drawn and
 * was deleted before they clicked it.
 *
 * Nothing to offer here: the file is gone and its copy went with it, so this
 * one stays a plain notice.
 */
export function notifyFileVanished(name: string): void {
  toast({
    title: translate("desktopFileLink.missing.title", "File no longer exists"),
    body: translate(
      "desktopFileLink.missing.body",
      `"${name}" has been deleted or moved on disk, so it has been removed from your files.`,
      { name },
    ),
    durationMs: 8000,
  });
}

/**
 * Tell the user a file they still have open has been deleted on disk. It stays
 * open and keeps its contents, but it is no longer backed by anything, so the
 * next save has to go somewhere new.
 *
 * This is an unresolved decision, not an event, so the toast stays until it is
 * dealt with and carries the action that deals with it. Telling someone to save
 * without saying they will be asked for a new location makes the file picker
 * read as an error.
 */
export function notifyOpenFileDeleted(
  names: string[],
  onSaveAs?: () => void,
): void {
  const single = names.length === 1;
  const label = single ? `"${names[0]}"` : `${names.length} files`;
  toast({
    title: translate(
      "desktopFileLink.openDeleted.title",
      "File deleted on disk",
    ),
    body: translate(
      "desktopFileLink.openDeleted.body",
      `${label} no longer exists on disk. It is still open here - saving will ask you for a new location.`,
      { label },
    ),
    isPersistentPopup: true,
    ...(onSaveAs && single
      ? {
          buttonText: translate("desktopFileLink.saveAs", "Save as…"),
          buttonCallback: onSaveAs,
        }
      : {}),
  });
}

/**
 * Tell the user their unsaved edits are shadowing a newer file on disk.
 *
 * Keeping theirs is the safe default and is what already happened, so the
 * action offered is the reversal. Announcing a fork with no way to resolve it
 * leaves the user to work out for themselves which version they are looking at.
 */
export function notifyDiskConflict(name: string, onUseDisk?: () => void): void {
  toast({
    title: translate("desktopFileLink.conflict.title", "File changed on disk"),
    body: translate(
      "desktopFileLink.conflict.body",
      `"${name}" changed on disk, but you have unsaved changes here. Your version is being kept - saving will overwrite the file on disk.`,
      { name },
    ),
    isPersistentPopup: true,
    ...(onUseDisk
      ? {
          buttonText: translate(
            "desktopFileLink.useDiskVersion",
            "Use disk version",
          ),
          buttonCallback: onUseDisk,
        }
      : {}),
  });
}

/**
 * Say that an external edit was picked up. Silently swapping the bytes is the
 * right default - it is what "the file on disk is the truth" means - but doing
 * it with no trace at all leaves someone who did not expect the change unable
 * to tell whose version is on screen.
 */
export function notifyDiskReloaded(name: string): void {
  toast({
    alertType: "neutral",
    title: translate("desktopFileLink.reloaded.title", "Updated from disk"),
    body: translate(
      "desktopFileLink.reloaded.body",
      `"${name}" changed on disk and has been reloaded.`,
      { name },
    ),
    durationMs: 6000,
  });
}
