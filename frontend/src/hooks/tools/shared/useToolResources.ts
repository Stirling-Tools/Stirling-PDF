import { useState, useCallback, useEffect, useRef } from 'react';
import { generateThumbnailForFile, generateThumbnailWithMetadata, ThumbnailWithMetadata } from '../../../utils/thumbnailUtils';
import { zipFileService } from '../../../services/zipFileService';
import { usePreferences } from '../../../contexts/PreferencesContext';


export const useToolResources = () => {
  const { preferences } = usePreferences();
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const addBlobUrl = useCallback((url: string) => {
    setBlobUrls(prev => [...prev, url]);
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    setBlobUrls(prev => {
      prev.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Failed to revoke blob URL:', error);
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
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Failed to revoke blob URL during cleanup:', error);
        }
      });
    };
  }, []); // No dependencies - use ref to access current URLs

  const generateThumbnails = useCallback(async (files: File[]): Promise<string[]> => {
    console.log(`🖼️ useToolResources.generateThumbnails: Starting for ${files.length} files`);
    const thumbnails: string[] = [];

    for (const file of files) {
      try {
        console.log(`🖼️ Generating thumbnail for: ${file.name} (${file.type}, ${file.size} bytes)`);
        const thumbnail = await generateThumbnailForFile(file);
        console.log(`🖼️ Generated thumbnail for ${file.name}: SUCCESS`);
        thumbnails.push(thumbnail);
      } catch (error) {
        console.warn(`🖼️ Failed to generate thumbnail for ${file.name}:`, error);
        thumbnails.push('');
      }
    }

    return thumbnails;
  }, []);

  const generateThumbnailsWithMetadata = useCallback(async (files: File[]): Promise<ThumbnailWithMetadata[]> => {
    console.log(`🖼️ useToolResources.generateThumbnailsWithMetadata: Starting for ${files.length} files`);
    const results: ThumbnailWithMetadata[] = [];

    for (const file of files) {
      try {
        console.log(`🖼️ Generating thumbnail with metadata for: ${file.name} (${file.type}, ${file.size} bytes)`);
        const result = await generateThumbnailWithMetadata(file);
        console.log(`🖼️ Generated thumbnail with metadata for ${file.name}: SUCCESS, ${result.pageCount} pages`);
        results.push(result);
      } catch (error) {
        console.warn(`🖼️ Failed to generate thumbnail with metadata for ${file.name}:`, error);
        results.push({ thumbnail: '', pageCount: 1 });
      }
    }

    console.log(`🖼️ useToolResources.generateThumbnailsWithMetadata: Complete. Generated ${results.length}/${files.length} thumbnails with metadata`);
    return results;
  }, []);

  const extractZipFiles = useCallback(async (zipBlob: Blob, skipAutoUnzip = false): Promise<File[]> => {
    try {
      // Check if we should extract based on preferences
      const shouldExtract = await zipFileService.shouldUnzip(
        zipBlob,
        preferences.autoUnzip,
        preferences.autoUnzipFileLimit,
        skipAutoUnzip
      );

      if (!shouldExtract) {
        return [new File([zipBlob], 'result.zip', { type: 'application/zip' })];
      }

      const zipFile = new File([zipBlob], 'temp.zip', { type: 'application/zip' });
      const extractionResult = await zipFileService.extractPdfFiles(zipFile);
      return extractionResult.success ? extractionResult.extractedFiles : [];
    } catch (error) {
      console.error('useToolResources.extractZipFiles - Error:', error);
      return [];
    }
  }, [preferences.autoUnzip, preferences.autoUnzipFileLimit]);

  const extractAllZipFiles = useCallback(async (zipBlob: Blob, skipAutoUnzip = false): Promise<File[]> => {
    try {
      // Check if we should extract based on preferences
      const shouldExtract = await zipFileService.shouldUnzip(
        zipBlob,
        preferences.autoUnzip,
        preferences.autoUnzipFileLimit,
        skipAutoUnzip
      );

      if (!shouldExtract) {
        return [new File([zipBlob], 'result.zip', { type: 'application/zip' })];
      }

      const zipFile = new File([zipBlob], 'temp.zip', { type: 'application/zip' });
      const extractionResult = await zipFileService.extractAllFiles(zipFile);
      return extractionResult.success ? extractionResult.extractedFiles : [];
    } catch (error) {
      console.error('useToolResources.extractAllZipFiles - Error:', error);
      return [];
    }
  }, [preferences.autoUnzip, preferences.autoUnzipFileLimit]);

  const createDownloadInfo = useCallback(async (
    files: File[],
    operationType: string
  ): Promise<{ url: string; filename: string }> => {
    if (files.length === 1) {
      const url = URL.createObjectURL(files[0]);
      addBlobUrl(url);
      return { url, filename: files[0].name };
    }

    // Multiple files - create zip using shared service
    const { zipFile } = await zipFileService.createZipFromFiles(files, `${operationType}_results.zip`);
    const url = URL.createObjectURL(zipFile);
    addBlobUrl(url);

    return { url, filename: zipFile.name };
  }, [addBlobUrl]);

  return {
    generateThumbnails,
    generateThumbnailsWithMetadata,
    createDownloadInfo,
    extractZipFiles,
    extractAllZipFiles,
    cleanupBlobUrls,
  };
};
