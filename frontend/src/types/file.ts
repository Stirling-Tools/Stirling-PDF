/**
 * File types for the new architecture
 * FileContext uses pure File objects with separate ID tracking
 */

declare const tag: unique symbol;
export type FileId = string & { readonly [tag]: 'FileId' };

/**
 * File metadata for efficient operations without loading full file data
 * Used by IndexedDBContext and FileContext for lazy file loading
 */
export interface FileMetadata {
  id: FileId;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  thumbnail?: string;
  isDraft?: boolean; // Marks files as draft versions
}

export interface StorageConfig {
  useIndexedDB: boolean;
  maxFileSize: number; // Maximum size per file in bytes
  maxTotalStorage: number; // Maximum total storage in bytes
  warningThreshold: number; // Warning threshold (percentage 0-1)
}

export const defaultStorageConfig: StorageConfig = {
  useIndexedDB: true,
  maxFileSize: 100 * 1024 * 1024, // 100MB per file
  maxTotalStorage: 1024 * 1024 * 1024, // 1GB default, will be updated dynamically
  warningThreshold: 0.8, // Warn at 80% capacity
};

// Calculate and update storage limit: half of available storage or 10GB, whichever is smaller
export const initializeStorageConfig = async (): Promise<StorageConfig> => {
  const tenGB = 10 * 1024 * 1024 * 1024; // 10GB in bytes
  const oneGB = 1024 * 1024 * 1024; // 1GB fallback

  let maxTotalStorage = oneGB; // Default fallback

  // Try to estimate available storage
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota) {
        const halfQuota = estimate.quota / 2;
        maxTotalStorage = Math.min(halfQuota, tenGB);
      }
    } catch (error) {
      console.warn('Could not estimate storage quota, using 1GB default:', error);
    }
  }

  return {
    ...defaultStorageConfig,
    maxTotalStorage
  };
};
