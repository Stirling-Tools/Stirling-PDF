/**
 * Service for managing Watch Folder run state in IndexedDB
 */

import { SmartFolderRunEntry } from '@app/types/smartFolders';

const FOLDER_RUN_STATE_CHANGE_EVENT = 'folder-run-state-changed';

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
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(new Error('Failed to open folder run state database'));
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => { this.db = null; this.initPromise = null; };
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
      this.initPromise ??= this.init();
      await this.initPromise;
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
      request.onsuccess = () => {
        window.dispatchEvent(new CustomEvent(FOLDER_RUN_STATE_CHANGE_EVENT, { detail: { folderId } }));
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to set folder run state'));
    });
  }

  onRunStateChange(listener: (folderId: string) => void): () => void {
    const handler = (e: Event) => listener((e as CustomEvent).detail.folderId);
    window.addEventListener(FOLDER_RUN_STATE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FOLDER_RUN_STATE_CHANGE_EVENT, handler);
  }

  /** Atomically appends entries to a folder's run state within a single readwrite transaction,
   *  preventing lost-update races when multiple files are processed concurrently. */
  async appendRunEntries(folderId: string, entries: SmartFolderRunEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const getRequest = store.get(folderId);
      getRequest.onsuccess = () => {
        const existing: RunStateRecord | undefined = getRequest.result;
        const MAX_RUN_ENTRIES = 500;
        const combined = [...(existing?.runs ?? []), ...entries];
        const record: RunStateRecord = {
          folderId,
          runs: combined.length > MAX_RUN_ENTRIES ? combined.slice(-MAX_RUN_ENTRIES) : combined,
          lastUpdated: Date.now(),
        };
        const putRequest = store.put(record);
        putRequest.onsuccess = () => {
          window.dispatchEvent(new CustomEvent(FOLDER_RUN_STATE_CHANGE_EVENT, { detail: { folderId } }));
          resolve();
        };
        putRequest.onerror = () => reject(new Error('Failed to append run entries'));
      };
      getRequest.onerror = () => reject(new Error('Failed to read run state for append'));
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
