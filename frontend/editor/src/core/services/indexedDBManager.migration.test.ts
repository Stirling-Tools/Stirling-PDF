import { describe, expect, test, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";

import {
  DATABASE_CONFIGS,
  indexedDBManager,
} from "@app/services/indexedDBManager";

/**
 * Regression test for the IDB v2->v4 migration silent-clobber bug fixed in
 * commit 57e056026 "Merge IDB migrations". Pre-fix: two separate cursor
 * walks (v2->v3 and v3->v4) ran in the same versionchange transaction;
 * the second cursor's `value` was a structured-clone snapshot taken
 * BEFORE the first cursor's update() committed, so the v4 walk wrote
 * back its pre-v3 snapshot and silently erased every v3 field on every
 * row (isLeaf, versionNumber, originalFileId, parentFileId, toolHistory).
 *
 * A future v10 migration written as a third separate cursor walk would
 * re-introduce the exact same failure mode for anyone jumping multiple
 * versions. This test pins the behaviour by seeding a v2 DB and asserting
 * every v3+v4 field is present and correctly set after the upgrade.
 *
 * Also covers the SaaS-lineage reconciliation: SaaS shipped its own
 * versions of this database up to v8 (v5 added folder_* stores, v8 was
 * the terminal SaaS schema). When the unified codebase first opens a
 * SaaS browser's database it has to drop those orphan stores, backfill
 * folderId on every file row, and (for v6/v7 specifically) force-delete
 * the database because its data is known-corrupt.
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

/**
 * Seed a SaaS-shaped database at the given version. Mirrors the SaaS
 * terminal schema: `files` store plus the three folder_* / smart_folders
 * stores that we now treat as orphans. SaaS file rows are v3-shaped
 * (they got the file history fields via the SaaS migrateFileHistoryFields
 * path) but have never had a folderId.
 */
function seedSaasDatabase(version: number, fileIds: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("folder_members")) {
        db.createObjectStore("folder_members", { keyPath: "folderId" });
      }
      if (!db.objectStoreNames.contains("folder_run_states")) {
        db.createObjectStore("folder_run_states", { keyPath: "folderId" });
      }
      if (!db.objectStoreNames.contains("smart_folders")) {
        db.createObjectStore("smart_folders", { keyPath: "folderId" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(
        ["files", "folder_members", "smart_folders"],
        "readwrite",
      );
      const filesStore = tx.objectStore("files");
      for (const id of fileIds) {
        filesStore.add({
          id,
          name: `${id}.pdf`,
          type: "application/pdf",
          size: 1024,
          lastModified: 5000,
          data: new Blob([id], { type: "application/pdf" }),
          // v3 fields - SaaS records always have these by v3+
          isLeaf: true,
          versionNumber: 1,
          originalFileId: id,
          parentFileId: undefined,
          toolHistory: [],
          // intentionally no folderId field - SaaS lineage never had it
        });
      }
      // Drop a SaaS-only row in folder_members and smart_folders so we
      // can verify the orphan stores were actually dropped (not just
      // empty).
      tx.objectStore("folder_members").add({
        folderId: "saas-folder-1",
        fileIds: [...fileIds],
      });
      tx.objectStore("smart_folders").add({
        folderId: "saas-folder-1",
        files: {},
        lastUpdated: 6000,
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("SaaS seed tx failed"));
    };
    req.onerror = () => reject(req.error ?? new Error("SaaS seed open failed"));
  });
}

function getObjectStoreNames(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const names = Array.from(db.objectStoreNames);
      db.close();
      resolve(names);
    };
    req.onerror = () => reject(req.error);
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
    expect(await indexedDBManager.getDatabaseVersion(DB_NAME)).toBe(
      TARGET_VERSION,
    );
    indexedDBManager.closeDatabase(DB_NAME);
  });

  test("SaaS v8 -> latest backfills folderId, preserves files, drops orphan stores", async () => {
    await seedSaasDatabase(8, ["saas-file-a", "saas-file-b"]);
    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    const rows = (await readAllFiles()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // SaaS file rows already had v3 fields - migration should leave them alone.
      expect(row.isLeaf).toBe(true);
      expect(row.versionNumber).toBe(1);
      expect(row.originalFileId).toBe(row.id);
      expect(row.toolHistory).toEqual([]);
      // Critical: SaaS lineage never had folderId, the new schema requires it.
      expect(row.folderId).toBeNull();
    }

    // Orphan SaaS-only stores should be gone; the v9 schema's `folders`
    // store should exist; the `files` store survives.
    const stores = await getObjectStoreNames();
    expect(stores).toContain("files");
    expect(stores).toContain("folders");
    expect(stores).not.toContain("folder_members");
    expect(stores).not.toContain("folder_run_states");
    expect(stores).not.toContain("smart_folders");

    expect(await indexedDBManager.getDatabaseVersion(DB_NAME)).toBe(
      TARGET_VERSION,
    );
  });

  test("SaaS v5 (pre-orphan-stores edge case) backfills folderId", async () => {
    // v5 predates folder_members / folder_run_states / smart_folders in
    // SaaS lineage, so seed it with only the files store. SaaS v5 file
    // rows still lack folderId; this verifies the field-presence check
    // doesn't depend on the orphan stores existing.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").add({
          id: "saas-v5-file",
          name: "saas-v5.pdf",
          type: "application/pdf",
          size: 256,
          lastModified: 7000,
          data: new Blob(["v5"], { type: "application/pdf" }),
          isLeaf: true,
          versionNumber: 1,
          originalFileId: "saas-v5-file",
          parentFileId: undefined,
          toolHistory: [],
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error("v5 seed tx failed"));
      };
      req.onerror = () => reject(req.error ?? new Error("v5 seed open failed"));
    });

    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    const rows = (await readAllFiles()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.folderId).toBeNull();
  });

  test("SaaS v6 database is force-deleted (data lost, schema reset to v9)", async () => {
    // The force-delete warn IS the contract under test; production fires it
    // to surface why data was wiped.
    expectConsole.warn(/Deleting corrupt SaaS v6/);
    await seedSaasDatabase(6, ["v6-corrupt-file"]);

    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    // Wipe path - files are gone, but the DB is now a clean v9 install.
    const rows = await readAllFiles();
    expect(rows).toHaveLength(0);
    const stores = await getObjectStoreNames();
    expect(stores).toContain("files");
    expect(stores).toContain("folders");
    expect(stores).not.toContain("folder_members");
    expect(await indexedDBManager.getDatabaseVersion(DB_NAME)).toBe(
      TARGET_VERSION,
    );
  });

  test("SaaS v7 database is force-deleted (data lost, schema reset to v9)", async () => {
    // The force-delete warn IS the contract under test; production fires it
    // to surface why data was wiped.
    expectConsole.warn(/Deleting corrupt SaaS v7/);
    await seedSaasDatabase(7, ["v7-corrupt-file"]);

    await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    indexedDBManager.closeDatabase(DB_NAME);

    const rows = await readAllFiles();
    expect(rows).toHaveLength(0);
    expect(await indexedDBManager.getDatabaseVersion(DB_NAME)).toBe(
      TARGET_VERSION,
    );
  });
});
