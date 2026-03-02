/**
 * Stirling File Storage Service
 * Single-table architecture with typed query methods
 * Forces correct usage patterns through service API design
 */

import { FileId, BaseFileMetadata } from '@app/types/file';
import { StirlingFile, StirlingFileStub, createStirlingFile } from '@app/types/fileContext';
import { indexedDBManager, DATABASE_CONFIGS } from '@app/services/indexedDBManager';

/**
 * Storage record - single source of truth
 * Contains all data needed for both StirlingFile and StirlingFileStub
 */
export interface StoredStirlingFileRecord extends BaseFileMetadata {
  data: ArrayBuffer;
  fileId: FileId; // Matches runtime StirlingFile.fileId exactly
  quickKey: string; // Matches runtime StirlingFile.quickKey exactly
  thumbnail?: string;
  url?: string; // For compatibility with existing components
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
   * Store a StirlingFile with its metadata from StirlingFileStub
   */
  async storeStirlingFile(stirlingFile: StirlingFile, stub: StirlingFileStub): Promise<void> {
    const db = await this.getDatabase();
    const arrayBuffer = await stirlingFile.arrayBuffer();

    const record: StoredStirlingFileRecord = {
      id: stirlingFile.fileId,
      fileId: stirlingFile.fileId, // Explicit field for clarity
      quickKey: stirlingFile.quickKey,
      name: stirlingFile.name,
      type: stirlingFile.type,
      size: stirlingFile.size,
      lastModified: stirlingFile.lastModified,
      data: arrayBuffer,
      thumbnail: stub.thumbnailUrl,
      isLeaf: stub.isLeaf ?? true,

      // History data from stub
      versionNumber: stub.versionNumber ?? 1,
      originalFileId: stub.originalFileId ?? stirlingFile.fileId,
      parentFileId: stub.parentFileId ?? undefined,
      toolHistory: stub.toolHistory ?? []
    };

    return new Promise((resolve, reject) => {
      try {
        // Verify store exists before creating transaction
        if (!db.objectStoreNames.contains(this.storeName)) {
          throw new Error(`Object store '${this.storeName}' not found. Available stores: ${Array.from(db.objectStoreNames).join(', ')}`);
        }

        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        const request = store.add(record);

        request.onerror = () => {
          console.error('IndexedDB add error:', request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          resolve();
        };
      } catch (error) {
        console.error('Transaction error:', error);
        reject(error);
      }
    });
  }

  /**
   * Get StirlingFile with full data - for loading into workbench
   */
  async getStirlingFile(id: FileId): Promise<StirlingFile | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as StoredStirlingFileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Create File from stored data
        const blob = new Blob([record.data], { type: record.type });
        const file = new File([blob], record.name, {
          type: record.type,
          lastModified: record.lastModified
        });

        // Convert to StirlingFile with preserved IDs
        const stirlingFile = createStirlingFile(file, record.fileId);
        resolve(stirlingFile);
      };
    });
  }

  /**
   * Get multiple StirlingFiles - for batch loading
   */
  async getStirlingFiles(ids: FileId[]): Promise<StirlingFile[]> {
    const results = await Promise.all(ids.map(id => this.getStirlingFile(id)));
    return results.filter((file): file is StirlingFile => file !== null);
  }

  /**
   * Get StirlingFileStub (metadata only) - for UI browsing
   */
  async getStirlingFileStub(id: FileId): Promise<StirlingFileStub | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as StoredStirlingFileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Create StirlingFileStub from metadata (no file data)
        const stub: StirlingFileStub = {
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          lastModified: record.lastModified,
          quickKey: record.quickKey,
          thumbnailUrl: record.thumbnail,
          isLeaf: record.isLeaf,
          versionNumber: record.versionNumber,
          originalFileId: record.originalFileId,
          parentFileId: record.parentFileId,
          toolHistory: record.toolHistory,
          createdAt: Date.now() // Current session
        };

        resolve(stub);
      };
    });
  }

  /**
   * Get all StirlingFileStubs (metadata only) - for FileManager browsing
   */
  async getAllStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const stubs: StirlingFileStub[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          if (record && record.name && typeof record.size === 'number') {
            // Extract metadata only - no file data
            stubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: record.thumbnail,
              isLeaf: record.isLeaf,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              createdAt: Date.now()
            });
          }
          cursor.continue();
        } else {
          resolve(stubs);
        }
      };
    });
  }

  /**
   * Get leaf StirlingFileStubs only - for unprocessed files
   */
  async getLeafStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const leafStubs: StirlingFileStub[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          // Only include leaf files (default to true if undefined)
          if (record && record.name && typeof record.size === 'number' && record.isLeaf !== false) {
            leafStubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: record.thumbnail,
              isLeaf: record.isLeaf,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              createdAt: Date.now()
            });
          }
          cursor.continue();
        } else {
          resolve(leafStubs);
        }
      };
    });
  }

  /**
   * Delete StirlingFile - single operation, no sync issues
   */
  async deleteStirlingFile(id: FileId): Promise<void> {
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
   * Update thumbnail for existing file
   */
  async updateThumbnail(id: FileId, thumbnail: string): Promise<boolean> {
    const db = await this.getDatabase();

    return new Promise((resolve, _reject) => {
      try {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const record = getRequest.result as StoredStirlingFileRecord;
          if (record) {
            record.thumbnail = thumbnail;
            const updateRequest = store.put(record);

            updateRequest.onsuccess = () => {
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
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    let used: number;
    let fileCount: number;
    let available = 0;
    let quota: number | undefined;

    try {
      // Get browser quota for context
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota;
        available = estimate.quota || 0;
      }

      // Calculate our actual IndexedDB usage from file metadata
      const stubs = await this.getAllStirlingFileStubs();
      used = stubs.reduce((total, stub) => total + (stub?.size || 0), 0);
      fileCount = stubs.length;

      // Adjust available space
      if (quota) {
        available = quota - used;
      }

    } catch (error) {
      console.warn('Could not get storage stats:', error);
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
   * Create blob URL for stored file data
   */
  async createBlobUrl(id: FileId): Promise<string | null> {
    try {
      const db = await this.getDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const record = request.result as StoredStirlingFileRecord | undefined;
          if (record) {
            const blob = new Blob([record.data], { type: record.type });
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn(`Failed to create blob URL for ${id}:`, error);
      return null;
    }
  }

  /**
   * Mark a file as processed (no longer a leaf file)
   * Used when a file becomes input to a tool operation
   */
  async markFileAsProcessed(fileId: FileId): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record = await new Promise<StoredStirlingFileRecord | undefined>((resolve, reject) => {
        const request = store.get(fileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!record) {
        return false; // File not found
      }

      // Update the isLeaf flag to false
      record.isLeaf = false;

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error('Failed to mark file as processed:', error);
      return false;
    }
  }

  /**
   * Mark a file as leaf (opposite of markFileAsProcessed)
   * Used when promoting a file back to "recent" status
   */
  async markFileAsLeaf(fileId: FileId): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record = await new Promise<StoredStirlingFileRecord | undefined>((resolve, reject) => {
        const request = store.get(fileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!record) {
        return false; // File not found
      }

      // Update the isLeaf flag to true
      record.isLeaf = true;

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error('Failed to mark file as leaf:', error);
      return false;
    }
  }
}

// Export singleton instance
export const fileStorage = new FileStorageService();

// Helper hook for React components
export function useFileStorage() {
  return fileStorage;
}
