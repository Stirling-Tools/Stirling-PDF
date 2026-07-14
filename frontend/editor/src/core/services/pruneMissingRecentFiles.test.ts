import { describe, expect, test, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// Controllable seam + storage doubles.
const desktopFileLink = vi.hoisted(() => ({
  desktopFileLinkingSupported: true,
  pathExistsOnDisk: vi.fn<(path: string) => Promise<boolean>>(),
}));
const deleteMultipleStirlingFiles = vi.hoisted(() =>
  vi.fn<(ids: FileId[]) => Promise<void>>(),
);
const updateFileMetadata = vi.hoisted(() =>
  vi.fn<(id: FileId, updates: object) => Promise<boolean>>(),
);

vi.mock("@app/services/desktopFileLink", () => desktopFileLink);
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { deleteMultipleStirlingFiles, updateFileMetadata },
}));

import {
  pruneMissingRecentFiles,
  reconcileServerBackedRecents,
  hasLocalRecord,
} from "@app/services/pruneMissingRecentFiles";

const stub = (overrides: Partial<StirlingFileStub> = {}): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

beforeEach(() => {
  desktopFileLink.desktopFileLinkingSupported = true;
  desktopFileLink.pathExistsOnDisk.mockReset().mockResolvedValue(true);
  deleteMultipleStirlingFiles.mockReset().mockResolvedValue(undefined);
  updateFileMetadata.mockReset().mockResolvedValue(true);
});

describe("pruneMissingRecentFiles (local-only files)", () => {
  test("deletes a pristine local-only file whose disk file is gone", async () => {
    const gone = stub({ id: "gone" as FileId, localFilePath: "/tmp/gone.pdf" });
    const kept = stub({ id: "kept" as FileId, localFilePath: "/tmp/kept.pdf" });
    desktopFileLink.pathExistsOnDisk.mockImplementation(
      async (p) => p === "/tmp/kept.pdf",
    );

    const result = await pruneMissingRecentFiles([gone, kept]);

    expect(result.map((s) => s.id)).toEqual(["kept"]);
    expect(deleteMultipleStirlingFiles).toHaveBeenCalledWith(["gone"]);
    expect(updateFileMetadata).not.toHaveBeenCalled();
  });

  test("keeps in-app-edited local files but detaches the dead link", async () => {
    const dirty = stub({
      id: "dirty" as FileId,
      localFilePath: "/tmp/dirty.pdf",
      isDirty: true,
    });
    const edited = stub({
      id: "edited" as FileId,
      localFilePath: "/tmp/edited.pdf",
      versionNumber: 2,
      toolHistory: [{ toolId: "compress" as never, timestamp: 1 }],
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const result = await pruneMissingRecentFiles([dirty, edited]);

    expect(result.map((s) => s.id).sort()).toEqual(["dirty", "edited"]);
    expect(result.every((s) => s.localFilePath === undefined)).toBe(true);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
    expect(updateFileMetadata).toHaveBeenCalledTimes(2);
  });

  test("leaves server-backed files untouched (handled after the server fetch)", async () => {
    const remote = stub({
      id: "remote" as FileId,
      localFilePath: "/tmp/remote.pdf",
      remoteStorageId: 7,
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const result = await pruneMissingRecentFiles([remote]);

    expect(result).toEqual([remote]);
    expect(desktopFileLink.pathExistsOnDisk).not.toHaveBeenCalled();
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
    expect(updateFileMetadata).not.toHaveBeenCalled();
  });

  test("ignores files with no disk link (e.g. web/browser uploads)", async () => {
    const memoryOnly = stub({ id: "mem" as FileId });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const result = await pruneMissingRecentFiles([memoryOnly]);

    expect(result).toEqual([memoryOnly]);
    expect(desktopFileLink.pathExistsOnDisk).not.toHaveBeenCalled();
  });

  test("is a no-op when desktop file linking is unsupported (web)", async () => {
    desktopFileLink.desktopFileLinkingSupported = false;
    const gone = stub({ id: "gone" as FileId, localFilePath: "/tmp/gone.pdf" });

    const result = await pruneMissingRecentFiles([gone]);

    expect(result).toEqual([gone]);
    expect(desktopFileLink.pathExistsOnDisk).not.toHaveBeenCalled();
  });
});

describe("hasLocalRecord (desktop recents = local/IndexedDB only)", () => {
  test("keeps files with a real local IndexedDB id", () => {
    expect(hasLocalRecord(stub({ id: "uuid-abc" as FileId }))).toBe(true);
    // A locally-stored file that is ALSO uploaded still has a local record.
    expect(
      hasLocalRecord(stub({ id: "uuid-abc" as FileId, remoteStorageId: 5 })),
    ).toBe(true);
  });

  test("excludes ephemeral server-only and shared-only stubs", () => {
    expect(hasLocalRecord(stub({ id: "server-42" as FileId }))).toBe(false);
    expect(hasLocalRecord(stub({ id: "shared-tok" as FileId }))).toBe(false);
  });
});

describe("reconcileServerBackedRecents (server-uploaded files)", () => {
  const serverHas = (ids: number[]) => (id: number) => ids.includes(id);

  test("demotes a server-confirmed file whose disk original is gone", async () => {
    const s = stub({
      id: "s1" as FileId,
      localFilePath: "/tmp/s1.pdf",
      remoteStorageId: 42,
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const removed = await reconcileServerBackedRecents([s], serverHas([42]));

    expect(removed).toEqual(["s1"]);
    // The local copy is removed; the file lives on as a pure server file.
    expect(deleteMultipleStirlingFiles).toHaveBeenCalledWith(["s1"]);
  });

  test("does NOT demote when the server can't confirm the file (avoids data loss)", async () => {
    const s = stub({
      id: "s1" as FileId,
      localFilePath: "/tmp/s1.pdf",
      remoteStorageId: 42,
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const removed = await reconcileServerBackedRecents([s], serverHas([]));

    expect(removed).toEqual([]);
    expect(desktopFileLink.pathExistsOnDisk).not.toHaveBeenCalled();
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  test("does NOT demote a file with unsaved local edits", async () => {
    const s = stub({
      id: "s1" as FileId,
      localFilePath: "/tmp/s1.pdf",
      remoteStorageId: 42,
      isDirty: true,
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(false);

    const removed = await reconcileServerBackedRecents([s], serverHas([42]));

    expect(removed).toEqual([]);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  test("does NOT demote when the disk file still exists", async () => {
    const s = stub({
      id: "s1" as FileId,
      localFilePath: "/tmp/s1.pdf",
      remoteStorageId: 42,
    });
    desktopFileLink.pathExistsOnDisk.mockResolvedValue(true);

    const removed = await reconcileServerBackedRecents([s], serverHas([42]));

    expect(removed).toEqual([]);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });

  test("is a no-op off desktop", async () => {
    desktopFileLink.desktopFileLinkingSupported = false;
    const s = stub({
      id: "s1" as FileId,
      localFilePath: "/tmp/s1.pdf",
      remoteStorageId: 42,
    });

    const removed = await reconcileServerBackedRecents([s], serverHas([42]));

    expect(removed).toEqual([]);
    expect(deleteMultipleStirlingFiles).not.toHaveBeenCalled();
  });
});
