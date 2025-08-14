import { FileWithUrl } from "../types/file";
import { StoredFile, fileStorage } from "../services/fileStorage";

/**
 * @deprecated File objects no longer have mutated ID properties.
 * The new system maintains pure File objects and tracks IDs separately in FileContext.
 * Use FileContext selectors to get file IDs instead.
 */
export function getFileId(file: File): string | null {
  const legacyId = (file as File & { id?: string }).id;
  if (legacyId) {
    console.warn('DEPRECATED: getFileId() found legacy mutated File object. Use FileContext selectors instead.');
  }
  return legacyId || null;
}

/**
 * Get file ID for a File object using FileContext state (new system)
 * @param file File object to find ID for
 * @param fileState Current FileContext state
 * @returns File ID or null if not found
 */
export function getFileIdFromContext(file: File, fileIds: string[], getFile: (id: string) => File | undefined): string | null {
  // Find the file ID by comparing File objects
  for (const id of fileIds) {
    const contextFile = getFile(id);
    if (contextFile === file) {
      return id;
    }
  }
  return null;
}

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
 * Create enhanced file object from stored file metadata
 * This eliminates the repeated pattern in FileManager
 */
export function createEnhancedFileFromStored(storedFile: StoredFile, thumbnail?: string): FileWithUrl {
  const enhancedFile: FileWithUrl = {
    id: storedFile.id,
    storedInIndexedDB: true,
    url: undefined, // Don't create blob URL immediately to save memory
    thumbnail: thumbnail || storedFile.thumbnail,
    // File metadata
    name: storedFile.name,
    size: storedFile.size,
    type: storedFile.type,
    lastModified: storedFile.lastModified,
    webkitRelativePath: '',
    // Lazy-loading File interface methods
    arrayBuffer: async () => {
      const data = await fileStorage.getFileData(storedFile.id);
      if (!data) throw new Error(`File ${storedFile.name} not found in IndexedDB - may have been purged`);
      return data;
    },
    bytes: async () => {
      return new Uint8Array();
    },
    slice: (start?: number, end?: number, contentType?: string) => {
      // Return a promise-based slice that loads from IndexedDB
      return new Blob([], { type: contentType || storedFile.type });
    },
    stream: () => {
      throw new Error('Stream not implemented for IndexedDB files');
    },
    text: async () => {
      const data = await fileStorage.getFileData(storedFile.id);
      if (!data) throw new Error(`File ${storedFile.name} not found in IndexedDB - may have been purged`);
      return new TextDecoder().decode(data);
    },
  } as FileWithUrl;

  return enhancedFile;
}

/**
 * Load files from IndexedDB and convert to enhanced file objects
 */
export async function loadFilesFromIndexedDB(): Promise<FileWithUrl[]> {
  try {
    // fileStorage.init() no longer needed - using centralized IndexedDB manager
    const storedFiles = await fileStorage.getAllFileMetadata();

    if (storedFiles.length === 0) {
      return [];
    }

    const restoredFiles: FileWithUrl[] = storedFiles
      .filter(storedFile => {
        // Filter out corrupted entries
        return storedFile &&
               storedFile.name &&
               typeof storedFile.size === 'number';
      })
      .map(storedFile => {
        try {
          return createEnhancedFileFromStored(storedFile as any);
        } catch (error) {
          console.error('Failed to restore file:', storedFile?.name || 'unknown', error);
          return null;
        }
      })
      .filter((file): file is FileWithUrl => file !== null);

    return restoredFiles;
  } catch (error) {
    console.error('Failed to load files from IndexedDB:', error);
    return [];
  }
}

/**
 * Clean up blob URLs from file objects
 */
export function cleanupFileUrls(files: FileWithUrl[]): void {
  files.forEach(file => {
    if (file.url && !file.url.startsWith('indexeddb:')) {
      URL.revokeObjectURL(file.url);
    }
  });
}

/**
 * Check if file should use blob URL or IndexedDB direct access
 */
export function shouldUseDirectIndexedDBAccess(file: FileWithUrl): boolean {
  const FILE_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB
  return file.size > FILE_SIZE_LIMIT;
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
 * Gets the filename without extension
 * @param filename - The filename to process
 * @returns Filename without extension
 */
export function getFilenameWithoutExtension(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';

  const parts = filename.split('.');
  if (parts.length <= 1) return filename;

  // Return all parts except the last one (extension)
  return parts.slice(0, -1).join('.');
}

/**
 * Creates a new filename with a different extension
 * @param filename - Original filename
 * @param newExtension - New extension (without dot)
 * @returns New filename with the specified extension
 */
export function changeFileExtension(filename: string, newExtension: string): string {
  const nameWithoutExt = getFilenameWithoutExtension(filename);
  return `${nameWithoutExt}.${newExtension}`;
}
