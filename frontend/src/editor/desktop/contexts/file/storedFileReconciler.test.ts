import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// The three hooks that carry a record's link to its disk original around the
// app. They have no other home now, so a change here is a silent one.

const getDiskFileState = vi.hoisted(() => vi.fn());
const getLeafStubsNamed = vi.hoisted(() => vi.fn());
const getStirlingFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk: vi.fn(async () => null),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile,
    deleteStirlingFile: vi.fn(),
    updateFileMetadata: vi.fn(async () => true),
    getLeafStubsNamed,
  },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { expectConsole } from "@app/tests/failOnConsole";
import {
  persistedSourceFields,
  inheritedSourceLink,
  sourceLinkForNewFile,
  storedCopiesForNewFiles,
} from "@app/contexts/file/storedFileReconciler";

const PATH = "C:/docs/report.pdf";
let file: File;

const stub = (over: Partial<StirlingFileStub> = {}): StirlingFileStub =>
  ({
    id: "f1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 100,
    lastModified: 5000,
    isLeaf: true,
    versionNumber: 1,
    ...over,
  }) as StirlingFileStub;

beforeEach(() => {
  vi.clearAllMocks();
  file = new File(["pdf"], "report.pdf", { lastModified: 5000 });
  getDiskFileState.mockResolvedValue({
    availability: "present",
    size: 100,
    modifiedMs: 5000,
  });
});

describe("persistedSourceFields", () => {
  it("ignores an update that only touches content", () => {
    expect(persistedSourceFields({ size: 12, thumbnailUrl: "blob:x" })).toBe(
      null,
    );
  });

  it("picks out the link fields and leaves the rest behind", () => {
    expect(
      persistedSourceFields({
        localFilePath: PATH,
        diskSyncedSize: 100,
        thumbnailUrl: "blob:x",
      }),
    ).toEqual({ localFilePath: PATH, diskSyncedSize: 100 });
  });

  it("carries a cleared field through, since a detach is written as undefined", () => {
    const fields = persistedSourceFields({ localFilePath: undefined });
    expect(fields).not.toBe(null);
    expect(fields).toHaveProperty("localFilePath", undefined);
  });
});

describe("inheritedSourceLink", () => {
  it("passes the path and its baseline to the derived file", () => {
    expect(
      inheritedSourceLink(
        stub({
          localFilePath: PATH,
          diskSyncedSize: 100,
          diskSyncedModifiedMs: 5000,
        }),
      ),
    ).toEqual({
      localFilePath: PATH,
      diskSyncedSize: 100,
      diskSyncedModifiedMs: 5000,
    });
  });

  it("gives an unlinked source nothing to pass on", () => {
    expect(inheritedSourceLink(stub())).toEqual({});
  });
});

describe("sourceLinkForNewFile", () => {
  it("links a file the open dialog registered, and baselines it", async () => {
    pendingFilePathMappings.set(file, PATH);
    await expect(sourceLinkForNewFile(file)).resolves.toEqual({
      localFilePath: PATH,
      diskSyncedSize: 100,
      diskSyncedModifiedMs: 5000,
    });
    const copy = new File(["pdf"], "report.pdf", { lastModified: 5000 });
    await expect(sourceLinkForNewFile(copy)).resolves.toEqual({});
  });

  it("links without a baseline when disk cannot be read right now", async () => {
    pendingFilePathMappings.set(file, PATH);
    getDiskFileState.mockResolvedValue({
      availability: "unavailable",
      reason: "permission",
    });
    await expect(sourceLinkForNewFile(file)).resolves.toEqual({
      localFilePath: PATH,
    });
  });

  it("leaves a file that came from nowhere unlinked", async () => {
    await expect(sourceLinkForNewFile(file)).resolves.toEqual({});
    expect(getDiskFileState).not.toHaveBeenCalled();
  });
});

describe("storedCopiesForNewFiles", () => {
  // `file` holds three bytes; disk says the same, and so does the stored copy.
  const copy = (over: Partial<StirlingFileStub> = {}) =>
    stub({
      size: 3,
      localFilePath: PATH,
      diskSyncedSize: 3,
      diskSyncedModifiedMs: 5000,
      createdAt: 1,
      ...over,
    });

  beforeEach(() => {
    pendingFilePathMappings.set(file, PATH);
    getDiskFileState.mockResolvedValue({
      availability: "present",
      size: 3,
      modifiedMs: 5000,
    });
    getStirlingFile.mockResolvedValue({});
  });

  it("finds the stored copy of a file reopened from the same path", async () => {
    getLeafStubsNamed.mockResolvedValue([copy()]);
    const copies = await storedCopiesForNewFiles([file]);
    expect(copies.get(file)?.id).toBe("f1");
    expect(getLeafStubsNamed).toHaveBeenCalledWith("report.pdf");
  });

  it("picks the newest of several stored copies", async () => {
    getLeafStubsNamed.mockResolvedValue([
      copy({ id: "old" as FileId, createdAt: 1 }),
      copy({ id: "new" as FileId, createdAt: 2 }),
    ]);
    const copies = await storedCopiesForNewFiles([file]);
    expect(copies.get(file)?.id).toBe("new");
  });

  it.each<[string, Partial<StirlingFileStub>]>([
    ["came from another path", { localFilePath: "C:/other/report.pdf" }],
    ["has no baseline to compare against", { diskSyncedModifiedMs: undefined }],
    ["was read before disk changed", { diskSyncedModifiedMs: 4000 }],
    ["holds unsaved edits", { isDirty: true }],
    ["is a later version", { versionNumber: 2 }],
    ["carries tool history", { toolHistory: [{ toolId: "rotate" } as never] }],
    ["lost its bytes", { dataUnavailable: true }],
    ["lost its disk original", { orphanedFilePath: PATH }],
    ["is waiting on a disk conflict", { diskConflictAt: 1 }],
    ["lives on the server", { id: "server-12" as FileId }],
  ])("stores the file again when the record %s", async (_, over) => {
    getLeafStubsNamed.mockResolvedValue([copy(over)]);
    expect((await storedCopiesForNewFiles([file])).size).toBe(0);
  });

  it("stores the file again when the stored copy cannot be served", async () => {
    getLeafStubsNamed.mockResolvedValue([copy()]);
    getStirlingFile.mockResolvedValue(null);
    expect((await storedCopiesForNewFiles([file])).size).toBe(0);
  });

  it("stores a file again when its lookup fails, and still finds the others", async () => {
    expectConsole.warn(/lookup failed/);
    const other = new File(["pdf"], "other.pdf", { lastModified: 5000 });
    pendingFilePathMappings.set(other, "C:/docs/other.pdf");
    getLeafStubsNamed.mockImplementation(async (name: string) => {
      if (name === "report.pdf") throw new Error("IndexedDB read failed");
      return [
        copy({
          id: "f2" as FileId,
          name: "other.pdf",
          localFilePath: "C:/docs/other.pdf",
        }),
      ];
    });

    const copies = await storedCopiesForNewFiles([file, other]);

    expect(copies.has(file)).toBe(false);
    expect(copies.get(other)?.id).toBe("f2");
  });

  it("does not look for a file that came from nowhere", async () => {
    const unlinked = new File(["pdf"], "report.pdf");
    expect((await storedCopiesForNewFiles([unlinked])).size).toBe(0);
    expect(getLeafStubsNamed).not.toHaveBeenCalled();
  });

  it("does not look when disk cannot vouch for the bytes just read", async () => {
    getDiskFileState.mockResolvedValue({
      availability: "unavailable",
      reason: "offline",
    });
    expect((await storedCopiesForNewFiles([file])).size).toBe(0);
    expect(getLeafStubsNamed).not.toHaveBeenCalled();
  });
});
