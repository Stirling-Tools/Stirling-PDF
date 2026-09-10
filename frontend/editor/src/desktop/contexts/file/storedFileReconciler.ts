import { FileId, StirlingFileStub } from "@app/types/fileContext";
import type {
  OpenDecision,
  ReconcilePort,
} from "@core/contexts/file/storedFileReconciler";
import {
  syncLinkedFileFromDisk,
  persistDiskUpdate,
  deleteVanishedFile,
  detachedFields,
  diskBaseline,
  loadDiskVersion,
  refreshDiskBaselineAfterSave,
  notifyFileVanished,
  notifyDiskReloaded,
  notifyDiskTooLarge,
  notifyOpenFileDeleted,
  saveOrphanAsCopy,
} from "@app/services/diskFileSync";
import {
  getDiskFileState,
  type PresentDiskFileState,
} from "@app/services/desktopFileLink";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { isPristineLocalPassthrough } from "@app/services/pruneMissingRecentFiles";
import {
  cancelDiskConflict,
  requestDiskConflictChoice,
} from "@app/services/diskConflictPrompt";
import { hasUnsavedWork } from "@app/services/unsavedWork";

export type { OpenDecision, ReconcilePort };

// Desktop side of the reconcile seam: here a stored record is a cache of a file
// on disk, so every read re-checks disk and the workbench is told what changed.

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
  quickKey: string,
): Promise<Partial<StirlingFileStub>> {
  const localFilePath = pendingFilePathMappings.get(quickKey);
  if (!localFilePath) return {};
  pendingFilePathMappings.delete(quickKey);
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

/** Re-check one open record against disk. Returns it when its original is gone,
 *  so the caller can report a whole batch's losses in one toast. */
async function resyncRecord(
  stub: StirlingFileStub,
  port: ReconcilePort,
): Promise<StirlingFileStub | null> {
  const fileId = stub.id;
  const outcome = await syncLinkedFileFromDisk(stub, hasUnsavedWork());

  if (outcome.status === "missing") {
    // Never delete what is on screen: cutting the link leaves the document
    // intact and makes the next save ask for somewhere to put it.
    port.updateStub(fileId, detachedFields(stub.localFilePath));
    return stub;
  }

  if (outcome.status === "unavailable") {
    port.updateStub(fileId, { diskUnavailableReason: outcome.reason });
    return null;
  }

  if (stub.diskUnavailableReason) {
    port.updateStub(fileId, { diskUnavailableReason: undefined });
  }

  // Nothing to reconcile: the change on disk is the child that superseded this
  // version, and its bytes are not ours to replace.
  if (outcome.status === "superseded") return null;

  if (outcome.status === "too-large") {
    notifyDiskTooLarge(stub.name, () => void useDiskVersion(stub, port));
    return null;
  }

  if (outcome.status === "conflict") {
    // Already flagged; re-toasting on every write the other app makes would be
    // unusable.
    if (stub.diskConflictAt) return null;
    port.updateStub(fileId, { diskConflictAt: Date.now() });
    requestDiskConflictChoice({
      fileId,
      name: stub.name,
      onUseDisk: () => void useDiskVersion(stub, port),
    });
    return null;
  }

  if (outcome.status === "updated") {
    // The stat, the read and this commit are all awaited, so the decision was
    // made against a snapshot. Re-check before overwriting the user's bytes.
    const latest = port.getStub(fileId);
    if (
      !latest ||
      latest.isDirty ||
      hasUnsavedWork() ||
      latest.localFilePath !== stub.localFilePath
    ) {
      return null;
    }
    const { file, state } = outcome;
    const reloadedAt = Date.now();
    port.putFile(fileId, file);
    await persistDiskUpdate(fileId, file, state, reloadedAt);
    port.updateStub(fileId, pickedUpFields(file, state, reloadedAt));
    notifyDiskReloaded(stub.name);
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
