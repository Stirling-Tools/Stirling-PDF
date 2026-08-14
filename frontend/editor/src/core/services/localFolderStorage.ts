/**
 * Local Folder Storage - the record of directories mounted into the file
 * manager (kind "local").
 *
 * A local folder is a pointer at a directory on the machine; the directory
 * itself is the source of truth for everything else — name, contents,
 * lifetime — so the record carries only where it is and how to show it.
 * Mounts are flat by construction: they have no parent, and a directory's
 * subdirectories are the filesystem's business, not a folder hierarchy for
 * this store to model. Removing a mount removes the record and nothing else.
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
   * Mount a directory. Mounting the same directory twice hands back the
   * existing record — two rows for one directory would be two names for one
   * truth, and removing one would lie about the other.
   */
  async mountDirectory(directory: string, name: string): Promise<FolderRecord> {
    const existing = (await this.getAllFolders()).find(
      (folder) => folder.directory === directory,
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
