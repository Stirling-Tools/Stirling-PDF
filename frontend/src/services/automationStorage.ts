/**
 * Service for managing automation configurations in IndexedDB
 */

export interface AutomationConfig {
  id: string;
  name: string;
  description?: string;
  operations: Array<{
    operation: string;
    parameters: any;
  }>;
  createdAt: string;
  updatedAt: string;
}

class AutomationStorage {
  private dbName = 'StirlingPDF_Automations';
  private dbVersion = 1;
  private storeName = 'automations';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open automation storage database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return this.db;
  }

  async saveAutomation(automation: Omit<AutomationConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutomationConfig> {
    const db = await this.ensureDB();
    const timestamp = new Date().toISOString();
    
    const automationWithMeta: AutomationConfig = {
      id: `automation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...automation,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(automationWithMeta);

      request.onsuccess = () => {
        resolve(automationWithMeta);
      };

      request.onerror = () => {
        reject(new Error('Failed to save automation'));
      };
    });
  }

  async updateAutomation(automation: AutomationConfig): Promise<AutomationConfig> {
    const db = await this.ensureDB();
    
    const updatedAutomation: AutomationConfig = {
      ...automation,
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(updatedAutomation);

      request.onsuccess = () => {
        resolve(updatedAutomation);
      };

      request.onerror = () => {
        reject(new Error('Failed to update automation'));
      };
    });
  }

  async getAutomation(id: string): Promise<AutomationConfig | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('Failed to get automation'));
      };
    });
  }

  async getAllAutomations(): Promise<AutomationConfig[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const automations = request.result || [];
        // Sort by creation date, newest first
        automations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(automations);
      };

      request.onerror = () => {
        reject(new Error('Failed to get automations'));
      };
    });
  }

  async deleteAutomation(id: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to delete automation'));
      };
    });
  }

  async searchAutomations(query: string): Promise<AutomationConfig[]> {
    const automations = await this.getAllAutomations();
    
    if (!query.trim()) {
      return automations;
    }

    const lowerQuery = query.toLowerCase();
    return automations.filter(automation => 
      automation.name.toLowerCase().includes(lowerQuery) ||
      (automation.description && automation.description.toLowerCase().includes(lowerQuery)) ||
      automation.operations.some(op => op.operation.toLowerCase().includes(lowerQuery))
    );
  }
}

// Export singleton instance
export const automationStorage = new AutomationStorage();