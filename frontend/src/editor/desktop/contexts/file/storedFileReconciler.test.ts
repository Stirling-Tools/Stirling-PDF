import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// The three hooks that carry a record's link to its disk original around the
// app. They have no other home now, so a change here is a silent one.

const getDiskFileState = vi.hoisted(() => vi.fn());
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk: vi.fn(async () => null),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: vi.fn(),
    deleteStirlingFile: vi.fn(),
    updateFileMetadata: vi.fn(async () => true),
  },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import {
  persistedSourceFields,
  inheritedSourceLink,
  sourceLinkForNewFile,
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
