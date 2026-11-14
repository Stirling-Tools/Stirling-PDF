import { beforeEach, describe, expect, it, vi } from "vitest";

import { materializeServerStubs } from "@editor/services/fileSyncService";
import { createStirlingFile } from "@editor/types/fileContext";
import type { StirlingFile, StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  loadShareBundleEntries: vi.fn(),
  updateFileMetadata: vi.fn(),
}));

vi.mock("@editor/services/apiClient", () => ({
  default: { get: mocks.apiGet },
}));

vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata: mocks.updateFileMetadata },
}));

vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));

vi.mock("@editor/services/shareBundleUtils", () => ({
  getShareBundleEntryRootId: (
    manifest: { rootLogicalId: string },
    entry: { rootLogicalId?: string },
  ) => entry.rootLogicalId || manifest.rootLogicalId,
  isZipBundle: () => true,
  loadShareBundleEntries: mocks.loadShareBundleEntries,
  parseContentDispositionFilename: () => null,
}));

function ingestedFile(id: string, name: string): StirlingFile {
  return createStirlingFile(
    new File([id], name, {
      type: "application/pdf",
      lastModified: 100,
    }),
    id as FileId,
  );
}

describe("materializeServerStubs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockResolvedValue({
      data: new Blob(["bundle"], { type: "application/zip" }),
      headers: { "content-type": "application/zip" },
    });
  });

  it("returns the current file from every root in a server bundle", async () => {
    const entries = [
      {
        logicalId: "root-a",
        rootLogicalId: "root-a",
        versionNumber: 1,
        name: "a-v1.pdf",
        type: "application/pdf",
        size: 1,
        lastModified: 1,
        filePath: "files/a-v1.pdf",
        isLeaf: false,
      },
      {
        logicalId: "a-v2",
        rootLogicalId: "root-a",
        parentLogicalId: "root-a",
        versionNumber: 2,
        name: "a-v2.pdf",
        type: "application/pdf",
        size: 1,
        lastModified: 2,
        filePath: "files/a-v2.pdf",
        isLeaf: true,
      },
      {
        logicalId: "root-b",
        rootLogicalId: "root-b",
        versionNumber: 1,
        name: "b.pdf",
        type: "application/pdf",
        size: 1,
        lastModified: 1,
        filePath: "files/b.pdf",
        isLeaf: true,
      },
    ];
    const bundleFiles = entries.map(
      (entry) =>
        new File([entry.logicalId], entry.name, {
          type: entry.type,
          lastModified: entry.lastModified,
        }),
    );
    mocks.loadShareBundleEntries.mockResolvedValue({
      manifest: {
        schemaVersion: 1,
        rootLogicalId: "root-a",
        rootLogicalIds: ["root-a", "root-b"],
        createdAt: 1,
        entries,
      },
      rootOrder: ["root-a", "root-b"],
      sortedEntries: entries,
      files: bundleFiles,
    });

    const ingested = [
      ingestedFile("local-a-v1", "a-v1.pdf"),
      ingestedFile("local-a-v2", "a-v2.pdf"),
      ingestedFile("local-b", "b.pdf"),
    ];
    const addFiles = vi.fn().mockResolvedValue(ingested);
    const updateStub = vi.fn();
    const source: StirlingFileStub = {
      id: "server-9" as FileId,
      originalFileId: "server-9",
      name: "shared-files.zip",
      type: "application/zip",
      size: 10,
      lastModified: 1,
      versionNumber: 1,
      isLeaf: true,
      remoteStorageId: 9,
    };

    const result = await materializeServerStubs([source], {
      addFiles,
      updateStub,
    });

    expect(result.successfulSourceCount).toBe(1);
    expect(result.stubs.map((stub) => stub.id)).toEqual([
      "local-a-v2",
      "local-b",
    ]);
    expect(result.stubs.map((stub) => stub.originalFileId)).toEqual([
      "local-a-v1",
      "local-b",
    ]);
    expect(result.stubs.map((stub) => stub.name)).toEqual([
      "a-v2.pdf",
      "b.pdf",
    ]);
    expect(updateStub).toHaveBeenCalledTimes(3);
    expect(mocks.updateFileMetadata).toHaveBeenCalledTimes(3);
  });
});
