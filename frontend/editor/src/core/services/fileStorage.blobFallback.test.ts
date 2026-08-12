import { describe, expect, test, afterEach, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";

/**
 * Regression test for the WebKit nightly breakage introduced with the
 * large-file OOM fix (#7175): `storeStirlingFile` began putting the `File`
 * itself into IndexedDB (persisted by reference, so multi-GB uploads never
 * materialize in JS memory). WebKit refuses blob values whenever it can't write
 * the blob's backing file and rejects the request with `UnknownError: Error
 * preparing Blob/File data to be stored in object store`, so on WebKit every
 * upload silently failed to persist: files vanished on navigation, Compare
 * slots never filled, and the classification backfill had no bytes to read.
 *
 * The service now retries such a rejection with an ArrayBuffer copy and stops
 * offering blobs for the rest of the session.
 */

const nativeAdd = IDBObjectStore.prototype.add;

/** What each `add` attempt carried in `data` — the blob path or the copy path. */
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

/**
 * Record every add attempt, optionally failing the blob-valued ones the way an
 * engine without blob storage does.
 */
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

/**
 * A fresh service per test: whether the engine accepts blobs is remembered for
 * the process lifetime by design, so tests must not inherit that decision from
 * each other.
 */
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
    // Readable back is what every downstream consumer depends on: rehydration
    // after navigation, thumbnails, the classification backfill.
    expect((await fileStorage.getStirlingFile(id))?.name).toBe("webkit.pdf");
  });

  test("remembers the rejection, so later files skip the doomed blob attempt", async () => {
    expectConsole.warn(/IndexedDB rejected a Blob value/);
    const { fileStorage, store } = await freshFileStorage();
    instrumentAdd({ rejectBlobs: true });

    await store("first.pdf");
    attempts = [];
    const id = await store("second.pdf");

    // Straight to the copy path — no repeated blob probe, and only the single
    // warning expected above.
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
