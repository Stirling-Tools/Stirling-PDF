import { useState, useEffect } from "react";
import { getDocument } from "pdfjs-dist";
import { FileWithUrl } from "../types/file";

/**
 * Hook for IndexedDB-aware thumbnail loading
 * Handles thumbnail generation for files not in IndexedDB
 */
export function useIndexedDBThumbnail(file: FileWithUrl | undefined | null): { 
  thumbnail: string | null; 
  isGenerating: boolean 
} {
  const [thumb, setThumb] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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

      // Second priority: for IndexedDB files without stored thumbnails, just use placeholder
      if (file.storedInIndexedDB && file.id) {
        // Don't generate thumbnails for files loaded from IndexedDB - just use placeholder
        setThumb(null);
        return;
      }
      
      // Third priority: generate from blob for regular files during upload (small files only)
      if (!file.storedInIndexedDB && file.size < 50 * 1024 * 1024 && !generating) {
        setGenerating(true);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (context && !cancelled) {
            await page.render({ canvasContext: context, viewport }).promise;
            if (!cancelled) setThumb(canvas.toDataURL());
          }
          pdf.destroy(); // Clean up memory
        } catch (error) {
          console.warn('Failed to generate thumbnail for regular file', file.name, error);
          if (!cancelled) setThumb(null);
        } finally {
          if (!cancelled) setGenerating(false);
        }
      } else {
        // Large files or files without proper conditions - show placeholder
        setThumb(null);
      }
    }

    loadThumbnail();
    return () => { cancelled = true; };
  }, [file, file?.thumbnail, file?.id]);

  return { thumbnail: thumb, isGenerating: generating };
}