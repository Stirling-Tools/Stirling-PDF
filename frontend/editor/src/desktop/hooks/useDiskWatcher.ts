import { useEffect, useRef } from "react";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import { FileId } from "@app/types/fileContext";
import {
  onDiskFilesChanged,
  watchDiskPaths,
} from "@app/services/desktopFileLink";

/**
 * Watches the disk originals of every open file and reconciles as they change.
 *
 * Everything else in disk linking reconciles at a moment the user happens to
 * trigger - building the file list, or opening a file. A file edited or deleted
 * while it sits open in the workbench was therefore not noticed at all until
 * something else prompted a rebuild, so the app could show a document that had
 * stopped existing and let the user go on editing it.
 */

/**
 * Editors rarely write a file once: a save is often truncate-then-write, or a
 * temp file renamed over the target, which arrives as a burst. Waiting for the
 * burst to end avoids reading a half-written PDF.
 */
const SETTLE_MS = 400;

export function useDiskWatcher(): void {
  const { actions } = useFileActions();
  const { fileStubs } = useAllFiles();

  const linked = fileStubs
    .filter((stub) => stub.localFilePath)
    .map((stub) => ({ id: stub.id, path: stub.localFilePath! }));
  const paths = linked.map((entry) => entry.path).sort();
  // Re-registered whenever the linked set changes. The key is JSON rather than
  // a joined string: a separator would have to be a character that cannot occur
  // in a path, and on Windows very few candidates qualify.
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
