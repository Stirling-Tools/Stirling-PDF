/**
 * Stores FileSystemDirectoryHandle instances per folder in IndexedDB.
 * Handles are structured-cloneable so they survive page refresh.
 * Permission must be re-requested each session before writing.
 */

const DB_NAME = 'stirling-pdf-folder-directory-handles';
const DB_VERSION = 1;
const STORE = 'handles';

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

type ExtendedDirHandle = FileSystemDirectoryHandle & {
  queryPermission(opts: object): Promise<PermissionState>;
  requestPermission(opts: object): Promise<PermissionState>;
};

export const folderDirectoryHandleStorage = {
  // ── Output directory handles (readwrite) ─────────────────────────────────

  async get(folderId: string): Promise<FileSystemDirectoryHandle | null> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(folderId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async set(folderId: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, folderId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async remove(folderId: string): Promise<void> {
    const db = await getDB();
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
    const h = handle as ExtendedDirHandle;
    if ((await h.queryPermission(opts)) === 'granted') return true;
    return (await h.requestPermission(opts)) === 'granted';
  },

  // ── Input directory handles (readonly) ────────────────────────────────────
  // Stored under key "input:{folderId}" to avoid collisions with output handles.

  async getInput(folderId: string): Promise<FileSystemDirectoryHandle | null> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(`input:${folderId}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async setInput(folderId: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, `input:${folderId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async removeInput(folderId: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(`input:${folderId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Verifies the handle still has read permission, requesting it if needed.
   * On browsers that don't support queryPermission/requestPermission (Firefox),
   * returns true optimistically — access errors will surface naturally during iteration.
   */
  async ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const h = handle as ExtendedDirHandle;
    if (typeof h.queryPermission !== 'function') return true; // Firefox — no permission API
    const opts = { mode: 'read' };
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
