import { FileWithUrl } from "../types/file";
import { fileStorage, StorageStats } from "./fileStorage";
import { loadFilesFromIndexedDB, createEnhancedFileFromStored, cleanupFileUrls } from "../utils/fileUtils";
import { generateThumbnailForFile } from "../utils/thumbnailUtils";
import { updateStorageStatsIncremental } from "../utils/storageUtils";

/**
 * Service for file storage operations
 * Contains all IndexedDB operations and file management logic
 */
export const fileOperationsService = {
  
  /**
   * Load storage statistics
   */
  async loadStorageStats(): Promise<StorageStats | null> {
    try {
      return await fileStorage.getStorageStats();
    } catch (error) {
      console.error('Failed to load storage stats:', error);
      return null;
    }
  },

  /**
   * Force reload files from IndexedDB
   */
  async forceReloadFiles(): Promise<FileWithUrl[]> {
    try {
      return await loadFilesFromIndexedDB();
    } catch (error) {
      console.error('Failed to force reload files:', error);
      return [];
    }
  },

  /**
   * Load existing files from IndexedDB if not already loaded
   */
  async loadExistingFiles(
    filesLoaded: boolean, 
    currentFiles: FileWithUrl[]
  ): Promise<FileWithUrl[]> {
    if (filesLoaded && currentFiles.length > 0) {
      return currentFiles;
    }
    
    try {
      await fileStorage.init();
      const storedFiles = await fileStorage.getAllFileMetadata();
      
      // Detect if IndexedDB was purged by comparing with current UI state
      if (currentFiles.length > 0 && storedFiles.length === 0) {
        console.warn('IndexedDB appears to have been purged - clearing UI state');
        return [];
      }
      
      return await loadFilesFromIndexedDB();
    } catch (error) {
      console.error('Failed to load existing files:', error);
      return [];
    }
  },

  /**
   * Upload files to IndexedDB with thumbnail generation
   */
  async uploadFiles(
    uploadedFiles: File[],
    useIndexedDB: boolean
  ): Promise<FileWithUrl[]> {
    const newFiles: FileWithUrl[] = [];

    for (const file of uploadedFiles) {
      if (useIndexedDB) {
        try {
          console.log('Storing file in IndexedDB:', file.name);
          
          // Generate thumbnail only during upload
          const thumbnail = await generateThumbnailForFile(file);
          
          const storedFile = await fileStorage.storeFile(file, thumbnail);
          console.log('File stored with ID:', storedFile.id);
          
          const baseFile = fileStorage.createFileFromStored(storedFile);
          const enhancedFile = createEnhancedFileFromStored(storedFile, thumbnail);
          
          // Copy File interface methods from baseFile
          enhancedFile.arrayBuffer = baseFile.arrayBuffer.bind(baseFile);
          enhancedFile.slice = baseFile.slice.bind(baseFile);
          enhancedFile.stream = baseFile.stream.bind(baseFile);
          enhancedFile.text = baseFile.text.bind(baseFile);
          
          newFiles.push(enhancedFile);
        } catch (error) {
          console.error('Failed to store file in IndexedDB:', error);
          // Fallback to RAM storage
          const enhancedFile: FileWithUrl = Object.assign(file, {
            url: URL.createObjectURL(file),
            storedInIndexedDB: false
          });
          newFiles.push(enhancedFile);
        }
      } else {
        // IndexedDB disabled - use RAM
        const enhancedFile: FileWithUrl = Object.assign(file, {
          url: URL.createObjectURL(file),
          storedInIndexedDB: false
        });
        newFiles.push(enhancedFile);
      }
    }

    return newFiles;
  },

  /**
   * Remove a file from storage
   */
  async removeFile(file: FileWithUrl): Promise<void> {
    // Clean up blob URL
    if (file.url && !file.url.startsWith('indexeddb:')) {
      URL.revokeObjectURL(file.url);
    }

    // Remove from IndexedDB if stored there
    if (file.storedInIndexedDB && file.id) {
      try {
        await fileStorage.deleteFile(file.id);
      } catch (error) {
        console.error('Failed to delete file from IndexedDB:', error);
      }
    }
  },

  /**
   * Clear all files from storage
   */
  async clearAllFiles(files: FileWithUrl[]): Promise<void> {
    // Clean up all blob URLs
    cleanupFileUrls(files);

    // Clear IndexedDB
    try {
      await fileStorage.clearAll();
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
    }
  },

  /**
   * Create blob URL for file viewing
   */
  async createBlobUrlForFile(file: FileWithUrl): Promise<string> {
    // For large files, use IndexedDB direct access to avoid memory issues
    const FILE_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB
    if (file.size > FILE_SIZE_LIMIT) {
      console.warn(`File ${file.name} is too large for blob URL. Use direct IndexedDB access.`);
      return `indexeddb:${file.id}`;
    }
    
    // For all files, avoid persistent blob URLs
    if (file.storedInIndexedDB && file.id) {
      const storedFile = await fileStorage.getFile(file.id);
      if (storedFile) {
        return fileStorage.createBlobUrl(storedFile);
      }
    }
    
    // Fallback for files not in IndexedDB
    return URL.createObjectURL(file);
  },

  /**
   * Check for IndexedDB purge
   */
  async checkForPurge(currentFiles: FileWithUrl[]): Promise<boolean> {
    if (currentFiles.length === 0) return false;
    
    try {
      await fileStorage.init();
      const storedFiles = await fileStorage.getAllFileMetadata();
      return storedFiles.length === 0; // Purge detected if no files in storage but UI shows files
    } catch (error) {
      console.error('Error checking for purge:', error);
      return true; // Assume purged if can't access IndexedDB
    }
  },

  /**
   * Update storage stats incrementally (re-export utility for convenience)
   */
  updateStorageStatsIncremental
};