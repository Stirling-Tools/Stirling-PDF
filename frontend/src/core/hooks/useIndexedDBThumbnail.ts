import { useState, useEffect } from "react";
import { StirlingFileStub } from "@app/types/fileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import { FileId } from "@app/types/fileContext";
import { useFileManagement } from "@app/contexts/FileContext";

/**
 * Hook for IndexedDB-aware thumbnail loading
 * Handles thumbnail generation for files not in IndexedDB
 */
export function useIndexedDBThumbnail(
  file: StirlingFileStub | undefined | null,
): {
  thumbnail: string | null;
  isGenerating: boolean;
} {
  const [thumb, setThumb] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const indexedDB = useIndexedDB();
  const { updateStirlingFileStub } = useFileManagement();

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnail() {
      if (!file) {
        setThumb(null);
        return;
      }

      const tag = `[Thumb:${file.name}]`;
      const summary = {
        id: file.id,
        size: file.size,
        sizeMB: +(file.size / (1024 * 1024)).toFixed(1),
        type: (file as any).type ?? "",
        hasStoredThumb: Boolean(file.thumbnailUrl),
        remoteStorageId: (file as any).remoteStorageId ?? null,
        remoteOwnedByCurrentUser:
          (file as any).remoteOwnedByCurrentUser ?? null,
        remoteSharedViaLink: (file as any).remoteSharedViaLink ?? null,
      };

      // Tier 1: stored thumbnail on the stub.
      if (file.thumbnailUrl) {
        console.info(`${tag} tier=stored (using file.thumbnailUrl)`, summary);
        setThumb(file.thumbnailUrl);
        return;
      }

      // Tier 3 reason: >=100MB files are skipped entirely.
      if (file.size >= 100 * 1024 * 1024) {
        console.info(
          `${tag} tier=placeholder reason=fileTooLarge (>=100MB)`,
          summary,
        );
        setThumb(null);
        return;
      }

      // Tier 2: generate on demand from the File bytes in IndexedDB.
      // Re-entry guard is handled by the effect's cleanup/cancelled pattern —
      // `generating` is NOT in the deps, so setGenerating() does not trigger
      // the effect to re-run and cancel itself mid-flight.
      setGenerating(true);
      const startedAt = performance.now();
      try {
        if (!file.id || !indexedDB) {
          throw new Error(
            `missing prerequisite fileId=${file.id} indexedDB=${Boolean(indexedDB)}`,
          );
        }

        console.info(`${tag} tier=generate step=loadFromIndexedDB`, summary);
        const loadedFile = await indexedDB.loadFile(file.id as FileId);
        if (!loadedFile) {
          throw new Error("not in IndexedDB (likely remote-only stub)");
        }

        console.info(
          `${tag} tier=generate step=render (bytes loaded in ${Math.round(
            performance.now() - startedAt,
          )}ms)`,
        );
        const thumbnail = await generateThumbnailForFile(loadedFile);
        if (cancelled) return;

        const elapsed = Math.round(performance.now() - startedAt);
        setThumb(thumbnail);
        console.info(
          `${tag} tier=generate step=done in ${elapsed}ms (thumbBytes=${thumbnail?.length ?? 0})`,
        );

        if (file.id && indexedDB && thumbnail) {
          try {
            await indexedDB.updateThumbnail(file.id as FileId, thumbnail);
            // Also sync the in-memory stub so subsequent re-mounts hit tier 1
            // instead of regenerating. IndexedDB persistence alone only helps
            // the next page load; the current session reads file.thumbnailUrl
            // from the FileContext stub.
            updateStirlingFileStub(file.id as FileId, {
              thumbnailUrl: thumbnail,
            });
            console.info(
              `${tag} tier=generate step=persisted (IndexedDB + FileContext stub)`,
            );
          } catch (error) {
            console.warn(`${tag} persist failed:`, error);
          }
        }
      } catch (error) {
        const elapsed = Math.round(performance.now() - startedAt);
        console.warn(
          `${tag} tier=placeholder reason=generationFailed after ${elapsed}ms`,
          { ...summary, error },
        );
        if (!cancelled) setThumb(null);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }

    loadThumbnail();
    return () => {
      cancelled = true;
    };
    // `generating` is intentionally NOT in the deps — it's an internal flag
    // set by this effect, and including it caused the effect to cancel
    // itself mid-flight (orphaning the render and leaving generating=true
    // stuck forever).
  }, [file, file?.thumbnailUrl, file?.id, indexedDB]);

  return { thumbnail: thumb, isGenerating: generating };
}
