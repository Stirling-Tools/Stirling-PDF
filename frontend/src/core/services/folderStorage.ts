/**
 * Service for managing folder-file associations in IndexedDB.
 * File blobs are stored in the main stirling-pdf-files database (fileStorage).
 * This service only maintains folder record metadata: which file IDs belong to
 * which folders and their processing status.
 */

import { FolderFileMetadata, FolderRecord } from '@app/types/smartFolders';

const FOLDER_CHANGE_EVENT = 'folder-storage-changed';

class FolderStorage {
  private dbName = 'stirling-pdf-folder-files';
  private dbVersion = 3;
  private recordsStore = 'folderRecords';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open folder files database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.recordsStore)) {
          db.createObjectStore(this.recordsStore, { keyPath: 'folderId' });
        }
        // Remove legacy blob stores — files are now unified in stirling-pdf-files
        if (db.objectStoreNames.contains('folderOutputFiles')) {
          db.deleteObjectStore('folderOutputFiles');
        }
        if (db.objectStoreNames.contains('folderInputFiles')) {
          db.deleteObjectStore('folderInputFiles');
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Folder files database not initialized');
    }
    return this.db;
  }

  private dispatchChange(folderId: string): void {
    window.dispatchEvent(new CustomEvent(FOLDER_CHANGE_EVENT, { detail: { folderId } }));
  }

  onFolderChange(listener: (folderId: string) => void): () => void {
    const handler = (e: Event) => {
      listener((e as CustomEvent).detail.folderId);
    };
    window.addEventListener(FOLDER_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FOLDER_CHANGE_EVENT, handler);
  }

  async getFolderData(folderId: string): Promise<FolderRecord | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readonly');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.get(folderId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get folder data'));
    });
  }

  async addFileToFolder(folderId: string, fileId: string, metadata?: Partial<FolderFileMetadata>): Promise<void> {
    const db = await this.ensureDB();
    const now = new Date();
    return new Promise((resolve, reject) => {
      // Single readwrite transaction for both read and write — prevents lost-update
      // races when multiple files are added to the same folder concurrently.
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const getRequest = store.get(folderId);
      getRequest.onsuccess = () => {
        const record: FolderRecord = getRequest.result || { folderId, files: {}, lastUpdated: Date.now() };
        record.files[fileId] = { addedAt: now, status: 'pending', ...metadata };
        record.lastUpdated = Date.now();
        const putRequest = store.put(record);
        putRequest.onsuccess = () => { this.dispatchChange(folderId); resolve(); };
        putRequest.onerror = () => reject(new Error('Failed to add file to folder'));
      };
      getRequest.onerror = () => reject(new Error('Failed to read folder for add'));
    });
  }

  async updateFileMetadata(folderId: string, fileId: string, updates: Partial<FolderFileMetadata>): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      // Single readwrite transaction — prevents lost-update races during concurrent
      // pipeline runs where multiple files update their status simultaneously.
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const getRequest = store.get(folderId);
      getRequest.onsuccess = () => {
        const existing: FolderRecord | undefined = getRequest.result;
        if (!existing) { resolve(); return; }
        existing.files[fileId] = { ...existing.files[fileId], ...updates };
        existing.lastUpdated = Date.now();
        const putRequest = store.put(existing);
        putRequest.onsuccess = () => { this.dispatchChange(folderId); resolve(); };
        putRequest.onerror = () => reject(new Error('Failed to update file metadata'));
      };
      getRequest.onerror = () => reject(new Error('Failed to read folder for update'));
    });
  }

  async removeFileFromFolder(folderId: string, fileId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const getRequest = store.get(folderId);
      getRequest.onsuccess = () => {
        const existing: FolderRecord | undefined = getRequest.result;
        if (!existing) { resolve(); return; }
        delete existing.files[fileId];
        existing.lastUpdated = Date.now();
        const putRequest = store.put(existing);
        putRequest.onsuccess = () => { this.dispatchChange(folderId); resolve(); };
        putRequest.onerror = () => reject(new Error('Failed to remove file from folder'));
      };
      getRequest.onerror = () => reject(new Error('Failed to read folder for remove'));
    });
  }

  /** Overwrite the entire folder record (used by sync from server). */
  async setFolderData(folderId: string, record: FolderRecord): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.put(record);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to set folder data'));
    });
  }

  async clearFolder(folderId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.delete(folderId);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to clear folder'));
    });
  }

}

export const folderStorage = new FolderStorage();
