import { describe, expect, test, afterEach, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";

/**
 * WebKit refuses blob values when it can't write the blob's backing file, so
 * every upload silently failed to persist after #7175. Retried as a copy now.
 *
 * It can also accept one and then lose the backing store. fake-indexeddb returns no
 * Blob, so that loss is injected at the read; real round-trips: the e2e spec.
 */

const alertMock = vi.hoisted(() => vi.fn());
vi.mock("@app/components/toast", () => ({
  alert: (options: unknown) => alertMock(options),
}));

const nativeAdd = IDBObjectStore.prototype.add;
const nativePut = IDBObjectStore.prototype.put;
const nativeGet = IDBObjectStore.prototype.get;

/** What each `add` attempt carried in `data`: blob path or copy path. */
let attempts: Array<"blob" | "copy"> = [];
/** The same, for `put` - the rewrite path a lost backing store recovers through. */
let putAttempts: Array<"blob" | "copy"> = [];

/** An IDBRequest that fails asynchronously, the way WebKit rejects blob puts. */
class FailingRequest extends EventTarget {
  onerror: ((event: Event) => void) | null = null;
  onsuccess: ((event: Event) => void) | null = null;

  constructor(
    readonly error: DOMException,
    transaction?: IDBTransaction,
  ) {
    super();
    queueMicrotask(() => {
      const event = new Event("error", { cancelable: true });
      this.onerror?.(event);
      if (!event.defaultPrevented) transaction?.abort();
    });
  }
}

/** Record every add, optionally failing the blob-valued ones. */
function instrumentAdd(options: {
  rejectBlobs: boolean;
  error?: DOMException;
}) {
  IDBObjectStore.prototype.add = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const isBlob = (value as { data?: unknown } | null)?.data instanceof Blob;
    attempts.push(isBlob ? "blob" : "copy");
    if (isBlob && options.rejectBlobs) {
      return new FailingRequest(
        options.error ??
          new DOMException(
            "Error preparing Blob/File data to be stored in object store",
            "UnknownError",
          ),
      ) as unknown as IDBRequest<IDBValidKey>;
    }
    return key === undefined
      ? nativeAdd.call(this, value)
      : nativeAdd.call(this, value, key);
  } as typeof IDBObjectStore.prototype.add;
}

/** Record every put, so the copy-rewrite recovery can be observed. */
function instrumentPut() {
  IDBObjectStore.prototype.put = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    putAttempts.push(
      (value as { data?: unknown } | null)?.data instanceof Blob
        ? "blob"
        : "copy",
    );
    return key === undefined
      ? nativePut.call(this, value)
      : nativePut.call(this, value, key);
  } as typeof IDBObjectStore.prototype.put;
}

/** A stored blob whose backing store the engine has lost: it still reports a name,
 *  type and size, and every read of its bytes fails the way WebKit's does. */
function blobWithLostBackingStore(): Blob {
  const lost = () => {
    throw new DOMException(
      "The object can not be found here.",
      "NotFoundError",
    );
  };
  return Object.assign(
    new Blob(["%PDF-1.7 stirling"], { type: "application/pdf" }),
    { slice: lost, arrayBuffer: lost, text: lost, stream: lost },
  );
}

/** The next `deadReads` reads come back with a lost backing store, later ones
 *  untouched - so a repaired record can still be read normally. */
function loseBackingStoreOnRead(deadReads: number) {
  let remaining = deadReads;
  IDBObjectStore.prototype.get = function (
    this: IDBObjectStore,
    key: IDBValidKey | IDBKeyRange,
  ) {
    const request = nativeGet.call(this, key as IDBValidKey);
    // One substitution per request, however often `result` is read.
    let injected = false;
    return new Proxy(request, {
      get(target, prop) {
        // Receiver must be the real request: IDBRequest's accessors are branded.
        const value = Reflect.get(target, prop, target);
        if (prop !== "result") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (!value || injected || remaining === 0) return value;
        injected = true;
        remaining--;
        return { ...(value as object), data: blobWithLostBackingStore() };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  } as typeof IDBObjectStore.prototype.get;
}

/** A fresh service per test: the blob decision is remembered by design, so
 *  tests must not inherit it from each other. */
async function freshFileStorage() {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@app/services/fileStorage"),
      import("@app/types/fileContext"),
    ]);
  const store = async (name: string, thumbnailUrl?: string) => {
    const file = new File(["%PDF-1.7 stirling"], name, {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    stub.thumbnailUrl = thumbnailUrl;
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, stub.id),
      stub,
    );
    return stub.id;
  };
  return { fileStorage, store };
}

beforeEach(() => {
  attempts = [];
  putAttempts = [];
  alertMock.mockClear();
  // The blob verdict is deliberately durable, so each test must start undecided.
  localStorage.clear();
});

afterEach(() => {
  IDBObjectStore.prototype.add = nativeAdd;
  IDBObjectStore.prototype.put = nativePut;
  IDBObjectStore.prototype.get = nativeGet;
});

/** Abort the transaction the moment a write is issued over it. */
function abortOnPut() {
  IDBObjectStore.prototype.put = function (this: IDBObjectStore) {
    const request = new FailingRequest(
      new DOMException("transaction aborted", "AbortError"),
    ) as unknown as IDBRequest<IDBValidKey>;
    this.transaction.abort();
    return request;
  } as typeof IDBObjectStore.prototype.put;
}

describe("read-modify-write — a refused rewrite must not hang or vanish", () => {
  /** The abort guard used to sit on the read promise, leaving the write with a
   *  dead reject - and `.catch` can't rescue a promise that never settles. */
  test("settles instead of hanging when the write transaction aborts", async () => {
    expectConsole.error(/Failed to mark file as processed/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store("aborts.pdf");

    abortOnPut();

    // Before the fix this never settled and the test timed out.
    await expect(fileStorage.markFileAsProcessed(id)).resolves.toBe(false);
  });

  /** The copy-and-retry recovery can't be exercised here: it needs a record that
   *  reads back as a Blob, which fake-indexeddb never returns. */
  test("a metadata rewrite still commits, and reports commit not put", async () => {
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store("rewrite.pdf");

    await expect(fileStorage.markFileAsProcessed(id)).resolves.toBe(true);
    // Missing record: `false`, not a throw and not a claim of success.
    await expect(
      fileStorage.markFileAsProcessed("nope" as never),
    ).resolves.toBe(false);
    expect((await fileStorage.getStirlingFile(id))?.name).toBe("rewrite.pdf");
  });
});

describe("storeStirlingFile — blob-value fallback", () => {
  test("stores the File by reference when the engine accepts blob values", async () => {
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });

    const id = await store("by-reference.pdf");

    expect(attempts).toEqual(["blob"]);
    expect((await fileStorage.getStirlingFile(id))?.name).toBe(
      "by-reference.pdf",
    );
  });

  test("falls back to a copy when the engine rejects blob values, and the file stays readable", async () => {
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: true });

    const id = await store("webkit.pdf");

    expect(attempts).toEqual(["blob", "copy"]);
    // Readable back is what rehydration, thumbnails and backfill depend on.
    expect((await fileStorage.getStirlingFile(id))?.name).toBe("webkit.pdf");
  });

  test("remembers the rejection, so later files skip the doomed blob attempt", async () => {
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: true });

    await store("first.pdf");
    attempts = [];
    const id = await store("second.pdf");

    // Straight to the copy path, and only the one warning expected above.
    expect(attempts).toEqual(["copy"]);
    expect((await fileStorage.getStirlingFile(id))?.name).toBe("second.pdf");
  });

  test("falls back for Chromium InvalidBlob DataErrors", async () => {
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({
      rejectBlobs: true,
      error: new DOMException(
        "Failed to write blobs (InvalidBlob)",
        "DataError",
      ),
    });

    const first = await store("invalid-blob.pdf");
    expect(attempts).toEqual(["blob", "copy"]);
    expect((await fileStorage.getStirlingFile(first))?.name).toBe(
      "invalid-blob.pdf",
    );

    attempts = [];
    const second = await store("after-invalid-blob.pdf");
    expect(attempts).toEqual(["copy"]);
    expect((await fileStorage.getStirlingFile(second))?.name).toBe(
      "after-invalid-blob.pdf",
    );
  });

  test("does not misclassify unrelated DataErrors", async () => {
    const { store } = await freshFileStorage();
    instrumentAdd({
      rejectBlobs: true,
      error: new DOMException("The provided key is invalid", "DataError"),
    });

    await expect(store("bad-key.pdf")).rejects.toThrow(
      /provided key is invalid/,
    );
    expect(attempts).toEqual(["blob"]);
  });

  test("preserves the DataCloneError fallback", async () => {
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({
      rejectBlobs: true,
      error: new DOMException("Value could not be cloned", "DataCloneError"),
    });

    const id = await store("clone-error.pdf");

    expect(attempts).toEqual(["blob", "copy"]);
    expect((await fileStorage.getStirlingFile(id))?.name).toBe(
      "clone-error.pdf",
    );
  });

  /** Committing is not evidence the bytes survived, and by the next reload the
   *  source File is gone: without this the upload looks fine and the file is dead. */
  test("repairs a record whose stored blob loses its backing store", async () => {
    expectConsole.warn(/could not read its bytes back/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    instrumentPut();
    loseBackingStoreOnRead(1); // only the store's own read-back is dead

    const id = await store("dead-on-arrival.pdf");

    // Accepted as a blob, then rewritten from the file still in hand.
    expect(attempts).toEqual(["blob"]);
    expect(putAttempts).toEqual(["copy"]);
    expect((await fileStorage.getStirlingFile(id))?.name).toBe(
      "dead-on-arrival.pdf",
    );
    // Self-healed, so nothing to tell the user about.
    expect(alertMock).not.toHaveBeenCalled();
  });

  test("does not retry a failure a copy can't fix (quota)", async () => {
    const { store } = await freshFileStorage();
    IDBObjectStore.prototype.add = function (this: IDBObjectStore) {
      attempts.push("blob");
      throw new DOMException("no space left", "QuotaExceededError");
    } as typeof IDBObjectStore.prototype.add;

    await expect(store("too-big.pdf")).rejects.toThrow(/no space left/);
    expect(attempts).toEqual(["blob"]);
  });

  test("does not retry a failure a copy can't fix (duplicate key)", async () => {
    const { store } = await freshFileStorage();
    instrumentAdd({
      rejectBlobs: true,
      error: new DOMException("Key already exists", "ConstraintError"),
    });

    await expect(store("duplicate.pdf")).rejects.toThrow(/already exists/);
    expect(attempts).toEqual(["blob"]);
  });
});

/** An earlier session's record can't be repaired, and the user has to be told - but
 *  the telling must never gate the open. Awaiting the probe stalled every file in
 *  Safari, where the probe read of a lost backing store never settles. */
describe("reads — a stored blob whose bytes are gone", () => {
  test("hands the file over and reports the loss out of band", async () => {
    expectConsole.warn(/could not read its bytes back/);
    expectConsole.error(/cannot be read/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store("lost.pdf");

    loseBackingStoreOnRead(5); // every read from here on

    // Not null, and not awaited on the probe: the caller is never blocked.
    expect((await fileStorage.getStirlingFile(id))?.name).toBe("lost.pdf");
    await new Promise((resolve) => setTimeout(resolve));

    // Told once, not once per reader: every consumer of the file hits this record.
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][0]).toMatchObject({
      alertType: "warning",
      body: expect.stringContaining("lost.pdf"),
    });
  });

  /** The loop this closes: a reload re-decides optimistically, writes blobs the
   *  engine loses again, and the browser never settles on a shape that works. */
  test("remembers across reloads that this browser loses blob values", async () => {
    expectConsole.warn(/could not read its bytes back/);
    expectConsole.error(/cannot be read/);
    const first = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await first.store("lost.pdf");
    loseBackingStoreOnRead(1);
    expect(await first.fileStorage.getStirlingFile(id)).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve));

    // A new page load: a fresh service, same browser profile.
    const next = await freshFileStorage();
    attempts = [];
    const later = await next.store("after-reload.pdf");

    expect(attempts).toEqual(["copy"]);
    expect((await next.fileStorage.getStirlingFile(later))?.name).toBe(
      "after-reload.pdf",
    );
  });

  test("stops offering blob values for the rest of the session", async () => {
    expectConsole.warn(/could not read its bytes back/);
    expectConsole.error(/cannot be read/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const first = await store("lost.pdf");

    loseBackingStoreOnRead(1);
    expect(await fileStorage.getStirlingFile(first)).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve));

    // An engine that loses a blob it accepted can't be trusted with the next one,
    // so the read failure degrades writes too.
    attempts = [];
    const second = await store("later.pdf");
    expect(attempts).toEqual(["copy"]);
    expect((await fileStorage.getStirlingFile(second))?.name).toBe("later.pdf");
  });
});

/** Deleting a file used to leave its superseded versions in storage forever,
 *  invisible (listings filter on isLeaf) and still holding their full bytes. */
describe("orphanedAncestorIds", () => {
  const store = async (
    fileStorage: { storeStirlingFile: (f: never, s: never) => Promise<void> },
    id: string,
    parentFileId: string | undefined,
    isLeaf: boolean,
  ) => {
    const { createStirlingFile, createNewStirlingFileStub } =
      await import("@app/types/fileContext");
    const file = new File(["%PDF-1.7"], `${id}.pdf`, {
      type: "application/pdf",
    });
    const base = createNewStirlingFileStub(file);
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, id as never) as never,
      { ...base, id, isLeaf, parentFileId, originalFileId: "v1" } as never,
    );
  };

  test("takes the superseded versions with the leaf", async () => {
    const { fileStorage } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    await store(fileStorage as never, "v1", undefined, false);
    await store(fileStorage as never, "v2", "v1", true);

    expect(await fileStorage.orphanedAncestorIds(["v2" as never])).toEqual([
      "v1",
    ]);
  });

  test("leaves a split sibling's history alone", async () => {
    const { fileStorage } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    // Distinct ids: the fake database outlives the module reset between tests.
    await store(fileStorage as never, "split-root", undefined, false);
    await store(fileStorage as never, "split-a", "split-root", true);
    await store(fileStorage as never, "split-b", "split-root", true);

    // `split-b` still descends from the root, so deleting `split-a` can't strip it.
    expect(await fileStorage.orphanedAncestorIds(["split-a" as never])).toEqual(
      [],
    );
    // Once both leaves go, the shared ancestor is genuinely unreachable.
    expect(
      await fileStorage.orphanedAncestorIds([
        "split-a" as never,
        "split-b" as never,
      ]),
    ).toEqual(["split-root"]);
  });
});

/** Handing dead bytes over is only safe if whoever holds them is told to let go -
 *  otherwise the viewer renders a document that never loads (an endless spinner). */
describe("confirmed-unreadable records", () => {
  test("notifies listeners and refuses to hand the same file out twice", async () => {
    expectConsole.warn(/could not read its bytes back/);
    expectConsole.error(/cannot be read/);
    const { fileStorage, store } = await freshFileStorage();
    const { onRecordUnreadable } = await import("@app/services/fileStorage");
    instrumentAdd({ rejectBlobs: false });
    const id = await store("doomed.pdf");

    const dropped: string[] = [];
    const unsubscribe = onRecordUnreadable((fileId) => dropped.push(fileId));

    loseBackingStoreOnRead(5);
    // First read still hands the file over: the probe is out of band.
    expect(await fileStorage.getStirlingFile(id)).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve));

    // The holder is told, so the workbench can drop it instead of spinning.
    expect(dropped).toEqual([id]);
    // And a second consumer never gets the same dead bytes.
    expect(await fileStorage.getStirlingFile(id)).toBeNull();

    unsubscribe();
  });
});

/** A readable-blob substitute, for the rescue path: fake-indexeddb never returns
 *  Blob values, so a healthy legacy blob record is injected the same way a dead
 *  one is. */
function substituteHealthyBlobOnRead(reads: number) {
  let remaining = reads;
  IDBObjectStore.prototype.get = function (
    this: IDBObjectStore,
    key: IDBValidKey | IDBKeyRange,
  ) {
    const request = nativeGet.call(this, key as IDBValidKey);
    let injected = false;
    return new Proxy(request, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop !== "result") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (!value || injected || remaining === 0) return value;
        injected = true;
        remaining--;
        return {
          ...(value as object),
          data: new Blob(["%PDF-1.7 stirling"], { type: "application/pdf" }),
        };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  } as typeof IDBObjectStore.prototype.get;
}

/** The library must tell the truth per row: a record whose bytes are gone lists
 *  as data-lost instead of a file that pretends to open. */
describe("stub listings — data-lost auditing", () => {
  test("flags a dead record on the stub once the audit lands", async () => {
    expectConsole.warn(/could not read its bytes back/);
    expectConsole.error(/cannot be read/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store("husk.pdf");

    loseBackingStoreOnRead(1);
    // First read schedules the out-of-band audit; unknown is not yet flagged.
    expect(
      (await fileStorage.getStirlingFileStub(id))?.dataUnavailable,
    ).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve));

    expect((await fileStorage.getStirlingFileStub(id))?.dataUnavailable).toBe(
      true,
    );
  });

  test("rescues a still-readable legacy blob to a copy on a no-blob browser", async () => {
    // The durable verdict says this browser loses blob values...
    localStorage.setItem("stirling.indexeddb.blobValuesUnsupported", "true");
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    instrumentPut();
    const id = await store("legacy.pdf");

    // ...and a legacy record still holds a READABLE blob: save it while we can.
    substituteHealthyBlobOnRead(5);
    await fileStorage.getStirlingFileStub(id);
    await vi.waitFor(() => expect(putAttempts).toContain("copy"));
    // Rescued, not condemned: the stub stays openable.
    expect(
      (await fileStorage.getStirlingFileStub(id))?.dataUnavailable,
    ).toBeUndefined();
  });
});

/** One hung request inside the TTL bump's readwrite transaction wedged the whole
 *  store: every later read and write queued behind it forever - the infinite
 *  "Loading files..." after a Safari reload. Maintenance must not touch
 *  blob-bodied records on a browser that can't rewrite them anyway. */
describe("maintenanceMayRewrite", () => {
  test("keeps maintenance away from blob records on a no-blob browser", async () => {
    const { maintenanceMayRewrite } = await import("@app/services/fileStorage");
    const blobRecord = { data: new Blob(["x"]) };
    const copyRecord = { data: new ArrayBuffer(1) };

    expect(maintenanceMayRewrite(blobRecord, false)).toBe(false);
    // Copies never hang and their rewrite is accepted - always safe.
    expect(maintenanceMayRewrite(copyRecord, false)).toBe(true);
    // On engines that genuinely support blobs (Chrome), nothing changes.
    expect(maintenanceMayRewrite(blobRecord, true)).toBe(true);
    expect(maintenanceMayRewrite(copyRecord, true)).toBe(true);
  });

  test("settles an InvalidBlob TTL rewrite and does not retry it", async () => {
    expectConsole.warn(/thumbnail TTL bump skipped/);
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store("thumbnail.pdf", "data:image/png;base64,dGVzdA==");

    let ttlPutAttempts = 0;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore) {
      ttlPutAttempts++;
      return new FailingRequest(
        new DOMException("Failed to write blobs (InvalidBlob)", "DataError"),
        this.transaction,
      ) as unknown as IDBRequest<IDBValidKey>;
    } as typeof IDBObjectStore.prototype.put;

    await expect(fileStorage.getAllStirlingFileStubs()).resolves.toEqual([
      expect.objectContaining({ id }),
    ]);
    await vi.waitFor(() => expect(ttlPutAttempts).toBe(1));

    attempts = [];
    await store("after-ttl-failure.pdf");
    expect(attempts).toEqual(["copy"]);

    await expect(fileStorage.getAllStirlingFileStubs()).resolves.toHaveLength(
      2,
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(ttlPutAttempts).toBe(1);
  });

  test("uses a synchronous InvalidBlob TTL failure as the no-blob verdict", async () => {
    expectConsole.warn(/thumbnail TTL bump could not be issued/);
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: false });
    const id = await store(
      "synchronous-thumbnail.pdf",
      "data:image/png;base64,dGVzdA==",
    );

    let ttlPutAttempts = 0;
    IDBObjectStore.prototype.put = function () {
      ttlPutAttempts++;
      throw new DOMException(
        "Failed to write blobs (InvalidBlob)",
        "DataError",
      );
    } as typeof IDBObjectStore.prototype.put;

    await expect(fileStorage.getAllStirlingFileStubs()).resolves.toEqual([
      expect.objectContaining({ id }),
    ]);
    await vi.waitFor(() => expect(ttlPutAttempts).toBe(1));

    attempts = [];
    await store("after-synchronous-ttl-failure.pdf");
    expect(attempts).toEqual(["copy"]);

    await expect(fileStorage.getAllStirlingFileStubs()).resolves.toHaveLength(
      2,
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(ttlPutAttempts).toBe(1);
  });
});
