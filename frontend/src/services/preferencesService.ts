import { indexedDBManager, DATABASE_CONFIGS } from './indexedDBManager';

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  hasCompletedOnboarding: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  hasCompletedOnboarding: false,
};

class PreferencesService {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.PREFERENCES);
  }

  private ensureDatabase(): IDBDatabase {
    if (!this.db) {
      throw new Error('PreferencesService not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async getPreference<K extends keyof UserPreferences>(
    key: K
  ): Promise<UserPreferences[K]> {
    const db = this.ensureDatabase();

    return new Promise((resolve) => {
      const transaction = db.transaction(['preferences'], 'readonly');
      const store = transaction.objectStore('preferences');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.value !== undefined) {
          resolve(result.value);
        } else {
          // Return default value if preference not found
          resolve(DEFAULT_PREFERENCES[key]);
        }
      };

      request.onerror = () => {
        console.error('Error reading preference:', key, request.error);
        // Return default value on error
        resolve(DEFAULT_PREFERENCES[key]);
      };
    });
  }

  async setPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): Promise<void> {
    const db = this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['preferences'], 'readwrite');
      const store = transaction.objectStore('preferences');
      const request = store.put({ key, value });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Error writing preference:', key, request.error);
        reject(request.error);
      };
    });
  }

  async getAllPreferences(): Promise<UserPreferences> {
    const db = this.ensureDatabase();

    return new Promise((resolve) => {
      const transaction = db.transaction(['preferences'], 'readonly');
      const store = transaction.objectStore('preferences');
      const request = store.getAll();

      request.onsuccess = () => {
        const storedPrefs: Partial<UserPreferences> = {};
        const results = request.result;

        for (const item of results) {
          if (item.key && item.value !== undefined) {
            storedPrefs[item.key as keyof UserPreferences] = item.value;
          }
        }

        // Merge with defaults to ensure all preferences exist
        resolve({
          ...DEFAULT_PREFERENCES,
          ...storedPrefs,
        });
      };

      request.onerror = () => {
        console.error('Error reading all preferences:', request.error);
        // Return defaults on error
        resolve({ ...DEFAULT_PREFERENCES });
      };
    });
  }

  async clearAllPreferences(): Promise<void> {
    const db = this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['preferences'], 'readwrite');
      const store = transaction.objectStore('preferences');
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

export const preferencesService = new PreferencesService();
