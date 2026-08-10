import { afterEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";

import { indexedDBManager } from "@app/services/indexedDBManager";

/** Regression tests for the "spins forever" bug. Both directions: we yield our
 *  connection to another tab's upgrade, and we fail rather than hang on theirs. */

/** A database per test: these leave connections and version histories behind,
 *  and would otherwise block each other for the reason under test. */
function freshDb(name: string, version: number) {
  return {
    name: `blocked-guard-${name}`,
    version,
    stores: [{ name: "items", keyPath: "id" }],
  };
}

/** A raw connection that ignores `versionchange`, like an older build. */
function holdConnectionIgnoringVersionChange(
  name: string,
  version: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

afterEach(() => {
  vi.useRealTimers();
  indexedDBManager.closeAllDatabases();
});

describe("openDatabase — another connection is in the way", () => {
  test("rejects with an actionable error instead of hanging forever", async () => {
    expectConsole.warn(/blocked by another open connection/);

    const db = freshDb("hangs", 2);
    // A connection at v1 that never yields, so our v2 open is blocked.
    const squatter = await holdConnectionIgnoringVersionChange(db.name, 1);

    vi.useFakeTimers();
    const open = indexedDBManager.openDatabase(db);
    // Surface the rejection to the assertion, not to the process.
    const settled = open.then(
      () => "resolved" as const,
      (error: Error) => error,
    );

    // The block alone must not settle it - the squatter could still close.
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();

    // ...but it must not wait indefinitely either.
    await vi.advanceTimersByTimeAsync(10_000);

    const outcome = await settled;
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/another tab/i);

    squatter.close();
  });

  test("a later open succeeds once the blocker is gone", async () => {
    const config = freshDb("unblocked", 3);
    const squatter = await holdConnectionIgnoringVersionChange(config.name, 1);
    // Closed before the upgrade is requested, so it is never blocked.
    squatter.close();

    const db = await indexedDBManager.openDatabase(config);
    expect(db.version).toBe(3);
  });
});

describe("openDatabase — we are in someone else's way", () => {
  test("closes our connection when another tab needs to upgrade", async () => {
    expectConsole.warn(/Another tab is upgrading/);

    const config = freshDb("yields", 4);
    const db = await indexedDBManager.openDatabase(config);
    expect(db.version).toBe(4);

    // Our `versionchange` handler must close, or this open stays blocked.
    const upgraded = await new Promise<IDBDatabase | "blocked">((resolve) => {
      const request = indexedDB.open(config.name, 5);
      request.onblocked = () => resolve("blocked");
      request.onupgradeneeded = () => {
        const upgrading = request.result;
        if (!upgrading.objectStoreNames.contains("items")) {
          upgrading.createObjectStore("items", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    expect(upgraded).not.toBe("blocked");
    (upgraded as IDBDatabase).close();
  });

  test("forgets the closed handle so the next open reconnects", async () => {
    expectConsole.warn(/Another tab is upgrading/);
    const config = freshDb("reconnects", 6);
    const first = await indexedDBManager.openDatabase(config);

    // Drive the same path the other tab's upgrade would.
    first.onversionchange?.(
      new Event("versionchange") as IDBVersionChangeEvent,
    );

    // A cached-but-closed handle is worse than none - every read then fails.
    const second = await indexedDBManager.openDatabase(config);
    expect(second).not.toBe(first);
    expect(() => second.transaction("items", "readonly")).not.toThrow();
  });
});
