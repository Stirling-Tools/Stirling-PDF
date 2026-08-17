import { StirlingFileStub, FileId } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import {
  desktopFileLinkingSupported,
  pathExistsOnDisk,
} from "@app/services/desktopFileLink";
import { detachedFields } from "@app/services/diskFileSync";

/**
 * Reconciles the file list against disk before the user sees it, so a file
 * deleted outside the app never shows up as available. The open path re-checks
 * for the race where a file is deleted after the list is drawn.
 *
 * No-op off the desktop app, where there is no disk file to have lost.
 */

/**
 * True for an entry backed by a real local IndexedDB record, false for the
 * ephemeral `server-`/`shared-` stubs synthesised from server storage. Only
 * local records can have a disk link to reconcile.
 */
export function hasLocalRecord(stub: StirlingFileStub): boolean {
  return !stub.id.startsWith("server-") && !stub.id.startsWith("shared-");
}

/**
 * A local-only entry is a pristine passthrough of its disk file - same bytes on
 * both sides - only if it is a v1 with no in-app edits. When its disk file
 * disappears there is nothing unique to keep, so it goes.
 *
 * A non-leaf is excluded even though it fits that description: it is the root of
 * a version history that later versions still point at, and deleting it takes
 * "revert to original" with it. Its bytes are the only remaining copy of where
 * the user's work started, which is exactly the thing not to throw away.
 */
function isPristineLocalPassthrough(stub: StirlingFileStub): boolean {
  return (
    !stub.isDirty &&
    stub.isLeaf !== false &&
    (stub.versionNumber ?? 1) === 1 &&
    (stub.toolHistory?.length ?? 0) === 0
  );
}

/** A file that lost its disk original while the user had it open. */
export interface DetachedOpenFile {
  id: FileId;
  name: string;
  /** Where it used to live, so the caller can record it as the orphaned path. */
  path: string;
}

export interface PruneOptions {
  /**
   * Files currently open in the workbench. Deleting one of these would leave a
   * document on screen that has quietly stopped existing anywhere - still
   * editable, but gone from the file list and gone for good at the next
   * restart. Open files are therefore detached rather than deleted, whatever
   * their edit state, so what is on screen is always still somewhere.
   */
  openFileIds?: ReadonlySet<FileId>;
  /**
   * Open files whose disk original vanished. The caller MUST apply
   * {@link detachedFields} to its own copy of these stubs: the save paths read
   * the workbench stub, not this list, and would otherwise go on writing to the
   * path the user just deleted instead of asking for a new one.
   */
  onOpenFilesDetached?: (files: DetachedOpenFile[]) => void;
}

/**
 * Reconcile LOCAL-ONLY entries against the disk files they link to. Server-backed
 * entries are skipped: the server may hold the only remaining copy, and nothing
 * here can confirm that, so their dead disk link is left alone.
 *
 * For each local-only stub whose `localFilePath` no longer exists on disk:
 *  - open in the workbench → KEPT, link detached (see {@link PruneOptions}).
 *  - version-history root  → KEPT, link detached (later versions still need it).
 *  - pristine passthrough  → removed from the list AND from IndexedDB.
 *  - edited / dirty        → KEPT, dead `localFilePath` cleared (so there is no
 *    broken save-in-place; Ctrl+S falls back to Save As).
 *
 * Detached files keep the path they used to point at, so the UI can go on saying
 * "not on disk" once the toast announcing it has gone.
 */
export async function pruneMissingRecentFiles(
  stubs: StirlingFileStub[],
  options: PruneOptions = {},
): Promise<StirlingFileStub[]> {
  if (!desktopFileLinkingSupported) return stubs;

  const linked = stubs.filter(
    (stub) =>
      stub.localFilePath && !stub.remoteStorageId && hasLocalRecord(stub),
  );
  if (linked.length === 0) return stubs;

  const present = await Promise.all(
    linked.map((stub) => pathExistsOnDisk(stub.localFilePath!)),
  );

  const openIds = options.openFileIds;
  const toDelete: FileId[] = [];
  const toDetach: StirlingFileStub[] = [];
  const detachedOpen: DetachedOpenFile[] = [];
  linked.forEach((stub, i) => {
    if (present[i]) return;
    if (openIds?.has(stub.id)) {
      toDetach.push(stub);
      detachedOpen.push({
        id: stub.id,
        name: stub.name,
        path: stub.localFilePath!,
      });
    } else if (isPristineLocalPassthrough(stub)) {
      toDelete.push(stub.id);
    } else {
      toDetach.push(stub);
    }
  });

  if (detachedOpen.length > 0) {
    options.onOpenFilesDetached?.(detachedOpen);
  }

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
      toDetach.map((stub) =>
        fileStorage
          .updateFileMetadata(stub.id, detachedFields(stub.localFilePath))
          .catch((error) =>
            console.error("[pruneMissingRecentFiles] detach failed:", error),
          ),
      ),
    );
  }

  const deleteSet = new Set<FileId>(toDelete);
  const detachSet = new Map<FileId, string | undefined>(
    toDetach.map((stub) => [stub.id, stub.localFilePath]),
  );
  return stubs
    .filter((stub) => !deleteSet.has(stub.id))
    .map((stub) =>
      detachSet.has(stub.id)
        ? { ...stub, ...detachedFields(detachSet.get(stub.id)) }
        : stub,
    );
}
