/**
 * Remembers the blocking probe facts of unencrypted files across reloads, so a stored file is not
 * read again. An entry is trusted only for the same file id, size and lastModified: a new version
 * gets a new id and a file reloaded from disk gets a new lastModified, so changed bytes are always
 * probed afresh. Encrypted files are never stored, because their facts depend on the password.
 * A slow or missing database never delays a check: the lookup gives up and the file is probed.
 */
import {
  DATABASE_CONFIGS,
  indexedDBManager,
} from "@editor/services/indexedDBManager";
import type { PdfAccess } from "@editor/services/pdfAccessService";

type CachedFacts = Pick<
  PdfAccess,
  "signed" | "permissions" | "encryptionRevision" | "pageCount"
>;

interface CacheEntry {
  fileId: string;
  size: number;
  lastModified: number;
  facts: CachedFacts;
}

const STORE = "facts";
const LOOKUP_TIMEOUT_MS = 200;

function identity(file: Blob) {
  const fileId = (file as { fileId?: unknown }).fileId;
  return typeof indexedDB !== "undefined" &&
    typeof fileId === "string" &&
    file instanceof File
    ? { fileId, size: file.size, lastModified: file.lastModified }
    : undefined;
}

async function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.PDF_PROBE);
  return new Promise((resolve, reject) => {
    const pending = run(db.transaction(STORE, mode).objectStore(STORE));
    pending.onsuccess = () => resolve(pending.result);
    pending.onerror = () => reject(pending.error);
  });
}

export function readCachedPdfAccess(
  file: Blob,
): Promise<PdfAccess | undefined> | undefined {
  const key = identity(file);
  return key && lookup(key);
}

async function lookup(
  key: NonNullable<ReturnType<typeof identity>>,
): Promise<PdfAccess | undefined> {
  const entry = await Promise.race([
    request<CacheEntry | undefined>("readonly", (store) =>
      store.get(key.fileId),
    ),
    new Promise<undefined>((resolve) => setTimeout(resolve, LOOKUP_TIMEOUT_MS)),
  ]).catch(() => undefined);
  if (!entry) return undefined;
  if (entry.size !== key.size || entry.lastModified !== key.lastModified) {
    void request("readwrite", (store) => store.delete(key.fileId)).catch(
      () => {},
    );
    return undefined;
  }
  return {
    ...entry.facts,
    password: "",
    encrypted: false,
    ownerAuthenticated: false,
    requiresOpeningPassword: false,
  };
}

export function cachePdfAccess(file: Blob, access: PdfAccess): void {
  const key = identity(file);
  if (!key || access.encrypted || access.password !== "") return;
  const entry: CacheEntry = {
    ...key,
    facts: {
      signed: access.signed,
      permissions: access.permissions,
      encryptionRevision: access.encryptionRevision,
      pageCount: access.pageCount,
    },
  };
  void request("readwrite", (store) => store.put(entry)).catch(() => {});
}
