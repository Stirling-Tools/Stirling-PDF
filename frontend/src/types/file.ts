/**
 * File types for the new architecture
 * FileContext uses pure File objects with separate ID tracking
 */

declare const tag: unique symbol;
export type FileId = string & { readonly [tag]: 'FileId' };

/**
 * Tool operation metadata for history tracking
 * Note: Parameters removed for security - sensitive data like passwords should not be stored in history
 */
export interface ToolOperation {
  toolName: string;
  timestamp: number;
}

/**
 * File history information extracted from PDF metadata
 * Timestamps come from standard PDF metadata fields (CreationDate, ModificationDate)
 */
export interface FileHistoryInfo {
  originalFileId: string;
  parentFileId?: FileId;
  versionNumber: number;
  toolChain: ToolOperation[];
}

/**
 * Base file metadata shared between storage and runtime layers
 * Contains all common file properties and history tracking
 */
export interface BaseFileMetadata {
  id: FileId;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt?: number; // When file was added to system
  
  // File history tracking
  isLeaf?: boolean; // True if this file hasn't been processed yet
  originalFileId?: string; // Root file ID for grouping versions
  versionNumber?: number; // Version number in chain
  parentFileId?: FileId; // Immediate parent file ID
  toolHistory?: Array<{
    toolName: string;
    timestamp: number;
  }>; // Tool chain for history tracking

  // Standard PDF document metadata
  pdfMetadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

// FileMetadata has been replaced with StoredFileMetadata from '../services/fileStorage'
// This ensures clear type relationships and eliminates duplication


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
