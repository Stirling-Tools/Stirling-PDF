import { StirlingFileStub, FileId } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import {
  desktopFileLinkingSupported,
  pathExistsOnDisk,
} from "@app/services/desktopFileLink";
import { detachedFields } from "@app/services/diskFileSync";

/** Reconciles the file list against disk so a file deleted outside the app never shows as available;
 *  the open path re-checks for the delete-after-draw race. No-op off desktop. */

/** True for real local IndexedDB records; ephemeral `server-`/`shared-` stubs have no disk link. */
export function hasLocalRecord(stub: StirlingFileStub): boolean {
  return !stub.id.startsWith("server-") && !stub.id.startsWith("shared-");
}

/** Unedited v1 holds the same bytes as disk, so losing it loses nothing unique.
 *  Non-leaf is excluded: it is the version-history root "revert to original" needs. */
export function isPristineLocalPassthrough(stub: StirlingFileStub): boolean {
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
  /** The now-dead disk path, so the caller can record it as the orphaned path. */
  path: string;
}

export interface PruneOptions {
  /** Files open in the workbench. Deleting one would leave an on-screen document existing
   *  nowhere, so open files are detached rather than deleted whatever their edit state. */
  openFileIds?: ReadonlySet<FileId>;
  /** Open files whose disk original vanished. The caller MUST apply {@link detachedFields} to its
   *  own stubs: save paths read the workbench stub and would keep writing to the deleted path. */
  onOpenFilesDetached?: (files: DetachedOpenFile[]) => void;
}

/** Local-only stubs with a dead `localFilePath`: pristine passthroughs are deleted, the rest are
 *  detached (old path kept for the UI). Server-backed skipped - the server may hold the only copy. */
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
