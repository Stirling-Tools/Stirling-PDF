// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const disk = vi.hoisted(() => ({
  bytes: new Uint8Array(),
  modifiedMs: 2,
}));

vi.mock("@editor/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState: vi.fn(async () => ({
    availability: "present" as const,
    size: disk.bytes.length,
    modifiedMs: disk.modifiedMs,
  })),
  readFileFromDisk: vi.fn(async () => disk.bytes.slice().buffer),
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: vi.fn(),
    updateFileMetadata: vi.fn(async () => true),
    deleteStirlingFile: vi.fn(async () => undefined),
  },
}));
vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@editor/utils/thumbnailUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateThumbnailPairWithMetadata: vi.fn(async () => ({
    thumbnail: undefined,
    pageCount: 1,
  })),
  generateThumbnailWithMetadata: vi.fn(async () => ({
    thumbnail: undefined,
    pageCount: 1,
  })),
}));

import { reconcileOpenFilesAt } from "@editor/contexts/file/fileActions";
import { sameBytes } from "@editor/services/diskFileSync";

const PATH = "/Users/x/Documents/report.pdf";
const OPEN_BYTES = new TextEncoder().encode("%PDF-1.7 open copy");

function stub(): StirlingFileStub {
  return {
    id: "open" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: OPEN_BYTES.length,
    lastModified: 1,
    createdAt: 1,
    quickKey: `report.pdf|${OPEN_BYTES.length}|1`,
    versionNumber: 1,
    originalFileId: "open",
    toolHistory: [],
    isLeaf: true,
    localFilePath: PATH,
    diskSyncedSize: OPEN_BYTES.length,
    diskSyncedModifiedMs: 1,
  };
}

function harness() {
  const record = stub();
  const byId = { [record.id]: record };
  const stateRef = {
    current: {
      files: { byId, ids: [record.id] },
      ui: { hasUnsavedChanges: false },
    } as unknown as FileContextState,
  };
  const openFile = new File([OPEN_BYTES], record.name, {
    type: "application/pdf",
  });
  const filesRef = { current: new Map<FileId, File>([[record.id, openFile]]) };
  const updates: Partial<StirlingFileStub>[] = [];
  const lifecycleManager = {
    updateStirlingFileStub: (_id: FileId, u: Partial<StirlingFileStub>) => {
      updates.push(u);
      Object.assign(record, u);
    },
  };
  return {
    openFile,
    filesRef,
    updates,
    run: () =>
      reconcileOpenFilesAt(
        [PATH],
        stateRef,
        filesRef,
        lifecycleManager as never,
      ),
  };
}

beforeEach(() => {
  disk.modifiedMs = 2;
});

describe("a disk change that only moves the timestamp", () => {
  test("keeps the open bytes and re-stamps the baseline", async () => {
    disk.bytes = OPEN_BYTES.slice();
    const h = harness();

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([
      { diskSyncedSize: OPEN_BYTES.length, diskSyncedModifiedMs: 2 },
    ]);
  });

  test("a real content change still replaces the open bytes", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness();

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).not.toBe(h.openFile);
    expect(h.updates.some((u) => u.diskReloadedAt !== undefined)).toBe(true);
  });
});

describe("sameBytes", () => {
  test("compares content, not identity", async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])]);
    expect(await sameBytes(a, new Blob([new Uint8Array([1, 2, 3])]))).toBe(
      true,
    );
    expect(await sameBytes(a, new Blob([new Uint8Array([1, 2, 4])]))).toBe(
      false,
    );
    expect(await sameBytes(a, new Blob([new Uint8Array([1, 2])]))).toBe(false);
  });
});
