/**
 * IndexedDB File Storage Service
 * Provides high-capacity file storage for PDF processing
 */

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
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
  private dbName = 'stirling-pdf-files';
  private dbVersion = 2; // Increment version to force schema update
  private storeName = 'files';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database (singleton pattern)
   */
  async init(): Promise<void> {
    if (this.db) {
      return Promise.resolve();
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB connection established');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = (event as any).oldVersion;
        
        console.log('IndexedDB upgrade needed from version', oldVersion, 'to', this.dbVersion);
        
        // Only recreate object store if it doesn't exist or if upgrading from version < 2
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('lastModified', 'lastModified', { unique: false });
          console.log('IndexedDB object store created with keyPath: id');
        } else if (oldVersion < 2) {
          // Only delete and recreate if upgrading from version 1 to 2
          db.deleteObjectStore(this.storeName);
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('lastModified', 'lastModified', { unique: false });
          console.log('IndexedDB object store recreated with keyPath: id (version upgrade)');
        }
      };
    });
    
    return this.initPromise;
  }

  /**
   * Store a file in IndexedDB
   */
  async storeFile(file: File, thumbnail?: string): Promise<StoredFile> {
    if (!this.db) await this.init();

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const arrayBuffer = await file.arrayBuffer();
    
    const storedFile: StoredFile = {
      id,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      data: arrayBuffer,
      thumbnail
    };

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        // Debug logging
        console.log('Object store keyPath:', store.keyPath);
        console.log('Storing file:', { 
          id: storedFile.id, 
          name: storedFile.name, 
          hasData: !!storedFile.data,
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
  async getFile(id: string): Promise<StoredFile | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
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
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
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
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
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
          console.log('Loaded metadata for', files.length, 'files without loading data');
          resolve(files);
        }
      };
    });
  }

  /**
   * Delete a file from IndexedDB
   */
  async deleteFile(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear all stored files
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
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
    if (!this.db) await this.init();

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
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
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
        console.log(`Trying to open ${this.dbName} version ${version}...`);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(this.dbName, version);
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
        console.log(`Version ${version} not accessible:`, error.message);
      }
    }
  }

  /**
   * Debug method to check what's actually in the database
   */
  async debugDatabaseContents(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
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
   * Convert StoredFile back to File object for compatibility
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
    
    // Add custom properties for compatibility
    Object.defineProperty(file, 'id', { value: storedFile.id, writable: false });
    Object.defineProperty(file, 'thumbnail', { value: storedFile.thumbnail, writable: false });
    
    return file;
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
  async getFileData(id: string): Promise<ArrayBuffer | null> {
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
  async createTemporaryBlobUrl(id: string): Promise<string | null> {
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
  async updateThumbnail(id: string, thumbnail: string): Promise<boolean> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite');
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