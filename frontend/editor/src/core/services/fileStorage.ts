/**
 * Stirling File Storage Service
 * Single-table architecture with typed query methods
 * Forces correct usage patterns through service API design
 */

import { FileId, BaseFileMetadata } from "@app/types/file";
import {
  StirlingFile,
  StirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

/**
 * Storage record - single source of truth
 * Contains all data needed for both StirlingFile and StirlingFileStub
 */
const THUMBNAIL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface StoredStirlingFileRecord extends BaseFileMetadata {
  data: ArrayBuffer;
  fileId: FileId; // Matches runtime StirlingFile.fileId exactly
  quickKey: string; // Matches runtime StirlingFile.quickKey exactly
  thumbnail?: string;
  thumbnailStoredAt?: number; // Epoch ms — sliding 30-day TTL
  url?: string; // For compatibility with existing components
}

export interface StorageStats {
  used: number;
  available: number;
  fileCount: number;
  quota?: number;
}

class FileStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = "files";

  /**
   * Get database connection using centralized manager
   */
  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.dbConfig);
  }

  /** Returns thumbnail if within TTL, otherwise undefined. */
  private isThumbnailFresh(record: StoredStirlingFileRecord): boolean {
    if (!record.thumbnail) return false;
    if (!record.thumbnailStoredAt) return false;
    return Date.now() - record.thumbnailStoredAt < THUMBNAIL_TTL_MS;
  }

  /** Fire-and-forget: bump thumbnailStoredAt (or clear expired thumbnail) for a set of ids. */
  private async bumpThumbnailTTL(ids: FileId[], clear = false): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      // Issue all gets up front — each onsuccess creates a put before the
      // transaction can auto-commit, keeping it alive until all puts settle.
      ids.forEach((id) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result as StoredStirlingFileRecord | undefined;
          if (!record) return;
          if (clear) {
            record.thumbnail = undefined;
            record.thumbnailStoredAt = undefined;
          } else {
            record.thumbnailStoredAt = Date.now();
          }
          store.put(record);
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  /**
   * Store a StirlingFile with its metadata from StirlingFileStub
   */
  async storeStirlingFile(
    stirlingFile: StirlingFile,
    stub: StirlingFileStub,
  ): Promise<void> {
    const db = await this.getDatabase();
    const arrayBuffer = await stirlingFile.arrayBuffer();

    const record: StoredStirlingFileRecord = {
      id: stirlingFile.fileId,
      fileId: stirlingFile.fileId, // Explicit field for clarity
      quickKey: stirlingFile.quickKey,
      name: stirlingFile.name,
      type: stirlingFile.type,
      size: stirlingFile.size,
      lastModified: stirlingFile.lastModified,
      createdAt: stub.createdAt,
      data: arrayBuffer,
      thumbnail: stub.thumbnailUrl,
      thumbnailStoredAt: stub.thumbnailUrl ? Date.now() : undefined,
      isLeaf: stub.isLeaf ?? true,
      remoteStorageId: stub.remoteStorageId,
      remoteStorageUpdatedAt: stub.remoteStorageUpdatedAt,
      remoteOwnerUsername: stub.remoteOwnerUsername,
      remoteOwnedByCurrentUser: stub.remoteOwnedByCurrentUser,
      remoteAccessRole: stub.remoteAccessRole,
      remoteSharedViaLink: stub.remoteSharedViaLink,
      remoteHasShareLinks: stub.remoteHasShareLinks,
      remoteShareToken: stub.remoteShareToken,

      // History data from stub
      versionNumber: stub.versionNumber ?? 1,
      originalFileId: stub.originalFileId ?? stirlingFile.fileId,
      parentFileId: stub.parentFileId ?? undefined,
      toolHistory: stub.toolHistory ?? [],
    };

    return new Promise((resolve, reject) => {
      try {
        // Verify store exists before creating transaction
        if (!db.objectStoreNames.contains(this.storeName)) {
          throw new Error(
            `Object store '${this.storeName}' not found. Available stores: ${Array.from(db.objectStoreNames).join(", ")}`,
          );
        }

        const transaction = db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);

        const request = store.add(record);

        request.onerror = () => {
          console.error("IndexedDB add error:", request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          resolve();
        };
      } catch (error) {
        console.error("Transaction error:", error);
        reject(error);
      }
    });
  }

  /**
   * Get StirlingFile with full data - for loading into workbench
   */
  async getStirlingFile(id: FileId): Promise<StirlingFile | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as StoredStirlingFileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Create File from stored data
        const blob = new Blob([record.data], { type: record.type });
        const file = new File([blob], record.name, {
          type: record.type,
          lastModified: record.lastModified,
        });

        // Convert to StirlingFile with preserved IDs
        const stirlingFile = createStirlingFile(file, record.fileId);
        resolve(stirlingFile);
      };
    });
  }

  /**
   * Get multiple StirlingFiles - for batch loading
   */
  async getStirlingFiles(ids: FileId[]): Promise<StirlingFile[]> {
    const results = await Promise.all(
      ids.map((id) => this.getStirlingFile(id)),
    );
    return results.filter((file): file is StirlingFile => file !== null);
  }

  /**
   * Get StirlingFileStub (metadata only) - for UI browsing
   */
  async getStirlingFileStub(id: FileId): Promise<StirlingFileStub | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as StoredStirlingFileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Create StirlingFileStub from metadata (no file data)
        const fresh = this.isThumbnailFresh(record);
        void this.bumpThumbnailTTL([record.id], !fresh);

        const stub: StirlingFileStub = {
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          lastModified: record.lastModified,
          quickKey: record.quickKey,
          thumbnailUrl: fresh ? record.thumbnail : undefined,
          isLeaf: record.isLeaf,
          remoteStorageId: record.remoteStorageId,
          remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
          remoteOwnerUsername: record.remoteOwnerUsername,
          remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
          remoteAccessRole: record.remoteAccessRole,
          remoteSharedViaLink: record.remoteSharedViaLink,
          remoteHasShareLinks: record.remoteHasShareLinks,
          remoteShareToken: record.remoteShareToken,
          versionNumber: record.versionNumber,
          originalFileId: record.originalFileId,
          parentFileId: record.parentFileId,
          toolHistory: record.toolHistory,
          createdAt: record.createdAt || Date.now(),
        };

        resolve(stub);
      };
    });
  }

  /**
   * Get all StirlingFileStubs (metadata only) - for FileManager browsing
   */
  async getAllStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const stubs: StirlingFileStub[] = [];

      const tobump: FileId[] = [];
      const toexpire: FileId[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          if (record && record.name && typeof record.size === "number") {
            const fresh = this.isThumbnailFresh(record);
            if (record.thumbnail) {
              if (fresh) tobump.push(record.id);
              else toexpire.push(record.id);
            }
            stubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: fresh ? record.thumbnail : undefined,
              isLeaf: record.isLeaf,
              remoteStorageId: record.remoteStorageId,
              remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
              remoteOwnerUsername: record.remoteOwnerUsername,
              remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
              remoteAccessRole: record.remoteAccessRole,
              remoteSharedViaLink: record.remoteSharedViaLink,
              remoteHasShareLinks: record.remoteHasShareLinks,
              remoteShareToken: record.remoteShareToken,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              createdAt: record.createdAt || Date.now(),
            });
          }
          cursor.continue();
        } else {
          void this.bumpThumbnailTTL(tobump);
          void this.bumpThumbnailTTL(toexpire, true);
          resolve(stubs);
        }
      };
    });
  }

  /**
   * Get all history stubs for a given original file ID.
   */
  async getHistoryChainStubs(
    originalFileId: FileId,
  ): Promise<StirlingFileStub[]> {
    const stubs = await this.getAllStirlingFileStubs();
    return stubs
      .filter((stub) => (stub.originalFileId || stub.id) === originalFileId)
      .sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));
  }

  /**
   * Get leaf StirlingFileStubs only - for unprocessed files
   */
  async getLeafStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const leafStubs: StirlingFileStub[] = [];
      const tobump: FileId[] = [];
      const toexpire: FileId[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          // Only include leaf files (default to true if undefined)
          if (
            record &&
            record.name &&
            typeof record.size === "number" &&
            record.isLeaf !== false
          ) {
            const fresh = this.isThumbnailFresh(record);
            if (record.thumbnail) {
              if (fresh) tobump.push(record.id);
              else toexpire.push(record.id);
            }
            leafStubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: fresh ? record.thumbnail : undefined,
              isLeaf: record.isLeaf,
              remoteStorageId: record.remoteStorageId,
              remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
              remoteOwnerUsername: record.remoteOwnerUsername,
              remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
              remoteAccessRole: record.remoteAccessRole,
              remoteSharedViaLink: record.remoteSharedViaLink,
              remoteHasShareLinks: record.remoteHasShareLinks,
              remoteShareToken: record.remoteShareToken,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              createdAt: record.createdAt || Date.now(),
            });
          }
          cursor.continue();
        } else {
          void this.bumpThumbnailTTL(tobump);
          void this.bumpThumbnailTTL(toexpire, true);
          resolve(leafStubs);
        }
      };
    });
  }

  /**
   * Delete StirlingFile - single operation, no sync issues
   */
  async deleteStirlingFile(id: FileId): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Delete multiple StirlingFiles in a single transaction
   */
  async deleteMultipleStirlingFiles(ids: FileId[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Transaction aborted"));
      ids.forEach((id) => store.delete(id));
    });
  }

  /**
   * Update thumbnail for existing file
   */
  async updateThumbnail(id: FileId, thumbnail: string): Promise<boolean> {
    const db = await this.getDatabase();

    return new Promise((resolve, _reject) => {
      try {
        const transaction = db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const record = getRequest.result as StoredStirlingFileRecord;
          if (record) {
            record.thumbnail = thumbnail;
            record.thumbnailStoredAt = Date.now();
            const updateRequest = store.put(record);

            updateRequest.onsuccess = () => {
              resolve(true);
            };
            updateRequest.onerror = () => {
              console.error("Failed to update thumbnail:", updateRequest.error);
              resolve(false);
            };
          } else {
            resolve(false);
          }
        };

        getRequest.onerror = () => {
          console.error(
            "Failed to get file for thumbnail update:",
            getRequest.error,
          );
          resolve(false);
        };
      } catch (error) {
        console.error("Transaction error during thumbnail update:", error);
        resolve(false);
      }
    });
  }

  /**
   * Clear all stored files
   */
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

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    let used: number;
    let fileCount: number;
    let available = 0;
    let quota: number | undefined;

    try {
      // Get browser quota for context
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota;
        available = estimate.quota || 0;
      }

      // Calculate our actual IndexedDB usage from file metadata
      const stubs = await this.getAllStirlingFileStubs();
      used = stubs.reduce((total, stub) => total + (stub?.size || 0), 0);
      fileCount = stubs.length;

      // Adjust available space
      if (quota) {
        available = quota - used;
      }
    } catch (error) {
      console.warn("Could not get storage stats:", error);
      used = 0;
      fileCount = 0;
    }

    return {
      used,
      available,
      fileCount,
      quota,
    };
  }

  /**
   * Create blob URL for stored file data
   */
  async createBlobUrl(id: FileId): Promise<string | null> {
    try {
      const db = await this.getDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const record = request.result as StoredStirlingFileRecord | undefined;
          if (record) {
            const blob = new Blob([record.data], { type: record.type });
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn(`Failed to create blob URL for ${id}:`, error);
      return null;
    }
  }

  /**
   * Mark a file as processed (no longer a leaf file)
   * Used when a file becomes input to a tool operation
   */
  async markFileAsProcessed(fileId: FileId): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      const record = await new Promise<StoredStirlingFileRecord | undefined>(
        (resolve, reject) => {
          const request = store.get(fileId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );

      if (!record) {
        return false; // File not found
      }

      // Update the isLeaf flag to false
      record.isLeaf = false;

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error("Failed to mark file as processed:", error);
      return false;
    }
  }

  /**
   * Mark a file as leaf (opposite of markFileAsProcessed)
   * Used when promoting a file back to "recent" status
   */
  async markFileAsLeaf(fileId: FileId): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      const record = await new Promise<StoredStirlingFileRecord | undefined>(
        (resolve, reject) => {
          const request = store.get(fileId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );

      if (!record) {
        return false; // File not found
      }

      // Update the isLeaf flag to true
      record.isLeaf = true;

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error("Failed to mark file as leaf:", error);
      return false;
    }
  }

  /**
   * Update metadata fields for a stored file record.
   */
  async updateFileMetadata(
    fileId: FileId,
    updates: Partial<StoredStirlingFileRecord>,
  ): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const record = await new Promise<StoredStirlingFileRecord | undefined>(
        (resolve, reject) => {
          const request = store.get(fileId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () =>
            resolve(request.result as StoredStirlingFileRecord | undefined);
        },
      );

      if (!record) {
        return false;
      }

      const updatedRecord = { ...record, ...updates };
      await new Promise<void>((resolve, reject) => {
        const request = store.put(updatedRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error("Failed to update file metadata:", error);
      return false;
    }
  }
}

// Export singleton instance
export const fileStorage = new FileStorageService();

// Helper hook for React components
export function useFileStorage() {
  return fileStorage;
}
