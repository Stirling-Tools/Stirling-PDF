/**
 * IndexedDB File Storage Service
 * Provides high-capacity file storage for PDF processing
 * Now uses centralized IndexedDB manager
 */

import { FileId } from '../types/file';
import { indexedDBManager, DATABASE_CONFIGS } from './indexedDBManager';

export interface StoredFile {
  id: FileId;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
  thumbnail?: string;
  url?: string; // For compatibility with existing components
  isLeaf?: boolean; // True if this file is a leaf node (hasn't been processed yet)
}

export interface StorageStats {
  used: number;
  available: number;
  fileCount: number;
  quota?: number;
}

class FileStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = 'files';

  /**
   * Get database connection using centralized manager
   */
  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.dbConfig);
  }

  /**
   * Store a file in IndexedDB with external UUID
   */
  async storeFile(file: File, fileId: FileId, thumbnail?: string, isLeaf: boolean = true): Promise<StoredFile> {
    const db = await this.getDatabase();

    const arrayBuffer = await file.arrayBuffer();

    const storedFile: StoredFile = {
      id: fileId, // Use provided UUID
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      data: arrayBuffer,
      thumbnail,
      isLeaf
    };

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        // Debug logging
        console.log('📄 LEAF FLAG DEBUG - Storing file:', {
          id: storedFile.id,
          name: storedFile.name,
          isLeaf: storedFile.isLeaf,
          dataSize: storedFile.data.byteLength
        });

        const request = store.add(storedFile);

        request.onerror = () => {
          console.error('IndexedDB add error:', request.error);
          console.error('Failed object:', storedFile);
          reject(request.error);
        };
        request.onsuccess = () => {
          console.log('File stored successfully with ID:', storedFile.id);
          resolve(storedFile);
        };
      } catch (error) {
        console.error('Transaction error:', error);
        reject(error);
      }
    });
  }

  /**
   * Retrieve a file from IndexedDB
   */
  async getFile(id: FileId): Promise<StoredFile | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Get all stored files (WARNING: loads all data into memory)
   */
  async getAllFiles(): Promise<StoredFile[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Filter out null/corrupted entries
        const files = request.result.filter(file =>
          file &&
          file.data &&
          file.name &&
          typeof file.size === 'number'
        );
        resolve(files);
      };
    });
  }

  /**
   * Get metadata of all stored files (without loading data into memory)
   */
  async getAllFileMetadata(): Promise<Omit<StoredFile, 'data'>[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const files: Omit<StoredFile, 'data'>[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const storedFile = cursor.value;
          // Only extract metadata, skip the data field
          if (storedFile && storedFile.name && typeof storedFile.size === 'number') {
            files.push({
              id: storedFile.id,
              name: storedFile.name,
              type: storedFile.type,
              size: storedFile.size,
              lastModified: storedFile.lastModified,
              thumbnail: storedFile.thumbnail
            });
          }
          cursor.continue();
        } else {
          // Metadata loaded efficiently without file data
          resolve(files);
        }
      };
    });
  }

  /**
   * Delete a file from IndexedDB
   */
  async deleteFile(id: FileId): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Update the lastModified timestamp of a file (for most recently used sorting)
   */
  async touchFile(id: FileId): Promise<boolean> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const file = getRequest.result;
        if (file) {
          // Update lastModified to current timestamp
          file.lastModified = Date.now();
          const updateRequest = store.put(file);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve(false); // File not found
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Mark a file as no longer being a leaf (it has been processed)
   */
  async markFileAsProcessed(id: FileId): Promise<boolean> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const file = getRequest.result;
        if (file) {
          console.log('📄 LEAF FLAG DEBUG - Marking as processed:', {
            id: file.id,
            name: file.name,
            wasLeaf: file.isLeaf,
            nowLeaf: false
          });
          file.isLeaf = false;
          const updateRequest = store.put(file);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          console.warn('📄 LEAF FLAG DEBUG - File not found for processing:', id);
          resolve(false); // File not found
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Get only leaf files (files that haven't been processed yet)
   */
  async getLeafFiles(): Promise<StoredFile[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const leafFiles: StoredFile[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const storedFile = cursor.value;
          if (storedFile && storedFile.isLeaf !== false) { // Default to true if undefined
            leafFiles.push(storedFile);
          }
          cursor.continue();
        } else {
          resolve(leafFiles);
        }
      };
    });
  }

  /**
   * Get metadata of only leaf files (without loading data into memory)
   */
  async getLeafFileMetadata(): Promise<Omit<StoredFile, 'data'>[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const files: Omit<StoredFile, 'data'>[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const storedFile = cursor.value;
          // Only include leaf files (default to true if undefined for backward compatibility)
          if (storedFile && storedFile.name && typeof storedFile.size === 'number' && storedFile.isLeaf !== false) {
            files.push({
              id: storedFile.id,
              name: storedFile.name,
              type: storedFile.type,
              size: storedFile.size,
              lastModified: storedFile.lastModified,
              thumbnail: storedFile.thumbnail,
              isLeaf: storedFile.isLeaf
            });
          }
          cursor.continue();
        } else {
          console.log('📄 LEAF FLAG DEBUG - Found leaf files:', files.map(f => ({ id: f.id, name: f.name, isLeaf: f.isLeaf })));
          resolve(files);
        }
      };
    });
  }

  /**
   * Clear all stored files
   */
  async clearAll(): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get storage statistics (only our IndexedDB usage)
   */
  async getStorageStats(): Promise<StorageStats> {
    let used = 0;
    let available = 0;
    let quota: number | undefined;
    let fileCount = 0;

    try {
      // Get browser quota for context
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota;
        available = estimate.quota || 0;
      }

      // Calculate our actual IndexedDB usage from file metadata
      const files = await this.getAllFileMetadata();
      used = files.reduce((total, file) => total + (file?.size || 0), 0);
      fileCount = files.length;

      // Adjust available space
      if (quota) {
        available = quota - used;
      }

    } catch (error) {
      console.warn('Could not get storage stats:', error);
      // If we can't read metadata, database might be purged
      used = 0;
      fileCount = 0;
    }

    return {
      used,
      available,
      fileCount,
      quota
    };
  }

  /**
   * Get file count quickly without loading metadata
   */
  async getFileCount(): Promise<number> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Check all IndexedDB databases to see if files are in another version
   */
  async debugAllDatabases(): Promise<void> {
    console.log('=== Checking All IndexedDB Databases ===');

    if ('databases' in indexedDB) {
      try {
        const databases = await indexedDB.databases();
        console.log('Found databases:', databases);

        for (const dbInfo of databases) {
          if (dbInfo.name?.includes('stirling') || dbInfo.name?.includes('pdf')) {
            console.log(`Checking database: ${dbInfo.name} (version: ${dbInfo.version})`);
            try {
              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbInfo.name!, dbInfo.version);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });

              console.log(`Database ${dbInfo.name} object stores:`, Array.from(db.objectStoreNames));
              db.close();
            } catch (error) {
              console.error(`Failed to open database ${dbInfo.name}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to list databases:', error);
      }
    } else {
      console.log('indexedDB.databases() not supported');
    }

    // Also check our specific database with different versions
    for (let version = 1; version <= 3; version++) {
      try {
        console.log(`Trying to open ${this.dbConfig.name} version ${version}...`);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(this.dbConfig.name, version);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onupgradeneeded = () => {
            // Don't actually upgrade, just check
            request.transaction?.abort();
          };
        });

        console.log(`Version ${version} object stores:`, Array.from(db.objectStoreNames));

        if (db.objectStoreNames.contains('files')) {
          const transaction = db.transaction(['files'], 'readonly');
          const store = transaction.objectStore('files');
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            console.log(`Version ${version} files store has ${countRequest.result} entries`);
          };
        }

        db.close();
      } catch (error) {
        if (error instanceof Error) {
          console.log(`Version ${version} not accessible:`, error.message);
        }
      }
    }
  }

  /**
   * Debug method to check what's actually in the database
   */
  async debugDatabaseContents(): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      // First try getAll to see if there's anything
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => {
        console.log('=== Raw getAll() result ===');
        console.log('Raw entries found:', getAllRequest.result.length);
        getAllRequest.result.forEach((item, index) => {
          console.log(`Raw entry ${index}:`, {
            keys: Object.keys(item || {}),
            id: item?.id,
            name: item?.name,
            size: item?.size,
            type: item?.type,
            hasData: !!item?.data,
            dataSize: item?.data?.byteLength,
            fullObject: item
          });
        });
      };

      // Then try cursor
      const cursorRequest = store.openCursor();
      console.log('=== IndexedDB Cursor Debug ===');
      let count = 0;

      cursorRequest.onerror = () => {
        console.error('Cursor error:', cursorRequest.error);
        reject(cursorRequest.error);
      };

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          count++;
          const value = cursor.value;
          console.log(`Cursor File ${count}:`, {
            id: value?.id,
            name: value?.name,
            size: value?.size,
            type: value?.type,
            hasData: !!value?.data,
            dataSize: value?.data?.byteLength,
            hasThumbnail: !!value?.thumbnail,
            allKeys: Object.keys(value || {})
          });
          cursor.continue();
        } else {
          console.log(`=== End Cursor Debug - Found ${count} files ===`);
          resolve();
        }
      };
    });
  }

  /**
   * Convert StoredFile back to pure File object without mutations
   * Returns a clean File object - use FileContext.addStoredFiles() for proper metadata handling
   */
  createFileFromStored(storedFile: StoredFile): File {
    if (!storedFile || !storedFile.data) {
      throw new Error('Invalid stored file: missing data');
    }

    if (!storedFile.name || typeof storedFile.size !== 'number') {
      throw new Error('Invalid stored file: missing metadata');
    }

    const blob = new Blob([storedFile.data], { type: storedFile.type });
    const file = new File([blob], storedFile.name, {
      type: storedFile.type,
      lastModified: storedFile.lastModified
    });

    // Use FileContext.addStoredFiles() to properly associate with metadata
    return file;
  }

  /**
   * Convert StoredFile to the format expected by FileContext.addStoredFiles()
   * This is the recommended way to load stored files into FileContext
   */
  createFileWithMetadata(storedFile: StoredFile): { file: File; originalId: FileId; metadata: { thumbnail?: string } } {
    const file = this.createFileFromStored(storedFile);

    return {
      file,
      originalId: storedFile.id,
      metadata: {
        thumbnail: storedFile.thumbnail
      }
    };
  }

  /**
   * Create blob URL for stored file
   */
  createBlobUrl(storedFile: StoredFile): string {
    const blob = new Blob([storedFile.data], { type: storedFile.type });
    return URL.createObjectURL(blob);
  }

  /**
   * Get file data as ArrayBuffer for streaming/chunked processing
   */
  async getFileData(id: FileId): Promise<ArrayBuffer | null> {
    try {
      const storedFile = await this.getFile(id);
      return storedFile ? storedFile.data : null;
    } catch (error) {
      console.warn(`Failed to get file data for ${id}:`, error);
      return null;
    }
  }

  /**
   * Create a temporary blob URL that gets revoked automatically
   */
  async createTemporaryBlobUrl(id: FileId): Promise<string | null> {
    const data = await this.getFileData(id);
    if (!data) return null;

    const blob = new Blob([data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Auto-revoke after a short delay to free memory
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000); // 10 seconds

    return url;
  }

  /**
   * Update thumbnail for an existing file
   */
  async updateThumbnail(id: FileId, thumbnail: string): Promise<boolean> {
    const db = await this.getDatabase();

    return new Promise((resolve, _reject) => {
      try {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const storedFile = getRequest.result;
          if (storedFile) {
            storedFile.thumbnail = thumbnail;
            const updateRequest = store.put(storedFile);

            updateRequest.onsuccess = () => {
              console.log('Thumbnail updated for file:', id);
              resolve(true);
            };
            updateRequest.onerror = () => {
              console.error('Failed to update thumbnail:', updateRequest.error);
              resolve(false);
            };
          } else {
            resolve(false);
          }
        };

        getRequest.onerror = () => {
          console.error('Failed to get file for thumbnail update:', getRequest.error);
          resolve(false);
        };
      } catch (error) {
        console.error('Transaction error during thumbnail update:', error);
        resolve(false);
      }
    });
  }

  /**
   * Check if storage quota is running low
   */
  async isStorageLow(): Promise<boolean> {
    const stats = await this.getStorageStats();
    if (!stats.quota) return false;

    const usagePercent = stats.used / stats.quota;
    return usagePercent > 0.8; // Consider low if over 80% used
  }

  /**
   * Clean up old files if storage is low
   */
  async cleanupOldFiles(maxFiles: number = 50): Promise<void> {
    const files = await this.getAllFileMetadata();

    if (files.length <= maxFiles) return;

    // Sort by last modified (oldest first)
    files.sort((a, b) => a.lastModified - b.lastModified);

    // Delete oldest files
    const filesToDelete = files.slice(0, files.length - maxFiles);
    for (const file of filesToDelete) {
      await this.deleteFile(file.id);
    }
  }
}

// Export singleton instance
export const fileStorage = new FileStorageService();

// Helper hook for React components
export function useFileStorage() {
  return fileStorage;
}
