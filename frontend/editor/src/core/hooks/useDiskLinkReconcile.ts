import { useCallback, useRef } from "react";
import { FileId } from "@app/types/fileContext";
import { useAllFiles, useFileActions } from "@app/contexts/file/fileHooks";
import {
  detachedFields,
  notifyOpenFileDeleted,
  saveOrphanAsCopy,
} from "@app/services/diskFileSync";
import type { DetachedOpenFile } from "@app/services/pruneMissingRecentFiles";

/**
 * Shared wiring for the two places that reconcile the file list against disk
 * (the files page and the recent-files list).
 *
 * Both used to hand `pruneMissingRecentFiles` a bare toast callback, which left
 * the detach applied in IndexedDB and in the list they render, but NOT in the
 * workbench. Every save path - Ctrl+S, the workbench save buttons, the exit
 * warning - reads the workbench stub, so an open file whose original had been
 * deleted went on quietly writing itself back to the deleted path instead of
 * asking for a new location. That only came right after a reload.
 */

/**
 * Both list builders can be in flight at once, and each would report the same
 * loss. Ids are remembered briefly so the user is told once.
 */
const RECENTLY_REPORTED_MS = 5000;
const reportedAt = new Map<FileId, number>();

function claimReport(ids: FileId[], now: number): boolean {
  for (const [id, at] of reportedAt) {
    if (now - at > RECENTLY_REPORTED_MS) reportedAt.delete(id);
  }
  const fresh = ids.filter((id) => !reportedAt.has(id));
  ids.forEach((id) => reportedAt.set(id, now));
  return fresh.length > 0;
}

/** Test seam: the guard is module state and would leak between cases. */
export function __resetDetachReports(): void {
  reportedAt.clear();
}

export function useDiskLinkReconcile() {
  const { actions } = useFileActions();
  // Read through a ref so the returned callbacks stay stable - their consumers
  // re-run on identity change, which would loop on every workbench update.
  const { fileIds, fileStubs } = useAllFiles();
  const openFileIdsRef = useRef<FileId[]>(fileIds);
  openFileIdsRef.current = fileIds;
  const stubsRef = useRef(fileStubs);
  stubsRef.current = fileStubs;

  const onOpenFilesDetached = useCallback(
    (files: DetachedOpenFile[]) => {
      // Cut the link in the workbench too, so the save paths stop pointing at a
      // file that is not there. This is the part that makes Ctrl+S become
      // Save As in the session it happened, rather than after a restart.
      files.forEach((file) =>
        actions.updateStirlingFileStub(file.id, detachedFields(file.path)),
      );

      if (
        !claimReport(
          files.map((f) => f.id),
          Date.now(),
        )
      )
        return;

      const single = files.length === 1 ? files[0] : undefined;
      notifyOpenFileDeleted(
        files.map((f) => f.name),
        single
          ? () => {
              const stub = stubsRef.current.find((s) => s.id === single.id);
              if (!stub) return;
              void saveOrphanAsCopy(stub).then((saved) => {
                if (saved)
                  actions.updateStirlingFileStub(stub.id, saved.updates);
              });
            }
          : undefined,
      );
    },
    [actions],
  );

  return { openFileIdsRef, onOpenFilesDetached };
}
