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

// Stub updates go through the file context, and each one re-renders every
// consumer of the file list. A big folder filling in generates hundreds of
// thumbnails over minutes; flushing them in windows turns that into a handful
// of re-renders (React batches same-tick updates into one). The card itself
// paints immediately from its local state — only the shared stub waits.
const STUB_THUMB_FLUSH_MS = 500;
const pendingStubThumbs = new Map<
  FileId,
  { thumbnail: string; apply: (id: FileId, thumbnail: string) => void }
>();
let stubThumbFlushTimer: ReturnType<typeof setTimeout> | null = null;

function queueStubThumbUpdate(
  fileId: FileId,
  thumbnail: string,
  apply: (id: FileId, thumbnail: string) => void,
): void {
  pendingStubThumbs.set(fileId, { thumbnail, apply });
  stubThumbFlushTimer ??= setTimeout(() => {
    stubThumbFlushTimer = null;
    const batch = Array.from(pendingStubThumbs);
    pendingStubThumbs.clear();
    for (const [id, entry] of batch) entry.apply(id, entry.thumbnail);
  }, STUB_THUMB_FLUSH_MS);
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
        queueStubThumbUpdate(fileId, thumbnail, (id, url) =>
          updateStirlingFileStub(id, { thumbnailUrl: url }),
        );
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

// Keyed by path + mtime + size: an unchanged file never renders twice, an edited one does.
const diskThumbCache = new Map<string, string>();
// Bounded by bytes, not entries: image thumbnails are data URLs that track the
// source, so 300 photos would pin gigabytes of strings for the process lifetime.
const DISK_THUMB_CACHE_MAX_BYTES = 48 * 1024 * 1024;
let diskThumbCacheBytes = 0;

function cacheDiskThumb(key: string, url: string): void {
  const prior = diskThumbCache.get(key);
  if (prior !== undefined) diskThumbCacheBytes -= prior.length;
  while (
    diskThumbCacheBytes + url.length > DISK_THUMB_CACHE_MAX_BYTES &&
    diskThumbCache.size > 0
  ) {
    // Insertion order makes this FIFO; an evicted thumbnail re-renders on revisit.
    const oldest = diskThumbCache.keys().next().value!;
    diskThumbCacheBytes -= diskThumbCache.get(oldest)!.length;
    diskThumbCache.delete(oldest);
  }
  diskThumbCache.set(key, url);
  diskThumbCacheBytes += url.length;
}

// Reading the bytes is the expensive step, so only for types the generator renders.
const THUMBABLE_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
]);

function canEverThumbnail(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return THUMBABLE_EXTENSIONS.has(ext);
}

/**
 * Thumbnail for a disk-listed file, through the same generator and the same concurrency
 * gate as stored files — a mounted folder's rows fill in progressively alongside
 * everything else instead of stampeding the disk.
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
    if (!canEverThumbnail(entry.name)) return;
    let cancelled = false;
    scheduleLazyThumb(async () => {
      if (cancelled || diskThumbCache.has(key)) return;
      try {
        const file = await readDiskFile(entry);
        if (!file || cancelled) return;
        const url = await generateThumbnailForFile(file);
        // "" is cached too: a failed/oversized render should not retry on
        // every re-mount of the same row.
        cacheDiskThumb(key, url);
        if (!cancelled && url) setThumb(url);
      } catch {
        cacheDiskThumb(key, "");
      }
    });
    return () => {
      cancelled = true;
    };
    // The key encodes every field of `entry` this effect reads.
  }, [key]);

  return thumb;
}
