// Note: This utility should be used with useToolResources for ZIP operations
import { getFilenameFromHeaders } from '@app/utils/fileResponseUtils';

export type ResponseHandler = (blob: Blob, originalFiles: File[]) => Promise<File[]> | File[];

/**
 * Processes a blob response into File(s).
 * - If a tool-specific responseHandler is provided, it is used.
 * - If responseHeaders provided and contains Content-Disposition, uses that filename.
 * - Otherwise, create a single file using the filePrefix + original name.
 * - If filePrefix is empty, preserves the original filename.
 */
export async function processResponse(
  blob: Blob,
  originalFiles: File[],
  filePrefix?: string,
  responseHandler?: ResponseHandler,
  responseHeaders?: Record<string, any>
): Promise<File[]> {
  if (responseHandler) {
    const out = await responseHandler(blob, originalFiles);
    return Array.isArray(out) ? out : [out as unknown as File];
  }

  // Check if we should use the backend-provided filename from headers
  // Only when responseHeaders are explicitly provided (indicating the operation requested this)
  if (responseHeaders) {
    const contentDisposition = responseHeaders['content-disposition'];
    const backendFilename = getFilenameFromHeaders(contentDisposition);
    if (backendFilename) {
      const type = blob.type || responseHeaders['content-type'] || 'application/octet-stream';
      return [new File([blob], backendFilename, { type })];
    }
    // If preserveBackendFilename was requested but no Content-Disposition header found,
    // fall back to default behavior (this handles cases where backend doesn't set the header)
  }

  // Default behavior: use filePrefix + original name
  const original = originalFiles[0]?.name ?? 'result.pdf';
  // Only add prefix if it's not empty - this preserves original filenames for file history
  const name = filePrefix ? `${filePrefix}${original}` : original;
  const type = blob.type || 'application/octet-stream';

  // File was modified by tool processing - set lastModified to current time
  return [new File([blob], name, {
    type,
    lastModified: Date.now()
  })];
}
