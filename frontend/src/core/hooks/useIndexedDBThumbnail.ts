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

      // Tier 1: stored thumbnail on the stub.
      if (file.thumbnailUrl) {
        setThumb(file.thumbnailUrl);
        return;
      }

      // >=100MB files are skipped entirely — no thumbnail.
      if (file.size >= 100 * 1024 * 1024) {
        setThumb(null);
        return;
      }

      // Tier 2: generate on demand from the File bytes in IndexedDB.
      // Re-entry guard is handled by the effect's cleanup/cancelled pattern —
      // `generating` is NOT in the deps, so setGenerating() does not trigger
      // the effect to re-run and cancel itself mid-flight.
      setGenerating(true);
      try {
        if (!file.id || !indexedDB) {
          throw new Error(
            `missing prerequisite fileId=${file.id} indexedDB=${Boolean(indexedDB)}`,
          );
        }

        const loadedFile = await indexedDB.loadFile(file.id as FileId);
        if (!loadedFile) {
          throw new Error("not in IndexedDB (likely remote-only stub)");
        }

        const thumbnail = await generateThumbnailForFile(loadedFile);
        if (cancelled) return;

        setThumb(thumbnail);

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
          } catch (error) {
            console.warn("Failed to persist thumbnail:", error);
          }
        }
      } catch (error) {
        console.warn("Failed to generate thumbnail for file", file.name, error);
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
  }, [file, file?.thumbnailUrl, file?.id, indexedDB, updateStirlingFileStub]);

  return { thumbnail: thumb, isGenerating: generating };
}
