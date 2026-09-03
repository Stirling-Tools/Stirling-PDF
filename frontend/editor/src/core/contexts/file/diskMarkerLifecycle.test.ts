import { describe, expect, test, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId, ToolOperation } from "@app/types/file";

// A conflict marker must not outlive its file, nor precede one: the modal would
// name a file that is gone, and an inherited marker suppresses the child's own.

vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState: vi.fn(async () => ({
    exists: true,
    size: 1,
    modifiedMs: 1,
  })),
  pathExistsOnDisk: vi.fn(async () => true),
  readFileFromDisk: vi.fn(async () => null),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: vi.fn(),
    updateFileMetadata: vi.fn(async () => true),
  },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

import { FileLifecycleManager } from "@app/contexts/file/lifecycle";
import { createChildStub } from "@app/contexts/file/fileActions";
import {
  requestDiskConflictChoice,
  subscribeDiskConflicts,
  __resetDiskConflicts,
} from "@app/services/diskConflictPrompt";

beforeEach(() => __resetDiskConflicts());

function manager() {
  const filesRef = { current: new Map<FileId, File>() };
  return new FileLifecycleManager(filesRef, vi.fn());
}

function queuedIds(): FileId[] {
  let seen: { fileId: FileId }[] = [];
  const off = subscribeDiskConflicts((queue) => {
    seen = queue;
  });
  off();
  return seen.map((q) => q.fileId);
}

describe("closing a file drops its queued conflict", () => {
  test("removeFiles cancels the prompt", () => {
    requestDiskConflictChoice({
      fileId: "a" as FileId,
      name: "a.pdf",
      onUseDisk: vi.fn(),
    });
    requestDiskConflictChoice({
      fileId: "b" as FileId,
      name: "b.pdf",
      onUseDisk: vi.fn(),
    });
    manager().removeFiles(["a" as FileId]);
    expect(queuedIds()).toEqual(["b"]);
  });

  test("the delayed-cleanup path cancels it too", () => {
    requestDiskConflictChoice({
      fileId: "a" as FileId,
      name: "a.pdf",
      onUseDisk: vi.fn(),
    });
    manager().cleanupFile("a" as FileId);
    expect(queuedIds()).toEqual([]);
  });
});

describe("a tool output does not inherit its parent's disk markers", () => {
  const parent = {
    id: "p1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 10,
    lastModified: 0,
    isLeaf: true,
    versionNumber: 1,
    localFilePath: "C:/docs/report.pdf",
    diskSyncedSize: 500,
    diskSyncedModifiedMs: 400,
    diskConflictAt: 123,
    diskReloadedAt: 456,
  } as StirlingFileStub;

  const operation: ToolOperation = { toolId: "split", timestamp: 1 };

  test("clears the markers but keeps the link and its baseline", () => {
    const child = createChildStub(
      parent,
      operation,
      new File(["%PDF-1.7"], "report_split.pdf", { type: "application/pdf" }),
    );

    // Inheriting these shows a badge the child never earned, and the conflict
    // short-circuit in resyncFilesFromDisk would suppress its own prompt.
    expect(child.diskConflictAt).toBeUndefined();
    expect(child.diskReloadedAt).toBeUndefined();
    // The link and baseline must survive: dropping them would raise a bogus
    // conflict on every open, and Ctrl+S would stop writing back.
    expect(child.localFilePath).toBe("C:/docs/report.pdf");
    expect(child.diskSyncedSize).toBe(500);
    expect(child.diskSyncedModifiedMs).toBe(400);
    expect(child.isDirty).toBe(true);
  });
});
