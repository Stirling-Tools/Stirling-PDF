/**
 * Service for managing Watched Folder configurations in IndexedDB
 */

import { WatchedFolder } from "@app/types/watchedFolders";

const STORAGE_CHANGE_EVENT = "watched-folder-storage-changed";

class WatchedFolderStorage {
  private dbName = "stirling-pdf-watched-folders";
  private dbVersion = 1;
  private storeName = "watchedFolders";
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error("Failed to open smart folder storage database"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => {
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("order", "order", { unique: false });
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
      throw new Error("Smart folder database not initialized");
    }
    return this.db;
  }

  private dispatchChange(): void {
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }

  async getAllFolders(): Promise<WatchedFolder[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const folders: WatchedFolder[] = request.result || [];
        folders.sort((a, b) => {
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
        resolve(folders);
      };
      request.onerror = () => reject(new Error("Failed to get smart folders"));
    });
  }

  async getFolder(id: string): Promise<WatchedFolder | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error("Failed to get smart folder"));
    });
  }

  async createFolder(
    data: Omit<WatchedFolder, "id" | "createdAt" | "updatedAt">,
  ): Promise<WatchedFolder> {
    const db = await this.ensureDB();
    const timestamp = new Date().toISOString();
    const folder: WatchedFolder = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.add(folder);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(folder);
      };
      request.onerror = () =>
        reject(new Error("Failed to create smart folder"));
    });
  }

  async createFolderWithId(folder: WatchedFolder): Promise<WatchedFolder> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(folder);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(folder);
      };
      request.onerror = () =>
        reject(new Error("Failed to create smart folder with id"));
    });
  }

  async updateFolder(folder: WatchedFolder): Promise<WatchedFolder> {
    const db = await this.ensureDB();
    const updated: WatchedFolder = {
      ...folder,
      updatedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(updated);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve(updated);
      };
      request.onerror = () =>
        reject(new Error("Failed to update smart folder"));
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      request.onsuccess = () => {
        this.dispatchChange();
        resolve();
      };
      request.onerror = () =>
        reject(new Error("Failed to delete smart folder"));
    });
  }
}

export const watchedFolderStorage = new WatchedFolderStorage();
export { STORAGE_CHANGE_EVENT as WATCHED_FOLDER_STORAGE_CHANGE_EVENT };
