import { describe, expect, it } from "vitest";
import { isUnfiledLocalFile } from "@app/components/filesPage/fileOrigin";
import type { StirlingFileStub } from "@app/types/fileContext";
import { createFolderId, type FolderRecord } from "@app/types/folder";

describe("isUnfiledLocalFile", () => {
  const folderId = createFolderId();
  const folders = new Map([[folderId, { id: folderId } as FolderRecord]]);

  it.each([
    ["loose browser copy", {}, true],
    ["browser copy in an existing folder", { folderId }, false],
    [
      "browser copy whose folder was removed",
      { folderId: createFolderId() },
      true,
    ],
    ["server file at the library root", { remoteStorageId: 42 }, false],
    ["shared file", { remoteOwnedByCurrentUser: false }, false],
    ["file opened through a share link", { remoteSharedViaLink: true }, false],
  ])("identifies a %s", (_name, metadata, expected) => {
    expect(isUnfiledLocalFile(metadata as StirlingFileStub, folders)).toBe(
      expected,
    );
  });
});
