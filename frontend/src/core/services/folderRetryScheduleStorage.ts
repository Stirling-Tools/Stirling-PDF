/**
 * Persistent retry schedule for Watch Folder automation.
 *
 * Stores pending retries in IndexedDB so they survive page close.
 * The service worker reads this store to schedule timers; the main thread
 * drains due entries on mount, on SW notification, and on visibilitychange.
 *
 * claimDue() is atomic (single readwrite IDB transaction) — safe across tabs.
 */

export interface RetryEntry {
  /** `${folderId}:${fileId}` — natural composite key */
  id: string;
  folderId: string;
  fileId: string;
  /** Absolute ms timestamp when this retry should fire */
  dueAt: number;
  attempt: number;
  ownedByFolder: boolean;
}

class FolderRetryScheduleStorage {
  private dbName = 'stirling-pdf-retry-schedule';
  private dbVersion = 1;
  private storeName = 'retries';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(new Error('Failed to open retry schedule database'));
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => { this.db = null; this.initPromise = null; };
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          // Index on dueAt lets the SW and claimDue() range-scan efficiently
          store.createIndex('dueAt', 'dueAt', { unique: false });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      this.initPromise ??= this.init();
      await this.initPromise;
    }
    if (!this.db) throw new Error('Retry schedule database not initialized');
    return this.db;
  }

  /** Upsert a retry entry. Calling again for the same file replaces the previous schedule. */
  async schedule(
    folderId: string,
    fileId: string,
    dueAt: number,
    attempt: number,
    ownedByFolder: boolean
  ): Promise<void> {
    const db = await this.ensureDB();
    const entry: RetryEntry = {
      id: `${folderId}:${fileId}`,
      folderId,
      fileId,
      dueAt,
      attempt,
      ownedByFolder,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const request = tx.objectStore(this.storeName).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to schedule retry'));
    });
  }

  /** Remove a scheduled retry (e.g. when a folder is deleted or a file is manually retried). */
  async cancel(folderId: string, fileId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const request = tx.objectStore(this.storeName).delete(`${folderId}:${fileId}`);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to cancel retry'));
    });
  }

  /**
   * Atomically reads and deletes all entries whose dueAt is in the past.
   * Because the delete happens inside the same readwrite transaction as the
   * read, two concurrent tabs cannot both claim the same entry.
   */
  async claimDue(): Promise<RetryEntry[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const claimed: RetryEntry[] = [];
      const tx = db.transaction([this.storeName], 'readwrite');
      const index = tx.objectStore(this.storeName).index('dueAt');
      const cursorRequest = index.openCursor(IDBKeyRange.upperBound(now));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          claimed.push(cursor.value as RetryEntry);
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(new Error('Failed to claim due retries'));
    });
  }

  /** Remove all scheduled retries for a folder (called when the folder is deleted). */
  async clearFolder(folderId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const entry = cursor.value as RetryEntry;
        if (entry.folderId === folderId) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Failed to clear folder retries'));
    });
  }

  /** Returns the earliest scheduled dueAt timestamp, or null if no entries exist. */
  async getEarliestDueAt(): Promise<number | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const cursorRequest = tx.objectStore(this.storeName).index('dueAt').openCursor();
      cursorRequest.onsuccess = () =>
        resolve(cursorRequest.result ? (cursorRequest.result.value as RetryEntry).dueAt : null);
      cursorRequest.onerror = () => reject(new Error('Failed to get earliest due at'));
    });
  }
}

export const folderRetryScheduleStorage = new FolderRetryScheduleStorage();
