import { afterEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";
import type { DatabaseConfig } from "@app/services/indexedDBManager";

/**
 * A blocked open fires `blocked` and then nothing at all - no success, no error -
 * until the other connection goes away. Unguarded, the open promise never settles
 * and every caller hangs SILENTLY: the file library spun forever with an empty
 * console, which is why this kept being reported as unreproducible.
 */

const config = (name: string, version: number): DatabaseConfig => ({
  name,
  version,
  stores: [{ name: "things", keyPath: "id" }],
});

/** A raw connection on an older version that never yields, i.e. the other tab. */
function holdOlderVersion(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("things")) {
        request.result.createObjectStore("things", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("openDatabase — blocked by another connection", () => {
  test("rejects with something actionable instead of hanging", async () => {
    expectConsole.warn(/blocked by another connection/);
    const { indexedDBManager } = await import("@app/services/indexedDBManager");
    const held = await holdOlderVersion("blocked-db");

    vi.useFakeTimers();
    const open = indexedDBManager.openDatabase(config("blocked-db", 2));
    const settled = vi.fn();
    void open.then(settled, settled);

    // Still pending before the grace period is up: a tab that yields quickly
    // must not be failed prematurely.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(open).rejects.toThrow(/blocked by another connection/);

    held.close();
  });

  test("dedupes concurrent callers onto one connection", async () => {
    const { indexedDBManager } = await import("@app/services/indexedDBManager");
    const spy = vi.spyOn(indexedDB, "open");

    // Racing in the same tick is the case registration-after-await could not
    // dedupe, and only the first request would ever receive `blocked`.
    const [a, b, c] = await Promise.all([
      indexedDBManager.openDatabase(config("shared-db", 1)),
      indexedDBManager.openDatabase(config("shared-db", 1)),
      indexedDBManager.openDatabase(config("shared-db", 1)),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(
      spy.mock.calls.filter(([name]) => name === "shared-db"),
    ).toHaveLength(1);
    spy.mockRestore();
  });
});
