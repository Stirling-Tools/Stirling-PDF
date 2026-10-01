import { describe, expect, it } from "vitest";
import { createFolderId, type FolderRecord } from "@app/types/folder";
import { getFolderChain, getFolderPath } from "@app/utils/folderPath";

const root: FolderRecord = {
  id: createFolderId(),
  name: "Receipts",
  parentFolderId: null,
  createdAt: 0,
  updatedAt: 0,
};
const child: FolderRecord = {
  ...root,
  id: createFolderId(),
  name: "2026",
  parentFolderId: root.id,
};

describe("folder paths", () => {
  it("shares root-first ordering between breadcrumbs and search captions", () => {
    const folders = new Map([root, child].map((folder) => [folder.id, folder]));
    expect(getFolderChain(child.id, folders)).toEqual([root, child]);
    expect(getFolderPath(child.id, folders)).toBe("Receipts / 2026");
    expect(getFolderPath(null, folders)).toBe("");
    expect(getFolderPath(createFolderId(), folders)).toBe("");
  });

  it("retains the known part of a path when a parent is missing", () => {
    const folders = new Map([[child.id, child]]);
    expect(getFolderChain(child.id, folders)).toEqual([child]);
    expect(getFolderPath(child.id, folders)).toBe("2026");
  });

  it("terminates cyclic parent data without repeating a folder", () => {
    const cyclicRoot = { ...root, parentFolderId: child.id };
    const folders = new Map(
      [cyclicRoot, child].map((folder) => [folder.id, folder]),
    );
    expect(getFolderChain(child.id, folders)).toEqual([cyclicRoot, child]);
    expect(getFolderPath(child.id, folders)).toBe("Receipts / 2026");
  });
});
