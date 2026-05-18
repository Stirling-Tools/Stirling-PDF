import { describe, expect, test, beforeEach } from "vitest";
import "fake-indexeddb/auto";

import { DATABASE_CONFIGS, indexedDBManager } from "./indexedDBManager";

/**
 * Regression test for the IDB v2->v4 migration silent-clobber bug fixed in
 * commit 57e056026 "Merge IDB migrations". Pre-fix: two separate cursor
 * walks (v2->v3 and v3->v4) ran in the same versionchange transaction;
 * the second cursor's `value` was a structured-clone snapshot taken
 * BEFORE the first cursor's update() committed, so the v4 walk wrote
 * back its pre-v3 snapshot and silently erased every v3 field on every
 * row (isLeaf, versionNumber, originalFileId, parentFileId, toolHistory).
 *
 * A future v5 migration written as a third separate cursor walk would
 * re-introduce the exact same failure mode for anyone jumping multiple
 * versions. This test pins the behaviour by seeding a v2 DB and asserting
 * every v3+v4 field is present and correctly set after the upgrade.
 */

const DB_NAME = DATABASE_CONFIGS.FILES.name;
const TARGET_VERSION = DATABASE_CONFIGS.FILES.version;

/**
 * Open a v2-shaped FILES DB and seed it with two v2-shape records. v2
 * had only the `files` store with `id` as keyPath; none of the v3 fields
 * (isLeaf, versionNumber, originalFileId, parentFileId, toolHistory) or
 * the v4 field (folderId) yet existed on records.
 */
function seedV2Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      store.add({
        id: "file-a",
        name: "alpha.pdf",
        type: "application/pdf",
        size: 1024,
        lastModified: 1000,
        data: new Blob(["hello"], { type: "application/pdf" }),
      });
      store.add({
        id: "file-b",
        name: "beta.pdf",
        type: "application/pdf",
        size: 2048,
        lastModified: 2000,
        data: new Blob(["world"], { type: "application/pdf" }),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("seed tx failed"));
    };
    req.onerror = () => reject(req.error ?? new Error("seed open failed"));
  });
}

/**
 * Seed a v3-shape DB (so we can also verify that a v3->v4 jump still
 * lands correctly under the merged migration).
 */
function seedV3Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      store.add({
        id: "file-c",
        name: "gamma.pdf",
        type: "application/pdf",
        size: 4096,
        lastModified: 3000,
        data: new Blob(["v3"], { type: "application/pdf" }),
        // v3 fields, set explicitly so this is genuinely a v3 record
        isLeaf: true,
        versionNumber: 1,
        originalFileId: "file-c",
        parentFileId: undefined,
        toolHistory: [],
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("v3 seed tx failed"));
    };
    req.onerror = () => reject(req.error ?? new Error("v3 seed open failed"));
  });
}

function readAllFiles(): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const all = store.getAll();
      all.onsuccess = () => {
        db.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function cleanup(): Promise<void> {
  indexedDBManager.closeAllDatabases();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // best-effort in jsdom
  });
}

describe("IndexedDB migration (FILES store)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  test("v2 -> latest applies v3 AND v4 fields without clobbering", async () => {
    await seedV2Database();
    // Trigger the migration via the production code path.
    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    const rows = (await readAllFiles()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // v3 fields - this is the critical assertion. Pre-fix, the v4
      // cursor walk's structured-clone snapshot would write these back
      // as undefined, silently erasing them.
      expect(row.isLeaf).toBe(true);
      expect(row.versionNumber).toBe(1);
      expect(row.originalFileId).toBe(row.id);
      expect(row.toolHistory).toEqual([]);
      // parentFileId is intentionally set to undefined for legacy records
      // (they're version roots, not children of anything).
      expect(row.parentFileId).toBeUndefined();
      // v4 field
      expect(row.folderId).toBeNull();
    }
  });

  test("v3 -> latest applies v4 folderId without erasing existing v3 fields", async () => {
    await seedV3Database();
    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    const rows = (await readAllFiles()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // Existing v3 fields should be unchanged
    expect(row.isLeaf).toBe(true);
    expect(row.versionNumber).toBe(1);
    expect(row.originalFileId).toBe("file-c");
    expect(row.toolHistory).toEqual([]);
    // v4 field added
    expect(row.folderId).toBeNull();
  });

  test("fresh install at latest version requires no migration", async () => {
    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    expect(
      await indexedDBManager.getDatabaseVersion(DB_NAME),
    ).toBe(TARGET_VERSION);
    indexedDBManager.closeDatabase(DB_NAME);
  });
});
