/**
 * IndexedDBContext - Clean persistence layer for file storage
 * Integrates with FileContext to provide transparent file persistence
 */

import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { fileStorage } from "@app/services/fileStorage";
import { FileId } from "@app/types/file";
import { StirlingFileStub, createStirlingFile, createQuickKey } from "@app/types/fileContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";

const DEBUG = process.env.NODE_ENV === "development";

interface IndexedDBContextValue {
  // Core CRUD operations
  saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<StirlingFileStub>;
  loadFile: (fileId: FileId) => Promise<File | null>;
  loadMetadata: (fileId: FileId) => Promise<StirlingFileStub | null>;
  deleteFile: (fileId: FileId) => Promise<void>;

  // Batch operations
  loadAllMetadata: () => Promise<StirlingFileStub[]>;
  loadLeafMetadata: () => Promise<StirlingFileStub[]>; // Only leaf files for recent files list
  deleteMultiple: (fileIds: FileId[]) => Promise<void>;
  clearAll: () => Promise<void>;

  // Utilities
  getStorageStats: () => Promise<{ used: number; available: number; fileCount: number }>;
  updateThumbnail: (fileId: FileId, thumbnail: string) => Promise<boolean>;
  markFileAsProcessed: (fileId: FileId) => Promise<boolean>;

  // Incremented after any write or delete — subscribe to trigger re-reads
  revision: number;
  bumpRevision: () => void;
}

const IndexedDBContext = createContext<IndexedDBContextValue | null>(null);

interface IndexedDBProviderProps {
  children: React.ReactNode;
}

export function IndexedDBProvider({ children }: IndexedDBProviderProps) {
  const [revision, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);

  // LRU File cache to avoid repeated ArrayBuffer→File conversions
  const fileCache = useRef(new Map<FileId, { file: File; lastAccessed: number }>());
  const MAX_CACHE_SIZE = 50; // Maximum number of files to cache

  // LRU cache management
  const evictLRUEntries = useCallback(() => {
    if (fileCache.current.size <= MAX_CACHE_SIZE) return;

    // Convert to array and sort by last accessed time (oldest first)
    const entries = Array.from(fileCache.current.entries()).sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove the least recently used entries
    const toRemove = entries.slice(0, fileCache.current.size - MAX_CACHE_SIZE);
    toRemove.forEach(([fileId]) => {
      fileCache.current.delete(fileId);
    });

    if (DEBUG) console.log(`🗂️ Evicted ${toRemove.length} LRU cache entries`);
  }, []);

  const saveFile = useCallback(
    async (file: File, fileId: FileId, existingThumbnail?: string): Promise<StirlingFileStub> => {
      // Use existing thumbnail or generate new one if none provided
      const thumbnail = existingThumbnail || (await generateThumbnailForFile(file));

      // History is handled via direct fileStorage calls, not here
      const stirlingFile = createStirlingFile(file, fileId);

      // Create minimal stub for storage
      const stub: StirlingFileStub = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        quickKey: createQuickKey(file),
        thumbnailUrl: thumbnail,
        isLeaf: true,
        createdAt: Date.now(),
        versionNumber: 1,
        originalFileId: fileId,
        toolHistory: [],
      };

      await fileStorage.storeStirlingFile(stirlingFile, stub);
      const storedFile = await fileStorage.getStirlingFileStub(fileId);

      // Cache the file object for immediate reuse
      fileCache.current.set(fileId, { file, lastAccessed: Date.now() });
      evictLRUEntries();

      // Return StirlingFileStub from the stored file (no conversion needed)
      if (!storedFile) {
        throw new Error(`Failed to retrieve stored file after saving: ${file.name}`);
      }

      bumpRevision();
      return storedFile;
    },
    [bumpRevision],
  );

  const loadFile = useCallback(
    async (fileId: FileId): Promise<File | null> => {
      // Check cache first
      const cached = fileCache.current.get(fileId);
      if (cached) {
        // Update last accessed time for LRU
        cached.lastAccessed = Date.now();
        return cached.file;
      }

      // Load from IndexedDB
      const storedFile = await fileStorage.getStirlingFile(fileId);
      if (!storedFile) return null;

      // StirlingFile is already a File object, no reconstruction needed
      const file = storedFile;

      // Cache for future use with LRU eviction
      fileCache.current.set(fileId, { file, lastAccessed: Date.now() });
      evictLRUEntries();

      return file;
    },
    [evictLRUEntries],
  );

  const loadMetadata = useCallback(async (fileId: FileId): Promise<StirlingFileStub | null> => {
    // Load stub directly from storage service
    return await fileStorage.getStirlingFileStub(fileId);
  }, []);

  const deleteFile = useCallback(
    async (fileId: FileId): Promise<void> => {
      // Remove from cache
      fileCache.current.delete(fileId);

      // Remove from IndexedDB
      await fileStorage.deleteStirlingFile(fileId);
      bumpRevision();
    },
    [bumpRevision],
  );

  const loadLeafMetadata = useCallback(async (): Promise<StirlingFileStub[]> => {
    const metadata = await fileStorage.getLeafStirlingFileStubs(); // Only get leaf files

    // All files are already StirlingFileStub objects, no processing needed
    return metadata;
  }, []);

  const loadAllMetadata = useCallback(async (): Promise<StirlingFileStub[]> => {
    const metadata = await fileStorage.getAllStirlingFileStubs();

    // All files are already StirlingFileStub objects, no processing needed
    return metadata;
  }, []);

  const deleteMultiple = useCallback(
    async (fileIds: FileId[]): Promise<void> => {
      // Remove from cache
      fileIds.forEach((id) => fileCache.current.delete(id));

      // Delete all in a single IDB transaction
      await fileStorage.deleteMultipleStirlingFiles(fileIds);
      bumpRevision();
    },
    [bumpRevision],
  );

  const clearAll = useCallback(async (): Promise<void> => {
    // Clear cache
    fileCache.current.clear();

    // Clear IndexedDB
    await fileStorage.clearAll();
    bumpRevision();
  }, [bumpRevision]);

  const getStorageStats = useCallback(async () => {
    return await fileStorage.getStorageStats();
  }, []);

  const updateThumbnail = useCallback(
    async (fileId: FileId, thumbnail: string): Promise<boolean> => {
      const result = await fileStorage.updateThumbnail(fileId, thumbnail);
      if (result) bumpRevision();
      return result;
    },
    [bumpRevision],
  );

  const markFileAsProcessed = useCallback(
    async (fileId: FileId): Promise<boolean> => {
      const result = await fileStorage.markFileAsProcessed(fileId);
      if (result) bumpRevision();
      return result;
    },
    [bumpRevision],
  );

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
    markFileAsProcessed,
    revision,
    bumpRevision,
  };

  return <IndexedDBContext.Provider value={value}>{children}</IndexedDBContext.Provider>;
}

export function useIndexedDB() {
  const context = useContext(IndexedDBContext);
  if (!context) {
    throw new Error("useIndexedDB must be used within an IndexedDBProvider");
  }
  return context;
}
