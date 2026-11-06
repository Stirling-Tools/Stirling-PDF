import { useState, useEffect, useRef } from "react";
import { StirlingFileStub } from "@editor/types/fileContext";
import { useIndexedDB } from "@editor/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@editor/utils/thumbnailUtils";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import {
  useFileManagement,
  useFileSelectors,
} from "@editor/contexts/FileContext";

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
  // A rendered thumbnail stays with this hook even after the stub drops its
  // copy: eviction strips data-URL thumbnails from stubs, and regenerating here
  // would immediately push the total back over budget and evict another file.
  // Keyed by file version so a genuinely changed file still refreshes.
  const renderedForRef = useRef<string | null>(null);
  const indexedDB = useIndexedDB();
  const { updateStirlingFileStub } = useFileManagement();
  const selectors = useFileSelectors();

  const fileVersion = file
    ? `${file.id}:${file.lastModified}:${file.size}`
    : null;

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnail() {
      if (!file || !fileVersion) {
        setThumb(null);
        renderedForRef.current = null;
        return;
      }

      // Tier 1: stored thumbnail on the stub.
      if (file.thumbnailUrl) {
        setThumb(file.thumbnailUrl);
        renderedForRef.current = fileVersion;
        return;
      }

      // Already rendered this exact version; the stub copy was evicted, keep
      // the one on screen instead of regenerating and evicting a neighbour.
      if (renderedForRef.current === fileVersion) {
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

        const loadedFile =
          selectors.getFile(file.id) ?? (await indexedDB.loadFile(file.id));
        if (!loadedFile) {
          throw new Error("not in IndexedDB (likely remote-only stub)");
        }

        const thumbnail = await generateThumbnailForFile(loadedFile);
        if (cancelled) return;

        renderedForRef.current = fileVersion;
        setThumb(thumbnail);

        if (file.id && indexedDB && thumbnail) {
          try {
            await indexedDB.updateThumbnail(
              file.id,
              thumbnail,
              getPdfAccess(loadedFile)?.encrypted ?? false,
            );
            // Also sync the in-memory stub so subsequent re-mounts hit tier 1
            // instead of regenerating. IndexedDB persistence alone only helps
            // the next page load; the current session reads file.thumbnailUrl
            // from the FileContext stub.
            updateStirlingFileStub(file.id, {
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
  }, [
    file,
    fileVersion,
    file?.thumbnailUrl,
    file?.id,
    indexedDB,
    updateStirlingFileStub,
    selectors,
  ]);

  return { thumbnail: thumb, isGenerating: generating };
}
