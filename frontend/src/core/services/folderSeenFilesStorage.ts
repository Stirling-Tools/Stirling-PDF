/**
 * Tracks which local-folder input files have already been submitted for processing.
 * Key: `{folderId}|{filename}|{size}|{lastModified}` — uniquely identifies a file version.
 * Prevents re-submitting the same file on every poll cycle.
 */

const DB_NAME = 'stirling-pdf-folder-seen-files';
const DB_VERSION = 1;
const STORE = 'seenFiles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeSeenKey(folderId: string, file: File): string {
  return `${folderId}|${file.name}|${file.size}|${file.lastModified}`;
}

export const folderSeenFilesStorage = {
  async isSeen(key: string): Promise<boolean> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result != null);
      req.onerror = () => reject(req.error);
    });
  },

  async markSeen(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(Date.now(), key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /** Remove all seen-file entries for a folder (called when folder is deleted or reset). */
  async clearFolder(folderId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        if ((cursor.key as string).startsWith(`${folderId}|`)) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
};
