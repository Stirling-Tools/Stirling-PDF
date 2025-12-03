// Pure utility functions for file operations

/**
 * Consolidated file size formatting utility
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
  if (!filename || typeof filename !== 'string') return '';

  const parts = filename.split('.');
  // If there's no extension (no dots or only one part), return empty string
  if (parts.length <= 1) return '';

  // Get the last part (extension) in lowercase
  let extension = parts[parts.length - 1].toLowerCase();

  // Normalize common extension variants
  if (extension === 'jpeg') extension = 'jpg';

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
  options: { preserveCase?: boolean } = {}
): string {
  if (!filename || typeof filename !== 'string') return '';

  const { preserveCase = false } = options;
  const withoutExtension = filename.replace(/\.[^.]+$/, '');

  return preserveCase ? withoutExtension : withoutExtension.toLowerCase();
}

/**
 * Checks if a file is a PDF based on extension and MIME type
 * @param file - File or file-like object with name and type properties
 * @returns true if the file appears to be a PDF
 */
export function isPdfFile(file: { name?: string; type?: string } | File | Blob | null | undefined): boolean {
  if (!file) return false;

  const name = 'name' in file ? file.name : undefined;
  const type = file.type;

  // Check MIME type first (most reliable)
  if (type === 'application/pdf') return true;

  // Check file extension as fallback
  if (name) {
    const ext = detectFileExtension(name);
    if (ext === 'pdf') return true;
  }

  return false;
}
