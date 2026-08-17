import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const disk = vi.hoisted(() => ({
  supported: true,
  // Paths present on disk; anything else is treated as deleted.
  present: new Set<string>(),
}));

vi.mock("@app/services/desktopFileLink", () => ({
  get desktopFileLinkingSupported() {
    return disk.supported;
  },
  pathExistsOnDisk: vi.fn(async (path: string) => disk.present.has(path)),
  getDiskFileState: vi.fn(async (path: string) => ({
    exists: disk.present.has(path),
    size: 0,
    modifiedMs: 0,
  })),
  readFileFromDisk: vi.fn(async () => null),
}));

const deleteMultipleStirlingFiles = vi.hoisted(() => vi.fn(async () => 0));
const updateFileMetadata = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { deleteMultipleStirlingFiles, updateFileMetadata },
}));

import {
  pruneMissingRecentFiles,
  hasLocalRecord,
} from "@app/services/pruneMissingRecentFiles";

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "file-1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 100,
    lastModified: 5000,
    isLeaf: true,
    originalFileId: "file-1",
    versionNumber: 1,
    toolHistory: [],
    ...overrides,
  } as StirlingFileStub;
}

beforeEach(() => {
  disk.supported = true;
  disk.present = new Set(["C:/docs/kept.pdf"]);
  vi.clearAllMocks();
});

describe("hasLocalRecord", () => {
  it("rejects the synthetic server and share stubs", () => {
    expect(hasLocalRecord(stub({ id: "server-12" as FileId }))).toBe(false);
    expect(hasLocalRecord(stub({ id: "shared-abc" as FileId }))).toBe(false);
    expect(hasLocalRecord(stub())).toBe(true);
  });
});

describe("pruneMissingRecentFiles", () => {
  it("passes everything through off the desktop app", async () => {
    disk.supported = false;
    const stubs = [stub({ localFilePath: "C:/docs/gone.pdf" })];
    expect(await pruneMissingRecentFiles(stubs)).toBe(stubs);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  it("leaves files whose disk original is still there", async () => {
    const stubs = [stub({ localFilePath: "C:/docs/kept.pdf" })];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result).toHaveLength(1);
    expect(result[0].localFilePath).toBe("C:/docs/kept.pdf");
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  it("deletes a pristine passthrough whose disk file was removed", async () => {
    const stubs = [
      stub({ id: "gone" as FileId, localFilePath: "C:/docs/gone.pdf" }),
      stub({ id: "kept" as FileId, localFilePath: "C:/docs/kept.pdf" }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result.map((s) => s.id)).toEqual(["kept"]);
    expect(deleteMultipleStirlingFiles).toHaveBeenCalledWith(["gone"]);
  });

  it("keeps an edited file but detaches its dead disk link", async () => {
    const stubs = [
      stub({
        id: "edited" as FileId,
        localFilePath: "C:/docs/gone.pdf",
        versionNumber: 3,
        toolHistory: [{ toolId: "split" as any, timestamp: 1 }],
      }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result).toHaveLength(1);
    expect(result[0].localFilePath).toBeUndefined();
    expect(result[0].diskSyncedSize).toBeUndefined();
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
    expect(updateFileMetadata).toHaveBeenCalledWith(
      "edited",
      expect.objectContaining({ localFilePath: undefined }),
    );
  });

  it("records where a detached file used to live", async () => {
    const stubs = [
      stub({
        id: "edited" as FileId,
        localFilePath: "C:/docs/gone.pdf",
        versionNumber: 3,
      }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    // Without this the "not on disk" state dies with the toast that announced it.
    expect(result[0].orphanedFilePath).toBe("C:/docs/gone.pdf");
    expect(updateFileMetadata).toHaveBeenCalledWith(
      "edited",
      expect.objectContaining({ orphanedFilePath: "C:/docs/gone.pdf" }),
    );
  });

  it("keeps a version-history root even though it looks like a passthrough", async () => {
    // v1 opened from disk, then a tool ran on it: still v1 with no tool history
    // of its own, so it reads as pristine - but later versions point at it and
    // deleting it takes "revert to original" with them.
    const stubs = [
      stub({
        id: "root" as FileId,
        localFilePath: "C:/docs/gone.pdf",
        isLeaf: false,
      }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].localFilePath).toBeUndefined();
    expect(result[0].orphanedFilePath).toBe("C:/docs/gone.pdf");
  });

  it("never touches the synthetic server and share stubs", async () => {
    const stubs = [
      stub({ id: "server-7" as FileId, localFilePath: "C:/docs/gone.pdf" }),
      stub({ id: "shared-x" as FileId, localFilePath: "C:/docs/gone.pdf" }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result).toHaveLength(2);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
    expect(updateFileMetadata).not.toHaveBeenCalled();
  });

  it("keeps a file with unsaved edits even though its disk file is gone", async () => {
    const stubs = [
      stub({
        id: "dirty" as FileId,
        localFilePath: "C:/docs/gone.pdf",
        isDirty: true,
      }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result).toHaveLength(1);
    expect(result[0].localFilePath).toBeUndefined();
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  it("never touches a server-backed file here", async () => {
    const stubs = [
      stub({
        id: "server-backed" as FileId,
        localFilePath: "C:/docs/gone.pdf",
        remoteStorageId: 42,
      }),
    ];
    const result = await pruneMissingRecentFiles(stubs);
    expect(result).toHaveLength(1);
    expect(result[0].localFilePath).toBe("C:/docs/gone.pdf");
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  it("ignores files that never came from disk", async () => {
    const stubs = [stub({ localFilePath: undefined })];
    expect(await pruneMissingRecentFiles(stubs)).toBe(stubs);
  });

  describe("a file the user still has open", () => {
    const openStub = () =>
      stub({ id: "open" as FileId, localFilePath: "C:/docs/gone.pdf" });

    it("is kept and detached rather than deleted under the user", async () => {
      const onOpenFilesDetached = vi.fn();
      const result = await pruneMissingRecentFiles([openStub()], {
        openFileIds: new Set(["open" as FileId]),
        onOpenFilesDetached,
      });

      // Deleting it would leave a document on screen that exists nowhere.
      expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].localFilePath).toBeUndefined();
      // The id and old path go with it: the caller has to apply the same detach
      // to the workbench stub, or every save path keeps writing to the dead path.
      expect(onOpenFilesDetached).toHaveBeenCalledWith([
        { id: "open", name: "report.pdf", path: "C:/docs/gone.pdf" },
      ]);
    });

    it("would have been deleted had it not been open", async () => {
      const result = await pruneMissingRecentFiles([openStub()]);
      expect(deleteMultipleStirlingFiles).toHaveBeenCalledWith(["open"]);
      expect(result).toHaveLength(0);
    });

    it("says nothing when the open file's disk original is fine", async () => {
      const onOpenFilesDetached = vi.fn();
      await pruneMissingRecentFiles(
        [stub({ id: "open" as FileId, localFilePath: "C:/docs/kept.pdf" })],
        { openFileIds: new Set(["open" as FileId]), onOpenFilesDetached },
      );
      expect(onOpenFilesDetached).not.toHaveBeenCalled();
    });

    it("reports every open file lost in one go", async () => {
      const onOpenFilesDetached = vi.fn();
      await pruneMissingRecentFiles(
        [
          stub({
            id: "a" as FileId,
            name: "a.pdf",
            localFilePath: "C:/docs/a.pdf",
          }),
          stub({
            id: "b" as FileId,
            name: "b.pdf",
            localFilePath: "C:/docs/b.pdf",
          }),
        ],
        {
          openFileIds: new Set(["a" as FileId, "b" as FileId]),
          onOpenFilesDetached,
        },
      );
      expect(onOpenFilesDetached).toHaveBeenCalledWith([
        { id: "a", name: "a.pdf", path: "C:/docs/a.pdf" },
        { id: "b", name: "b.pdf", path: "C:/docs/b.pdf" },
      ]);
    });
  });
});
