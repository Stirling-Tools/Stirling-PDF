import { useState, useCallback, useEffect, useRef } from "react";
import {
  generateThumbnailForFile,
  generateThumbnailWithMetadata,
  ThumbnailWithMetadata,
} from "@app/utils/thumbnailUtils";
import { zipFileService } from "@app/services/zipFileService";
import { usePreferences } from "@app/contexts/PreferencesContext";

// A wedged pdfium worker never replies, so awaiting it pinned the review panel on
// "Generating previews..." with no way out but a page reload.
const THUMBNAIL_TIMEOUT_MS = 30_000;

function withThumbnailTimeout<T>(
  work: Promise<T>,
  fallback: T,
  fileName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`Thumbnail generation timed out for ${fileName}`);
      resolve(fallback);
    }, THUMBNAIL_TIMEOUT_MS);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const useToolResources = () => {
  const { preferences } = usePreferences();
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const addBlobUrl = useCallback((url: string) => {
    setBlobUrls((prev) => [...prev, url]);
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    setBlobUrls((prev) => {
      prev.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn("Failed to revoke blob URL:", error);
        }
      });
      return [];
    });
  }, []); // No dependencies - use functional update pattern

  // Cleanup on unmount - use ref to avoid dependency on blobUrls state
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    blobUrlsRef.current = blobUrls;
  }, [blobUrls]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn("Failed to revoke blob URL during cleanup:", error);
        }
      });
    };
  }, []); // No dependencies - use ref to access current URLs

  const generateThumbnails = useCallback(
    async (files: File[]): Promise<string[]> => {
      console.log(
        `🖼️ useToolResources.generateThumbnails: Starting for ${files.length} files`,
      );
      const thumbnails: string[] = [];

      for (const file of files) {
        try {
          console.log(
            `🖼️ Generating thumbnail for: ${file.name} (${file.type}, ${file.size} bytes)`,
          );
          const thumbnail = await withThumbnailTimeout(
            generateThumbnailForFile(file),
            "",
            file.name,
          );
          console.log(`🖼️ Generated thumbnail for ${file.name}: SUCCESS`);
          thumbnails.push(thumbnail);
        } catch (error) {
          console.warn(
            `🖼️ Failed to generate thumbnail for ${file.name}:`,
            error,
          );
          thumbnails.push("");
        }
      }

      return thumbnails;
    },
    [],
  );

  const generateThumbnailsWithMetadata = useCallback(
    async (files: File[]): Promise<ThumbnailWithMetadata[]> => {
      console.log(
        `🖼️ useToolResources.generateThumbnailsWithMetadata: Starting for ${files.length} files`,
      );
      const results: ThumbnailWithMetadata[] = [];

      for (const file of files) {
        try {
          console.log(
            `🖼️ Generating thumbnail with metadata for: ${file.name} (${file.type}, ${file.size} bytes)`,
          );
          const result = await withThumbnailTimeout(
            generateThumbnailWithMetadata(file),
            { thumbnail: "", pageCount: 1 },
            file.name,
          );
          console.log(
            `🖼️ Generated thumbnail with metadata for ${file.name}: SUCCESS, ${result.pageCount} pages`,
          );
          results.push(result);
        } catch (error) {
          console.warn(
            `🖼️ Failed to generate thumbnail with metadata for ${file.name}:`,
            error,
          );
          results.push({ thumbnail: "", pageCount: 1 });
        }
      }

      console.log(
        `🖼️ useToolResources.generateThumbnailsWithMetadata: Complete. Generated ${results.length}/${files.length} thumbnails with metadata`,
      );
      return results;
    },
    [],
  );

  const extractZipFiles = useCallback(
    async (
      zipBlob: Blob,
      skipAutoUnzip = false,
      confirmLargeExtraction?: (
        fileCount: number,
        fileName: string,
      ) => Promise<boolean>,
    ): Promise<File[]> => {
      try {
        return await zipFileService.extractWithPreferences(zipBlob, {
          autoUnzip: preferences.autoUnzip,
          autoUnzipFileLimit: preferences.autoUnzipFileLimit,
          skipAutoUnzip,
          confirmLargeExtraction,
        });
      } catch (error) {
        console.error("useToolResources.extractZipFiles - Error:", error);
        return [];
      }
    },
    [preferences.autoUnzip, preferences.autoUnzipFileLimit],
  );

  const createDownloadInfo = useCallback(
    async (
      files: File[],
      operationType: string,
    ): Promise<{ url: string; filename: string }> => {
      if (files.length === 1) {
        const url = URL.createObjectURL(files[0]);
        addBlobUrl(url);
        return { url, filename: files[0].name };
      }

      // Multiple files - create zip using shared service
      const { zipFile } = await zipFileService.createZipFromFiles(
        files,
        `${operationType}_results.zip`,
      );
      const url = URL.createObjectURL(zipFile);
      addBlobUrl(url);

      return { url, filename: zipFile.name };
    },
    [addBlobUrl],
  );

  return {
    generateThumbnails,
    generateThumbnailsWithMetadata,
    createDownloadInfo,
    extractZipFiles,
    cleanupBlobUrls,
  };
};
