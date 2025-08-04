import { useState, useCallback, useEffect } from 'react';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';

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

  const createDownloadInfo = useCallback(async (
    files: File[], 
    operationType: string
  ): Promise<{ url: string; filename: string }> => {
    if (files.length === 1) {
      const url = URL.createObjectURL(files[0]);
      addBlobUrl(url);
      return { url, filename: files[0].name };
    }

    // Multiple files - create zip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    files.forEach(file => {
      zip.file(file.name, file);
    });
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    addBlobUrl(url);
    
    return { url, filename: `${operationType}_results.zip` };
  }, [addBlobUrl]);

  return {
    generateThumbnails,
    createDownloadInfo,
    cleanupBlobUrls,
  };
};