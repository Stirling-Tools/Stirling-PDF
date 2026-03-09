/**
 * Service for managing files within Smart Folders in IndexedDB
 */

import { FolderFileMetadata, FolderRecord } from '@app/types/smartFolders';

const FOLDER_CHANGE_EVENT = 'folder-storage-changed';

interface OutputFileRecord {
  fileId: string;
  folderId: string;
  name: string;
  blob: Blob;
  storedAt: number;
}

interface InputFileRecord {
  fileId: string;
  folderId: string;
  name: string;
  blob: Blob;
  storedAt: number;
}

class FolderStorage {
  private dbName = 'stirling-pdf-folder-files';
  private dbVersion = 2;
  private recordsStore = 'folderRecords';
  private outputStore = 'folderOutputFiles';
  private inputStore = 'folderInputFiles';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open folder files database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.recordsStore)) {
          db.createObjectStore(this.recordsStore, { keyPath: 'folderId' });
        }
        if (!db.objectStoreNames.contains(this.outputStore)) {
          const outputStore = db.createObjectStore(this.outputStore, { keyPath: 'fileId' });
          outputStore.createIndex('folderId', 'folderId', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.inputStore)) {
          const inputStore = db.createObjectStore(this.inputStore, { keyPath: 'fileId' });
          inputStore.createIndex('folderId', 'folderId', { unique: false });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Folder files database not initialized');
    }
    return this.db;
  }

  private dispatchChange(folderId: string): void {
    window.dispatchEvent(new CustomEvent(FOLDER_CHANGE_EVENT, { detail: { folderId } }));
  }

  onFolderChange(listener: (folderId: string) => void): () => void {
    const handler = (e: Event) => {
      listener((e as CustomEvent).detail.folderId);
    };
    window.addEventListener(FOLDER_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FOLDER_CHANGE_EVENT, handler);
  }

  async getFolderData(folderId: string): Promise<FolderRecord | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readonly');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.get(folderId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get folder data'));
    });
  }

  async addFileToFolder(folderId: string, fileId: string, metadata?: Partial<FolderFileMetadata>): Promise<void> {
    const db = await this.ensureDB();
    const existing = await this.getFolderData(folderId);
    const now = new Date();
    const record: FolderRecord = existing || { folderId, files: {}, lastUpdated: Date.now() };
    record.files[fileId] = {
      addedAt: now,
      status: 'pending',
      inputFileId: fileId,
      ...metadata,
    };
    record.lastUpdated = Date.now();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.put(record);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to add file to folder'));
    });
  }

  async updateFileMetadata(folderId: string, fileId: string, updates: Partial<FolderFileMetadata>): Promise<void> {
    const db = await this.ensureDB();
    const existing = await this.getFolderData(folderId);
    if (!existing) return;
    existing.files[fileId] = { ...existing.files[fileId], ...updates };
    existing.lastUpdated = Date.now();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.put(existing);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to update file metadata'));
    });
  }

  async removeFileFromFolder(folderId: string, fileId: string): Promise<void> {
    const db = await this.ensureDB();
    const existing = await this.getFolderData(folderId);
    if (!existing) return;
    delete existing.files[fileId];
    existing.lastUpdated = Date.now();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.put(existing);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to remove file from folder'));
    });
  }

  async storeInputFile(folderId: string, fileId: string, blob: Blob, name: string): Promise<void> {
    const db = await this.ensureDB();
    const record: InputFileRecord = { fileId, folderId, name, blob, storedAt: Date.now() };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.inputStore], 'readwrite');
      const store = transaction.objectStore(this.inputStore);
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store input file'));
    });
  }

  async getInputFile(fileId: string): Promise<InputFileRecord | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.inputStore], 'readonly');
      const store = transaction.objectStore(this.inputStore);
      const request = store.get(fileId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get input file'));
    });
  }

  async getInputFilesByFolder(folderId: string): Promise<InputFileRecord[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.inputStore], 'readonly');
      const store = transaction.objectStore(this.inputStore);
      const index = store.index('folderId');
      const request = index.getAll(folderId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get input files by folder'));
    });
  }

  async clearFolder(folderId: string): Promise<void> {
    const db = await this.ensureDB();
    // Delete output and input files for this folder
    const outputFileIds = await this.getOutputFileIdsByFolder(folderId);
    await Promise.all(outputFileIds.map(id => this.deleteOutputFile(db, id)));
    const inputFiles = await this.getInputFilesByFolder(folderId);
    await Promise.all(inputFiles.map(f => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.inputStore], 'readwrite');
      const store = transaction.objectStore(this.inputStore);
      const request = store.delete(f.fileId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete input file'));
    })));
    // Delete folder record
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.recordsStore], 'readwrite');
      const store = transaction.objectStore(this.recordsStore);
      const request = store.delete(folderId);
      request.onsuccess = () => {
        this.dispatchChange(folderId);
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to clear folder'));
    });
  }

  private async getOutputFileIdsByFolder(folderId: string): Promise<string[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.outputStore], 'readonly');
      const store = transaction.objectStore(this.outputStore);
      const index = store.index('folderId');
      const request = index.getAll(folderId);
      request.onsuccess = () => {
        const records: OutputFileRecord[] = request.result || [];
        resolve(records.map(r => r.fileId));
      };
      request.onerror = () => reject(new Error('Failed to get output file ids'));
    });
  }

  private async deleteOutputFile(db: IDBDatabase, fileId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.outputStore], 'readwrite');
      const store = transaction.objectStore(this.outputStore);
      const request = store.delete(fileId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete output file'));
    });
  }

  async storeOutputFile(folderId: string, fileId: string, blob: Blob, name: string): Promise<void> {
    const db = await this.ensureDB();
    const record: OutputFileRecord = {
      fileId,
      folderId,
      name,
      blob,
      storedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.outputStore], 'readwrite');
      const store = transaction.objectStore(this.outputStore);
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store output file'));
    });
  }

  async getOutputFile(fileId: string): Promise<OutputFileRecord | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.outputStore], 'readonly');
      const store = transaction.objectStore(this.outputStore);
      const request = store.get(fileId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get output file'));
    });
  }

  async getOutputFilesByFolder(folderId: string): Promise<OutputFileRecord[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.outputStore], 'readonly');
      const store = transaction.objectStore(this.outputStore);
      const index = store.index('folderId');
      const request = index.getAll(folderId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get output files by folder'));
    });
  }

  async getProcessingFileIds(folderId: string): Promise<string[]> {
    const record = await this.getFolderData(folderId);
    if (!record) return [];
    return Object.entries(record.files)
      .filter(([, meta]) => meta.status === 'processing')
      .map(([id]) => id);
  }

  async getProcessedFileIds(folderId: string): Promise<string[]> {
    const record = await this.getFolderData(folderId);
    if (!record) return [];
    return Object.entries(record.files)
      .filter(([, meta]) => meta.status === 'processed')
      .map(([id]) => id);
  }

  async getPendingFileIds(folderId: string): Promise<string[]> {
    const record = await this.getFolderData(folderId);
    if (!record) return [];
    return Object.entries(record.files)
      .filter(([, meta]) => meta.status === 'pending')
      .map(([id]) => id);
  }
}

export const folderStorage = new FolderStorage();
export type { OutputFileRecord, InputFileRecord };
