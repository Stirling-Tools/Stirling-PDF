import { FileId, StirlingFileStub } from "@editor/types/fileContext";
import type {
  OpenDecision,
  ReconcilePort,
} from "@editor-core/contexts/file/storedFileReconciler";
import {
  syncLinkedFileFromDisk,
  persistDiskUpdate,
  deleteVanishedFile,
  detachedFields,
  diskBaseline,
  loadDiskVersion,
  refreshDiskBaselineAfterSave,
  isSelfWrite,
  notifyFileVanished,
  notifyDiskReloaded,
  notifyDiskTooLarge,
  notifyOpenFileDeleted,
  saveOrphanAsCopy,
} from "@editor/services/diskFileSync";
import {
  getDiskFileState,
  type PresentDiskFileState,
} from "@editor/services/desktopFileLink";
import { sourcePathForFile } from "@editor/services/fileImportPaths";
import { isPristineLocalPassthrough } from "@editor/services/pruneMissingRecentFiles";
import {
  cancelDiskConflict,
  requestDiskConflictChoice,
} from "@editor/services/diskConflictPrompt";
import { hasUnsavedWork } from "@editor/services/unsavedWork";

export type { OpenDecision, ReconcilePort };

// Desktop side of the reconcile seam: here a stored record is a cache of a file
// on disk. Opening a record re-checks its content against disk; while a file is
// open, only the loss of its original is tracked.

/** Take the disk version of a conflicted file, discarding the unsaved in-app
 *  edits shadowing it. Only reachable from the conflict modal's action. */
async function useDiskVersion(
  stub: StirlingFileStub,
  port: ReconcilePort,
): Promise<void> {
  const loaded = await loadDiskVersion(stub);
  if (!loaded) return;
  const { file, state } = loaded;
  const reloadedAt = Date.now();
  port.putFile(stub.id, file);
  await persistDiskUpdate(stub.id, file, state, reloadedAt);
  // Must follow putFile: the workbench drops updates for a file it cannot find.
  port.updateStub(stub.id, pickedUpFields(file, state, reloadedAt));
  // pickedUpFields cleared the cached page data; without this the editors lay
  // out from a placeholder and never get the real document back.
  port.reprocessFile(stub.id);
}

/** Fields marking a picked-up disk read, shared by both reconcile paths. */
function pickedUpFields(
  file: File,
  state: PresentDiskFileState,
  reloadedAt: number,
): Partial<StirlingFileStub> {
  return {
    size: file.size,
    lastModified: file.lastModified,
    // The cached page data describes the previous bytes.
    processedFile: undefined,
    thumbnailUrl: undefined,
    isDirty: false,
    diskConflictAt: undefined,
    diskReloadedAt: reloadedAt,
    ...diskBaseline(state),
  };
}

// A record's link to its disk original is stamped long after the record was
// stored, so a change to any of these fields is mirrored back into IndexedDB.
// In memory only, the link would die on reload.
const DISK_LINK_FIELDS = [
  "localFilePath",
  "isDirty",
  "diskSyncedSize",
  "diskSyncedModifiedMs",
  "orphanedFilePath",
  "diskConflictAt",
  "diskReloadedAt",
] as const satisfies readonly (keyof StirlingFileStub)[];

export function persistedSourceFields(
  updates: Partial<StirlingFileStub>,
): Partial<StirlingFileStub> | null {
  const persisted: Partial<StirlingFileStub> = {};
  let found = false;
  for (const field of DISK_LINK_FIELDS) {
    if (field in updates) {
      // Object.assign-style copy keeps each field's own type.
      (persisted as Record<string, unknown>)[field] = updates[field];
      found = true;
    }
  }
  return found ? persisted : null;
}

export function inheritedSourceLink(
  sourceStub: StirlingFileStub,
): Partial<StirlingFileStub> {
  if (!sourceStub.localFilePath) return {};
  return {
    localFilePath: sourceStub.localFilePath,
    // Deriving the file wrote nothing to disk, so the source's baseline still
    // describes it. Without one, the next open reads the link as changed and
    // claims a false conflict.
    diskSyncedSize: sourceStub.diskSyncedSize,
    diskSyncedModifiedMs: sourceStub.diskSyncedModifiedMs,
  };
}

export async function sourceLinkForNewFile(
  file: File,
): Promise<Partial<StirlingFileStub>> {
  const localFilePath = await sourcePathForFile(file);
  if (!localFilePath) return {};
  // Baseline what disk held at read time; without it the next open has nothing
  // to compare against and re-reads the file needlessly.
  const state = await getDiskFileState(localFilePath);
  return {
    localFilePath,
    ...(state.availability === "present" ? diskBaseline(state) : {}),
  };
}

export async function reconcileBeforeOpen(
  stub: StirlingFileStub,
  port: ReconcilePort,
): Promise<OpenDecision> {
  const fileId = stub.id;
  const outcome = await syncLinkedFileFromDisk(stub, hasUnsavedWork());

  if (outcome.status === "missing") {
    // Only an unedited v1 passthrough holds nothing the disk file did not;
    // anything else is detached, never deleted.
    if (isPristineLocalPassthrough(stub)) {
      console.warn(
        `[Reconcile] ${stub.name} (${fileId}) no longer exists at ${stub.localFilePath}; removing it`,
      );
      notifyFileVanished(stub.name);
      void deleteVanishedFile(fileId);
      return { drop: true };
    }
    return {
      updates: detachedFields(stub.localFilePath),
      afterPublish: () => notifyOpenFileDeleted([stub.name]),
    };
  }

  if (outcome.status === "updated") {
    // An edit committed while we were reading disk must not be discarded by a
    // decision taken before it existed.
    if (port.getStub(fileId)?.isDirty || hasUnsavedWork()) return {};
    const { file, state } = outcome;
    const reloadedAt = Date.now();
    void persistDiskUpdate(fileId, file, state, reloadedAt).catch((error) =>
      console.error(
        `[Reconcile] Failed to persist disk update for ${fileId}:`,
        error,
      ),
    );
    return {
      file,
      updates: pickedUpFields(file, state, reloadedAt),
      contentReplaced: true,
      // Swapping the bytes under the user is the right default, but doing it
      // with no trace leaves them unable to tell whose version they have.
      afterPublish: () => notifyDiskReloaded(stub.name),
    };
  }

  const conflictAt = outcome.status === "conflict" ? Date.now() : undefined;
  const updates: Partial<StirlingFileStub> = {
    ...(conflictAt ? { diskConflictAt: conflictAt } : {}),
    diskUnavailableReason:
      outcome.status === "unavailable" ? outcome.reason : undefined,
  };

  if (conflictAt) {
    return {
      updates,
      afterPublish: () =>
        requestDiskConflictChoice({
          fileId,
          name: stub.name,
          onUseDisk: () => void useDiskVersion(stub, port),
        }),
    };
  }

  if (outcome.status === "too-large") {
    // The copy served is knowingly stale: too big to re-read unasked. The
    // baseline is left un-stamped so every reopen asks again, which only works
    // if the ask is visible.
    return {
      updates,
      afterPublish: () =>
        notifyDiskTooLarge(stub.name, () => void useDiskVersion(stub, port)),
    };
  }

  return { updates };
}

// Editors and sync clients that delete the original before moving the new file
// in leave the path empty for a moment, and a detach is not undone.
const GONE_RECHECK_MS = 500;

// The watcher and the focus re-check fire together when the user changes a
// file elsewhere and switches back. A record already being checked is left to
// that pass, so one loss is not detached and reported twice.
const checking = new Set<FileId>();

/** Re-check one open record's disk original. Returns it when the original is
 *  gone, so the caller can report a whole batch's losses in one toast.
 *
 *  Only whether the file is still there is checked. What is on screen is never
 *  replaced or questioned while it is open: a reload resets the viewer and any
 *  editor state the app cannot count as unsaved, and sync clients and indexers
 *  touch files constantly. An edit made elsewhere is picked up the next time
 *  the file is opened. */
async function resyncRecord(
  stub: StirlingFileStub,
  port: ReconcilePort,
): Promise<StirlingFileStub | null> {
  const fileId = stub.id;
  const path = stub.localFilePath;
  // Our own save can leave the path briefly empty or locked.
  if (!path || isSelfWrite(path) || checking.has(fileId)) return null;
  checking.add(fileId);
  try {
    return await checkOriginal(stub, path, port);
  } finally {
    checking.delete(fileId);
  }
}

async function checkOriginal(
  stub: StirlingFileStub,
  path: string,
  port: ReconcilePort,
): Promise<StirlingFileStub | null> {
  const fileId = stub.id;
  let state = await getDiskFileState(path);
  if (state.availability === "gone") {
    await new Promise((resolve) => setTimeout(resolve, GONE_RECHECK_MS));
    state = await getDiskFileState(path);
  }

  if (state.availability === "gone") {
    // A save may have started during the wait, or an earlier pass detached the
    // record after this pass listed the stubs.
    if (isSelfWrite(path) || port.getStub(fileId)?.localFilePath !== path) {
      return null;
    }
    // Never delete what is on screen: cutting the link leaves the document
    // intact and makes the next save ask for somewhere to put it.
    port.updateStub(fileId, detachedFields(path));
    return stub;
  }

  if (state.availability === "unavailable") {
    port.updateStub(fileId, { diskUnavailableReason: state.reason });
    return null;
  }

  if (stub.diskUnavailableReason) {
    port.updateStub(fileId, { diskUnavailableReason: undefined });
  }
  return null;
}

export async function reconcileOpenFiles(
  locations: string[],
  port: ReconcilePort,
): Promise<void> {
  const wanted = new Set(locations);
  const byPath = new Map<string, StirlingFileStub[]>();
  for (const stub of port.listStubs()) {
    if (!stub.localFilePath || !wanted.has(stub.localFilePath)) continue;
    const held = byPath.get(stub.localFilePath);
    if (held) held.push(stub);
    else byPath.set(stub.localFilePath, [stub]);
  }

  const detached: StirlingFileStub[] = [];
  for (const stubs of byPath.values()) {
    for (const stub of stubs) {
      const lost = await resyncRecord(stub, port);
      if (lost) detached.push(lost);
    }
  }

  if (detached.length === 0) return;
  const single = detached.length === 1 ? detached[0] : undefined;
  notifyOpenFileDeleted(
    detached.map((stub) => stub.name),
    single
      ? () => {
          void saveOrphanAsCopy(single).then((saved) => {
            if (saved) port.updateStub(single.id, saved.updates);
          });
        }
      : undefined,
  );
}

export function noteFileSaved(
  fileId: FileId,
  updates: Partial<StirlingFileStub>,
  applyUpdates: (updates: Partial<StirlingFileStub>) => void,
): void {
  // A save just made disk and app agree, so re-baseline against the file we
  // wrote. Without this the next open reads it back as an external change.
  if (updates.isDirty !== false || !updates.localFilePath) return;
  void refreshDiskBaselineAfterSave(fileId, updates.localFilePath)
    .then((baseline) => {
      if (baseline) applyUpdates(baseline);
    })
    .catch((error) =>
      console.error(`[Reconcile] Failed to re-baseline ${fileId}:`, error),
    );
}

export function forgetFile(fileId: FileId): void {
  // A queued conflict for a file that is gone would name it in a blocking modal
  // whose Use-disk button then no-ops against the workbench's own guard.
  cancelDiskConflict(fileId);
}
