import { useState, useEffect } from "react";
import { FileMetadata } from "../types/file";
import { useIndexedDB } from "../contexts/IndexedDBContext";
import { generateThumbnailForFile } from "../utils/thumbnailUtils";

/**
 * Calculate optimal scale for thumbnail generation
 * Ensures high quality while preventing oversized renders
 */
function calculateThumbnailScale(pageViewport: { width: number; height: number }): number {
  const maxWidth = 400;  // Max thumbnail width
  const maxHeight = 600; // Max thumbnail height

  const scaleX = maxWidth / pageViewport.width;
  const scaleY = maxHeight / pageViewport.height;

  // Don't upscale, only downscale if needed
  return Math.min(scaleX, scaleY, 1.0);
}

/**
 * Hook for IndexedDB-aware thumbnail loading
 * Handles thumbnail generation for files not in IndexedDB
 */
export function useIndexedDBThumbnail(file: FileMetadata | undefined | null): {
  thumbnail: string | null;
  isGenerating: boolean
} {
  const [thumb, setThumb] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const indexedDB = useIndexedDB();

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnail() {
      if (!file) {
        setThumb(null);
        return;
      }

      // First priority: use stored thumbnail
      if (file.thumbnail) {
        setThumb(file.thumbnail);
        return;
      }

      // Second priority: generate thumbnail for files under 100MB
      if (file.size < 100 * 1024 * 1024 && !generating) {
        setGenerating(true);
        try {
          let fileObject: File;

          // Try to load file from IndexedDB using new context
          if (file.id && indexedDB) {
            const loadedFile = await indexedDB.loadFile(file.id);
            if (!loadedFile) {
              throw new Error('File not found in IndexedDB');
            }
            fileObject = loadedFile;
          } else {
            throw new Error('File ID not available or IndexedDB context not available');
          }

          // Use the universal thumbnail generator
          const thumbnail = await generateThumbnailForFile(fileObject);
          if (!cancelled) {
            setThumb(thumbnail);
            
            // Save thumbnail to IndexedDB for persistence
            if (file.id && indexedDB && thumbnail) {
              try {
                await indexedDB.updateThumbnail(file.id, thumbnail);
              } catch (error) {
                console.warn('Failed to save thumbnail to IndexedDB:', error);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to generate thumbnail for file', file.name, error);
          if (!cancelled) setThumb(null);
        } finally {
          if (!cancelled) setGenerating(false);
        }
      } else {
        // Large files - no thumbnail
        setThumb(null);
      }
    }

    loadThumbnail();
    return () => { cancelled = true; };
  }, [file, file?.thumbnail, file?.id, indexedDB, generating]);

  return { thumbnail: thumb, isGenerating: generating };
}
