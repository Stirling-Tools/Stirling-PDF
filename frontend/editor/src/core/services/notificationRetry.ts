import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import {
  indexedDBManager,
  type DatabaseConfig,
} from "@app/services/indexedDBManager";
import { zipFileService } from "@app/services/zipFileService";
import type { FileId } from "@app/types/file";
import type { ToolEndpoint } from "@app/types/toolApiTypes";

/**
 * What the notification bell needs to offer "Retry" or "Decrypt and retry" on a
 * failure the editor reported. The server keeps none of it: the report drops the
 * operation and answers 204, so this lives here, keyed on the opaque `fileId` it was
 * filed against. Last-write-wins per fileId, which is narrower than the server's
 * dedup (that one also keys on the failure kind): see {@link stashMatchesKind} for
 * how a consumer tells whether the surviving stash belongs to a given row.
 */
export interface RetryPayload {
  /** tool/endpoint identifier, e.g. "remove-password" */
  operation: string;
  /** the API path that failed, so a retry needs no tool registry lookup */
  endpoint: string;
  /** the tool parameters as submitted */
  params: Record<string, unknown>;
  fileIds: string[];
  /** Whether the endpoint takes the whole batch in one call, or one file per call. */
  multiFile: boolean;
  /** The failure's error code, so a stash can be matched to the row's kind. */
  errorCode: string | null;
  recordedAt: number;
}

/**
 * The error codes the named failure kinds claim, mirrored from the server's
 * {@code FailureKind} declarations. Used only to tell whether the one stash a file
 * carries belongs to a given row: the server keys incidents on kind as well as file,
 * so one file can have two open rows while this stash holds only the newest failure.
 */
const KIND_ERROR_CODES: Record<string, string> = {
  INPUT_PASSWORD_PROTECTED: "E004",
};

/**
 * Whether a stashed failure is the one a row of this kind describes. A named kind
 * owns exactly its claimed code; every other kind owns whatever no named kind
 * claims. A stash written before {@code errorCode} existed matches nothing named,
 * failing closed rather than retrying the wrong operation.
 */
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

/**
 * Its own database rather than a store on `stirling-pdf-files`: that schema has
 * shipped at v9, and adding a store there means a version bump plus an upgrade path
 * on every install for a hint that is safe to lose. Still opened through
 * `indexedDBManager`, so this is not a second way to reach IndexedDB.
 */
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

/**
 * Secret-looking field names. A tool's parameters can carry one (remove-password submits
 * `password`), so they are stripped on the way in rather than trusted to be absent.
 */
const SECRET_FIELD = /pass(word|phrase)|secret|token|credential/i;

/**
 * Stash the retry payload for a failure that was just reported. Never rejects, like
 * `reportToolFailure`: a browser that refuses IndexedDB should cost the user the retry
 * button, not a second error on top of the failure they already have.
 */
export async function stashRetryPayload(payload: RetryPayload): Promise<void> {
  try {
    const fileIds = payload.fileIds.filter(isUsableId);
    if (!payload.operation.trim() || fileIds.length === 0) return;

    const record = {
      ...payload,
      fileIds,
      // Persisting a password would defeat the point of asking for it again.
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

  // A record written by an older shape of this service is unusable rather than
  // half-usable: a retry with no endpoint has nowhere to go.
  if (!record.operation || !record.endpoint) return null;

  return {
    operation: record.operation,
    endpoint: record.endpoint,
    params: record.params ?? {},
    fileIds: record.fileIds ?? [fileId],
    // Older records predate these fields; both defaults fail closed (one file per
    // call, matching no named kind).
    multiFile: record.multiFile ?? false,
    errorCode: record.errorCode ?? null,
    recordedAt: record.recordedAt,
  };
}

/**
 * Whether the document is still in this browser, which decides whether a retry can run at
 * all. Null once the user deletes the file, and on every other device they own.
 */
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

/**
 * Why a retry could not run, for the component layer to word: the wording belongs
 * up there, which has `t`. `serverMessage` means {@link PasswordRetryOutcome.message}
 * carries the server's own words, which pass through untranslated on purpose.
 */
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

/**
 * Unlock a document this browser is holding, for a failure with no stashed operation such
 * as an attended policy run: a password-protected input is fixed the same way whatever was
 * reading it. Same contract as {@link retryWithPassword} otherwise.
 */
export async function unlockLocalDocument(
  fileId: string,
  password: string,
): Promise<PasswordRetryOutcome> {
  return postWithPassword(UNLOCK_ENDPOINT, {}, [fileId], password);
}

/**
 * Re-run the stashed operation with the password the user just typed, and hand back
 * what it produced. The password is appended to a single request and then out of
 * scope: never stashed, never logged, never in the message returned here.
 *
 * A single-file endpoint was called once per file by the original run, so the retry
 * sends only `forFileId`, the document the row is about; a multi-file endpoint gets
 * the whole stashed batch back, exactly as it was submitted.
 *
 * `files` is returned rather than adopted because every file operation goes through
 * FileContext, which a service cannot reach.
 */
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

  // getStirlingFiles drops what it cannot find, so a short result means an input is
  // gone. Resolved rather than thrown: the caller shows this next to the notification.
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

/**
 * The response as adoptable documents. A multi-output run answers with a ZIP, which
 * must not land in the workbench pretending to be one PDF, so it is unpacked here
 * the same way the tool pipeline unpacks it.
 */
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

/**
 * The name the server gave the output, falling back to the input's: a caller adopting an
 * unnamed blob would put a file called "blob" in the user's workbench.
 */
function filenameOf(headers: unknown, fallback: string): string {
  const disposition = (headers as Record<string, unknown> | undefined)?.[
    "content-disposition"
  ];
  if (typeof disposition !== "string") return fallback;

  // filename* (RFC 5987, percent-encoded) wins over plain filename, which is how a
  // server sends a non-ASCII name.
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

/**
 * The tool's parameters as form fields, alongside the documents under `fileInput`.
 * `objectToFormData` is not reused: it is typed to the generated request union and throws on
 * anything non-primitive, whereas a stashed payload is an opaque record read out of storage.
 */
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

/**
 * How deep the walk below goes before it stops descending. Tool parameters are shallow, so this is
 * far above anything real; it exists so a pathological or cyclic object cannot exhaust the stack.
 */
const MAX_PARAM_DEPTH = 20;

/** Stands in for a subtree too deep to walk. Never the value itself: see below. */
const TOO_DEEP = "[nested too deeply to store]";

/**
 * Every secret-looking field dropped, at any depth: a tool can nest its parameters, and a
 * password one level down is still a password.
 *
 * Past {@link MAX_PARAM_DEPTH} the subtree is replaced rather than returned. Returning it would
 * mean anything below the limit is persisted unexamined, so the one place this function must not
 * fail open is exactly the place it stops looking.
 */
function withoutSecrets(
  value: Record<string, unknown>,
): Record<string, unknown>;
function withoutSecrets(value: unknown): unknown;
function withoutSecrets(value: unknown): unknown {
  return prunedBelow(value, 0);
}

/**
 * The walk itself. Separate from {@link withoutSecrets} because the depth is bookkeeping between
 * one level and the next, and no caller should be able to start part-way down.
 */
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

/**
 * What the server said, or null when it said nothing usable (the caller words that
 * case itself). Never carries the password: it is not interpolated here.
 */
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

    // Evict in the same transaction as the writes, so two concurrent stashes cannot
    // both decide the store is under the cap.
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
