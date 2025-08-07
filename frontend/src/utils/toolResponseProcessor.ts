// Note: This utility should be used with useToolResources for ZIP operations

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
 * Note: For ZIP extraction, use useToolResources.extractZipFiles instead
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
        // This path should be avoided - use useToolResources.extractZipFiles instead
        throw new Error('ZIP extraction should use useToolResources.extractZipFiles');
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