import { StirlingFileStub, FileId } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import {
  desktopFileLinkingSupported,
  pathExistsOnDisk,
} from "@app/services/desktopFileLink";

/**
 * True for a recents entry backed by a real local IndexedDB record, false for
 * the ephemeral `server-`/`shared-` stubs synthesised from server storage (which
 * have no IDB row). Desktop recents show only files with a local record; the
 * server-only ones belong in the My Files view.
 */
export function hasLocalRecord(stub: StirlingFileStub): boolean {
  return !stub.id.startsWith("server-") && !stub.id.startsWith("shared-");
}

/**
 * A local-only recent is a pristine passthrough of its disk file — identical
 * bytes on disk and in IndexedDB — only if it's a v1 with no in-app edits. When
 * its disk file disappears there's nothing unique to keep, so it's deleted.
 * Otherwise (unsaved edits, or a later/tool version) the IndexedDB copy may be
 * the only one left, so it's KEPT with just the dead disk link detached.
 */
function isPristineLocalPassthrough(stub: StirlingFileStub): boolean {
  return (
    !stub.isDirty &&
    (stub.versionNumber ?? 1) === 1 &&
    (stub.toolHistory?.length ?? 0) === 0
  );
}

/**
 * Reconcile LOCAL-ONLY desktop recents against the disk files they link to.
 * Server-backed recents are intentionally left untouched here — they're handled
 * after the server fetch by {@link reconcileServerBackedRecents}, which can
 * confirm the file still exists remotely before dropping the local copy.
 *
 * For each local-only stub whose `localFilePath` no longer exists on disk:
 *  - pristine passthrough → removed from recents + IndexedDB.
 *  - edited / dirty       → KEPT, dead `localFilePath` cleared (no broken "Show
 *    in folder"; Ctrl+S falls back to Save As).
 * No-op off the desktop app.
 */
export async function pruneMissingRecentFiles(
  stubs: StirlingFileStub[],
): Promise<StirlingFileStub[]> {
  if (!desktopFileLinkingSupported) return stubs;

  const linked = stubs.filter(
    (stub) => stub.localFilePath && !stub.remoteStorageId,
  );
  if (linked.length === 0) return stubs;

  const present = await Promise.all(
    linked.map((stub) => pathExistsOnDisk(stub.localFilePath!)),
  );

  const toDelete: FileId[] = [];
  const toDetach: FileId[] = [];
  linked.forEach((stub, i) => {
    if (present[i]) return;
    if (isPristineLocalPassthrough(stub)) toDelete.push(stub.id);
    else toDetach.push(stub.id);
  });

  if (toDelete.length === 0 && toDetach.length === 0) return stubs;

  if (toDelete.length > 0) {
    try {
      await fileStorage.deleteMultipleStirlingFiles(toDelete);
    } catch (error) {
      console.error("[pruneMissingRecentFiles] delete failed:", error);
    }
  }
  if (toDetach.length > 0) {
    await Promise.all(
      toDetach.map((id) =>
        fileStorage
          .updateFileMetadata(id, { localFilePath: undefined })
          .catch((error) =>
            console.error("[pruneMissingRecentFiles] detach failed:", error),
          ),
      ),
    );
  }

  const deleteSet = new Set<FileId>(toDelete);
  const detachSet = new Set<FileId>(toDetach);
  return stubs
    .filter((stub) => !deleteSet.has(stub.id))
    .map((stub) =>
      detachSet.has(stub.id) ? { ...stub, localFilePath: undefined } : stub,
    );
}

/**
 * When a server-uploaded recent's local disk original has been deleted, drop its
 * LOCAL copy so the file becomes a pure server file: it leaves the (local)
 * recents but remains under My Files and stays downloadable from the server.
 * Only files the server CONFIRMS it still holds (via `serverHasFile`) and with
 * no unsaved local edits are demoted, so the last copy is never lost.
 *
 * Returns the deleted local ids so the caller can drop them from the list this
 * pass. No-op off the desktop app.
 */
export async function reconcileServerBackedRecents(
  stubs: StirlingFileStub[],
  serverHasFile: (remoteStorageId: number) => boolean,
): Promise<FileId[]> {
  if (!desktopFileLinkingSupported) return [];

  const candidates = stubs.filter(
    (stub) =>
      typeof stub.remoteStorageId === "number" &&
      serverHasFile(stub.remoteStorageId) &&
      stub.localFilePath &&
      !stub.isDirty,
  );
  if (candidates.length === 0) return [];

  const present = await Promise.all(
    candidates.map((stub) => pathExistsOnDisk(stub.localFilePath!)),
  );
  const gone = candidates.filter((_, i) => !present[i]);
  if (gone.length === 0) return [];

  const removedIds = gone.map((stub) => stub.id);
  try {
    await fileStorage.deleteMultipleStirlingFiles(removedIds);
  } catch (error) {
    // If we couldn't remove the local copy, don't drop it from the list either.
    console.error("[reconcileServerBackedRecents] delete failed:", error);
    return [];
  }

  return removedIds;
}
