/**
 * IndexedDBContext - Clean persistence layer for file storage
 * Integrates with FileContext to provide transparent file persistence
 */

import React, { createContext, useContext, useCallback, useRef } from 'react';

const DEBUG = process.env.NODE_ENV === 'development';
import { fileStorage, StoredFile } from '../services/fileStorage';
import { FileId } from '../types/fileContext';
import { FileMetadata } from '../types/file';
import { generateThumbnailForFile } from '../utils/thumbnailUtils';

interface IndexedDBContextValue {
  // Core CRUD operations
  saveFile: (file: File, fileId: FileId, thumbnail?: string) => Promise<FileMetadata>;
  loadFile: (fileId: FileId) => Promise<File | null>;
  loadMetadata: (fileId: FileId) => Promise<FileMetadata | null>;
  deleteFile: (fileId: FileId) => Promise<void>;
  
  // Batch operations
  loadAllMetadata: () => Promise<FileMetadata[]>;
  deleteMultiple: (fileIds: FileId[]) => Promise<void>;
  clearAll: () => Promise<void>;
  
  // Utilities
  getStorageStats: () => Promise<{ used: number; available: number; fileCount: number }>;
  
  // Draft operations
  loadAllDraftMetadata: () => Promise<FileMetadata[]>;
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
    // Check for duplicate at IndexedDB level before saving
    const quickKey = `${file.name}|${file.size}|${file.lastModified}`;
    const existingFiles = await fileStorage.getAllFileMetadata();
    const duplicate = existingFiles.find(stored => 
      `${stored.name}|${stored.size}|${stored.lastModified}` === quickKey
    );
    
    if (duplicate) {
      if (DEBUG) console.log(`🔍 SAVE: Skipping IndexedDB duplicate - using existing record:`, duplicate.name);
      // Return the existing file's metadata instead of saving duplicate
      return {
        id: duplicate.id,
        name: duplicate.name,
        type: duplicate.type,
        size: duplicate.size,
        lastModified: duplicate.lastModified,
        thumbnail: duplicate.thumbnail
      };
    }
    
    // DEBUG: Check original file before saving
    if (DEBUG && file.type === 'application/pdf') {
      try {
        const { getDocument } = await import('pdfjs-dist');
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        console.log(`🔍 BEFORE SAVE - Original file:`, {
          name: file.name,
          size: file.size,
          arrayBufferSize: arrayBuffer.byteLength,
          pages: pdf.numPages
        });
        pdf.destroy();
      } catch (error) {
        console.error(`🔍 Error validating file before save:`, error);
      }
    }
    
    // Use existing thumbnail or generate new one
    const thumbnail = existingThumbnail || await generateThumbnailForFile(file);
    
    // Store in IndexedDB
    const storedFile = await fileStorage.storeFile(file, fileId, thumbnail);
    
    // Cache the file object for immediate reuse
    fileCache.current.set(fileId, { file, lastAccessed: Date.now() });
    evictLRUEntries();
    
    // Return metadata
    return {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      thumbnail
    };
  }, []);

  const loadFile = useCallback(async (fileId: FileId): Promise<File | null> => {
    // Check cache first
    const cached = fileCache.current.get(fileId);
    if (cached) {
      // Update last accessed time for LRU
      cached.lastAccessed = Date.now();
      return cached.file;
    }

    // Load from IndexedDB using the internal fileStorage (which wraps indexedDBManager)
    const storedFile = await fileStorage.getFile(fileId);
    if (!storedFile) {
      if (DEBUG) console.log(`📁 File not found in IndexedDB: ${fileId}`);
      return null;
    }

    // Reconstruct File object
    const file = new File([storedFile.data], storedFile.name, {
      type: storedFile.type,
      lastModified: storedFile.lastModified
    });

    // DEBUG: Check if file reconstruction is working
    if (DEBUG && file.type === 'application/pdf') {
      console.log(`🔍 AFTER LOAD - Reconstructed file:`, {
        name: file.name,
        originalSize: storedFile.size,
        reconstructedSize: file.size,
        dataLength: storedFile.data.byteLength,
        sizesMatch: storedFile.size === file.size
      });
      
      // Quick PDF validation
      try {
        const { getDocument } = await import('pdfjs-dist');
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        console.log(`🔍 AFTER LOAD - PDF validation: ${pdf.numPages} pages in reconstructed file`);
        pdf.destroy();
      } catch (error) {
        console.error(`🔍 AFTER LOAD - PDF reconstruction error:`, error);
      }
    }

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

  const loadAllMetadata = useCallback(async (): Promise<FileMetadata[]> => {
    const metadata = await fileStorage.getAllFileMetadata();
    
    return metadata.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      size: m.size,
      lastModified: m.lastModified,
      thumbnail: m.thumbnail
    }));
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

  const loadAllDraftMetadata = useCallback(async (): Promise<FileMetadata[]> => {
    try {
      const { indexedDBManager, DATABASE_CONFIGS } = await import('../services/indexedDBManager');
      const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.DRAFTS);
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['drafts'], 'readonly');
        const store = transaction.objectStore('drafts');
        const request = store.getAll();
        
        request.onsuccess = () => {
          const drafts = request.result || [];
          const draftMetadata: FileMetadata[] = drafts.map((draft: any) => ({
            id: draft.id,
            name: draft.name || `Draft ${draft.id}`,
            type: 'application/pdf',
            size: draft.size || 0,
            lastModified: draft.timestamp || Date.now(),
            thumbnail: draft.thumbnail,
            isDraft: true
          }));
          resolve(draftMetadata);
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to load draft metadata:', error);
      return [];
    }
  }, []);

  // No periodic cleanup needed - LRU eviction happens on-demand when cache fills

  const value: IndexedDBContextValue = {
    saveFile,
    loadFile,
    loadMetadata,
    deleteFile,
    loadAllMetadata,
    deleteMultiple,
    clearAll,
    getStorageStats,
    loadAllDraftMetadata
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