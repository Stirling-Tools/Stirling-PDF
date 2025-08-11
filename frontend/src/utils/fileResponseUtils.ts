/**
 * Generic utility functions for handling file responses from API endpoints
 */

/**
 * Extracts filename from Content-Disposition header
 * @param contentDisposition - Content-Disposition header value
 * @returns Filename if found, null otherwise
 */
export const getFilenameFromHeaders = (contentDisposition: string = ''): string | null => {
  const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (match && match[1]) {
    return match[1].replace(/['"]/g, '');
  }
  return null;
};

/**
 * Creates a File object from API response using the filename from headers
 * @param responseData - The response data (blob/arraybuffer/string)
 * @param headers - Response headers object
 * @param fallbackFilename - Filename to use if none provided in headers
 * @returns File object
 */
export const createFileFromApiResponse = (
  responseData: any,
  headers: any,
  fallbackFilename: string
): File => {
  const contentType = headers?.['content-type'] || 'application/octet-stream';
  const contentDisposition = headers?.['content-disposition'] || '';
  
  const filename = getFilenameFromHeaders(contentDisposition) || fallbackFilename;
  const blob = new Blob([responseData], { type: contentType });
  
  return new File([blob], filename, { type: contentType });
};