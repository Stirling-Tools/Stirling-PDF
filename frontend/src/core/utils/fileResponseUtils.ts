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
export type HeaderSource =
  | Record<string, string | null | undefined>
  | Headers
  | Array<[string, string]>
  | undefined
  | null;

function getHeaderValue(headers: HeaderSource, key: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    const value = headers.get(key);
    return value === null ? undefined : value;
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([headerKey]) => headerKey.toLowerCase() === key.toLowerCase());
    return entry?.[1];
  }
  const value = headers[key];
  return value === null || value === undefined ? undefined : value;
}

export const createFileFromApiResponse = (
  responseData: BlobPart,
  headers: HeaderSource,
  fallbackFilename: string
): File => {
  const contentType = getHeaderValue(headers, 'content-type') || 'application/octet-stream';
  const contentDisposition = getHeaderValue(headers, 'content-disposition') || '';

  const filename = getFilenameFromHeaders(contentDisposition) || fallbackFilename;
  const blob = new Blob([responseData], { type: contentType });

  return new File([blob], filename, { type: contentType });
};

export function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = view;

  const start = byteOffset;
  const end = byteOffset + byteLength;

  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
    const out = new ArrayBuffer(byteLength);
    new Uint8Array(out).set(new Uint8Array(buffer, start, byteLength));
    return out;
  }

  if (buffer instanceof ArrayBuffer && typeof buffer.slice === 'function') {
    return buffer.slice(start, end);
  }

  const out = new ArrayBuffer(byteLength);
  new Uint8Array(out).set(new Uint8Array(buffer, start, byteLength));
  return out;
}
