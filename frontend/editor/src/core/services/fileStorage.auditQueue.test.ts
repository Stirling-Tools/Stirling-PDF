import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";

/**
 * The work a read starts in the background. A listing audits every record it
 * reads, and each audit reads through a stream Chromium backs with a pipe the
 * size of the blob; started all at once, the audits of a library of 1,800 files
 * ran the desktop page out of memory. A record whose file has drifted from its
 * name is also rewritten, and that must not land over newer bytes.
 */

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

const readBlobSlice = vi.hoisted(() => vi.fn());
vi.mock("@app/utils/blobSlice", () => ({ readBlobSlice }));

const nativeGet = IDBObjectStore.prototype.get;

/** fake-indexeddb returns no Blob, so every record read comes back with one. */
function serveBlobsOnRead() {
  IDBObjectStore.prototype.get = function (
    this: IDBObjectStore,
    key: IDBValidKey | IDBKeyRange,
  ) {
    const request = nativeGet.call(this, key as IDBValidKey);
    let served: object | undefined;
    return new Proxy(request, {
      get(target, prop) {
        // Receiver must be the real request: IDBRequest's accessors are branded.
        const value = Reflect.get(target, prop, target);
        if (prop !== "result") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (!value) return value;
        served ??= {
          ...(value as object),
          data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
        };
        return served;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  } as typeof IDBObjectStore.prototype.get;
}

async function storeFiles(count: number) {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@app/services/fileStorage"),
      import("@app/types/fileContext"),
    ]);
  const ids = [];
  for (let i = 0; i < count; i++) {
    const file = new File(["%PDF-1.7"], `file-${i}.pdf`, {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, stub.id),
      stub,
    );
    ids.push(stub.id);
  }
  return { fileStorage, ids };
}

beforeEach(() => {
  readBlobSlice.mockReset();
  localStorage.clear();
});

afterEach(() => {
  IDBObjectStore.prototype.get = nativeGet;
  vi.useRealTimers();
});

describe("auditing stored records", () => {
  test("reads four records at a time, and reaches every one", async () => {
    const { fileStorage, ids } = await storeFiles(10);
    const held: Array<() => void> = [];
    let open = 0;
    let peak = 0;
    readBlobSlice.mockImplementation(
      () =>
        new Promise<Uint8Array>((resolve) => {
          open++;
          peak = Math.max(peak, open);
          held.push(() => {
            open--;
            resolve(new Uint8Array(1));
          });
        }),
    );
    serveBlobsOnRead();

    await Promise.all(ids.map((id) => fileStorage.getStirlingFileStub(id)));
    await vi.waitFor(() => expect(readBlobSlice).toHaveBeenCalledTimes(4));

    for (let released = 0; released < ids.length; released++) {
      await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
      held.shift()!();
    }
    expect(readBlobSlice).toHaveBeenCalledTimes(ids.length);
    expect(peak).toBe(4);
  });

  test("a read past its deadline is cancelled before its slot is reused", async () => {
    const { fileStorage, ids } = await storeFiles(6);
    let open = 0;
    let peak = 0;
    // Pending until its signal aborts, as a stream read ends once cancelled.
    readBlobSlice.mockImplementation(
      (_blob: Blob, _start: number, _end: number, signal?: AbortSignal) =>
        new Promise<Uint8Array>((_resolve, reject) => {
          open++;
          peak = Math.max(peak, open);
          signal?.addEventListener("abort", () => {
            open--;
            reject(signal.reason);
          });
        }),
    );
    serveBlobsOnRead();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await Promise.all(ids.map((id) => fileStorage.getStirlingFileStub(id)));
    await vi.waitFor(() => expect(readBlobSlice).toHaveBeenCalledTimes(4));
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(readBlobSlice).toHaveBeenCalledTimes(6));

    expect(peak).toBe(4);
  });

  test("a read that ignores its cancel still gives its slot back", async () => {
    const { fileStorage, ids } = await storeFiles(6);
    readBlobSlice.mockImplementation(() => new Promise(() => {}));
    serveBlobsOnRead();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await Promise.all(ids.map((id) => fileStorage.getStirlingFileStub(id)));
    await vi.waitFor(() => expect(readBlobSlice).toHaveBeenCalledTimes(4));
    // One deadline for the read, and one for the cancel it never answers.
    await vi.advanceTimersByTimeAsync(3000);
    expect(readBlobSlice).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(readBlobSlice).toHaveBeenCalledTimes(6));
  });
});

describe("rewriting a record under its current name", () => {
  const nativePut = IDBObjectStore.prototype.put;

  /** The bytes of every put of record `id` from here on. */
  function bodiesPutFor(id: string): unknown[] {
    const bodies: unknown[] = [];
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: { id?: string; data?: unknown },
      key?: IDBValidKey,
    ) {
      if (value?.id === id) bodies.push(value.data);
      return nativePut.call(this, value, key);
    } as typeof nativePut;
    return bodies;
  }

  /** The rewrite's copy: the eight bytes of "%PDF-1.7" served on read, named. */
  const isCopy = (data: unknown) =>
    data instanceof File && data.size === 8 && data.name === "file-0.pdf";

  afterEach(() => {
    IDBObjectStore.prototype.put = nativePut;
  });

  test("stores the copy when nothing else wrote the bytes", async () => {
    const { fileStorage, ids } = await storeFiles(1);
    const [id] = ids;
    readBlobSlice.mockResolvedValue(new Uint8Array(1));
    serveBlobsOnRead();
    const bodies = bodiesPutFor(id);

    // A plain Blob comes back without the record's name, so this starts the rewrite.
    await fileStorage.getStirlingFile(id);

    await vi.waitFor(() => expect(bodies.some(isCopy)).toBe(true));
  });

  test("gives up when the bytes were replaced while its copy was made", async () => {
    const { fileStorage, ids } = await storeFiles(1);
    const [id] = ids;
    // Probes wait until released: the audit and the rewrite each read one byte.
    const held: Array<() => void> = [];
    readBlobSlice.mockImplementation(
      () =>
        new Promise<Uint8Array>((resolve) =>
          held.push(() => resolve(new Uint8Array(1))),
        ),
    );
    serveBlobsOnRead();
    const bodies = bodiesPutFor(id);

    await fileStorage.getStirlingFile(id);
    await vi.waitFor(() => expect(held.length).toBe(2));
    const newer = new File(["newer"], "file-0.pdf", {
      type: "application/pdf",
    });
    await fileStorage.updateFileMetadata(id, { data: newer });
    held.splice(0).forEach((release) => release());
    await new Promise((settled) => setTimeout(settled, 250));

    expect(bodies.some(isCopy)).toBe(false);
  });
});
