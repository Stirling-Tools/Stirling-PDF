/**
 * Service for managing Smart Folder run state in IndexedDB
 */

import { SmartFolderRunEntry } from '@app/types/smartFolders';

interface RunStateRecord {
  folderId: string;
  runs: SmartFolderRunEntry[];
  lastUpdated: number;
}

class FolderRunStateStorage {
  private dbName = 'stirling-pdf-folder-run-state';
  private dbVersion = 1;
  private storeName = 'runStates';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(new Error('Failed to open folder run state database'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'folderId' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Folder run state database not initialized');
    }
    return this.db;
  }

  async getFolderRunState(folderId: string): Promise<SmartFolderRunEntry[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(folderId);
      request.onsuccess = () => {
        const record: RunStateRecord | undefined = request.result;
        resolve(record?.runs || []);
      };
      request.onerror = () => reject(new Error('Failed to get folder run state'));
    });
  }

  async setFolderRunState(folderId: string, runs: SmartFolderRunEntry[]): Promise<void> {
    const db = await this.ensureDB();
    const record: RunStateRecord = { folderId, runs, lastUpdated: Date.now() };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to set folder run state'));
    });
  }

  async clearFolderRunState(folderId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(folderId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear folder run state'));
    });
  }
}

export const folderRunStateStorage = new FolderRunStateStorage();
