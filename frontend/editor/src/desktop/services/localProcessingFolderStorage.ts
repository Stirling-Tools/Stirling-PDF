import { indexedDBManager } from "@app/services/indexedDBManager";
import type {
  ProcessingFolder,
  ProcessingFolderRun,
} from "@app/services/processingFolderApi";
import type { DiskFileEntry } from "@app/services/localFolderContents";

export interface LocalProcessingFolder extends ProcessingFolder {
  directory: string;
  sessionKey: string;
}

export interface LocalProcessingFile {
  id: string;
  folderId: string;
  input: DiskFileEntry;
  run: ProcessingFolderRun;
  serverRunId?: string;
  /** Copies written by the desktop, used to recognise its own output and protect later edits. */
  outputs: DiskFileEntry[];
  originalPath?: string;
  /** Keeps backup ownership after restore while allowing the restored input to be processed again. */
  restored?: boolean;
  /** First confirmed absence, tied to the backup version so replacement restarts retention. */
  orphanedOriginal?: { since: number; version: string };
}

const DATABASE = {
  name: "stirling-desktop-processing",
  version: 1,
  stores: [
    { name: "folders", keyPath: "id" },
    {
      name: "files",
      keyPath: "id",
      indexes: [{ name: "folderId", keyPath: "folderId", unique: false }],
    },
  ],
};

async function read<T>(
  storeName: string,
  query: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await indexedDBManager.openDatabase(DATABASE);
  return new Promise((resolve, reject) => {
    const request = query(db.transaction(storeName).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(
  storeName: string,
  value: LocalProcessingFolder | LocalProcessingFile | string,
): Promise<void> {
  const db = await indexedDBManager.openDatabase(DATABASE);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    if (typeof value === "string") store.delete(value);
    else store.put(value);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Desktop folder configuration and delivery history; document bytes stay on disk. */
export const localProcessingFolderStorage = {
  folders: (): Promise<LocalProcessingFolder[]> =>
    read("folders", (store) => store.getAll()),
  folder: (id: string): Promise<LocalProcessingFolder | undefined> =>
    read("folders", (store) => store.get(id)),
  saveFolder: (folder: LocalProcessingFolder): Promise<void> =>
    write("folders", folder),
  deleteFolder: (id: string): Promise<void> => write("folders", id),
  files: (folderId: string): Promise<LocalProcessingFile[]> =>
    read("files", (store) => store.index("folderId").getAll(folderId)),
  saveFile: (file: LocalProcessingFile): Promise<void> => write("files", file),
  deleteFile: (id: string): Promise<void> => write("files", id),
};
