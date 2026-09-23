import { describe, expect, test, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { virtualFolderStorage } from "@app/services/virtualFolderStorage";
import { folderStorage } from "@app/services/folderStorage";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

/**
 * Virtual folders have no server to be authoritative, so the invariants the
 * server enforces for its folders (no cycles, bounded depth, subtree deletes
 * that report every removed id) are this module's own responsibility.
 */
describe("virtualFolderStorage", () => {
  beforeEach(() => {
    indexedDBManager.closeDatabase(DATABASE_CONFIGS.FILES.name);
    globalThis.indexedDB = new IDBFactory();
  });

  test("creates rows stamped virtual, invisible to the server folder cache", async () => {
    const created = await virtualFolderStorage.createFolder("Research", null);
    expect(created.kind).toBe("virtual");

    // Same DB, different store: the server cache must not see it, because a
    // sync wipes that cache wholesale and would silently destroy the row.
    expect(await folderStorage.getAllFolders()).toEqual([]);
    expect(await virtualFolderStorage.getAllFolders()).toEqual([created]);
  });

  test("the server cache refuses a virtual row outright", async () => {
    const virtual = await virtualFolderStorage.createFolder("Research", null);
    await expect(folderStorage.upsertFolder(virtual)).rejects.toThrow(
      /server folders only/,
    );
  });

  test("refuses to move a folder into its own subtree", async () => {
    const parent = await virtualFolderStorage.createFolder("a", null);
    const child = await virtualFolderStorage.createFolder("b", parent.id);
    const grandchild = await virtualFolderStorage.createFolder("c", child.id);

    await expect(
      virtualFolderStorage.moveFolder(parent.id, grandchild.id),
    ).rejects.toThrow(/own subtree/);
    await expect(
      virtualFolderStorage.moveFolder(parent.id, parent.id),
    ).rejects.toThrow(/into itself/);
  });

  test("deleting a folder removes its whole subtree and reports every id", async () => {
    const parent = await virtualFolderStorage.createFolder("a", null);
    const child = await virtualFolderStorage.createFolder("b", parent.id);
    const grandchild = await virtualFolderStorage.createFolder("c", child.id);
    const bystander = await virtualFolderStorage.createFolder("keep", null);

    const removed = await virtualFolderStorage.deleteFolder(parent.id);

    // Every removed id is reported so the caller can unlink files that
    // referenced them — the same contract as the server delete.
    expect([...removed].sort()).toEqual(
      [parent.id, child.id, grandchild.id].sort(),
    );
    expect(await virtualFolderStorage.getAllFolders()).toEqual([bystander]);
  });

  test("refuses to nest past the depth cap", async () => {
    let parentId = (await virtualFolderStorage.createFolder("d0", null)).id;
    for (let i = 1; i < 64; i += 1) {
      parentId = (await virtualFolderStorage.createFolder(`d${i}`, parentId))
        .id;
    }
    await expect(
      virtualFolderStorage.createFolder("too-deep", parentId),
    ).rejects.toThrow(/depth limit/);
  });
});
