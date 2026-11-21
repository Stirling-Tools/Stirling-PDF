// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { StirlingFileStub } from "@editor/types/fileContext";
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

import { reconcileBeforeOpen } from "@editor/contexts/file/storedFileReconciler";
import { sameBytes } from "@editor/services/diskFileSync";
import { requestDiskConflictChoice } from "@editor/services/diskConflictPrompt";

const PATH = "/Users/x/Documents/report.pdf";
const DISK_BYTES = new TextEncoder().encode("%PDF-1.7 disk copy");

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

function port() {
  return {
    getStub: () => undefined,
    listStubs: () => [],
    putFile: vi.fn(),
    updateStub: vi.fn(),
    dropFile: vi.fn(),
    reprocessFile: vi.fn(),
  };
}

async function open(record: StirlingFileStub) {
  const decision = await reconcileBeforeOpen(record, port());
  decision.afterPublish?.();
  return decision;
}

beforeEach(() => {
  disk.bytes = DISK_BYTES.slice();
  disk.modifiedMs = 2;
  unsaved.value = false;
  stored.files.clear();
  stored.stubs.clear();
  vi.mocked(requestDiskConflictChoice).mockClear();
});

describe("opening a stored file whose disk copy only moved its timestamp", () => {
  test("serves the stored copy and says nothing was reloaded", async () => {
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await open(stub());

    expect(decision.file).toBeUndefined();
    expect(decision.contentReplaced).toBeUndefined();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });

  test("raises no conflict over unsaved work elsewhere", async () => {
    unsaved.value = true;
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await open(stub());

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });

  test("raises no conflict on a tool output whose source still matches disk", async () => {
    stored.stubs.set("open", stub({ isLeaf: false }));
    stored.files.set("open", pdf(DISK_BYTES));
    stored.files.set(
      "output",
      pdf(new TextEncoder().encode("%PDF-1.7 compressed copy")),
    );

    const decision = await open(
      stub({
        id: "output" as FileId,
        parentFileId: "open" as FileId,
        versionNumber: 2,
        isDirty: true,
      }),
    );

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });

  test("raises no conflict on a version restored by undo that disk still holds", async () => {
    stored.files.set("restored", pdf(DISK_BYTES));

    const decision = await open(
      stub({
        id: "restored" as FileId,
        isDirty: true,
        parentFileId: "gone" as FileId,
      }),
    );

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });
});

describe("opening a stored file whose disk copy really changed", () => {
  test("loads the disk version", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await open(stub());

    expect(decision.contentReplaced).toBe(true);
    expect(decision.file?.size).toBe(disk.bytes.length);
  });

  test("still raises a conflict over unsaved work when the size is unchanged", async () => {
    unsaved.value = true;
    disk.bytes = new TextEncoder().encode("%PDF-1.7 disk cop!");
    stored.files.set("open", pdf(DISK_BYTES));

    await open(stub());

    expect(requestDiskConflictChoice).toHaveBeenCalledTimes(1);
  });

  test("loads the disk version when the stored copy can no longer be read", async () => {
    const dead = pdf(DISK_BYTES);
    vi.spyOn(dead, "slice").mockImplementation(() => {
      throw new Error("backing store lost");
    });
    stored.files.set("open", dead);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const decision = await open(stub());

    expect(decision.contentReplaced).toBe(true);
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
