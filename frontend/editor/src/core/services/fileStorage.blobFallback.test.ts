import { describe, expect, test, afterEach, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";

/**
 * WebKit refuses blob values when it can't write the blob's backing file, so
 * every upload silently failed to persist after #7175. Retried as a copy now.
 *
 * fake-indexeddb never returns a Blob from a read, so round-trips can't be
 * modelled here - `engine-capabilities.spec.ts` covers those on a real engine.
 */

const nativeAdd = IDBObjectStore.prototype.add;
const nativePut = IDBObjectStore.prototype.put;

/** What each `add` attempt carried in `data`: blob path or copy path. */
let attempts: Array<"blob" | "copy"> = [];

/** An IDBRequest that fails asynchronously, the way WebKit rejects blob puts. */
class FailingRequest extends EventTarget {
  onerror: ((event: Event) => void) | null = null;
  onsuccess: ((event: Event) => void) | null = null;

  constructor(readonly error: DOMException) {
    super();
    queueMicrotask(() => this.onerror?.(new Event("error")));
  }
}

/** Record every add, optionally failing the blob-valued ones. */
function instrumentAdd(options: { rejectBlobs: boolean }) {
  IDBObjectStore.prototype.add = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const isBlob = (value as { data?: unknown } | null)?.data instanceof Blob;
    attempts.push(isBlob ? "blob" : "copy");
    if (isBlob && options.rejectBlobs) {
      return new FailingRequest(
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

/** A fresh service per test: the blob decision is remembered by design, so
 *  tests must not inherit it from each other. */
async function freshFileStorage() {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@app/services/fileStorage"),
      import("@app/types/fileContext"),
    ]);
  const store = async (name: string) => {
    const file = new File(["%PDF-1.7 stirling"], name, {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
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
});

afterEach(() => {
  IDBObjectStore.prototype.add = nativeAdd;
  IDBObjectStore.prototype.put = nativePut;
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

  test("does not retry a failure a copy can't fix (quota)", async () => {
    const { store } = await freshFileStorage();
    IDBObjectStore.prototype.add = function (this: IDBObjectStore) {
      attempts.push("blob");
      throw new DOMException("no space left", "QuotaExceededError");
    } as typeof IDBObjectStore.prototype.add;

    await expect(store("too-big.pdf")).rejects.toThrow(/no space left/);
    expect(attempts).toEqual(["blob"]);
  });
});
