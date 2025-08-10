// Note: This utility should be used with useToolResources for ZIP operations

export type ResponseHandler = (blob: Blob, originalFiles: File[]) => Promise<File[]> | File[];

/**
 * Processes a blob response into File(s).
 * - If a tool-specific responseHandler is provided, it is used.
 * - Otherwise, create a single file using the filePrefix + original name.
 */
export async function processResponse(
  blob: Blob,
  originalFiles: File[],
  filePrefix: string,
  responseHandler?: ResponseHandler
): Promise<File[]> {
  if (responseHandler) {
    const out = await responseHandler(blob, originalFiles);
    return Array.isArray(out) ? out : [out as unknown as File];
  }

  const original = originalFiles[0]?.name ?? 'result.pdf';
  const name = `${filePrefix}${original}`;
  const type = blob.type || 'application/octet-stream';
  return [new File([blob], name, { type })];
}
