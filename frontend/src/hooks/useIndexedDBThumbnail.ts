import { useState, useEffect } from "react";
import { FileWithUrl } from "../types/file";
import { fileStorage } from "../services/fileStorage";
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

      // Second priority: generate thumbnail for any file type
      if (file.size < 100 * 1024 * 1024 && !generating) {
        setGenerating(true);
        try {
          let fileObject: File;
          
          // Handle IndexedDB files vs regular File objects
          if (file.storedInIndexedDB && file.id) {
            // For IndexedDB files, recreate File object from stored data
            const storedFile = await fileStorage.getFile(file.id);
            if (!storedFile) {
              throw new Error('File not found in IndexedDB');
            }
            fileObject = new File([storedFile.data], storedFile.name, {
              type: storedFile.type,
              lastModified: storedFile.lastModified
            });
          } else if (file.file) {
            // For FileWithUrl objects that have a File object
            fileObject = file.file;
          } else if (file.id) {
            // Fallback: try to get from IndexedDB even if storedInIndexedDB flag is missing
            const storedFile = await fileStorage.getFile(file.id);
            if (!storedFile) {
              throw new Error('File not found in IndexedDB and no File object available');
            }
            fileObject = new File([storedFile.data], storedFile.name, {
              type: storedFile.type,
              lastModified: storedFile.lastModified
            });
          } else {
            throw new Error('File object not available and no ID for IndexedDB lookup');
          }
          
          // Use the universal thumbnail generator
          const thumbnail = await generateThumbnailForFile(fileObject);
          if (!cancelled && thumbnail) {
            setThumb(thumbnail);
          } else if (!cancelled) {
            setThumb(null);
          }
        } catch (error) {
          console.warn('Failed to generate thumbnail for file', file.name, error);
          if (!cancelled) setThumb(null);
        } finally {
          if (!cancelled) setGenerating(false);
        }
      } else {
        // Large files - generate placeholder
        setThumb(null);
      }
    }

    loadThumbnail();
    return () => { cancelled = true; };
  }, [file, file?.thumbnail, file?.id]);

  return { thumbnail: thumb, isGenerating: generating };
}