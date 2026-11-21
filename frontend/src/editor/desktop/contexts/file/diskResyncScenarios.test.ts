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
import {
  beginSelfWrite,
  __resetSelfWrites,
} from "@editor/services/diskFileSync";
import {
  getDiskFileState,
  readFileFromDisk,
} from "@editor/services/desktopFileLink";
import { alert } from "@editor/components/toast";
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

const toastTitles = () =>
  vi.mocked(alert).mock.calls.map((c) => (c[0] as { title: string }).title);
const reloads = (updates: Partial<StirlingFileStub>[]) =>
  updates.filter((u) => u.diskReloadedAt !== undefined).length;
const BIG = 600 * 1024 * 1024;

beforeEach(() => {
  disk.bytes = DISK_BYTES.slice();
  disk.modifiedMs = 2;
  unsaved.value = false;
  stored.files.clear();
  stored.stubs.clear();
  __resetSelfWrites();
  vi.mocked(requestDiskConflictChoice).mockClear();
  vi.mocked(readFileFromDisk).mockClear();
  vi.mocked(alert).mockClear();
  vi.mocked(getDiskFileState).mockImplementation(async () => ({
    availability: "present" as const,
    size: disk.bytes.length,
    modifiedMs: disk.modifiedMs,
  }));
});

describe("repeated and overlapping checks", () => {
  test("a second touch after the re-stamp reads nothing", async () => {
    const h = harness(stub(), DISK_BYTES);

    await h.run();
    await h.run();

    expect(readFileFromDisk).toHaveBeenCalledTimes(1);
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
  });

  test("the watcher and the focus check racing on a touch keep the file", async () => {
    const h = harness(stub(), DISK_BYTES);

    await Promise.all([h.run(), h.run(), h.run()]);

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(reloads(h.updates)).toBe(0);
  });

  test("the watcher and the focus check racing on a real edit reload once", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness(stub(), DISK_BYTES);

    await Promise.all([h.run(), h.run()]);

    expect(reloads(h.updates)).toBe(1);
    expect(readFileFromDisk).toHaveBeenCalledTimes(1);
  });
  test("a check that still sees the stub from before a reload does not reload again", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const record = stub();
    const beforeReload = { ...record };
    const h = harness(record, DISK_BYTES);

    await h.run();
    Object.assign(record, beforeReload);
    await h.run();

    expect(reloads(h.updates)).toBe(1);
  });
});

describe("writes in progress", () => {
  test("our own save is not checked while it is being written", async () => {
    beginSelfWrite(PATH);
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(readFileFromDisk).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  test("a file saved by us and then touched raises no conflict", async () => {
    const saved = new TextEncoder().encode("%PDF-1.7 saved by us, longer");
    disk.bytes = saved.slice();
    disk.modifiedMs = 6;
    unsaved.value = true;
    const h = harness(
      stub({
        size: saved.length,
        diskSyncedSize: saved.length,
        diskSyncedModifiedMs: 5,
      }),
      saved,
    );

    await h.run();

    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
  });

  test("a half-written file is left for the next event", async () => {
    const h = harness(stub(), DISK_BYTES);
    vi.mocked(readFileFromDisk).mockImplementationOnce(
      async () => disk.bytes.slice(0, 5).buffer,
    );

    await h.run();
    expect(h.updates).toEqual([]);

    await h.run();
    expect(h.updates).toEqual([
      { diskSyncedSize: DISK_BYTES.length, diskSyncedModifiedMs: 2 },
    ]);
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
  });
});

describe("files the check leaves alone", () => {
  test("a superseded version is never replaced", async () => {
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness(stub({ isLeaf: false }), DISK_BYTES);

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(reloads(h.updates)).toBe(0);
  });

  test("a filesystem with no modified time is checked by size alone", async () => {
    disk.modifiedMs = 0;
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(readFileFromDisk).not.toHaveBeenCalled();
  });

  test("a file too large to re-read is reported once", async () => {
    vi.mocked(getDiskFileState).mockImplementation(async () => ({
      availability: "present" as const,
      size: BIG,
      modifiedMs: disk.modifiedMs,
    }));
    const h = harness(
      stub({ id: "big" as FileId, diskSyncedSize: BIG }),
      DISK_BYTES,
    );

    await h.run();
    disk.modifiedMs = 3;
    await h.run();
    await h.run();
    await vi.waitFor(() => expect(alert).toHaveBeenCalled());

    expect(toastTitles()).toEqual(["File changed on disk"]);
    expect(readFileFromDisk).not.toHaveBeenCalled();
  });
});
