/**
 * Tracks which local-folder input files have already been submitted for processing.
 * Key: `{folderId}|{filename}|{size}|{lastModified}` — uniquely identifies a file version.
 * Prevents re-submitting the same file on every poll cycle.
 */

const DB_NAME = 'stirling-pdf-folder-seen-files';
const DB_VERSION = 1;
const STORE = 'seenFiles';

/** Cached singleton DB connection — avoids opening a new connection per call. */
let cachedDB: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);
  if (initPromise) return initPromise;
  initPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      cachedDB = req.result;
      cachedDB.onclose = () => { cachedDB = null; initPromise = null; };
      resolve(cachedDB);
    };
    req.onerror = () => { initPromise = null; reject(req.error); };
  });
  return initPromise;
}

export function makeSeenKey(folderId: string, file: File): string {
  return `${folderId}|${file.name}|${file.size}|${file.lastModified}`;
}

export const folderSeenFilesStorage = {
  async isSeen(key: string): Promise<boolean> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result != null);
      req.onerror = () => reject(req.error);
    });
  },

  async markSeen(key: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(Date.now(), key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /** Remove all seen-file entries for a folder (called when folder is deleted or reset). */
  async clearFolder(folderId: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const prefix = `${folderId}|`;
      // Use key range to narrow cursor scan to keys starting with the folder prefix
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
};
