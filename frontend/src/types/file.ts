/**
 * Enhanced file types for IndexedDB storage
 */

export interface FileWithUrl extends File {
  id?: string;
  url?: string;
  thumbnail?: string;
  storedInIndexedDB?: boolean;
}

export interface StorageConfig {
  useIndexedDB: boolean;
  // Simplified - no thresholds needed, IndexedDB for everything
}

export const defaultStorageConfig: StorageConfig = {
  useIndexedDB: true,
};