/**
 * Stores FileSystemDirectoryHandle instances per folder in IndexedDB.
 * Handles are structured-cloneable so they survive page refresh.
 * Permission must be re-requested each session before writing.
 */

const DB_NAME = 'stirling-pdf-folder-directory-handles';
const DB_VERSION = 1;
const STORE = 'handles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const folderDirectoryHandleStorage = {
  async get(folderId: string): Promise<FileSystemDirectoryHandle | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(folderId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async set(folderId: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, folderId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async remove(folderId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(folderId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Verifies the handle still has readwrite permission, requesting it if needed.
   * Returns true if permission is granted, false if denied/dismissed.
   */
  async ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const opts = { mode: 'readwrite' };
    const h = handle as FileSystemDirectoryHandle & {
      queryPermission(opts: object): Promise<PermissionState>;
      requestPermission(opts: object): Promise<PermissionState>;
    };
    if ((await h.queryPermission(opts)) === 'granted') return true;
    return (await h.requestPermission(opts)) === 'granted';
  },

  /** Write a file blob into the directory, overwriting if it exists. */
  async writeFile(handle: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
    const fileHandle = await handle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  },
};
