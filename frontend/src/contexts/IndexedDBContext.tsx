/**
 * IndexedDBContext - Clean persistence layer for file storage
 * Integrates with FileContext to provide transparent file persistence
 */

import React, { createContext, useContext, useCallback, useRef } from 'react';

const DEBUG = process.env.NODE_ENV === 'development';
import { fileStorage, StoredFile } from '../services/fileStorage';
import { FileId } from '../types/file';
import { FileMetadata } from '../types/file';
import { generateThumbnailForFile } from '../utils/thumbnailUtils';
import { createFileMetadataWithHistory } from '../utils/fileHistoryUtils';

interface IndexedDBContextValue {
  // Core CRUD operations
  saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<FileMetadata>;
  loadFile: (fileId: FileId) => Promise<File | null>;
  loadMetadata: (fileId: FileId) => Promise<FileMetadata | null>;
  deleteFile: (fileId: FileId) => Promise<void>;

  // Batch operations
  loadAllMetadata: () => Promise<FileMetadata[]>;
  loadLeafMetadata: () => Promise<FileMetadata[]>; // Only leaf files for recent files list
  deleteMultiple: (fileIds: FileId[]) => Promise<void>;
  clearAll: () => Promise<void>;

  // Utilities
  getStorageStats: () => Promise<{ used: number; available: number; fileCount: number }>;
  updateThumbnail: (fileId: FileId, thumbnail: string) => Promise<boolean>;
  markFileAsProcessed: (fileId: FileId) => Promise<boolean>;
}

const IndexedDBContext = createContext<IndexedDBContextValue | null>(null);

interface IndexedDBProviderProps {
  children: React.ReactNode;
}

export function IndexedDBProvider({ children }: IndexedDBProviderProps) {
  // LRU File cache to avoid repeated ArrayBuffer→File conversions
  const fileCache = useRef(new Map<FileId, { file: File; lastAccessed: number }>());
  const MAX_CACHE_SIZE = 50; // Maximum number of files to cache

  // LRU cache management
  const evictLRUEntries = useCallback(() => {
    if (fileCache.current.size <= MAX_CACHE_SIZE) return;

    // Convert to array and sort by last accessed time (oldest first)
    const entries = Array.from(fileCache.current.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove the least recently used entries
    const toRemove = entries.slice(0, fileCache.current.size - MAX_CACHE_SIZE);
    toRemove.forEach(([fileId]) => {
      fileCache.current.delete(fileId);
    });

    if (DEBUG) console.log(`🗂️ Evicted ${toRemove.length} LRU cache entries`);
  }, []);

  const saveFile = useCallback(async (file: File, fileId: FileId, existingThumbnail?: string): Promise<FileMetadata> => {
    // Use existing thumbnail or generate new one if none provided
    const thumbnail = existingThumbnail || await generateThumbnailForFile(file);

    // Store in IndexedDB
    const storedFile = await fileStorage.storeFile(file, fileId, thumbnail);

    // Cache the file object for immediate reuse
    fileCache.current.set(fileId, { file, lastAccessed: Date.now() });
    evictLRUEntries();

    // Extract history metadata for PDFs and return enhanced metadata
    const metadata = await createFileMetadataWithHistory(file, fileId, thumbnail);


    return metadata;
  }, []);

  const loadFile = useCallback(async (fileId: FileId): Promise<File | null> => {
    // Check cache first
    const cached = fileCache.current.get(fileId);
    if (cached) {
      // Update last accessed time for LRU
      cached.lastAccessed = Date.now();
      return cached.file;
    }

    // Load from IndexedDB
    const storedFile = await fileStorage.getFile(fileId);
    if (!storedFile) return null;

    // Reconstruct File object
    const file = new File([storedFile.data], storedFile.name, {
      type: storedFile.type,
      lastModified: storedFile.lastModified
    });

    // Cache for future use with LRU eviction
    fileCache.current.set(fileId, { file, lastAccessed: Date.now() });
    evictLRUEntries();

    return file;
  }, [evictLRUEntries]);

  const loadMetadata = useCallback(async (fileId: FileId): Promise<FileMetadata | null> => {
    // Try to get from cache first (no IndexedDB hit)
    const cached = fileCache.current.get(fileId);
    if (cached) {
      const file = cached.file;
      return {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      };
    }

    // Load metadata from IndexedDB (efficient - no data field)
    const metadata = await fileStorage.getAllFileMetadata();
    const fileMetadata = metadata.find(m => m.id === fileId);

    if (!fileMetadata) return null;

    return {
      id: fileMetadata.id,
      name: fileMetadata.name,
      type: fileMetadata.type,
      size: fileMetadata.size,
      lastModified: fileMetadata.lastModified,
      thumbnail: fileMetadata.thumbnail
    };
  }, []);

  const deleteFile = useCallback(async (fileId: FileId): Promise<void> => {
    // Remove from cache
    fileCache.current.delete(fileId);

    // Remove from IndexedDB
    await fileStorage.deleteFile(fileId);
  }, []);

  const loadLeafMetadata = useCallback(async (): Promise<FileMetadata[]> => {
    const metadata = await fileStorage.getLeafFileMetadata(); // Only get leaf files

    // Separate PDF and non-PDF files for different processing
    const pdfFiles = metadata.filter(m => m.type.includes('pdf'));
    const nonPdfFiles = metadata.filter(m => !m.type.includes('pdf'));

    // Process non-PDF files immediately (no history extraction needed)
    const nonPdfMetadata: FileMetadata[] = nonPdfFiles.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      size: m.size,
      lastModified: m.lastModified,
      thumbnail: m.thumbnail,
      isLeaf: m.isLeaf
    }));

    // Process PDF files with controlled concurrency to avoid memory issues
    const BATCH_SIZE = 5; // Process 5 PDFs at a time to avoid overwhelming memory
    const pdfMetadata: FileMetadata[] = [];

    for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
      const batch = pdfFiles.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (m) => {
        try {
          // For PDF files, load and extract basic history for display only
          const storedFile = await fileStorage.getFile(m.id);
          if (storedFile?.data) {
            const file = new File([storedFile.data], m.name, {
              type: m.type,
              lastModified: m.lastModified
            });
            return await createFileMetadataWithHistory(file, m.id, m.thumbnail);
          }
        } catch (error) {
          if (DEBUG) console.warn('🗂️ Failed to extract basic metadata from leaf file:', m.name, error);
        }

        // Fallback to basic metadata without history
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          size: m.size,
          lastModified: m.lastModified,
          thumbnail: m.thumbnail,
          isLeaf: m.isLeaf
        };
      }));

      pdfMetadata.push(...batchResults);
    }

    return [...nonPdfMetadata, ...pdfMetadata];
  }, []);

  const loadAllMetadata = useCallback(async (): Promise<FileMetadata[]> => {
    const metadata = await fileStorage.getAllFileMetadata();

    // Separate PDF and non-PDF files for different processing
    const pdfFiles = metadata.filter(m => m.type.includes('pdf'));
    const nonPdfFiles = metadata.filter(m => !m.type.includes('pdf'));

    // Process non-PDF files immediately (no history extraction needed)
    const nonPdfMetadata: FileMetadata[] = nonPdfFiles.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      size: m.size,
      lastModified: m.lastModified,
      thumbnail: m.thumbnail
    }));

    // Process PDF files with controlled concurrency to avoid memory issues
    const BATCH_SIZE = 5; // Process 5 PDFs at a time to avoid overwhelming memory
    const pdfMetadata: FileMetadata[] = [];

    for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
      const batch = pdfFiles.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (m) => {
        try {
          // For PDF files, load and extract history with timeout
          const storedFile = await fileStorage.getFile(m.id);
          if (storedFile?.data) {
            const file = new File([storedFile.data], m.name, {
              type: m.type,
              lastModified: m.lastModified
            });
            return await createFileMetadataWithHistory(file, m.id, m.thumbnail);
          }
        } catch (error) {
          if (DEBUG) console.warn('🗂️ Failed to extract history from stored file:', m.name, error);
        }

        // Fallback to basic metadata if history extraction fails
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          size: m.size,
          lastModified: m.lastModified,
          thumbnail: m.thumbnail
        };
      }));

      pdfMetadata.push(...batchResults);
    }

    return [...nonPdfMetadata, ...pdfMetadata];
  }, []);

  const deleteMultiple = useCallback(async (fileIds: FileId[]): Promise<void> => {
    // Remove from cache
    fileIds.forEach(id => fileCache.current.delete(id));

    // Remove from IndexedDB in parallel
    await Promise.all(fileIds.map(id => fileStorage.deleteFile(id)));
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    // Clear cache
    fileCache.current.clear();

    // Clear IndexedDB
    await fileStorage.clearAll();
  }, []);

  const getStorageStats = useCallback(async () => {
    return await fileStorage.getStorageStats();
  }, []);

  const updateThumbnail = useCallback(async (fileId: FileId, thumbnail: string): Promise<boolean> => {
    return await fileStorage.updateThumbnail(fileId, thumbnail);
  }, []);

  const markFileAsProcessed = useCallback(async (fileId: FileId): Promise<boolean> => {
    return await fileStorage.markFileAsProcessed(fileId);
  }, []);

  const value: IndexedDBContextValue = {
    saveFile,
    loadFile,
    loadMetadata,
    deleteFile,
    loadAllMetadata,
    loadLeafMetadata,
    deleteMultiple,
    clearAll,
    getStorageStats,
    updateThumbnail,
    markFileAsProcessed
  };

  return (
    <IndexedDBContext.Provider value={value}>
      {children}
    </IndexedDBContext.Provider>
  );
}

export function useIndexedDB() {
  const context = useContext(IndexedDBContext);
  if (!context) {
    throw new Error('useIndexedDB must be used within an IndexedDBProvider');
  }
  return context;
}
