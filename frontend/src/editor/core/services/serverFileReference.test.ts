import { describe, expect, it } from "vitest";
import {
  STORED_FILE_ID_PREFIX,
  storedFileIdForFile,
  storedFileIdForStub,
} from "@editor/services/serverFileReference";
import type { FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "local-1" as FileId,
    name: "document.pdf",
    type: "application/pdf",
    size: 1024,
    lastModified: 1,
    isLeaf: true,
    originalFileId: "local-1",
    versionNumber: 1,
    ...overrides,
  };
}

describe("storedFileIdForStub", () => {
  it("references the server copy for an unedited import", () => {
    expect(storedFileIdForStub(stub({ remoteStorageId: 7 }))).toBe(
      `${STORED_FILE_ID_PREFIX}7`,
    );
  });

  it("references an imported server file when the build omits revision metadata", () => {
    expect(
      storedFileIdForStub(
        stub({
          remoteStorageId: 7,
          versionNumber: 1,
        }),
      ),
    ).toBe(`${STORED_FILE_ID_PREFIX}7`);
  });

  it("references a revision-less import whose local timestamp is the download time", () => {
    expect(
      storedFileIdForStub(
        stub({
          remoteStorageId: 7,
          remoteStorageUpdatedAt: 1_000,
          lastModified: 9_999,
          versionNumber: 1,
        }),
      ),
    ).toBe(`${STORED_FILE_ID_PREFIX}7`);
  });

  it("falls back once a tool has produced a child version", () => {
    expect(
      storedFileIdForStub(
        stub({
          id: "local-2" as FileId,
          remoteStorageId: 7,
          versionNumber: 2,
          parentFileId: "local-1" as FileId,
        }),
      ),
    ).toBeUndefined();
  });

  it("references an uncached server stub by its id", () => {
    expect(
      storedFileIdForStub(
        stub({
          id: "server-11" as FileId,
          remoteStorageId: 11,
          isLeaf: true,
        }),
      ),
    ).toBe(`${STORED_FILE_ID_PREFIX}11`);
  });

  it("keeps encrypted documents on the upload path", () => {
    expect(
      storedFileIdForStub(
        stub({
          remoteStorageId: 7,
          processedFile: { pages: [], isEncrypted: true },
        }),
      ),
    ).toBeUndefined();
  });

  it("keeps share-link copies on the upload path", () => {
    expect(
      storedFileIdForStub(
        stub({
          remoteStorageId: 7,
          remoteSharedViaLink: true,
        }),
      ),
    ).toBeUndefined();
  });

  it("resolves a server id carried only by the file id", () => {
    expect(
      storedFileIdForStub(
        stub({ id: "server-3" as FileId, remoteStorageId: undefined }),
      ),
    ).toBe(`${STORED_FILE_ID_PREFIX}3`);
  });
});

describe("storedFileIdForFile", () => {
  it("looks the stub up by the file's embedded id", () => {
    const file = { fileId: "local-1" } as unknown as File;
    const current = stub({ remoteStorageId: 5 });

    expect(storedFileIdForFile(file, () => current)).toBe(
      `${STORED_FILE_ID_PREFIX}5`,
    );
  });

  it("does not use a reference when the stub is missing", () => {
    const file = { fileId: "local-1" } as unknown as File;
    expect(storedFileIdForFile(file, () => undefined)).toBeUndefined();
  });
});
