// Pure utility functions for file operations

/**
 * Consolidated file size formatting utility
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get file date as string
 */
export function getFileDate(file: File | { lastModified: number }): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toLocaleString();
  }
  return "Unknown";
}

/**
 * Get file size as string (legacy method for backward compatibility)
 */
export function getFileSize(file: File | { size: number }): string {
  if (!file.size) return "Unknown";
  return formatFileSize(file.size);
}

/**
 * Detects and normalizes file extension from filename
 * @param filename - The filename to extract extension from
 * @returns Normalized file extension in lowercase, empty string if no extension
 */
export function detectFileExtension(filename: string): string {
  if (!filename || typeof filename !== "string") return "";

  const parts = filename.split(".");
  // If there's no extension (no dots or only one part), return empty string
  if (parts.length <= 1) return "";

  // Get the last part (extension) in lowercase
  let extension = parts[parts.length - 1].toLowerCase();

  // Normalize common extension variants
  if (extension === "jpeg") extension = "jpg";

  return extension;
}

/**
 * Removes the file extension from a filename
 * @param filename - The filename to process
 * @param options - Options for processing
 * @param options.preserveCase - If true, preserves original case. If false (default), converts to lowercase
 * @returns Filename without extension
 * @example
 * getFilenameWithoutExtension('document.pdf') // 'document'
 * getFilenameWithoutExtension('my.file.name.txt') // 'my.file.name'
 * getFilenameWithoutExtension('REPORT.PDF', { preserveCase: true }) // 'REPORT'
 */
export function getFilenameWithoutExtension(
  filename: string,
  options: { preserveCase?: boolean } = {},
): string {
  if (!filename || typeof filename !== "string") return "";

  const { preserveCase = false } = options;
  const withoutExtension = filename.replace(/\.[^.]+$/, "");

  return preserveCase ? withoutExtension : withoutExtension.toLowerCase();
}

/**
 * Checks if a file is a PDF based on extension and MIME type
 * @param file - File or file-like object with name and type properties
 * @returns true if the file appears to be a PDF
 */
export function isPdfFile(
  file: { name?: string; type?: string } | File | Blob | null | undefined,
): boolean {
  if (!file) return false;

  const name = "name" in file ? file.name : undefined;
  const type = file.type;

  // Check MIME type first (most reliable)
  if (type === "application/pdf") return true;

  // Check file extension as fallback
  if (name) {
    const ext = detectFileExtension(name);
    if (ext === "pdf") return true;
  }

  return false;
}

export type NonPdfFileType =
  | "image"
  | "csv"
  | "json"
  | "text"
  | "markdown"
  | "html"
  | "unknown";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "svg",
  "tiff",
  "tif",
  "webp",
]);
const CSV_EXTENSIONS = new Set(["csv", "tsv"]);
const JSON_EXTENSIONS = new Set(["json"]);
const TEXT_EXTENSIONS = new Set(["txt"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);

/**
 * Detects the non-PDF file type category for viewer routing.
 * Returns 'unknown' for PDFs or unrecognized formats.
 */
export function detectNonPdfFileType(
  file: { name?: string; type?: string } | File | null | undefined,
): NonPdfFileType {
  if (!file) return "unknown";

  const name = "name" in file ? file.name : undefined;
  const mimeType = file.type ?? "";

  // Check MIME type first
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "text/tab-separated-values") return "csv";
  if (mimeType === "application/json") return "json";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/markdown") return "markdown";

  // Fall back to extension
  if (name) {
    const ext = detectFileExtension(name);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (CSV_EXTENSIONS.has(ext)) return "csv";
    if (JSON_EXTENSIONS.has(ext)) return "json";
    if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
    if (TEXT_EXTENSIONS.has(ext)) return "text";
    if (HTML_EXTENSIONS.has(ext)) return "html";
  }

  return "unknown";
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  html: "text/html",
  htm: "text/html",
  txt: "text/plain",
  text: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  rtf: "application/rtf",
  zip: "application/zip",
  md: "text/markdown",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  eml: "message/rfc822",
  epub: "application/epub+zip",
};

/**
 * Builds an HTML file input `accept` attribute string from a list of file
 * extensions. The result includes both the extension form (".pdf") and the
 * MIME type form ("application/pdf") when known, so browsers reliably restrict
 * the native picker.
 */
export function buildAcceptAttribute(extensions?: string[] | null): string {
  if (!extensions || extensions.length === 0) return "";

  const tokens = new Set<string>();
  for (const raw of extensions) {
    if (!raw) continue;
    const ext = raw.replace(/^\./, "").toLowerCase();
    if (!ext) continue;
    tokens.add(`.${ext}`);
    const mime = EXTENSION_MIME_TYPES[ext];
    if (mime) tokens.add(mime);
  }

  return Array.from(tokens).join(",");
}
