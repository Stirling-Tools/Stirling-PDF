// Note: This utility should be used with useToolResources for ZIP operations
import { getFilenameFromHeaders } from './fileResponseUtils';

export type ResponseHandler = (blob: Blob, originalFiles: File[]) => Promise<File[]> | File[];

/**
 * Processes a blob response into File(s).
 * - If a tool-specific responseHandler is provided, it is used.
 * - If responseHeaders provided and contains Content-Disposition, uses that filename.
 * - Otherwise, create a single file using the filePrefix + original name.
 */
export async function processResponse(
  blob: Blob,
  originalFiles: File[],
  filePrefix: string,
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
  const name = `${filePrefix}${original}`;
  const type = blob.type || 'application/octet-stream';
  return [new File([blob], name, { type })];
}
