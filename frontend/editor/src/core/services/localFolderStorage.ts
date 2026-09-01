/**
 * The record of directories mounted into the file manager (kind "local"): a pointer
 * at a directory, nothing more. The directory owns its name, contents and lifetime,
 * so the record holds only where it is and how to show it, and removing a mount
 * removes the record and nothing else.
 *
 * Mounts are flat by construction - no parent, and a directory's subdirectories are
 * the filesystem's business rather than a hierarchy for this store to model.
 */

import {
  FolderId,
  FolderRecord,
  folderKind,
  createFolderId,
  pickFolderColor,
} from "@app/types/folder";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

/**
 * One directory, one key — regardless of how the picker spelled the path.
 * Lexical only: separators unified, repeats collapsed (UNC's leading pair
 * kept), trailing separator stripped, and case folded for Windows-style
 * paths (drive letter or UNC), where the filesystem ignores case but a
 * string compare doesn't. Elsewhere case stays significant. Symlinks and 8.3
 * short names are beyond a string's power to resolve and stay distinct.
 */
export function directoryKey(directory: string): string {
  let key = directory.replace(/\\/g, "/");
  const unc = key.startsWith("//");
  key = key.replace(/\/{2,}/g, "/");
  if (unc) key = `/${key}`;
  if (key.length > 1 && !/^[a-zA-Z]:\/$/.test(key)) {
    key = key.replace(/\/+$/, "");
  }
  if (/^[a-zA-Z]:/.test(key) || unc) {
    key = key.toLowerCase();
  }
  return key;
}

function requireLocalFolder(folder: FolderRecord): void {
  if (folderKind(folder) !== "local") {
    throw new Error(
      `localFolderStorage owns local folders only; got kind "${folderKind(folder)}" for ${folder.id}`,
    );
  }
}

class LocalFolderStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = "local_folders";

  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.dbConfig);
  }

  async getAllFolders(): Promise<FolderRecord[]> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve((request.result as FolderRecord[]) ?? []);
    });
  }

  /**
   * Mount a directory, or hand back the existing record for one already mounted:
   * two rows for one directory would be two names for one truth. Nesting is fine -
   * a mount lists only its own files, so a subdirectory needs its own mount to be
   * reachable.
   */
  async mountDirectory(directory: string, name: string): Promise<FolderRecord> {
    const key = directoryKey(directory);
    const folders = await this.getAllFolders();
    const existing = folders.find(
      (folder) => directoryKey(folder.directory ?? "") === key,
    );
    if (existing) return existing;
    const now = Date.now();
    const record: FolderRecord = {
      id: createFolderId(),
      kind: "local",
      name,
      parentFolderId: null,
      directory,
      color: pickFolderColor(name),
      createdAt: now,
      updatedAt: now,
    };
    requireLocalFolder(record);
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const req = store.put(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
    return record;
  }

  /** Remove the mount. The directory on disk is untouched, always. */
  async removeFolder(id: FolderId): Promise<void> {
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const req = store.delete(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
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

export const localFolderStorage = new LocalFolderStorageService();
