import { zipFileService } from '../services/zipFileService';

export interface ResponseHandler {
  type: 'single' | 'zip' | 'custom';
  processor?: (blob: Blob) => Promise<File[]>;
  useZipExtractor?: boolean;
}

const defaultResponseHandler: ResponseHandler = {
  type: 'single'
};

/**
 * Processes API response blob based on handler configuration
 */
export const processResponse = async (
  blob: Blob, 
  originalFiles: File[], 
  filePrefix: string,
  responseHandler?: ResponseHandler
): Promise<File[]> => {
  const handler = responseHandler || defaultResponseHandler;
  
  switch (handler.type) {
    case 'zip':
      if (handler.useZipExtractor) {
        const zipFile = new File([blob], 'result.zip', { type: 'application/zip' });
        const extractionResult = await zipFileService.extractPdfFiles(zipFile);
        return extractionResult.success ? extractionResult.extractedFiles : [];
      }
      // Fall through to custom if no zip extractor
    case 'custom':
      if (handler.processor) {
        return await handler.processor(blob);
      }
      // Fall through to single
    case 'single':
    default:
      const contentType = blob.type || 'application/pdf';
      const filename = originalFiles.length === 1 
        ? `${filePrefix}${originalFiles[0].name}`
        : `${filePrefix}result.pdf`;
      return [new File([blob], filename, { type: contentType })];
  }
};