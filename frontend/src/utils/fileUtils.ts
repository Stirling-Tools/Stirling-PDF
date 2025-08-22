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
