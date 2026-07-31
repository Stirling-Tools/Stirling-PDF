import { useEffect, useRef, useState } from "react";
import type { FileId } from "@app/types/file";
import { useFileManagement } from "@app/contexts/FileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";

const THUMBNAIL_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

// Global gate on concurrent lazy generations. Each one loads the file's FULL
// bytes from IndexedDB and renders a thumbnail — when a big list mounts (e.g. a
// 300-file folder drop), letting every row start at once stampedes IndexedDB
// and the main thread, exactly when uploads/policies are also working. Queue
// FIFO at a small concurrency instead; rows fill in progressively.
const LAZY_THUMB_CONCURRENCY = 2;
let activeLazyThumbs = 0;
const lazyThumbQueue: Array<() => Promise<void>> = [];

function scheduleLazyThumb(task: () => Promise<void>): void {
  lazyThumbQueue.push(task);
  drainLazyThumbQueue();
}

function drainLazyThumbQueue(): void {
  if (activeLazyThumbs >= LAZY_THUMB_CONCURRENCY) return;
  const next = lazyThumbQueue.shift();
  if (!next) return;
  activeLazyThumbs++;
  void next().finally(() => {
    activeLazyThumbs--;
    drainLazyThumbQueue();
  });
}

/**
 * Show the stub's thumbnail if present; otherwise pull bytes from IndexedDB,
 * generate one, persist it, and update the stub. Server-only files with no
 * cached bytes silently stay placeholder-only.
 */
export function useLazyThumbnail(
  fileId: FileId,
  size: number,
  thumbnailUrl?: string,
): string | undefined {
  const [thumb, setThumb] = useState<string | undefined>(thumbnailUrl);
  // Latched only once a generation actually finishes (or is ruled out), so a
  // re-render that cancels queued work doesn't leave the row permanently blank.
  const generated = useRef(false);
  const indexedDB = useIndexedDB();
  const { updateStirlingFileStub } = useFileManagement();
  // Held in a ref so their identity can't re-run the effect: a re-run cancels
  // the queued task, and the row would then be skipped forever.
  const depsRef = useRef({ indexedDB, updateStirlingFileStub });
  depsRef.current = { indexedDB, updateStirlingFileStub };

  useEffect(() => {
    if (thumbnailUrl) setThumb(thumbnailUrl);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (thumbnailUrl || generated.current || size >= THUMBNAIL_SIZE_LIMIT)
      return;
    let cancelled = false;

    scheduleLazyThumb(async () => {
      // Row unmounted (or a hydration delivered the thumbnail) while this sat
      // in the queue — skip the expensive byte load entirely.
      if (cancelled) return;
      try {
        const file = await depsRef.current.indexedDB.loadFile(fileId);
        if (cancelled) return;
        // No cached bytes to render from: don't queue this row again.
        if (!file) {
          generated.current = true;
          return;
        }
        const thumbnail = await generateThumbnailForFile(file);
        if (cancelled) return;
        generated.current = true;
        if (!thumbnail) return;
        setThumb(thumbnail);
        void depsRef.current.indexedDB.updateThumbnail(fileId, thumbnail);
        depsRef.current.updateStirlingFileStub(fileId, {
          thumbnailUrl: thumbnail,
        });
      } catch {
        // non-critical
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileId, size, thumbnailUrl]);

  return thumb;
}
