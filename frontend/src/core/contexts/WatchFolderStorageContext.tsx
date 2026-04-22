/**
 * Context for abstracting Watch Folder storage.
 *
 * Core provides a default IDB-only implementation.
 * Proprietary can override with a server-backed implementation
 * that uses IDB as a local cache.
 */

import React, { createContext, useContext } from 'react';
import { SmartFolder, FolderRecord } from '@app/types/smartFolders';
import { SmartFolderRunEntry } from '@app/types/smartFolders';

// ── Storage interface ──────────────────────────────────────────────────────

export interface WatchFolderStorageBackend {
  // Folder CRUD
  getAllFolders(): Promise<SmartFolder[]>;
  getFolder(id: string): Promise<SmartFolder | null>;
  createFolder(data: Omit<SmartFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartFolder>;
  createFolderWithId(folder: SmartFolder): Promise<SmartFolder>;
  updateFolder(folder: SmartFolder): Promise<SmartFolder>;
  deleteFolder(id: string): Promise<void>;

  // File metadata
  getFolderData(folderId: string): Promise<FolderRecord | null>;
  updateFileMetadata(folderId: string, fileId: string, meta: Partial<import('@app/types/smartFolders').FolderFileMetadata>): Promise<void>;
  addFileToFolder(folderId: string, fileId: string, meta?: Partial<import('@app/types/smartFolders').FolderFileMetadata>): Promise<void>;
  clearFolder(folderId: string): Promise<void>;

  // Run state
  getFolderRunState(folderId: string): Promise<SmartFolderRunEntry[]>;
  addFolderRunEntries(folderId: string, entries: SmartFolderRunEntry[]): Promise<void>;
  clearFolderRunState(folderId: string): Promise<void>;

  /** Subscribe to storage change events. Returns unsubscribe function. */
  onChange(callback: () => void): () => void;
}

// ── Context ────────────────────────────────────────────────────────────────

const WatchFolderStorageContext = createContext<WatchFolderStorageBackend | null>(null);

export function WatchFolderStorageProvider({
  backend,
  children,
}: {
  backend: WatchFolderStorageBackend;
  children: React.ReactNode;
}) {
  return (
    <WatchFolderStorageContext.Provider value={backend}>
      {children}
    </WatchFolderStorageContext.Provider>
  );
}

/**
 * Returns the storage backend from context, or null if none is provided
 * (meaning hooks should fall back to direct IDB imports).
 */
export function useWatchFolderStorage(): WatchFolderStorageBackend | null {
  return useContext(WatchFolderStorageContext);
}
