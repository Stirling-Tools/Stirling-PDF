import { useEffect, useRef } from "react";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import { FileId } from "@app/types/fileContext";
import {
  onDiskFilesChanged,
  watchDiskPaths,
} from "@app/services/desktopFileLink";

// Watches disk originals of open files: every other reconcile is user-triggered, so
// an edit or delete under an open file otherwise goes unnoticed until a rebuild.

// Saves arrive as bursts (truncate-then-write, or temp file renamed over the
// target); settling avoids reading a half-written PDF.
const SETTLE_MS = 400;

export function useDiskWatcher(): void {
  const { actions } = useFileActions();
  const { fileStubs } = useAllFiles();

  const linked = fileStubs
    .filter((stub) => stub.localFilePath)
    .map((stub) => ({ id: stub.id, path: stub.localFilePath! }));
  const paths = linked.map((entry) => entry.path).sort();
  // Re-registered whenever the linked set changes. JSON rather than a joined
  // string: no separator character is safe inside Windows paths.
  const watchKey = JSON.stringify(paths);

  // The handler and the watch effect read through refs, so neither is torn down
  // and rebuilt every time an unrelated stub field changes.
  const pathToIdRef = useRef(new Map<string, FileId>());
  pathToIdRef.current = new Map(linked.map((entry) => [entry.path, entry.id]));
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  useEffect(() => {
    void watchDiskPaths(pathsRef.current);
  }, [watchKey]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    // Ids seen since the last flush, deduped: one burst per file, one re-check.
    const pending = new Set<FileId>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      const ids = [...pending];
      pending.clear();
      if (ids.length > 0) void actions.resyncFilesFromDisk(ids);
    };

    void onDiskFilesChanged((changed) => {
      for (const path of changed) {
        const id = pathToIdRef.current.get(path);
        if (id) pending.add(id);
      }
      if (pending.size === 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SETTLE_MS);
    }).then((off) => {
      // The effect may have been torn down while the listener was registering.
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [actions]);

  // Stop watching when the window goes away, so the watcher thread does not
  // outlive the files it was watching for.
  useEffect(() => () => void watchDiskPaths([]), []);
}
