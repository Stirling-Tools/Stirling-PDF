import { useEffect, useRef, useState } from "react";
import type { FileId } from "@app/types/file";
import { useFileManagement } from "@app/contexts/FileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import { readDiskFile } from "@app/services/localFolderContents";

const THUMBNAIL_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

// Global gate on concurrent lazy generations. Each one loads the file's FULL
// bytes from IndexedDB and renders a thumbnail — when a big list mounts (e.g. a
// 300-file folder drop), letting every row start at once stampedes IndexedDB
// and the main thread, exactly when uploads/policies are also working. Queue
// FIFO at a small concurrency instead; rows fill in progressively.
const LAZY_THUMB_CONCURRENCY = 2;
let activeLazyThumbs = 0;
const lazyThumbQueue: Array<() => Promise<void>> = [];

export function scheduleLazyThumb(task: () => Promise<void>): void {
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
  const attempted = useRef(false);
  const indexedDB = useIndexedDB();
  const { updateStirlingFileStub } = useFileManagement();

  useEffect(() => {
    if (thumbnailUrl) setThumb(thumbnailUrl);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (thumbnailUrl || attempted.current || size >= THUMBNAIL_SIZE_LIMIT)
      return;
    attempted.current = true;
    let cancelled = false;

    scheduleLazyThumb(async () => {
      // Row unmounted (or a hydration delivered the thumbnail) while this sat
      // in the queue — skip the expensive byte load entirely.
      if (cancelled) return;
      try {
        const file = await indexedDB.loadFile(fileId);
        if (!file || cancelled) return;
        const thumbnail = await generateThumbnailForFile(file);
        if (cancelled || !thumbnail) return;
        setThumb(thumbnail);
        void indexedDB.updateThumbnail(fileId, thumbnail);
        updateStirlingFileStub(fileId, { thumbnailUrl: thumbnail });
      } catch {
        // non-critical
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileId, size, thumbnailUrl, indexedDB, updateStirlingFileStub]);

  return thumb;
}

// ─── thumbnails for files listed straight off a mounted directory ─────────

/**
 * Cache keyed by path + mtime + size, so an unchanged file never renders
 * twice and an edited one re-renders. Bounded: a mounted Downloads folder can
 * list hundreds of files, and each generation reads the file's FULL bytes off
 * disk, so the cache is what makes revisits and re-sorts free.
 */
const diskThumbCache = new Map<string, string>();
const DISK_THUMB_CACHE_CAP = 300;

/**
 * Thumbnail for a disk-listed file, through the same generator and the same
 * concurrency gate as stored files — a mounted folder's rows fill in
 * progressively alongside everything else instead of stampeding the disk.
 * Returns undefined while pending, unsupported, or too large (placeholder
 * icon stays).
 */
export function useDiskThumbnail(entry: {
  path: string;
  name: string;
  sizeBytes: number;
  lastModified: number;
}): string | undefined {
  const key = `${entry.path}|${entry.lastModified}|${entry.sizeBytes}`;
  const [thumb, setThumb] = useState<string | undefined>(() => {
    const hit = diskThumbCache.get(key);
    return hit === "" ? undefined : hit;
  });

  useEffect(() => {
    const cached = diskThumbCache.get(key);
    if (cached !== undefined) {
      setThumb(cached === "" ? undefined : cached);
      return;
    }
    if (entry.sizeBytes >= THUMBNAIL_SIZE_LIMIT) return;
    let cancelled = false;
    scheduleLazyThumb(async () => {
      if (cancelled || diskThumbCache.has(key)) return;
      try {
        const file = await readDiskFile(entry);
        if (!file || cancelled) return;
        const url = await generateThumbnailForFile(file);
        if (diskThumbCache.size >= DISK_THUMB_CACHE_CAP) {
          // Maps iterate in insertion order; dropping the first entry makes
          // this FIFO — crude, but revisits re-generate rather than grow.
          const oldest = diskThumbCache.keys().next().value;
          if (oldest !== undefined) diskThumbCache.delete(oldest);
        }
        // "" is cached too: a failed/oversized render should not retry on
        // every re-mount of the same row.
        diskThumbCache.set(key, url);
        if (!cancelled && url) setThumb(url);
      } catch {
        diskThumbCache.set(key, "");
      }
    });
    return () => {
      cancelled = true;
    };
    // The key encodes every field of `entry` this effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return thumb;
}
