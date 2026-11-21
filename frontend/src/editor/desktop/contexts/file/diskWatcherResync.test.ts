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
    run: (paths: string[] = [PATH]) =>
      reconcileOpenFilesAt(
        paths,
        stateRef,
        filesRef,
        lifecycleManager as never,
      ),
  };
}

const toastTitles = () =>
  vi.mocked(alert).mock.calls.map((c) => (c[0] as { title: string }).title);
const GONE = { availability: "gone" as const };
const detached = (updates: Partial<StirlingFileStub>[]) =>
  updates.filter((u) => "localFilePath" in u && u.localFilePath === undefined);

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

describe("an open file whose disk original changes", () => {
  test("a timestamp-only change leaves it alone without reading disk", async () => {
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(readFileFromDisk).not.toHaveBeenCalled();
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([]);
  });

  test("an edit made elsewhere is not swapped in or questioned", async () => {
    unsaved.value = true;
    disk.bytes = new TextEncoder().encode("%PDF-1.7 edited elsewhere");
    const h = harness(stub({ isDirty: true }), DISK_BYTES);

    await h.run();

    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    expect(h.updates).toEqual([]);
    expect(requestDiskConflictChoice).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("an open file whose original goes away", () => {
  test("is detached, kept on screen and reported once", async () => {
    vi.mocked(getDiskFileState).mockResolvedValue(GONE);
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(detached(h.updates)).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ orphanedFilePath: PATH });
    expect(h.filesRef.current.get("open" as FileId)).toBe(h.openFile);
    await vi.waitFor(() =>
      expect(toastTitles()).toEqual(["File deleted on disk"]),
    );
  });

  test("is not detached when the file is back a moment later", async () => {
    vi.mocked(getDiskFileState).mockResolvedValueOnce(GONE);
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.updates).toEqual([]);
  });

  test("the watcher and the focus check racing on it report it once", async () => {
    vi.mocked(getDiskFileState).mockResolvedValue(GONE);
    const h = harness(stub(), DISK_BYTES);

    await Promise.all([h.run(), h.run()]);

    expect(detached(h.updates)).toHaveLength(1);
    await vi.waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert).toHaveBeenCalledTimes(1);
  });

  test("is not mistaken for a loss while our own save writes it", async () => {
    vi.mocked(getDiskFileState).mockResolvedValue(GONE);
    beginSelfWrite(PATH);
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.updates).toEqual([]);
  });

  test("is not detached when our own save starts while it is re-checked", async () => {
    vi.mocked(getDiskFileState).mockImplementation(async () => {
      beginSelfWrite(PATH);
      return GONE;
    });
    const h = harness(stub(), DISK_BYTES);

    await h.run();

    expect(h.updates).toEqual([]);
  });

  test("on a volume that went offline is marked, then cleared on return", async () => {
    vi.mocked(getDiskFileState).mockResolvedValueOnce({
      availability: "unavailable",
      reason: "offline",
    });
    const h = harness(stub(), DISK_BYTES);

    await h.run();
    expect(h.updates).toEqual([{ diskUnavailableReason: "offline" }]);

    await h.run();
    expect(h.updates.at(-1)).toEqual({ diskUnavailableReason: undefined });
  });
});
