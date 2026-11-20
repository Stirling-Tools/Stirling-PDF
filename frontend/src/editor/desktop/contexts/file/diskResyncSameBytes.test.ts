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
const unsaved = vi.hoisted(() => ({ value: false }));
const stored = vi.hoisted(() => ({
  files: new Map<string, File>(),
  stubs: new Map<string, unknown>(),
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
    getStirlingFile: vi.fn(async (id: string) => stored.files.get(id) ?? null),
    getStirlingFileStub: vi.fn(
      async (id: string) => stored.stubs.get(id) ?? null,
    ),
    updateFileMetadata: vi.fn(async () => true),
    deleteStirlingFile: vi.fn(async () => undefined),
  },
}));
vi.mock("@editor/services/unsavedWork", () => ({
  hasUnsavedWork: () => unsaved.value,
}));
vi.mock("@editor/services/diskConflictPrompt", () => ({
  requestDiskConflictChoice: vi.fn(),
  cancelDiskConflict: vi.fn(),
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
import { reconcileBeforeOpen } from "@editor/contexts/file/storedFileReconciler";
import { sameBytes } from "@editor/services/diskFileSync";
import { requestDiskConflictChoice } from "@editor/services/diskConflictPrompt";

const PATH = "/Users/x/Documents/report.pdf";
const DISK_BYTES = new TextEncoder().encode("%PDF-1.7 disk copy");
const TOOL_BYTES = new TextEncoder().encode("%PDF-1.7 compressed copy");

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "open" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: DISK_BYTES.length,
    lastModified: 1,
    createdAt: 1,
    quickKey: `report.pdf|${DISK_BYTES.length}|1`,
    versionNumber: 1,
    originalFileId: "open",
    toolHistory: [],
    isLeaf: true,
    localFilePath: PATH,
    diskSyncedSize: DISK_BYTES.length,
    diskSyncedModifiedMs: 1,
    ...overrides,
  };
}

function pdf(bytes: Uint8Array<ArrayBuffer>): File {
  return new File([bytes], "report.pdf", { type: "application/pdf" });
}

function harness(record: StirlingFileStub, openBytes: Uint8Array<ArrayBuffer>) {
  const byId = { [record.id]: record };
  const stateRef = {
    current: {
      files: { byId, ids: [record.id] },
      ui: { hasUnsavedChanges: false },
    } as unknown as FileContextState,
  };
  const openFile = pdf(openBytes);
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
  disk.bytes = DISK_BYTES.slice();
  disk.modifiedMs = 2;
  unsaved.value = false;
  stored.files.clear();
  stored.stubs.clear();
  vi.mocked(requestDiskConflictChoice).mockClear();
});

describe("a disk change that only moves the timestamp", () => {
  test("keeps the open bytes and re-stamps the baseline", async () => {
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([
      { diskSyncedSize: DISK_BYTES.length, diskSyncedModifiedMs: 2 },
    ]);
  });

  test("raises no conflict while an editor holds unsaved work", async () => {
    unsaved.value = true;
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(h.updates).toEqual([
      { diskSyncedSize: DISK_BYTES.length, diskSyncedModifiedMs: 2 },
    ]);
  });

  test("raises no conflict on a tool output whose source still matches disk", async () => {
    const source = stub({ isLeaf: false });
    stored.stubs.set("open", source);
    stored.files.set("open", pdf(DISK_BYTES));
    const output = stub({
      id: "output" as FileId,
      parentFileId: "open" as FileId,
      versionNumber: 2,
      size: TOOL_BYTES.length,
      isDirty: true,
    });
    const h = harness(output, TOOL_BYTES);

    await h.run();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(h.filesRef.current.get("output" as FileId)).toBe(h.openFile);
    expect(output.diskSyncedModifiedMs).toBe(2);
  });
});

describe("a real disk change", () => {
  test("replaces the open bytes when nothing is unsaved", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).not.toBe(h.openFile);
    expect(h.updates.some((u) => u.diskReloadedAt !== undefined)).toBe(true);
  });

  test("reloads over an open copy that can no longer be read", async () => {
    const h = harness(stub(), DISK_BYTES);
    const dead = pdf(DISK_BYTES);
    vi.spyOn(dead, "slice").mockImplementation(() => {
      throw new Error("backing store lost");
    });
    h.filesRef.current.set("open" as FileId, dead);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).not.toBe(dead);
    expect(h.updates.some((u) => u.diskReloadedAt !== undefined)).toBe(true);
  });

  test("still raises a conflict when the size is unchanged", async () => {
    unsaved.value = true;
    disk.bytes = new TextEncoder().encode("%PDF-1.7 disk cop!");
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(requestDiskConflictChoice).toHaveBeenCalledTimes(1);
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
  });

  test("raises a conflict on a tool output with no clean source left", async () => {
    const h = harness(
      stub({
        id: "output" as FileId,
        parentFileId: "gone" as FileId,
        isDirty: true,
      }),
      TOOL_BYTES,
    );

    await h.run();

    expect(requestDiskConflictChoice).toHaveBeenCalledTimes(1);
  });
});

describe("opening a stored file whose timestamp moved", () => {
  test("serves the stored copy and says nothing was reloaded", async () => {
    stored.files.set("open", pdf(DISK_BYTES));
    const port = {
      getStub: () => undefined,
      listStubs: () => [],
      getFile: () => undefined,
      putFile: vi.fn(),
      updateStub: vi.fn(),
      dropFile: vi.fn(),
      reprocessFile: vi.fn(),
    };

    const decision = await reconcileBeforeOpen(stub(), port);

    expect(decision.file).toBeUndefined();
    expect(decision.contentReplaced).toBeUndefined();
    expect(decision.afterPublish).toBeUndefined();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
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
