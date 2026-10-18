import { useCallback, useRef } from "react";
import { FileId } from "@app/types/fileContext";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import type { DetachedOpenFile } from "@app/services/pruneMissingRecentFiles";

// Wiring the file list and the recent-files list share for reconciling their
// records. Only the detach handler is build-specific; the open-file set the
// prune reads is the workbench's own and is always needed.

/** Test seam for the build that keeps state here; a no-op where none is kept. */
export function __resetDetachReports(): void {}

export function useDiskLinkReconcile() {
  const { fileIds } = useAllFiles();
  // Read through a ref so the returned callbacks stay stable - their consumers
  // re-run on identity change, which would loop on every workbench update.
  const openFileIdsRef = useRef<FileId[]>(fileIds);
  openFileIdsRef.current = fileIds;

  const onOpenFilesDetached = useCallback(
    (_files: DetachedOpenFile[]) => {},
    [],
  );

  return { openFileIdsRef, onOpenFilesDetached };
}
