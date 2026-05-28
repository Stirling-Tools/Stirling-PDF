import { useEffect, useRef, useState } from "react";
import type { FileId } from "@app/types/file";
import { useFileManagement } from "@app/contexts/FileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";

const THUMBNAIL_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

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

    (async () => {
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
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, size, thumbnailUrl, indexedDB, updateStirlingFileStub]);

  return thumb;
}
