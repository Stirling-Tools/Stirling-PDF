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
      
      if (!extractionResult.success) {
        throw new Error(`ZIP extraction failed: ${extractionResult.error || 'Unknown error'}`);
      }
      
      return extractionResult.extractedFiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `ZIP extraction error: ${error}`;
      throw new Error(errorMessage);
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
          // Determine MIME type based on file extension
          const mimeType = getMimeTypeFromFilename(filename);
          const extractedFile = new File([content], filename, { type: mimeType });
          extractedFiles.push(extractedFile);
        }
      }
      
      if (extractedFiles.length === 0) {
        throw new Error('ZIP file contains no extractable files');
      }
      
      return extractedFiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `ZIP extraction error: ${error}`;
      throw new Error(errorMessage);
    }
  }, []);

  // Helper function to determine MIME type from filename
  const getMimeTypeFromFilename = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'txt': return 'text/plain';
      case 'jpg': 
      case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      case 'html': 
      case 'htm': return 'text/html';
      case 'css': return 'text/css';
      case 'js': return 'application/javascript';
      case 'json': return 'application/json';
      case 'xml': return 'application/xml';
      case 'zip': return 'application/zip';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt': return 'application/vnd.ms-powerpoint';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      default: return 'application/octet-stream';
    }
  };

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