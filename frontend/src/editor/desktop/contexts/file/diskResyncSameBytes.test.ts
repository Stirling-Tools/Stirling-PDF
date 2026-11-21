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
import { alert } from "@editor/components/toast";
import { readFileFromDisk } from "@editor/services/desktopFileLink";

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

function openPort() {
  return {
    getStub: () => undefined,
    listStubs: () => [],
    getFile: () => undefined,
    putFile: vi.fn(),
    updateStub: vi.fn(),
    dropFile: vi.fn(),
    reprocessFile: vi.fn(),
  };
}

beforeEach(() => {
  disk.bytes = DISK_BYTES.slice();
  disk.modifiedMs = 2;
  unsaved.value = false;
  stored.files.clear();
  stored.stubs.clear();
  vi.mocked(requestDiskConflictChoice).mockClear();
  vi.mocked(alert).mockClear();
  vi.mocked(readFileFromDisk).mockClear();
});

describe("an open file whose disk original changes", () => {
  test("a timestamp-only change leaves it alone without reading disk", async () => {
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(readFileFromDisk).not.toHaveBeenCalled();
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([]);
  });

  test("an edit made elsewhere is not swapped in", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
  });

  test("an edit made elsewhere raises no conflict over unsaved work", async () => {
    unsaved.value = true;
    disk.bytes = new TextEncoder().encode("%PDF-1.7 disk cop!");
    const h = harness(stub({ isDirty: true }), DISK_BYTES);

    await h.run();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
  });

  test("the edit is picked up the next time the file is opened", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await reconcileBeforeOpen(stub(), openPort());

    expect(decision.contentReplaced).toBe(true);
    expect(decision.file?.size).toBe(disk.bytes.length);
  });
});

describe("opening a stored file whose timestamp moved", () => {
  test("serves the stored copy and says nothing was reloaded", async () => {
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await reconcileBeforeOpen(stub(), openPort());

    expect(decision.file).toBeUndefined();
    expect(decision.contentReplaced).toBeUndefined();
    expect(decision.afterPublish).toBeUndefined();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });
});

describe("opening a stored file after a timestamp-only change", () => {
  test("raises no conflict over unsaved work elsewhere", async () => {
    unsaved.value = true;
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await reconcileBeforeOpen(stub(), openPort());

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

    const decision = await reconcileBeforeOpen(
      stub({
        id: "output" as FileId,
        parentFileId: "open" as FileId,
        versionNumber: 2,
        isDirty: true,
      }),
      openPort(),
    );
    decision.afterPublish?.();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });

  test("raises no conflict on a version restored by undo that disk still holds", async () => {
    stored.files.set("restored", pdf(DISK_BYTES));

    const decision = await reconcileBeforeOpen(
      stub({
        id: "restored" as FileId,
        isDirty: true,
        parentFileId: "gone" as FileId,
      }),
      openPort(),
    );
    decision.afterPublish?.();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(decision.updates).toMatchObject({ diskSyncedModifiedMs: 2 });
  });

  test("still raises a conflict when disk really changed under unsaved work", async () => {
    unsaved.value = true;
    disk.bytes = new TextEncoder().encode("%PDF-1.7 disk cop!");
    stored.files.set("open", pdf(DISK_BYTES));

    const decision = await reconcileBeforeOpen(stub(), openPort());
    decision.afterPublish?.();

    expect(requestDiskConflictChoice).toHaveBeenCalledTimes(1);
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
