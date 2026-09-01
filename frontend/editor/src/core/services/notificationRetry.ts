import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import {
  indexedDBManager,
  type DatabaseConfig,
} from "@app/services/indexedDBManager";
import { zipFileService } from "@app/services/zipFileService";
import type { FileId } from "@app/types/file";
import type { ToolEndpoint } from "@app/types/toolApiTypes";

/** What the bell needs to retry a reported failure. The server keeps none of it. */
export interface RetryPayload {
  operation: string;
  endpoint: string;
  params: Record<string, unknown>;
  fileIds: string[];
  /** Whether the endpoint takes the whole batch in one call, or one file per call. */
  multiFile: boolean;
  /** The failure's error code, so a stash can be matched to the row's kind. */
  errorCode: string | null;
  recordedAt: number;
}

/** Mirrored from the server's `FailureKind` declarations. */
const KIND_ERROR_CODES: Record<string, string> = {
  INPUT_PASSWORD_PROTECTED: "E004",
};

/** Whether the one stash a file carries is the failure this row describes. */
export function stashMatchesKind(
  kindId: string,
  payload: RetryPayload,
): boolean {
  const claimed = KIND_ERROR_CODES[kindId];
  if (claimed) return payload.errorCode === claimed;
  return (
    payload.errorCode === null ||
    !Object.values(KIND_ERROR_CODES).includes(payload.errorCode)
  );
}

/** Its own database: the files schema is at v9, and this hint is safe to lose. */
const RETRY_DB_CONFIG: DatabaseConfig = {
  name: "stirling-pdf-retry",
  version: 1,
  stores: [{ name: "retryPayloads", keyPath: "fileId" }],
};

const STORE_NAME = "retryPayloads";

/** Capped, oldest evicted first, so the stash cannot grow for the origin's lifetime. */
const MAX_RETAINED_PAYLOADS = 25;

/** One record per file involved, so a retry can be found from any of them. */
interface StoredRetryRecord extends RetryPayload {
  fileId: string;
}

/** Stripped on the way in: remove-password submits its password as a parameter. */
const SECRET_FIELD = /pass(word|phrase)|secret|token|credential/i;

/** Never rejects: a browser refusing IndexedDB costs the retry button, not a second error. */
export async function stashRetryPayload(payload: RetryPayload): Promise<void> {
  try {
    const fileIds = payload.fileIds.filter(isUsableId);
    if (!payload.operation.trim() || fileIds.length === 0) return;

    const record = {
      ...payload,
      fileIds,
      params: withoutSecrets(payload.params),
    };

    await writeRecords(fileIds.map((fileId) => ({ ...record, fileId })));
  } catch {
    // Nothing to recover: the bell simply offers no retry for this failure.
  }
}

/** The most recent operation that failed on this file, or null when nothing is stashed. */
export async function loadRetryPayload(
  fileId: string | null,
): Promise<RetryPayload | null> {
  if (!isUsableId(fileId)) return null;

  let record: StoredRetryRecord | undefined;
  try {
    record = await readRecord(fileId);
  } catch {
    return null;
  }
  if (!record) return null;

  // An older shape is unusable rather than half-usable: a retry needs somewhere to go.
  if (!record.operation || !record.endpoint) return null;

  return {
    operation: record.operation,
    endpoint: record.endpoint,
    params: record.params ?? {},
    fileIds: record.fileIds ?? [fileId],
    // Older records predate these fields; both defaults fail closed.
    multiFile: record.multiFile ?? false,
    errorCode: record.errorCode ?? null,
    recordedAt: record.recordedAt,
  };
}

/** Whether the document is still in this browser, which decides whether a retry can run. */
export async function hasLocalFile(fileId: string | null): Promise<boolean> {
  if (!isUsableId(fileId)) return false;

  try {
    const stub = await fileStorage.getStirlingFileStub(fileId as FileId);
    return stub !== null;
  } catch {
    return false;
  }
}

/** A file the retry produced, handed back for the caller to adopt. */
export interface RetryOutputFile {
  blob: Blob;
  filename: string;
}

/** Why a retry could not run; `serverMessage` means the message is the server's own words. */
export type PasswordRetryFailure =
  | "notRetryable"
  | "fileMissing"
  | "serverMessage";

/** What a password-carrying call comes back with. `files` only ever on success. */
export interface PasswordRetryOutcome {
  ok: boolean;
  reason?: PasswordRetryFailure;
  message?: string | null;
  files?: RetryOutputFile[];
}

/** Checked against the generated endpoints, so a renamed route fails the build here. */
const UNLOCK_ENDPOINT =
  "/api/v1/security/remove-password" satisfies ToolEndpoint;

/** Unlock a held document for a failure with no stashed operation, e.g. a policy run. */
export async function unlockLocalDocument(
  fileId: string,
  password: string,
): Promise<PasswordRetryOutcome> {
  return postWithPassword(UNLOCK_ENDPOINT, {}, [fileId], password);
}

/** Re-runs the stashed operation: `forFileId` alone, or the whole batch for a multi-file endpoint. */
export async function retryWithPassword(
  payload: RetryPayload,
  password: string,
  forFileId: string | null = null,
): Promise<PasswordRetryOutcome> {
  if (!payload.endpoint) {
    return { ok: false, reason: "notRetryable", message: null };
  }

  const fileIds = payload.multiFile
    ? payload.fileIds
    : [
        forFileId && payload.fileIds.includes(forFileId)
          ? forFileId
          : payload.fileIds[0],
      ];

  return postWithPassword(payload.endpoint, payload.params, fileIds, password);
}

/** Shared by both callers above, so a password reaches the network from one place only. */
async function postWithPassword(
  endpoint: string,
  params: Record<string, unknown>,
  requestedFileIds: (string | null | undefined)[],
  password: string,
): Promise<PasswordRetryOutcome> {
  const fileIds = requestedFileIds.filter(isUsableId);
  let files: File[] = [];
  try {
    files = await fileStorage.getStirlingFiles(fileIds as FileId[]);
  } catch {
    files = [];
  }

  // getStirlingFiles drops what it cannot find, so a short result means an input is gone.
  if (files.length === 0 || files.length !== fileIds.length) {
    return { ok: false, reason: "fileMissing", message: null };
  }

  try {
    const formData = toFormData(params, files);
    formData.append("password", password);
    const response = await apiClient.post<Blob>(endpoint, formData, {
      responseType: "blob",
    });
    return {
      ok: true,
      files: await asOutputFiles(
        response.data,
        filenameOf(response.headers, files[0].name),
      ),
    };
  } catch (error) {
    return { ok: false, reason: "serverMessage", message: messageOf(error) };
  }
}

/** A multi-output run answers with a ZIP, which must not land in the workbench as one PDF. */
async function asOutputFiles(
  blob: Blob,
  filename: string,
): Promise<RetryOutputFile[]> {
  if (await zipFileService.isZipResponse(blob)) {
    const extracted = await zipFileService.extractPdfFiles(
      new File([blob], filename),
    );
    if (extracted.success && extracted.extractedFiles.length > 0) {
      return extracted.extractedFiles.map((file) => ({
        blob: file,
        filename: file.name,
      }));
    }
  }
  return [{ blob, filename }];
}

/** Falls back to the input's name, so an unnamed blob is not adopted as "blob". */
function filenameOf(headers: unknown, fallback: string): string {
  const disposition = (headers as Record<string, unknown> | undefined)?.[
    "content-disposition"
  ];
  if (typeof disposition !== "string") return fallback;

  // filename* (RFC 5987) wins over plain filename: that is how a non-ASCII name arrives.
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const name = encoded ?? plain;
  if (!name) return fallback;

  try {
    return decodeURIComponent(name.trim().replace(/^"|"$/g, "")) || fallback;
  } catch {
    // A malformed escape is not worth failing an otherwise successful retry over.
    return name.trim().replace(/^"|"$/g, "") || fallback;
  }
}

function isUsableId(fileId: string | null | undefined): fileId is string {
  return typeof fileId === "string" && fileId.trim() !== "";
}

/** Not `objectToFormData`: that is typed to the generated union and throws on a stashed record. */
function toFormData(params: Record<string, unknown>, files: File[]): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) formData.append(key, asField(item));
    } else {
      formData.append(key, asField(value));
    }
  }

  for (const file of files) formData.append("fileInput", file);

  return formData;
}

function asField(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : `${value}`;
}

/** Far above any real tool's nesting; exists so a cyclic object cannot exhaust the stack. */
const MAX_PARAM_DEPTH = 20;

/** Stands in for a subtree too deep to walk. */
const TOO_DEEP = "[nested too deeply to store]";

/** Secrets dropped at any depth; past the limit the subtree is replaced, never returned unseen. */
function withoutSecrets(
  value: Record<string, unknown>,
): Record<string, unknown>;
function withoutSecrets(value: unknown): unknown;
function withoutSecrets(value: unknown): unknown {
  return prunedBelow(value, 0);
}

function prunedBelow(value: unknown, depth: number): unknown {
  if (depth >= MAX_PARAM_DEPTH) return TOO_DEEP;
  if (Array.isArray(value))
    return value.map((item) => prunedBelow(item, depth + 1));
  if (value === null || typeof value !== "object") return value;

  const kept: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) continue;
    kept[key] = prunedBelow(nested, depth + 1);
  }
  return kept;
}

/** What the server said, or null when it said nothing usable. Never carries the password. */
function messageOf(error: unknown): string | null {
  const response = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof response === "string" && response.trim() !== "") return response;

  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

async function writeRecords(records: StoredRetryRecord[]): Promise<void> {
  const db = await indexedDBManager.openDatabase(RETRY_DB_CONFIG);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Retry stash transaction aborted"));

    // put, not add: last write wins per fileId, matching the server's dedup.
    for (const record of records) store.put(record);

    // Evicted in the same transaction, so two concurrent stashes cannot both see room.
    const all = store.getAll();
    all.onsuccess = () => {
      const stored = (all.result ?? []) as StoredRetryRecord[];
      const excess = stored.length - MAX_RETAINED_PAYLOADS;
      if (excess <= 0) return;
      stored
        .sort((a, b) => a.recordedAt - b.recordedAt)
        .slice(0, excess)
        .forEach((record) => store.delete(record.fileId));
    };
    all.onerror = () => reject(all.error);
  });
}

async function readRecord(
  fileId: string,
): Promise<StoredRetryRecord | undefined> {
  const db = await indexedDBManager.openDatabase(RETRY_DB_CONFIG);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const request = transaction.objectStore(STORE_NAME).get(fileId);
    request.onsuccess = () =>
      resolve(request.result as StoredRetryRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}
