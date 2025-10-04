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

        console.log(`Upgrading ${config.name} from v${oldVersion} to v${config.version}`);

        // Create or update object stores
        config.stores.forEach(storeConfig => {
          let store: IDBObjectStore | undefined;

          if (db.objectStoreNames.contains(storeConfig.name)) {
            // Store exists - get reference for migration
            console.log(`Object store '${storeConfig.name}' already exists`);
            store = transaction?.objectStore(storeConfig.name);

            // Add new indexes if they don't exist
            if (storeConfig.indexes && store) {
              storeConfig.indexes.forEach(indexConfig => {
                if (!store?.indexNames.contains(indexConfig.name)) {
                  store?.createIndex(
                    indexConfig.name,
                    indexConfig.keyPath,
                    { unique: indexConfig.unique }
                  );
                  console.log(`Created index '${indexConfig.name}' on '${storeConfig.name}'`);
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
              storeConfig.indexes.forEach(indexConfig => {
                store?.createIndex(
                  indexConfig.name,
                  indexConfig.keyPath,
                  { unique: indexConfig.unique }
                );
                console.log(`Created index '${indexConfig.name}' on '${storeConfig.name}'`);
              });
            }
          }

          // Perform data migration for files database
          if (config.name === 'stirling-pdf-files' && storeConfig.name === 'files' && store) {
            this.migrateFileHistoryFields(store, oldVersion);
          }
        });
      };
    });
  }

  /**
   * Migrate existing file records to include new file history fields
   */
  private migrateFileHistoryFields(store: IDBObjectStore, oldVersion: number): void {
    // Only migrate if upgrading from a version before file history was added (version < 3)
    if (oldVersion >= 3) {
      return;
    }

    console.log('Starting file history migration for existing records...');

    const cursor = store.openCursor();
    let migratedCount = 0;

    cursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const record = cursor.value;
        let needsUpdate = false;

        // Add missing file history fields with sensible defaults
        if (record.isLeaf === undefined) {
          record.isLeaf = true; // Existing files are unprocessed, should appear in recent files
          needsUpdate = true;
        }

        if (record.versionNumber === undefined) {
          record.versionNumber = 1; // Existing files are first version
          needsUpdate = true;
        }

        if (record.originalFileId === undefined) {
          record.originalFileId = record.id; // Existing files are their own root
          needsUpdate = true;
        }

        if (record.parentFileId === undefined) {
          record.parentFileId = undefined; // No parent for existing files
          needsUpdate = true;
        }

        if (record.toolHistory === undefined) {
          record.toolHistory = []; // No history for existing files
          needsUpdate = true;
        }

        // Update the record if any fields were missing
        if (needsUpdate) {
          try {
            cursor.update(record);
            migratedCount++;
          } catch (error) {
            console.error('Failed to migrate record:', record.id, error);
          }
        }

        cursor.continue();
      } else {
        // Migration complete
        console.log(`File history migration completed. Migrated ${migratedCount} records.`);
      }
    };

    cursor.onerror = (event) => {
      console.error('File history migration failed:', (event.target as IDBRequest).error);
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
    name: 'stirling-pdf-files',
    version: 3,
    stores: [{
      name: 'files',
      keyPath: 'id',
      indexes: [
        { name: 'name', keyPath: 'name', unique: false },
        { name: 'lastModified', keyPath: 'lastModified', unique: false },
        { name: 'originalFileId', keyPath: 'originalFileId', unique: false },
        { name: 'parentFileId', keyPath: 'parentFileId', unique: false },
        { name: 'versionNumber', keyPath: 'versionNumber', unique: false }
      ]
    }]
  } as DatabaseConfig,

  DRAFTS: {
    name: 'stirling-pdf-drafts',
    version: 1,
    stores: [{
      name: 'drafts',
      keyPath: 'id'
    }]
  } as DatabaseConfig,

  PREFERENCES: {
    name: 'stirling-pdf-preferences',
    version: 1,
    stores: [{
      name: 'preferences',
      keyPath: 'key'
    }]
  } as DatabaseConfig,

} as const;

export const indexedDBManager = IndexedDBManager.getInstance();
