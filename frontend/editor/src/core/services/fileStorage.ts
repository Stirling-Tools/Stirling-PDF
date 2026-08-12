/**
 * Stirling File Storage Service
 * Single-table architecture with typed query methods
 * Forces correct usage patterns through service API design
 */

import { FileId, BaseFileMetadata } from "@app/types/file";
import { FolderId } from "@app/types/folder";
import {
  StirlingFile,
  StirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";
import { alert } from "@app/components/toast";

/**
 * Storage record - single source of truth
 * Contains all data needed for both StirlingFile and StirlingFileStub
 */
const THUMBNAIL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface StoredStirlingFileRecord extends BaseFileMetadata {
  // Blob since the large-file OOM fix (stored by reference, no JS-side copy);
  // ArrayBuffer records predate it and are still readable.
  data: ArrayBuffer | Blob;
  fileId: FileId; // Matches runtime StirlingFile.fileId exactly
  quickKey: string; // Matches runtime StirlingFile.quickKey exactly
  thumbnail?: string;
  thumbnailStoredAt?: number; // Epoch ms - sliding 30-day TTL
  url?: string; // For compatibility with existing components
  // Cached classification labels — mirrors the stub field so the sidebar can
  // group by label without re-reading PDF bytes, and it survives versioning.
  // See StirlingFileStub.classificationLabels.
  classificationLabels?: string[];
}

export interface StorageStats {
  used: number;
  available: number;
  fileCount: number;
  quota?: number;
}

/**
 * Best-effort provenance for records persisted before `derivedFromTool`
 * existed. A version chain (a tool history, a version past the first, or a
 * parent) is unambiguously a tool output, so flag it. Legacy independent
 * artifacts (convert/split/merge) recorded none of that and are
 * indistinguishable from uploads in old data — they stay unflagged, which for
 * an enforcement feature is the safe default (enforce rather than silently
 * skip). New records always carry an explicit flag, so this only fires for
 * pre-existing files on first read after upgrade.
 */
export function legacyDerivedFromTool(
  record: StoredStirlingFileRecord,
): boolean | undefined {
  if ((record.toolHistory?.length ?? 0) > 0) return true;
  if ((record.versionNumber ?? 1) > 1) return true;
  if (record.parentFileId != null) return true;
  return undefined;
}

/**
 * Can't persist a Blob/File value, so a copy would work? WebKit reports
 * `UnknownError` ("Error preparing Blob/File data...") when it can't write the
 * blob's backing file; a refused structured clone is `DataCloneError`.
 * Narrow on purpose: retrying quota or duplicate-key failures would fail again
 * and hide the real cause.
 */
function isBlobValueRejection(error: unknown): boolean {
  const name = (error as DOMException | null)?.name;
  return name === "UnknownError" || name === "DataCloneError";
}

/** This engine loses Blob values, remembered per browser: session-scoped, each
 *  reload re-decides optimistically and writes more files it will lose. */
const BLOB_VALUES_UNSUPPORTED_KEY = "stirling.indexeddb.blobValuesUnsupported";

function readBlobValuesSupported(): boolean {
  try {
    return localStorage.getItem(BLOB_VALUES_UNSUPPORTED_KEY) !== "true";
  } catch {
    // Storage unavailable (private mode): decide fresh each session.
    return true;
  }
}

function persistBlobValuesUnsupported(): void {
  try {
    localStorage.setItem(BLOB_VALUES_UNSUPPORTED_KEY, "true");
  } catch {
    // Storage unavailable: the session-scoped flag still degrades this session.
  }
}

/** WebKit loses backing stores for blobs it accepted, and only a real read shows
 *  it. One byte is enough: what fails is opening the store, not the length. */
async function blobReadFailure(data: Blob): Promise<unknown> {
  try {
    await data.slice(0, 1).arrayBuffer();
    return null;
  } catch (error) {
    return error ?? new Error("Reading a stored blob's bytes failed");
  }
}

/** Notified when a record's bytes are proven unreadable, so whoever is holding the
 *  file can drop it instead of rendering a document that never arrives. */
const unreadableListeners = new Set<(fileId: FileId) => void>();

export function onRecordUnreadable(
  listener: (fileId: FileId) => void,
): () => void {
  unreadableListeners.add(listener);
  return () => unreadableListeners.delete(listener);
}

/** The probe read itself can hang in WebKit, so anything that awaits it needs a
 *  deadline. Distinct from a failure: nothing was proven either way. */
const PROBE_UNANSWERED = { unanswered: true } as const;
const PROBE_DEADLINE_MS = 3000;

function withProbeDeadline(
  probe: Promise<unknown>,
): Promise<unknown | typeof PROBE_UNANSWERED> {
  return Promise.race([
    probe,
    new Promise<typeof PROBE_UNANSWERED>((resolve) =>
      setTimeout(() => resolve(PROBE_UNANSWERED), PROBE_DEADLINE_MS),
    ),
  ]);
}

/**
 * The File for a stored record. Re-wrapping a stored blob can cost WebKit the
 * backing handle, so hand it back untouched when its identity fields match.
 */
function fileFromRecord(record: StoredStirlingFileRecord): File {
  const { data } = record;
  if (
    data instanceof File &&
    data.name === record.name &&
    data.type === record.type &&
    data.lastModified === record.lastModified
  ) {
    return data;
  }
  return new File([data], record.name, {
    type: record.type,
    lastModified: record.lastModified,
  });
}

/**
 * Settle on abort, for promises whose settle paths (a cursor tick, a request not
 * yet issued) never arrive. Call ONCE per transaction - there is one slot.
 */
function settleOnAbort(
  transaction: IDBTransaction,
  settle: (reason: Error) => void,
): void {
  transaction.onabort = () =>
    settle(
      transaction.error ??
        new Error("IndexedDB transaction aborted before it completed"),
    );
}

class FileStorageService {
  private readonly dbConfig = DATABASE_CONFIGS.FILES;
  private readonly storeName = "files";
  /** Whether this engine takes Blob/File values, which avoid copying multi-GB
   *  files into JS memory. Optimistic; a No outlives the session (see the key). */
  private blobValuesSupported = readBlobValuesSupported();
  /** Whether a stored blob's bytes have come back yet. Until they have, each
   *  store proves it: accepting the write is no evidence the bytes survived. */
  private blobReadbackVerified = false;
  /** Ids whose TTL write failed. Without this the swallowed failure repeats a
   *  whole-file rewrite on every listing. Session-scoped on purpose. */
  private readonly unwritableRecords = new Set<FileId>();
  /** Ids already reported as unreadable, so one dead record is surfaced once
   *  rather than on every read of it. Session-scoped on purpose. */
  private readonly unreadableRecords = new Set<FileId>();

  /**
   * Get database connection using centralized manager
   */
  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.dbConfig);
  }

  /** Returns thumbnail if within TTL, otherwise undefined. */
  private isThumbnailFresh(record: StoredStirlingFileRecord): boolean {
    if (!record.thumbnail) return false;
    if (!record.thumbnailStoredAt) return false;
    return Date.now() - record.thumbnailStoredAt < THUMBNAIL_TTL_MS;
  }

  /** Fire-and-forget: bump thumbnailStoredAt (or clear expired thumbnail) for a set of ids. */
  private async bumpThumbnailTTL(ids: FileId[], clear = false): Promise<void> {
    const targets = ids.filter((id) => !this.unwritableRecords.has(id));
    if (targets.length === 0) return;
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      // Issue all gets up front - each onsuccess creates a put before the
      // transaction can auto-commit, keeping it alive until all puts settle.
      targets.forEach((id) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result as StoredStirlingFileRecord | undefined;
          if (!record) return;
          if (clear) {
            record.thumbnail = undefined;
            record.thumbnailStoredAt = undefined;
          } else {
            record.thumbnailStoredAt = Date.now();
          }
          // One unwritable record must not take the batch with it: a rejected
          // put aborts the transaction the other queued gets are still using.
          try {
            const put = store.put(record);
            put.onerror = (event) => {
              // The write we just swallowed is the one that would have taken
              // this record out of the expiring set, so stop retrying it.
              this.unwritableRecords.add(id);
              this.noteBlobRefusal(put.error);
              console.warn(
                `[fileStorage] thumbnail TTL bump skipped for ${id}:`,
                put.error,
              );
              // Swallow it here so the failure doesn't abort the transaction.
              event.preventDefault();
              event.stopPropagation();
            };
          } catch (error) {
            this.unwritableRecords.add(id);
            console.warn(
              `[fileStorage] thumbnail TTL bump could not be issued for ${id}:`,
              error,
            );
          }
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  /**
   * Store a StirlingFile with its metadata from StirlingFileStub
   */
  async storeStirlingFile(
    stirlingFile: StirlingFile,
    stub: StirlingFileStub,
  ): Promise<void> {
    const db = await this.getDatabase();

    const record: StoredStirlingFileRecord = {
      id: stirlingFile.fileId,
      fileId: stirlingFile.fileId, // Explicit field for clarity
      quickKey: stirlingFile.quickKey,
      name: stirlingFile.name,
      type: stirlingFile.type,
      size: stirlingFile.size,
      lastModified: stirlingFile.lastModified,
      createdAt: stub.createdAt,
      // Store the File (a Blob) itself: IndexedDB persists it by reference and
      // streams to disk, so multi-GB files never materialize in JS memory.
      // Engines that reject blob values fall back to a copy — see addFileRecord.
      data: this.blobValuesSupported
        ? stirlingFile
        : await stirlingFile.arrayBuffer(),
      thumbnail: stub.thumbnailUrl,
      thumbnailStoredAt: stub.thumbnailUrl ? Date.now() : undefined,
      isLeaf: stub.isLeaf ?? true,
      remoteStorageId: stub.remoteStorageId,
      remoteStorageUpdatedAt: stub.remoteStorageUpdatedAt,
      remoteOwnerUsername: stub.remoteOwnerUsername,
      remoteOwnedByCurrentUser: stub.remoteOwnedByCurrentUser,
      remoteAccessRole: stub.remoteAccessRole,
      remoteSharedViaLink: stub.remoteSharedViaLink,
      remoteHasShareLinks: stub.remoteHasShareLinks,
      remoteShareToken: stub.remoteShareToken,

      // History data from stub
      versionNumber: stub.versionNumber ?? 1,
      originalFileId: stub.originalFileId ?? stirlingFile.fileId,
      parentFileId: stub.parentFileId ?? undefined,
      toolHistory: stub.toolHistory ?? [],
      derivedFromTool: stub.derivedFromTool ?? false,
      sourceFileIds: stub.sourceFileIds,

      // Folder organisation (root when null)
      folderId: stub.folderId ?? null,

      // Cached classification category, if already known (preserved across re-stores).
      classificationLabels: stub.classificationLabels,
    };

    try {
      await this.addFileRecord(db, record);
    } catch (error) {
      // Recoverable: re-add as a copy, and stop offering blobs this session.
      // Anything else is the caller's to report.
      if (!(record.data instanceof Blob) || !this.noteBlobRefusal(error)) {
        throw error;
      }
      record.data = await record.data.arrayBuffer();
      await this.addFileRecord(db, record);
      return;
    }

    // Committed is not retrievable. Prove the round-trip while the source File is
    // still in hand; after a reload there is nothing left to repair from.
    if (record.data instanceof Blob && !this.blobReadbackVerified) {
      await this.verifyStoredBlobReadable(db, record, stirlingFile);
    }
  }

  /** Read one stored blob back, rewriting the record from {@code source} if its
   *  bytes don't come with it. Runs until one round-trip succeeds. */
  private async verifyStoredBlobReadable(
    db: IDBDatabase,
    record: StoredStirlingFileRecord,
    source: File,
  ): Promise<void> {
    // A record we can't read back at all is the caller's problem, not the probe's.
    const stored = await this.readRecord(db, record.id).catch(() => undefined);
    if (!(stored?.data instanceof Blob)) return;

    const failure = await withProbeDeadline(blobReadFailure(stored.data));
    if (!failure) {
      this.blobReadbackVerified = true;
      return;
    }
    if (failure === PROBE_UNANSWERED) {
      // Nothing proven, and an upload must never wait on a probe. Leave the record
      // as written; the read path reports it if the bytes really are gone.
      console.warn(
        `[fileStorage] readability probe for ${record.id} did not answer in ${PROBE_DEADLINE_MS}ms`,
      );
      return;
    }

    this.noteBlobUnreadable(failure);
    try {
      record.data = await source.arrayBuffer();
      await this.putRecord(db, record);
    } catch (error) {
      // The record is unusable either way, and the read path reports that to the
      // user. Don't turn a write that already committed into a failure.
      console.warn(
        `[fileStorage] could not rewrite ${record.id} as an in-memory copy:`,
        error,
      );
    }
  }

  /** Refused a Blob value? Stop offering blobs on this browser. Any write can flip
   *  this: WebKit refuses per-operation, not per-engine. */
  private noteBlobRefusal(error: unknown): boolean {
    if (!isBlobValueRejection(error)) return false;
    this.disableBlobValues(
      "IndexedDB rejected a Blob value; falling back to in-memory copies on this browser. " +
        "Very large files may now exhaust renderer memory.",
      error,
    );
    return true;
  }

  /** A stored blob whose bytes won't read back means blob values can't be trusted
   *  on this engine either, even though it accepted the write. */
  private noteBlobUnreadable(error: unknown): void {
    this.disableBlobValues(
      "IndexedDB accepted a Blob value but could not read its bytes back; " +
        "falling back to in-memory copies on this browser. " +
        "Very large files may now exhaust renderer memory.",
      error,
    );
  }

  private disableBlobValues(message: string, error: unknown): void {
    if (!this.blobValuesSupported) return;
    this.blobValuesSupported = false;
    persistBlobValuesUnsupported();
    console.warn(message, error);
  }

  /**
   * Tell the user (once) when a record's bytes are gone, WITHOUT gating anything on
   * the answer. Awaiting this was a mistake: in Safari the probe read of a lost
   * backing store can stay pending forever, so it stalled every file open instead
   * of the one consumer that would have failed anyway.
   */
  private reportIfUnreadable(record: StoredStirlingFileRecord): void {
    if (!(record.data instanceof Blob)) return;
    if (this.unreadableRecords.has(record.id)) return;
    void blobReadFailure(record.data).then((failure) => {
      if (!failure) {
        this.blobReadbackVerified = true;
        return;
      }
      this.noteBlobUnreadable(failure);
      this.reportUnreadableRecord(record, failure);
    });
  }

  /** One console error and one toast per dead record: every consumer of the file
   *  hits the same record, and the user needs the reason once, not per reader. */
  private reportUnreadableRecord(
    record: StoredStirlingFileRecord,
    failure: unknown,
  ): void {
    if (this.unreadableRecords.has(record.id)) return;
    this.unreadableRecords.add(record.id);
    // Whoever is holding it needs to let go, or the viewer renders a document
    // whose bytes never arrive - a spinner with no terminal state.
    for (const listener of unreadableListeners) listener(record.id);
    console.error(
      `[fileStorage] stored data for "${record.name}" (${record.id}) cannot be read; ` +
        "the browser no longer has the blob's backing store",
      failure,
    );
    alert({
      alertType: "warning",
      title: "File data is unavailable",
      body:
        `"${record.name}" is saved in this browser but its contents can no longer be read. ` +
        "Upload the file again to keep working on it.",
      expandable: false,
      durationMs: 8000,
    });
  }

  /** Read-modify-write one record in one transaction, resolving on COMMIT. Split
   *  across two promises, the abort guard covers one and the other hangs. */
  private async updateRecord(
    fileId: FileId,
    mutate: (record: StoredStirlingFileRecord) => boolean | void,
  ): Promise<boolean> {
    const db = await this.getDatabase();
    try {
      return await this.readModifyWrite(db, fileId, mutate);
    } catch (error) {
      // The record we read back still carries its Blob body; retry as a copy.
      if (!this.noteBlobRefusal(error)) throw error;
      return await this.rewriteRecordAsCopy(db, fileId, mutate);
    }
  }

  /** {@link updateRecord}'s happy path: one transaction, resolve on commit. */
  private readModifyWrite(
    db: IDBDatabase,
    fileId: FileId,
    mutate: (record: StoredStirlingFileRecord) => boolean | void,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      let written = false;
      settleOnAbort(transaction, reject);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(written);

      const store = transaction.objectStore(this.storeName);
      const getRequest = store.get(fileId);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const record = getRequest.result as
          | StoredStirlingFileRecord
          | undefined;
        // Nothing to write: let the empty transaction commit and report false.
        if (!record || mutate(record) === false) return;
        written = true;
        store.put(record);
      };
    });
  }

  /** Recovery path: two transactions, because materializing the copy is async
   *  and a transaction cannot survive an await. Last-write-wins either way. */
  private async rewriteRecordAsCopy(
    db: IDBDatabase,
    fileId: FileId,
    mutate: (record: StoredStirlingFileRecord) => boolean | void,
  ): Promise<boolean> {
    const record = await this.readRecord(db, fileId);
    if (!record || mutate(record) === false) return false;
    if (record.data instanceof Blob) {
      record.data = await record.data.arrayBuffer();
    }
    await this.putRecord(db, record);
    return true;
  }

  /** One record by id, in its own transaction. */
  private readRecord(
    db: IDBDatabase,
    fileId: FileId,
  ): Promise<StoredStirlingFileRecord | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      settleOnAbort(transaction, reject);
      const request = transaction.objectStore(this.storeName).get(fileId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /** One `put`, resolving on commit. */
  private putRecord(
    db: IDBDatabase,
    record: StoredStirlingFileRecord,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      settleOnAbort(transaction, reject);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(this.storeName).put(record);
    });
  }

  /** Single `add` of a file record. Rejects with the underlying IDB error. */
  private addFileRecord(
    db: IDBDatabase,
    record: StoredStirlingFileRecord,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Verify store exists before creating transaction
        if (!db.objectStoreNames.contains(this.storeName)) {
          throw new Error(
            `Object store '${this.storeName}' not found. Available stores: ${Array.from(db.objectStoreNames).join(", ")}`,
          );
        }

        const transaction = db.transaction([this.storeName], "readwrite");
        settleOnAbort(transaction, reject);
        const store = transaction.objectStore(this.storeName);

        const request = store.add(record);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Get StirlingFile with full data - for loading into workbench. Null covers
   *  both no such record and bytes gone; neither is a file callers can use. */
  async getStirlingFile(id: FileId): Promise<StirlingFile | null> {
    // Already proven unreadable this session: don't hand the same dead bytes to
    // another consumer that will spin on them. Session-scoped, so a reload retries.
    if (this.unreadableRecords.has(id)) return null;
    const db = await this.getDatabase();
    const record = await this.readRecord(db, id);
    if (!record) return null;
    // Reporting only, and NEVER awaited: WebKit can leave a read of a lost backing
    // store pending forever, and this is the path every file open goes through.
    this.reportIfUnreadable(record);

    // Convert to StirlingFile with preserved IDs
    return createStirlingFile(fileFromRecord(record), record.fileId);
  }

  /**
   * Get multiple StirlingFiles - for batch loading
   */
  async getStirlingFiles(ids: FileId[]): Promise<StirlingFile[]> {
    const results = await Promise.all(
      ids.map((id) => this.getStirlingFile(id)),
    );
    return results.filter((file): file is StirlingFile => file !== null);
  }

  /**
   * Get StirlingFileStub (metadata only) - for UI browsing
   */
  async getStirlingFileStub(id: FileId): Promise<StirlingFileStub | null> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      settleOnAbort(transaction, reject);
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as StoredStirlingFileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // No per-id thumbnail TTL bump here - the bulk getAll/leaf paths
        // already keep TTL fresh, and bumping on every single-id read
        // generated a writable transaction per call (write amplification).
        // We still gate thumbnailUrl on freshness so stale thumbnails
        // don't leak through this read path.
        const fresh = this.isThumbnailFresh(record);

        const stub: StirlingFileStub = {
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          lastModified: record.lastModified,
          quickKey: record.quickKey,
          thumbnailUrl: fresh ? record.thumbnail : undefined,
          isLeaf: record.isLeaf,
          remoteStorageId: record.remoteStorageId,
          remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
          remoteOwnerUsername: record.remoteOwnerUsername,
          remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
          remoteAccessRole: record.remoteAccessRole,
          remoteSharedViaLink: record.remoteSharedViaLink,
          remoteHasShareLinks: record.remoteHasShareLinks,
          remoteShareToken: record.remoteShareToken,
          versionNumber: record.versionNumber,
          originalFileId: record.originalFileId,
          parentFileId: record.parentFileId,
          toolHistory: record.toolHistory,
          derivedFromTool:
            record.derivedFromTool ?? legacyDerivedFromTool(record),
          sourceFileIds: record.sourceFileIds,
          folderId: record.folderId ?? null,
          createdAt: record.createdAt || Date.now(),
          classificationLabels: record.classificationLabels,
        };

        resolve(stub);
      };
    });
  }

  /**
   * Get all StirlingFileStubs (metadata only) - for FileManager browsing
   */
  async getAllStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      settleOnAbort(transaction, reject);
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const stubs: StirlingFileStub[] = [];

      const tobump: FileId[] = [];
      const toexpire: FileId[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          if (record && record.name && typeof record.size === "number") {
            const fresh = this.isThumbnailFresh(record);
            if (record.thumbnail) {
              if (fresh) tobump.push(record.id);
              else toexpire.push(record.id);
            }
            stubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: fresh ? record.thumbnail : undefined,
              isLeaf: record.isLeaf,
              remoteStorageId: record.remoteStorageId,
              remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
              remoteOwnerUsername: record.remoteOwnerUsername,
              remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
              remoteAccessRole: record.remoteAccessRole,
              remoteSharedViaLink: record.remoteSharedViaLink,
              remoteHasShareLinks: record.remoteHasShareLinks,
              remoteShareToken: record.remoteShareToken,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              derivedFromTool:
                record.derivedFromTool ?? legacyDerivedFromTool(record),
              sourceFileIds: record.sourceFileIds,
              folderId: record.folderId ?? null,
              createdAt: record.createdAt || Date.now(),
              classificationLabels: record.classificationLabels,
            });
          }
          cursor.continue();
        } else {
          // Only open the writeback transaction when there's something to do -
          // previously fired two empty transactions per refresh.
          if (tobump.length > 0) {
            void this.bumpThumbnailTTL(tobump).catch((e) =>
              console.warn("[fileStorage] thumbnail TTL bump failed", e),
            );
          }
          if (toexpire.length > 0) {
            void this.bumpThumbnailTTL(toexpire, true).catch((e) =>
              console.warn("[fileStorage] thumbnail expire failed", e),
            );
          }
          resolve(stubs);
        }
      };
    });
  }

  /**
   * Get all history stubs for a given original file ID.
   */
  async getHistoryChainStubs(
    originalFileId: FileId,
  ): Promise<StirlingFileStub[]> {
    const stubs = await this.getAllStirlingFileStubs();
    return stubs
      .filter((stub) => (stub.originalFileId || stub.id) === originalFileId)
      .sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));
  }

  /**
   * Get leaf StirlingFileStubs only - for unprocessed files
   */
  async getLeafStirlingFileStubs(): Promise<StirlingFileStub[]> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      settleOnAbort(transaction, reject);
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const leafStubs: StirlingFileStub[] = [];
      const tobump: FileId[] = [];
      const toexpire: FileId[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as StoredStirlingFileRecord;
          // Only include leaf files (default to true if undefined)
          if (
            record &&
            record.name &&
            typeof record.size === "number" &&
            record.isLeaf !== false
          ) {
            const fresh = this.isThumbnailFresh(record);
            if (record.thumbnail) {
              if (fresh) tobump.push(record.id);
              else toexpire.push(record.id);
            }
            leafStubs.push({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              lastModified: record.lastModified,
              quickKey: record.quickKey,
              thumbnailUrl: fresh ? record.thumbnail : undefined,
              isLeaf: record.isLeaf,
              remoteStorageId: record.remoteStorageId,
              remoteStorageUpdatedAt: record.remoteStorageUpdatedAt,
              remoteOwnerUsername: record.remoteOwnerUsername,
              remoteOwnedByCurrentUser: record.remoteOwnedByCurrentUser,
              remoteAccessRole: record.remoteAccessRole,
              remoteSharedViaLink: record.remoteSharedViaLink,
              remoteHasShareLinks: record.remoteHasShareLinks,
              remoteShareToken: record.remoteShareToken,
              versionNumber: record.versionNumber || 1,
              originalFileId: record.originalFileId || record.id,
              parentFileId: record.parentFileId,
              toolHistory: record.toolHistory || [],
              derivedFromTool:
                record.derivedFromTool ?? legacyDerivedFromTool(record),
              sourceFileIds: record.sourceFileIds,
              folderId: record.folderId ?? null,
              createdAt: record.createdAt || Date.now(),
              classificationLabels: record.classificationLabels,
            });
          }
          cursor.continue();
        } else {
          if (tobump.length > 0) {
            void this.bumpThumbnailTTL(tobump).catch((e) =>
              console.warn("[fileStorage] thumbnail TTL bump failed", e),
            );
          }
          if (toexpire.length > 0) {
            void this.bumpThumbnailTTL(toexpire, true).catch((e) =>
              console.warn("[fileStorage] thumbnail expire failed", e),
            );
          }
          resolve(leafStubs);
        }
      };
    });
  }

  /**
   * Move one or more files into a folder (or to the root when folderId is null).
   * Returns the ids of records that were actually updated.
   */
  async moveFilesToFolder(
    fileIds: FileId[],
    folderId: FolderId | null,
  ): Promise<FileId[]> {
    if (fileIds.length === 0) return [];
    const db = await this.getDatabase();
    const updated: FileId[] = [];

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Move transaction aborted"));

      fileIds.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const record = request.result as StoredStirlingFileRecord | undefined;
          if (!record) return;
          record.folderId = folderId;
          store.put(record);
          updated.push(id);
        };
        request.onerror = () => reject(request.error);
      });
    });

    return updated;
  }

  /**
   * Clear the folderId for every file currently inside any of the given
   * folders. Used when a folder (or subtree) is deleted so the contents
   * fall back to the root rather than dangling against a missing folder.
   */
  async clearFolderForFiles(folderIds: FolderId[]): Promise<number> {
    if (folderIds.length === 0) return 0;
    const db = await this.getDatabase();
    let cleared = 0;

    // Use the `folderId` index (declared on the files store in
    // indexedDBManager DATABASE_CONFIGS) with one keyRange-bounded cursor
    // per folderId. The previous full-store openCursor() was O(total files);
    // this is O(files-in-affected-folders + folderIds.length). On users
    // with thousands of files and a single deleted folder this is a 100x+
    // win and keeps the UI responsive while the transaction runs.
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const index = store.index("folderId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Clear folder transaction aborted"),
        );

      for (const folderId of folderIds) {
        const cursorRequest = index.openCursor(
          IDBKeyRange.only(folderId as string),
        );
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest)
            .result as IDBCursorWithValue | null;
          if (!cursor) return;
          const record = cursor.value as StoredStirlingFileRecord;
          record.folderId = null;
          cursor.update(record);
          cleared += 1;
          cursor.continue();
        };
      }
    });

    return cleared;
  }

  /**
   * Superseded versions that nothing else needs once {@code deleting} goes.
   *
   * Deleting a file removes one record; its older versions keep their full bytes
   * and are invisible (listings filter on isLeaf), so they accumulate forever.
   * Only for user-facing "delete this file" - deleting ONE version from the
   * history journey must leave the rest of the chain alone.
   */
  async orphanedAncestorIds(deleting: FileId[]): Promise<FileId[]> {
    if (deleting.length === 0) return [];
    const stubs = await this.getAllStirlingFileStubs();
    const byId = new Map(stubs.map((s) => [s.id as string, s]));
    const doomed = new Set(deleting.map(String));

    // Anything a surviving record descends from has to stay: split siblings
    // share a lineage, so one leaf's delete must not strip another's history.
    const keep = new Set<string>();
    for (const stub of stubs) {
      if (doomed.has(stub.id as string)) continue;
      let cursor = stub.parentFileId as string | undefined;
      while (cursor && !keep.has(cursor)) {
        keep.add(cursor);
        cursor = byId.get(cursor)?.parentFileId as string | undefined;
      }
    }

    const orphans: FileId[] = [];
    for (const id of deleting) {
      let cursor = byId.get(String(id))?.parentFileId as string | undefined;
      while (cursor) {
        if (!keep.has(cursor) && !doomed.has(cursor) && byId.has(cursor)) {
          doomed.add(cursor);
          orphans.push(cursor as FileId);
        }
        cursor = byId.get(cursor)?.parentFileId as string | undefined;
      }
    }
    return orphans;
  }

  /**
   * Delete StirlingFile - single operation, no sync issues
   */
  async deleteStirlingFile(id: FileId): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      // On commit, not on the request: callers refresh their list from storage as
      // soon as this resolves, and an aborted delete would put the row back.
      settleOnAbort(transaction, reject);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(this.storeName).delete(id);
    });
  }

  /**
   * Delete multiple StirlingFiles in a single transaction
   */
  async deleteMultipleStirlingFiles(ids: FileId[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Transaction aborted"));
      ids.forEach((id) => store.delete(id));
    });
  }

  /**
   * Update thumbnail for existing file
   */
  async updateThumbnail(id: FileId, thumbnail: string): Promise<boolean> {
    // Reports failure as `false` rather than rejecting; callers just need an answer.
    try {
      return await this.updateRecord(id, (record) => {
        record.thumbnail = thumbnail;
        record.thumbnailStoredAt = Date.now();
      });
    } catch (error) {
      console.error("Failed to update thumbnail:", error);
      return false;
    }
  }

  /**
   * Clear all stored files
   */
  async clearAll(): Promise<void> {
    const db = await this.getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      settleOnAbort(transaction, reject);
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    let used: number;
    let fileCount: number;
    let available = 0;
    let quota: number | undefined;

    try {
      // Get browser quota for context
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota;
        available = estimate.quota || 0;
      }

      // Calculate our actual IndexedDB usage from file metadata
      const stubs = await this.getAllStirlingFileStubs();
      used = stubs.reduce((total, stub) => total + (stub?.size || 0), 0);
      fileCount = stubs.length;

      // Adjust available space
      if (quota) {
        available = quota - used;
      }
    } catch (error) {
      console.warn("Could not get storage stats:", error);
      used = 0;
      fileCount = 0;
    }

    return {
      used,
      available,
      fileCount,
      quota,
    };
  }

  /**
   * Create blob URL for stored file data
   */
  async createBlobUrl(id: FileId): Promise<string | null> {
    try {
      const db = await this.getDatabase();
      const record = await this.readRecord(db, id);
      if (!record) return null;
      // Same as getStirlingFile: report, never gate. See reportIfUnreadable.
      this.reportIfUnreadable(record);

      // Stored blobs are handed straight to createObjectURL — re-wrapping
      // one can cost WebKit the backing handle. See fileFromRecord.
      const blob =
        record.data instanceof Blob
          ? record.data
          : new Blob([record.data], { type: record.type });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.warn(`Failed to create blob URL for ${id}:`, error);
      return null;
    }
  }

  /**
   * Mark a file as processed (no longer a leaf file)
   * Used when a file becomes input to a tool operation
   */
  async markFileAsProcessed(fileId: FileId): Promise<boolean> {
    try {
      return await this.updateRecord(fileId, (record) => {
        record.isLeaf = false;
      });
    } catch (error) {
      console.error("Failed to mark file as processed:", error);
      return false;
    }
  }

  /**
   * Persist output files as versions of their inputs: mark each input non-leaf (unless the
   * outputs are v1 originals, i.e. nothing was versioned) and store each output with its stub.
   * This is the durable half of {@link consumeFiles}, shared so a versioned result can be written
   * even when the input isn't in the active workspace (e.g. a policy run recovered after a reload).
   * Storage-only callers must bump the IndexedDB revision afterwards so the file views re-read;
   * {@link consumeFiles} instead updates workspace state via its dispatch.
   */
  async persistVersionedOutputs(
    inputFileIds: FileId[],
    outputStirlingFiles: StirlingFile[],
    outputStirlingFileStubs: StirlingFileStub[],
  ): Promise<void> {
    if (outputStirlingFiles.length !== outputStirlingFileStubs.length) {
      throw new Error(
        `Mismatch between output files (${outputStirlingFiles.length}) and stubs (${outputStirlingFileStubs.length})`,
      );
    }

    const allV1 = outputStirlingFileStubs.every(
      (stub) => stub.versionNumber === 1,
    );
    if (!allV1) {
      await Promise.all(
        inputFileIds.map((fileId) =>
          this.markFileAsProcessed(fileId).catch((error) => {
            // Best-effort: a missing/locked input shouldn't block storing the outputs.
            console.warn(`Failed to mark file ${fileId} as processed:`, error);
          }),
        ),
      );
    }

    await Promise.all(
      outputStirlingFiles.map((file, i) =>
        this.storeStirlingFile(file, outputStirlingFileStubs[i]).catch(
          (error) =>
            console.error(
              "Failed to persist output file to storage:",
              file.name,
              error,
            ),
        ),
      ),
    );
  }

  /**
   * Mark a file as leaf (opposite of markFileAsProcessed)
   * Used when promoting a file back to "recent" status
   */
  async markFileAsLeaf(fileId: FileId): Promise<boolean> {
    try {
      return await this.updateRecord(fileId, (record) => {
        record.isLeaf = true;
      });
    } catch (error) {
      console.error("Failed to mark file as leaf:", error);
      return false;
    }
  }

  /**
   * Update metadata fields for a stored file record.
   *
   * Returns `true` only once the write commits, never on the put's `onsuccess`.
   * {@link updateRecord} owns that guarantee for every write in this class.
   */
  async updateFileMetadata(
    fileId: FileId,
    updates: Partial<StoredStirlingFileRecord>,
  ): Promise<boolean> {
    try {
      return await this.updateRecord(fileId, (record) => {
        Object.assign(record, updates);
      });
    } catch (error) {
      console.error("Failed to update file metadata:", error);
      return false;
    }
  }
}

// Export singleton instance
export const fileStorage = new FileStorageService();

// Helper hook for React components
export function useFileStorage() {
  return fileStorage;
}
