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
        
        console.log(`Upgrading ${config.name} from v${oldVersion} to v${config.version}`);

        // Create or update object stores
        config.stores.forEach(storeConfig => {
          let store: IDBObjectStore;

          if (db.objectStoreNames.contains(storeConfig.name)) {
            // Store exists - for now, just continue (could add migration logic here)
            console.log(`Object store '${storeConfig.name}' already exists`);
            return;
          }

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
              store.createIndex(
                indexConfig.name,
                indexConfig.keyPath,
                { unique: indexConfig.unique }
              );
              console.log(`Created index '${indexConfig.name}' on '${storeConfig.name}'`);
            });
          }
        });
      };
    });
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
    version: 2,
    stores: [{
      name: 'files',
      keyPath: 'id',
      indexes: [
        { name: 'name', keyPath: 'name', unique: false },
        { name: 'lastModified', keyPath: 'lastModified', unique: false }
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
  } as DatabaseConfig
} as const;

export const indexedDBManager = IndexedDBManager.getInstance();