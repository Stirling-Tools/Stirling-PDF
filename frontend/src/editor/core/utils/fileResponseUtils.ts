/**
 * Generic utility functions for handling file responses from API endpoints
 */

/**
 * Extracts filename from Content-Disposition header
 * @param contentDisposition - Content-Disposition header value
 * @returns Filename if found, null otherwise
 */
/**
 * Parses an RFC 5987 `filename*` parameter
 * (e.g. `filename*=UTF-8''merged%20file.pdf`) into a decoded filename.
 * Returns null when the header has no `filename*` parameter or it is
 * malformed.
 */
const parseEncodedFilename = (contentDisposition: string): string | null => {
  const match = contentDisposition.match(/filename\*\s*=\s*"?([^";]+)"?/i);
  if (!match) return null;

  // RFC 5987 ext-value: charset ' language ' percent-encoded-value
  const parts = match[1].split("'");
  if (parts.length < 3) return null;
  const charset = parts[0].trim().toLowerCase() || "utf-8";
  const encoded = parts.slice(2).join("'");

  try {
    // Percent-decode to raw bytes first so non-UTF-8 charsets decode
    // correctly instead of being mangled by a UTF-8-only decode.
    const percentDecoded = encoded.replace(/%([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    const bytes = Uint8Array.from(percentDecoded, (ch) => ch.charCodeAt(0));
    return new TextDecoder(charset).decode(bytes) || null;
  } catch {
    try {
      return decodeURIComponent(encoded) || null;
    } catch {
      return null;
    }
  }
};

export const getFilenameFromHeaders = (
  contentDisposition: string = "",
): string | null => {
  // RFC 5987 `filename*` takes precedence over plain `filename` when both
  // are present; the plain regex below would otherwise mangle the encoded
  // form into e.g. "UTF-8merged file.pdf".
  const encodedFilename = parseEncodedFilename(contentDisposition);
  if (encodedFilename) return encodedFilename;

  const match = contentDisposition.match(
    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
  );
  if (match && match[1]) {
    const filename = match[1].replace(/['"]/g, "");

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
  responseData: BlobPart,
  headers: Record<string, unknown> | null | undefined,
  fallbackFilename: string,
): File => {
  const contentType =
    (headers?.["content-type"] as string | undefined) ||
    "application/octet-stream";
  const contentDisposition =
    (headers?.["content-disposition"] as string | undefined) || "";

  const filename =
    getFilenameFromHeaders(contentDisposition) || fallbackFilename;
  const blob = new Blob([responseData], { type: contentType });

  return new File([blob], filename, { type: contentType });
};
