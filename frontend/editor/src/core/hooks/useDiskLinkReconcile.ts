import { useCallback, useRef } from "react";
import { FileId } from "@app/types/fileContext";
import { useAllFiles, useFileActions } from "@app/contexts/file/fileHooks";
import {
  detachedFields,
  notifyOpenFileDeleted,
  saveOrphanAsCopy,
} from "@app/services/diskFileSync";
import type { DetachedOpenFile } from "@app/services/pruneMissingRecentFiles";

// Shared reconcile wiring for the files page and the recent-files list: the detach
// must reach the workbench stub too, or saves keep writing to the deleted path.

// Both list builders can be in flight at once; ids are remembered briefly so the
// same loss is reported once.
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
      // Cut the link in the workbench too, so Ctrl+S becomes Save As in this
      // session rather than only after a restart.
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
