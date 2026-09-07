import { useEffect, useRef } from "react";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
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

  const paths = [
    ...new Set(
      fileStubs
        .map((stub) => stub.localFilePath)
        .filter((path): path is string => Boolean(path)),
    ),
  ].sort();
  // Re-registered whenever the linked set changes. JSON rather than a joined
  // string: no separator character is safe inside Windows paths.
  const watchKey = JSON.stringify(paths);

  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  useEffect(() => {
    void watchDiskPaths(pathsRef.current);
  }, [watchKey]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      const changed = [...pending];
      pending.clear();
      if (changed.length > 0) void actions.resyncDiskPaths(changed);
    };

    void onDiskFilesChanged((changed) => {
      for (const path of changed) pending.add(path);
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

  const unavailableRef = useRef<string[]>([]);
  unavailableRef.current = [
    ...new Set(
      fileStubs
        .filter((stub) => stub.diskUnavailableReason && stub.localFilePath)
        .map((stub) => stub.localFilePath!),
    ),
  ];

  useEffect(() => {
    const recheck = () => {
      if (unavailableRef.current.length > 0) {
        void actions.resyncDiskPaths(unavailableRef.current);
      }
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [actions]);

  // outlive the files it was watching for.
  useEffect(() => () => void watchDiskPaths([]), []);
}
