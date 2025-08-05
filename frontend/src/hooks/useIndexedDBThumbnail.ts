import { useState, useEffect } from "react";
import { getDocument } from "pdfjs-dist";
import { FileWithUrl } from "../types/file";
import { fileStorage } from "../services/fileStorage";

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

      // Second priority: generate from blob for files (both IndexedDB and regular files, small files only)
      if (file.size < 50 * 1024 * 1024 && !generating) {
        setGenerating(true);
        try {
          let arrayBuffer: ArrayBuffer;
          
          // Handle IndexedDB files vs regular File objects
          if (file.storedInIndexedDB && file.id) {
            // For IndexedDB files, get the data from storage
            const storedFile = await fileStorage.getFile(file.id);
            if (!storedFile) {
              throw new Error('File not found in IndexedDB');
            }
            arrayBuffer = storedFile.data;
          } else if (typeof file.arrayBuffer === 'function') {
            // For regular File objects, use arrayBuffer method
            arrayBuffer = await file.arrayBuffer();
          } else if (file.id) {
            // Fallback: try to get from IndexedDB even if storedInIndexedDB flag is missing
            const storedFile = await fileStorage.getFile(file.id);
            if (!storedFile) {
              throw new Error('File has no arrayBuffer method and not found in IndexedDB');
            }
            arrayBuffer = storedFile.data;
          } else {
            throw new Error('File object has no arrayBuffer method and no ID for IndexedDB lookup');
          }
          
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          
          // Calculate optimal scale and create viewport
          const baseViewport = page.getViewport({ scale: 1.0 });
          const scale = calculateThumbnailScale(baseViewport);
          const viewport = page.getViewport({ scale });
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
          console.warn('Failed to generate thumbnail for file', file.name, error);
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