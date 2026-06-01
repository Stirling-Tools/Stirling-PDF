/**
 * Centralized IndexedDB Manager
 * Handles all database initialization, schema management, and migrations
 * Prevents race conditions and duplicate schema upgrades
 */

export interface DatabaseConfig {
  name: string;
  version: number;
  stores: {
    name: string;
    keyPath?: string | string[];
    autoIncrement?: boolean;
    indexes?: {
      name: string;
      keyPath: string | string[];
      unique: boolean;
    }[];
  }[];
}

class IndexedDBManager {
  private static instance: IndexedDBManager;
  private databases = new Map<string, IDBDatabase>();
  private initPromises = new Map<string, Promise<IDBDatabase>>();

  private constructor() {}

  static getInstance(): IndexedDBManager {
    if (!IndexedDBManager.instance) {
      IndexedDBManager.instance = new IndexedDBManager();
    }
    return IndexedDBManager.instance;
  }

  /**
   * Open or get existing database connection
   */
  async openDatabase(config: DatabaseConfig): Promise<IDBDatabase> {
    const existingDb = this.databases.get(config.name);
    if (existingDb) {
      return existingDb;
    }

    const existingPromise = this.initPromises.get(config.name);
    if (existingPromise) {
      return existingPromise;
    }

    // SaaS lineage shipped a v6 and a v7 of stirling-pdf-files whose
    // upgrade paths corrupted records (separate cursor walks racing in
    // one versionchange transaction). The SaaS build wipes those
    // databases on open to get users unstuck; we carry the wipe forward
    // here so any SaaS browser that hadn't reopened the app since then
    // gets a clean v9 install instead of trying to migrate corrupt data.
    // Affected users have already lost their files - this is just the
    // recovery path they were already on.
    if (config.name === "stirling-pdf-files") {
      const existingVersion = await this.getDatabaseVersion(config.name);
      if (existingVersion === 6 || existingVersion === 7) {
        console.warn(
          `Deleting corrupt SaaS v${existingVersion} ${config.name} database. Files will be lost but the app will work.`,
        );
        await this.deleteDatabase(config.name);
      }
    }

    const initPromise = this.performDatabaseInit(config);
    this.initPromises.set(config.name, initPromise);

    try {
      const db = await initPromise;
      this.databases.set(config.name, db);
      return db;
    } catch (error) {
      this.initPromises.delete(config.name);
      throw error;
    }
  }

  private performDatabaseInit(config: DatabaseConfig): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      console.log(`Opening IndexedDB: ${config.name} v${config.version}`);
      const request = indexedDB.open(config.name, config.version);

      request.onerror = () => {
        console.error(`Failed to open ${config.name}:`, request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const db = request.result;
        console.log(`Successfully opened ${config.name}`);

        // Set up close handler to clean up our references
        db.onclose = () => {
          console.log(`Database ${config.name} closed`);
          this.databases.delete(config.name);
          this.initPromises.delete(config.name);
        };

        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;
        const transaction = request.transaction;

        console.log(
          `Upgrading ${config.name} from v${oldVersion} to v${config.version}`,
        );

        // Create or update object stores
        config.stores.forEach((storeConfig) => {
          let store: IDBObjectStore | undefined;

          if (db.objectStoreNames.contains(storeConfig.name)) {
            // Store exists - get reference for migration
            console.log(`Object store '${storeConfig.name}' already exists`);
            store = transaction?.objectStore(storeConfig.name);

            // Add new indexes if they don't exist
            if (storeConfig.indexes && store) {
              storeConfig.indexes.forEach((indexConfig) => {
                if (!store?.indexNames.contains(indexConfig.name)) {
                  store?.createIndex(indexConfig.name, indexConfig.keyPath, {
                    unique: indexConfig.unique,
                  });
                  console.log(
                    `Created index '${indexConfig.name}' on '${storeConfig.name}'`,
                  );
                }
              });
            }
          } else {
            // Create new object store
            const options: IDBObjectStoreParameters = {};
            if (storeConfig.keyPath) {
              options.keyPath = storeConfig.keyPath;
            }
            if (storeConfig.autoIncrement) {
              options.autoIncrement = storeConfig.autoIncrement;
            }

            store = db.createObjectStore(storeConfig.name, options);
            console.log(`Created object store '${storeConfig.name}'`);

            // Create indexes
            if (storeConfig.indexes) {
              storeConfig.indexes.forEach((indexConfig) => {
                store?.createIndex(indexConfig.name, indexConfig.keyPath, {
                  unique: indexConfig.unique,
                });
                console.log(
                  `Created index '${indexConfig.name}' on '${storeConfig.name}'`,
                );
              });
            }
          }

          // Perform data migration for files database
          if (
            config.name === "stirling-pdf-files" &&
            storeConfig.name === "files" &&
            store
          ) {
            this.migrateFilesStore(store, oldVersion);
          }
        });

        // Drop stores that the SaaS lineage created in v6 but that this
        // codebase doesn't use. We use a different folder model now
        // (a `folders` store plus a `folderId` foreign key on each
        // file row), so folder_members / folder_run_states /
        // smart_folders are dead weight. The deleteObjectStore calls
        // must happen inside this versionchange transaction.
        if (config.name === "stirling-pdf-files") {
          for (const orphan of [
            "folder_members",
            "folder_run_states",
            "smart_folders",
          ]) {
            if (db.objectStoreNames.contains(orphan)) {
              db.deleteObjectStore(orphan);
              console.info(`Dropped orphan SaaS store: ${orphan}`);
            }
          }
        }
      };
    });
  }

  /**
   * Single-pass migration for the `files` store on stirling-pdf-files.
   *
   * Runs ONE openCursor() walk and applies every applicable per-version
   * delta to each record before `cursor.update()` writes it back. The
   * previous design called migrateFileHistoryFields and migrateFolderField
   * as two separate cursor walks inside the same onupgradeneeded
   * transaction; their requests interleaved in the IDB request queue so
   * the second walk's `cursor.value` was a stale snapshot taken before
   * the first walk's `update()` had been processed - the second
   * `update()` then wrote that stale object back, silently erasing
   * isLeaf / versionNumber / originalFileId / parentFileId / toolHistory
   * on every row both cursors touched. Folding into one cursor + one
   * write per record removes the race entirely.
   *
   * New per-version blocks should be added as additional
   * `if (oldVersion < N) { ... }` sections below.
   */
  private migrateFilesStore(store: IDBObjectStore, oldVersion: number): void {
    if (oldVersion >= 9) return; // nothing to migrate at the current schema

    const cursor = store.openCursor();
    let migrated = 0;

    cursor.onsuccess = (event) => {
      const result = (event.target as IDBRequest)
        .result as IDBCursorWithValue | null;
      if (!result) {
        console.log(`Files-store migration complete (${migrated} records).`);
        return;
      }
      const record = result.value;
      let needsUpdate = false;

      // v3: file history fields. Sensible defaults so existing files keep
      // showing up in the recent view and act as their own version root.
      if (oldVersion < 3) {
        if (record.isLeaf === undefined) {
          record.isLeaf = true;
          needsUpdate = true;
        }
        if (record.versionNumber === undefined) {
          record.versionNumber = 1;
          needsUpdate = true;
        }
        if (record.originalFileId === undefined) {
          record.originalFileId = record.id;
          needsUpdate = true;
        }
        if (record.parentFileId === undefined) {
          record.parentFileId = undefined;
          needsUpdate = true;
        }
        if (record.toolHistory === undefined) {
          record.toolHistory = [];
          needsUpdate = true;
        }
      }

      // folderId. OSS lineage added this in v4. SaaS lineage never had
      // it (its v5 and v8 file rows both lack the field), so we gate on
      // field presence rather than oldVersion. Required on every row
      // so the folderId index doesn't drop the record out of
      // bounded-key cursor scans.
      if (record.folderId === undefined) {
        record.folderId = null;
        needsUpdate = true;
      }

      if (needsUpdate) {
        try {
          result.update(record);
          migrated += 1;
        } catch (error) {
          // Aborting the upgrade transaction here forces IndexedDB to roll back
          // the schema version bump too - the user retries on next page load
          // instead of silently losing folderId / isLeaf / etc on partial rows.
          console.error("Failed to migrate record:", record.id, error);
          store.transaction.abort();
          return;
        }
      }
      result.continue();
    };

    cursor.onerror = (event) => {
      // Same reasoning as the per-record catch above: abort the upgrade so the
      // schema doesn't get marked as v9 with rows still on the older shape.
      const err = (event.target as IDBRequest).error;
      console.error("Files-store migration cursor failed:", err);
      try {
        store.transaction.abort();
      } catch {
        // Already aborted - ignore.
      }
    };
  }

  /**
   * Get database connection (must be already opened)
   */
  getDatabase(name: string): IDBDatabase | null {
    return this.databases.get(name) || null;
  }

  /**
   * Close database connection
   */
  closeDatabase(name: string): void {
    const db = this.databases.get(name);
    if (db) {
      db.close();
      this.databases.delete(name);
      this.initPromises.delete(name);
    }
  }

  /**
   * Close all database connections
   */
  closeAllDatabases(): void {
    this.databases.forEach((db, name) => {
      console.log(`Closing database: ${name}`);
      db.close();
    });
    this.databases.clear();
    this.initPromises.clear();
  }

  /**
   * Delete database completely
   */
  async deleteDatabase(name: string): Promise<void> {
    // Close connection if open
    this.closeDatabase(name);

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(name);

      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onsuccess = () => {
        console.log(`Deleted database: ${name}`);
        resolve();
      };
    });
  }

  /**
   * Check if a database exists and what version it is
   */
  async getDatabaseVersion(name: string): Promise<number | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const version = db.version;
        db.close();
        resolve(version);
      };
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        // Cancel the upgrade
        request.transaction?.abort();
        resolve(null);
      };
    });
  }
}

// Pre-defined database configurations
export const DATABASE_CONFIGS = {
  FILES: {
    name: "stirling-pdf-files",
    version: 9,
    stores: [
      {
        name: "files",
        keyPath: "id",
        indexes: [
          { name: "name", keyPath: "name", unique: false },
          { name: "lastModified", keyPath: "lastModified", unique: false },
          { name: "originalFileId", keyPath: "originalFileId", unique: false },
          { name: "parentFileId", keyPath: "parentFileId", unique: false },
          { name: "versionNumber", keyPath: "versionNumber", unique: false },
          { name: "folderId", keyPath: "folderId", unique: false },
        ],
      },
      {
        name: "folders",
        keyPath: "id",
        indexes: [
          {
            name: "parentFolderId",
            keyPath: "parentFolderId",
            unique: false,
          },
          { name: "name", keyPath: "name", unique: false },
          { name: "createdAt", keyPath: "createdAt", unique: false },
        ],
      },
    ],
  } as DatabaseConfig,

  DRAFTS: {
    name: "stirling-pdf-drafts",
    version: 1,
    stores: [
      {
        name: "drafts",
        keyPath: "id",
      },
    ],
  } as DatabaseConfig,

  PREFERENCES: {
    name: "stirling-pdf-preferences",
    version: 1,
    stores: [
      {
        name: "preferences",
        keyPath: "key",
      },
    ],
  } as DatabaseConfig,
} as const;

export const indexedDBManager = IndexedDBManager.getInstance();
