/**
 * Folder Storage Service - passive read-cache of the server's folder hierarchy.
 *
 * Folders are server-owned. This module just persists the most recent server
 * response so the UI can paint instantly on next mount (and remain readable
 * offline). Every mutation must go through {@code folderSyncService} first;
 * on success the caller invokes {@link FolderStorageService.replaceAll} or
 * one of the targeted updaters to keep the cache in step.
 *
 * No id generation here, no cycle detection, no idempotency tricks - those
 * are all the server's job now.
 */

import { FolderId, FolderRecord } from "@app/types/folder";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

class FolderStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = "folders";

  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.dbConfig);
  }

  /**
   * Atomically replace the entire cached folder set with the supplied list.
   * Used after a successful {@code pullFromServer} - the server is the
   * source of truth, so any folder absent from the response is dropped
   * locally too (no orphan rows surviving a server-side delete).
   */
  async replaceAll(folders: FolderRecord[]): Promise<void> {
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("folder cache replace failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("folder cache replace aborted"));
      store.clear();
      for (const folder of folders) {
        store.put(folder);
      }
    });
  }

  /** Insert or overwrite a single folder in the cache. */
  async upsertFolder(folder: FolderRecord): Promise<void> {
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const req = store.put(folder);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  /** Remove a set of folders from the cache (after a successful server delete). */
  async removeFolders(ids: FolderId[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("folder cache delete failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("folder cache delete aborted"));
      for (const id of ids) store.delete(id);
    });
  }

  async getAllFolders(): Promise<FolderRecord[]> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = (request.result as FolderRecord[]) ?? [];
        resolve(records);
      };
    });
  }

  async getFolder(id: FolderId): Promise<FolderRecord | null> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as FolderRecord | undefined;
        resolve(record ?? null);
      };
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const folderStorage = new FolderStorageService();
