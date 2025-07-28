import { FileWithUrl } from "../types/file";
import { StoredFile, fileStorage } from "../services/fileStorage";

export function getFileId(file: File): string {
  return (file as File & { id?: string }).id || file.name;
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
export function getFileDate(file: File): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toLocaleString();
  }
  return "Unknown";
}

/**
 * Get file size as string (legacy method for backward compatibility)
 */
export function getFileSize(file: File): string {
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
    // Lazy-loading File interface methods
    arrayBuffer: async () => {
      const data = await fileStorage.getFileData(storedFile.id);
      if (!data) throw new Error(`File ${storedFile.name} not found in IndexedDB - may have been purged`);
      return data;
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
    }
  } as FileWithUrl;
  
  return enhancedFile;
}

/**
 * Load files from IndexedDB and convert to enhanced file objects
 */
export async function loadFilesFromIndexedDB(): Promise<FileWithUrl[]> {
  try {
    await fileStorage.init();
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
          return createEnhancedFileFromStored(storedFile);
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