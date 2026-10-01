import { describe, expect, test } from "vitest";
import {
  diskFolderId,
  diskFolderPath,
  isDiskFolderId,
} from "@app/types/folder";

/**
 * A mount's subdirectories have no stored record, so their ids must carry the
 * path itself — through a URL, across a reload, for any spelling the OS uses.
 */
describe("disk folder ids", () => {
  test("round-trips Windows, POSIX, and non-ASCII paths", () => {
    for (const path of [
      "C:\\Users\\Reece\\Downloads\\Invoices",
      "/home/reece/Documents/Rechnungen 2026",
      "D:\\\u041f\u0440\u043e\u0435\u043a\u0442\u044b\\\u0421\u0447\u0435\u0442\u0430",
    ]) {
      const id = diskFolderId(path);
      expect(isDiskFolderId(id)).toBe(true);
      expect(diskFolderPath(id)).toBe(path);
    }
  });

  test("is URL-safe and distinct from stored folder ids", () => {
    const id = diskFolderId("C:\\a+b/c?d");
    expect(id).toMatch(/^disk:[A-Za-z0-9_-]+$/);
    expect(isDiskFolderId("3f0e2a9c-0000-4000-8000-000000000000")).toBe(false);
    expect(diskFolderPath("not-a-disk-id")).toBeNull();
  });
});
