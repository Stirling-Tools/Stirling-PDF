/**
 * Virtual Folder Storage - the system of record for kind "virtual" folders.
 *
 * Unlike {@link folderStorage} (a passive cache of the server's folder
 * hierarchy, wiped and rewritten on every sync), this store OWNS its rows:
 * a virtual folder exists only in this browser's IndexedDB and has no server
 * copy to be restored from. That is the point — virtual folders organise
 * files on installs with no login, no server storage, or no network.
 *
 * Because there is no server to be authoritative, the invariants the server
 * enforces for its folders are enforced here instead: no reparenting a folder
 * under its own subtree (cycles), and a bounded chain depth. Limits mirror
 * FolderService so a hierarchy never behaves differently for being virtual.
 */

import {
  FolderId,
  FolderProcessingConfig,
  FolderRecord,
  folderKind,
  createFolderId,
  pickFolderColor,
} from "@app/types/folder";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

/** Mirrors FolderService.MAX_FOLDER_DEPTH so virtual trees can't out-nest server ones. */
const MAX_FOLDER_DEPTH = 64;

function requireVirtualFolder(folder: FolderRecord): void {
  if (folderKind(folder) !== "virtual") {
    throw new Error(
      `virtualFolderStorage owns virtual folders only; got kind "${folderKind(folder)}" for ${folder.id}`,
    );
  }
}

class VirtualFolderStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = "virtual_folders";

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

  async getFolder(id: FolderId): Promise<FolderRecord | null> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve((request.result as FolderRecord | undefined) ?? null);
    });
  }

  /**
   * Create a virtual folder under the given parent (null = root). The parent,
   * when set, must itself be a virtual folder: a virtual row can't hang off a
   * server folder, whose lifetime this browser doesn't control — a server-side
   * delete would orphan the whole virtual subtree with nothing to notice.
   */
  async createFolder(
    name: string,
    parentFolderId: FolderId | null,
  ): Promise<FolderRecord> {
    if (parentFolderId !== null) {
      await this.requireWithinDepth(parentFolderId);
    }
    const now = Date.now();
    const record: FolderRecord = {
      id: createFolderId(),
      kind: "virtual",
      name,
      parentFolderId,
      color: pickFolderColor(name),
      createdAt: now,
      updatedAt: now,
    };
    await this.put(record);
    return record;
  }

  /** Attach or replace the folder's processing pipeline; null removes it. */
  async setProcessing(
    id: FolderId,
    config: FolderProcessingConfig | null,
  ): Promise<FolderRecord | null> {
    const existing = await this.getFolder(id);
    if (!existing) return null;
    const next: FolderRecord = {
      ...existing,
      processing: config ?? undefined,
      updatedAt: Date.now(),
    };
    if (!config) delete next.processing;
    await this.put(next);
    return next;
  }

  /** Rename / recolour / re-icon in place. Structure is moveFolder's job. */
  async updateFolder(
    id: FolderId,
    updates: Partial<Pick<FolderRecord, "name" | "color" | "icon">>,
  ): Promise<FolderRecord | null> {
    const existing = await this.getFolder(id);
    if (!existing) return null;
    const next: FolderRecord = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    await this.put(next);
    return next;
  }

  /**
   * Reparent a folder (null = to root), refusing moves that would make the
   * tree lie: under itself or its own descendant (a cycle — the subtree would
   * fall out of every walk), or deeper than the depth cap.
   */
  async moveFolder(
    id: FolderId,
    newParentId: FolderId | null,
  ): Promise<FolderRecord | null> {
    const existing = await this.getFolder(id);
    if (!existing) return null;
    if (newParentId !== null) {
      if (newParentId === id) {
        throw new Error("Cannot move a folder into itself");
      }
      const ancestors = await this.requireWithinDepth(newParentId);
      if (ancestors.has(id)) {
        throw new Error("Cannot move a folder into its own subtree");
      }
    }
    const next: FolderRecord = {
      ...existing,
      parentFolderId: newParentId,
      updatedAt: Date.now(),
    };
    await this.put(next);
    return next;
  }

  /**
   * Delete a folder and its whole virtual subtree, returning every removed id
   * so the caller can unlink files that referenced them — mirroring the shape
   * of the server delete, which reports removedFolderIds for the same reason.
   */
  async deleteFolder(id: FolderId): Promise<FolderId[]> {
    const all = await this.getAllFolders();
    const childrenByParent = new Map<FolderId | null, FolderRecord[]>();
    for (const folder of all) {
      const siblings = childrenByParent.get(folder.parentFolderId) ?? [];
      siblings.push(folder);
      childrenByParent.set(folder.parentFolderId, siblings);
    }
    const removed: FolderId[] = [];
    const queue: FolderId[] = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      removed.push(current);
      for (const child of childrenByParent.get(current) ?? []) {
        queue.push(child.id);
      }
    }
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("virtual folder delete failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("virtual folder delete aborted"));
      for (const folderId of removed) store.delete(folderId);
    });
    return removed;
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

  private async put(record: FolderRecord): Promise<void> {
    requireVirtualFolder(record);
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const req = store.put(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  /**
   * Walk from `startId` to the root, returning the ids seen. Throws when the
   * chain is missing a link (the parent must exist and be virtual), already
   * cyclic (defensive — a bug or hand-edited DB, not a reachable state), or
   * too deep to accept another child.
   */
  private async requireWithinDepth(startId: FolderId): Promise<Set<FolderId>> {
    const seen = new Set<FolderId>();
    let cursor: FolderId | null = startId;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        throw new Error("Virtual folder hierarchy contains a cycle");
      }
      seen.add(cursor);
      const parent: FolderRecord | null = await this.getFolder(cursor);
      if (parent === null) {
        throw new Error(`No virtual folder: ${cursor}`);
      }
      cursor = parent.parentFolderId;
    }
    // The chain walked is the prospective parent's own ancestry; whatever is
    // being placed under it sits one level deeper, so a full-depth chain has
    // no room for a child.
    if (seen.size >= MAX_FOLDER_DEPTH) {
      throw new Error(`Folder depth limit reached (max ${MAX_FOLDER_DEPTH})`);
    }
    return seen;
  }
}

export const virtualFolderStorage = new VirtualFolderStorageService();
