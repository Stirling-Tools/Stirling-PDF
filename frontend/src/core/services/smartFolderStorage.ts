/**
 * Service for managing Smart Folder configurations in IndexedDB
 */

import { SmartFolder } from '@app/types/smartFolders';

const STORAGE_CHANGE_EVENT = 'smart-folder-storage-changed';

class SmartFolderStorage {
  private dbName = 'stirling-pdf-smart-folders';
  private dbVersion = 1;
  private storeName = 'smartFolders';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open smart folder storage database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => { this.db = null; this.initPromise = null; };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('order', 'order', { unique: false });
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
      throw new Error('Smart folder database not initialized');
    }
    return this.db;
  }

  private dispatchChange(): void {
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }

  async getAllFolders(): Promise<SmartFolder[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const folders: SmartFolder[] = request.result || [];
        folders.sort((a, b) => {
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        resolve(folders);
      };
      request.onerror = () => reject(new Error('Failed to get smart folders'));
    });
  }

  async getFolder(id: string): Promise<SmartFolder | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get smart folder'));
    });
  }

  async createFolder(data: Omit<SmartFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartFolder> {
    const db = await this.ensureDB();
    const timestamp = new Date().toISOString();
    const folder: SmartFolder = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(folder);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(folder);
      };
      request.onerror = () => reject(new Error('Failed to create smart folder'));
    });
  }

  async createFolderWithId(folder: SmartFolder): Promise<SmartFolder> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(folder);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(folder);
      };
      request.onerror = () => reject(new Error('Failed to create smart folder with id'));
    });
  }

  async updateFolder(folder: SmartFolder): Promise<SmartFolder> {
    const db = await this.ensureDB();
    const updated: SmartFolder = { ...folder, updatedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(updated);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(updated);
      };
      request.onerror = () => reject(new Error('Failed to update smart folder'));
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to delete smart folder'));
    });
  }
}

export const smartFolderStorage = new SmartFolderStorage();
export { STORAGE_CHANGE_EVENT as SMART_FOLDER_STORAGE_CHANGE_EVENT };
