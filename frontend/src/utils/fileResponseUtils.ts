/**
 * Generic utility functions for handling file responses from API endpoints
 */

/**
 * Extracts filename from Content-Disposition header
 * @param contentDisposition - Content-Disposition header value
 * @returns Filename if found, null otherwise
 */
export const getFilenameFromHeaders = (contentDisposition = ''): string | null => {
  const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
  if (match?.[1]) {
    const filename = match[1].replace(/['"]/g, '');

    // Decode URL-encoded characters (e.g., %20 -> space)
    try {
      return decodeURIComponent(filename);
    } catch {
      // If decoding fails, return the original filename
      return filename;
    }
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
  responseData: unknown,
  headers: Record<string, string | undefined>,
  fallbackFilename: string
): File => {
  const contentType = headers?.['content-type'] ?? 'application/octet-stream';
  const contentDisposition = headers?.['content-disposition'] ?? '';

  const filename = getFilenameFromHeaders(contentDisposition) ?? fallbackFilename;
  const blob = new Blob([responseData as BlobPart], { type: contentType });

  return new File([blob], filename, { type: contentType });
};
