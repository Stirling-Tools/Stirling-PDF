import { FileId, StirlingFileStub } from "@app/types/fileContext";
import {
  DiskFileState,
  desktopFileLinkingSupported,
  getDiskFileState,
  readFileFromDisk,
} from "@app/services/desktopFileLink";
import { fileStorage } from "@app/services/fileStorage";

// Keeps desktop files 1:1 with disk: the stored copy is a cache, not truth, so
// every read re-checks disk. No-op off desktop, where the copy is the truth.

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

/** How a file stands relative to its disk original. Derived rather than stored
 *  so every surface gets the same answer instead of re-deriving it. */
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

/** Did disk change since our last read? No baseline means we cannot prove the
 *  copy is current, so re-read once; size settles it when mtime is missing. */
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

/** Fields marking a file as having lost its disk original. Applied in storage
 *  and the workbench so save paths stop writing to the deleted path. */
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

/** Compare a linked stub against disk and read live bytes when it moved on.
 *  Unsaved edits win (conflict); an unreadable file reports unchanged. */
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

/** Read the disk version, discarding unsaved in-app edits. Only from the "Use
 *  disk version" action - losing unsaved work must be the user's choice. */
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

/** Replace stored bytes with the disk read and re-stamp the baseline. Cached
 *  metadata and thumbnail describe the old bytes, so both are cleared. */
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

/** After a write-back, disk IS our copy, so re-stamp the baseline or the next
 *  open re-reads for nothing. Returns the new baseline, or null if none. */
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

/** Write an orphaned file somewhere new and re-link it; backs the toast's
 *  "Save as…" action. Returns the new path, or null if cancelled or failed. */
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

/** The bit of i18next this module needs, if it has been initialised at all. */
interface Translator {
  t: (key: string, options?: Record<string, unknown>) => string;
}

function isTranslator(value: unknown): value is Translator {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Translator).t === "function"
  );
}

/** Best-effort translation: runs from hydration paths with no i18n context,
 *  and the English default is already interpolated. */
function translate(
  key: string,
  defaultValue: string,
  params?: Record<string, string>,
): string {
  try {
    const i18next = (globalThis as Record<string, unknown>).i18next;
    if (isTranslator(i18next)) {
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

/** Lazy: this sits on the hydration path and the toast barrel pulls in the
 *  whole icon set, costing ~3s of module load per file open. */
function toast({ alertType = "warning", ...options }: ToastSpec): void {
  void import("@app/components/toast")
    .then(({ alert }) => alert({ alertType, expandable: false, ...options }))
    .catch((error) => console.error("[diskFileSync] toast failed:", error));
}

/** Tell the user a file they were opening is gone - the race the list-time
 *  prune cannot catch. Nothing to offer, so it stays a plain notice. */
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

/** An open file lost its disk original - an unresolved decision, not an event,
 *  so the toast persists and says saving will ask for a new location. */
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

/** Unsaved edits are shadowing a newer disk file. Keeping theirs already
 *  happened, so the action offered is the reversal, not a fork with no exit. */
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

/** Say an external edit was picked up: swapping bytes silently is right, but
 *  with no trace nobody can tell whose version is on screen. */
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
