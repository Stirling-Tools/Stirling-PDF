import { useState, useCallback, useEffect } from 'react';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { zipFileService } from '../../../services/zipFileService';


export const useToolResources = () => {
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const addBlobUrl = useCallback((url: string) => {
    setBlobUrls(prev => [...prev, url]);
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error);
      }
    });
    setBlobUrls([]);
  }, [blobUrls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      blobUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Failed to revoke blob URL during cleanup:', error);
        }
      });
    };
  }, [blobUrls]);

  const generateThumbnails = useCallback(async (files: File[]): Promise<string[]> => {
    const thumbnails: string[] = [];
    
    for (const file of files) {
      try {
        const thumbnail = await generateThumbnailForFile(file);
        thumbnails.push(thumbnail);
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
        thumbnails.push('');
      }
    }
    
    return thumbnails;
  }, []);

  const extractZipFiles = useCallback(async (zipBlob: Blob): Promise<File[]> => {
    try {
      const zipFile = new File([zipBlob], 'temp.zip', { type: 'application/zip' });
      const extractionResult = await zipFileService.extractPdfFiles(zipFile);
      return extractionResult.success ? extractionResult.extractedFiles : [];
    } catch (error) {
      console.error('useToolResources.extractZipFiles - Error:', error);
      return [];
    }
  }, []);

  const extractAllZipFiles = useCallback(async (zipBlob: Blob): Promise<File[]> => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      const arrayBuffer = await zipBlob.arrayBuffer();
      const zipContent = await zip.loadAsync(arrayBuffer);
      
      const extractedFiles: File[] = [];
      
      for (const [filename, file] of Object.entries(zipContent.files)) {
        if (!file.dir) {
          const content = await file.async('blob');
          const extractedFile = new File([content], filename, { type: 'application/pdf' });
          extractedFiles.push(extractedFile);
        }
      }
      
      return extractedFiles;
    } catch (error) {
      console.error('Error in extractAllZipFiles:', error);
      return [];
    }
  }, []);

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
    createDownloadInfo,
    extractZipFiles,
    extractAllZipFiles,
    cleanupBlobUrls,
  };
};