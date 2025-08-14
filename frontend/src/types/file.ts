/**
 * Enhanced file types for IndexedDB storage with UUID system
 * Extends File interface for compatibility with existing utilities
 */

export interface FileWithUrl extends File {
  id: string; // Required UUID from FileContext
  url?: string; // Blob URL for display
  thumbnail?: string;
  contentHash?: string; // SHA-256 content hash
  hashStatus?: 'pending' | 'completed' | 'failed';
  storedInIndexedDB?: boolean;
}

/**
 * Metadata-only version for efficient recent files loading
 */
export interface FileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  thumbnail?: string;
  contentHash?: string;
  hashStatus?: 'pending' | 'completed' | 'failed';
  storedInIndexedDB?: boolean;
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