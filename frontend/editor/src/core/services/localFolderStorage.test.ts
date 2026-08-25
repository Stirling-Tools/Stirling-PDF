import { describe, expect, test, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  localFolderStorage,
  directoryKey,
} from "@app/services/localFolderStorage";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";

/**
 * A mount is a pointer at a directory, and one directory must never have two
 * pointers — the rows would be two names for one truth. The filesystem is
 * happy to spell one directory many ways, so the dedupe has to see through
 * the spelling.
 */
describe("localFolderStorage", () => {
  beforeEach(() => {
    indexedDBManager.closeDatabase(DATABASE_CONFIGS.FILES.name);
    globalThis.indexedDB = new IDBFactory();
  });

  test("directoryKey equates the spellings a case-insensitive filesystem does", () => {
    const key = directoryKey("C:\\Users\\Reece\\Downloads");
    expect(directoryKey("c:\\users\\reece\\downloads")).toBe(key);
    expect(directoryKey("C:\\Users\\Reece\\Downloads\\")).toBe(key);
    expect(directoryKey("C:/Users/Reece/Downloads")).toBe(key);
    expect(directoryKey("C:\\Users\\\\Reece\\Downloads")).toBe(key);

    expect(directoryKey("\\\\server\\share\\docs")).toBe(
      directoryKey("//SERVER/share/docs/"),
    );

    // POSIX paths are genuinely case-sensitive; only the separator rules apply.
    expect(directoryKey("/home/Reece/")).toBe(directoryKey("/home/Reece"));
    expect(directoryKey("/home/Reece")).not.toBe(directoryKey("/home/reece"));
  });

  test("mounting the same directory under another spelling hands back the existing record", async () => {
    const first = await localFolderStorage.mountDirectory(
      "C:\\Users\\Reece\\Downloads",
      "Downloads",
    );
    const again = await localFolderStorage.mountDirectory(
      "c:/users/reece/downloads/",
      "downloads",
    );
    expect(again.id).toBe(first.id);
    expect(await localFolderStorage.getAllFolders()).toHaveLength(1);
  });

  test("a subdirectory of a mount gets its own mount; that is the only way to reach it", async () => {
    const parent = await localFolderStorage.mountDirectory(
      "C:\\Users\\Reece\\Downloads",
      "Downloads",
    );
    const child = await localFolderStorage.mountDirectory(
      "C:\\Users\\Reece\\Downloads\\Invoices",
      "Invoices",
    );
    expect(child.id).not.toBe(parent.id);
    expect(await localFolderStorage.getAllFolders()).toHaveLength(2);
  });
});
