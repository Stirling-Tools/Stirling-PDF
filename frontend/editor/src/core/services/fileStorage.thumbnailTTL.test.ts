import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";

import type { FileId } from "@app/types/file";

/**
 * A TTL bump is `put(record)`, and `record.data` is the file itself - there is
 * no partial update in IndexedDB. So "note that this thumbnail was used" used
 * to rewrite every byte of every file in the library, on every listing, and the
 * sidebar lists on mount and on every workbench change.
 *
 * These tests pin the debounce by counting writes, because nothing else fails
 * if it is removed: the behaviour is identical, just far more expensive. Each
 * asserts on a NON-EMPTY set of writes - "nothing was written" would pass
 * before the fire-and-forget bump had a chance to run.
 */

const nativePut = IDBObjectStore.prototype.put;

/** Ids written back during a listing, in order. */
let writes: FileId[] = [];

function countWrites() {
  IDBObjectStore.prototype.put = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    writes.push((value as { id: FileId }).id);
    return key === undefined
      ? nativePut.call(this, value)
      : nativePut.call(this, value, key);
  } as typeof IDBObjectStore.prototype.put;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * A fresh service over an empty store. fake-indexeddb keeps its data for the
 * whole file, so without the clear each test would see the previous test's
 * records and its write count would depend on execution order.
 */
async function freshFileStorage() {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@app/services/fileStorage"),
      import("@app/types/fileContext"),
    ]);
  await fileStorage.clearAll();

  /** Store one file carrying a thumbnail recorded `ageMs` ago. */
  const store = async (name: string, ageMs: number) => {
    const file = new File(["%PDF-1.7 stirling"], name, {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, stub.id),
      stub,
    );
    // storeStirlingFile stamps `Date.now()`; age it directly so the test does
    // not depend on how the thumbnail got there.
    await fileStorage.updateFileMetadata(stub.id, {
      thumbnail: "data:image/webp;base64,AAAA",
      thumbnailStoredAt: Date.now() - ageMs,
    });
    return stub.id;
  };

  return { fileStorage, store };
}

beforeEach(() => {
  writes = [];
});

afterEach(() => {
  IDBObjectStore.prototype.put = nativePut;
});

describe("thumbnail TTL bump — the whole record is rewritten, so debounce it", () => {
  test("rewrites the record recorded a day ago and leaves the recent one alone", async () => {
    const { fileStorage, store } = await freshFileStorage();
    const recent = await store("recent.pdf", 1 * HOUR);
    const stale = await store("stale.pdf", 2 * DAY);

    countWrites();
    await fileStorage.getLeafStirlingFileStubs();

    // Exactly one write, and it is the stale one. Before the debounce both were
    // rewritten, which on real files is the whole library.
    await vi.waitFor(() => expect(writes).toEqual([stale]));
    expect(writes).not.toContain(recent);
  });

  test("repeated listings rewrite at most once, not once per listing", async () => {
    const { fileStorage, store } = await freshFileStorage();
    const stale = await store("stale.pdf", 2 * DAY);

    countWrites();
    await fileStorage.getLeafStirlingFileStubs();
    await vi.waitFor(() => expect(writes).toEqual([stale]));

    // The first bump reset the stamp to now, so the next three are free. This
    // is the case that used to cost a full-library rewrite every time.
    for (let i = 0; i < 3; i++) await fileStorage.getLeafStirlingFileStubs();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toEqual([stale]);
  });

  test("an expired thumbnail is still cleared on the first listing that sees it", async () => {
    const { fileStorage, store } = await freshFileStorage();
    // Past the 30-day TTL: expiry must not be debounced away.
    const expired = await store("expired.pdf", 31 * DAY);

    countWrites();
    const stubs = await fileStorage.getLeafStirlingFileStubs();
    await vi.waitFor(() => expect(writes).toEqual([expired]));

    expect(stubs.find((s) => s.id === expired)?.thumbnailUrl).toBeUndefined();
  });

  test("the same debounce applies to the all-files listing", async () => {
    const { fileStorage, store } = await freshFileStorage();
    await store("recent.pdf", 1 * HOUR);
    const stale = await store("stale.pdf", 2 * DAY);

    countWrites();
    await fileStorage.getAllStirlingFileStubs();
    await vi.waitFor(() => expect(writes).toEqual([stale]));
  });
});
