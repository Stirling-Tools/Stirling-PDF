import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const disk = vi.hoisted(() => ({ gone: new Set<string>() }));

vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState: vi.fn(async (path: string) =>
    disk.gone.has(path)
      ? { availability: "gone" as const }
      : { availability: "present" as const, size: 1, modifiedMs: 1 },
  ),
  readFileFromDisk: vi.fn(async () => null),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: vi.fn(),
    updateFileMetadata: vi.fn(async () => true),
    deleteStirlingFile: vi.fn(async () => undefined),
  },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

import { reconcileOpenFilesAt } from "@app/contexts/file/fileActions";

const SHARED = "/Users/x/Documents/report.pdf";

function stub(id: string, path?: string): StirlingFileStub {
  return {
    id: id as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 1,
    lastModified: 1,
    createdAt: 1,
    quickKey: `report.pdf|1|${id}`,
    versionNumber: 1,
    originalFileId: id as FileId,
    toolHistory: [],
    isLeaf: true,
    localFilePath: path,
    diskSyncedSize: 1,
    diskSyncedModifiedMs: 1,
  } as StirlingFileStub;
}

function harness(stubs: StirlingFileStub[]) {
  const byId = Object.fromEntries(stubs.map((s) => [s.id, s]));
  const stateRef = {
    current: {
      files: { byId, ids: stubs.map((s) => s.id) },
      ui: { hasUnsavedChanges: false },
    } as unknown as FileContextState,
  };
  const updates: { id: FileId; updates: Partial<StirlingFileStub> }[] = [];
  const lifecycleManager = {
    updateStirlingFileStub: (id: FileId, u: Partial<StirlingFileStub>) => {
      updates.push({ id, updates: u });
      Object.assign(byId[id], u);
    },
  };
  return {
    stateRef,
    updates,
    run: (paths: string[]) =>
      reconcileOpenFilesAt(
        paths,
        stateRef as never,
        { current: new Map<FileId, File>() },
        lifecycleManager as never,
      ),
  };
}

beforeEach(() => disk.gone.clear());

describe("a disk path that backs more than one record", () => {
  test("every record holding it is reconciled, not just the last", async () => {
    disk.gone.add(SHARED);
    const h = harness([stub("first", SHARED), stub("second", SHARED)]);

    await h.run([SHARED]);

    const detached = h.updates.filter((u) => "orphanedFilePath" in u.updates);
    expect(detached.map((u) => u.id).sort()).toEqual(["first", "second"]);
    for (const update of detached) {
      expect(update.updates.localFilePath).toBeUndefined();
      expect(update.updates.orphanedFilePath).toBe(SHARED);
    }
  });

  test("a path no record holds does nothing", async () => {
    const h = harness([stub("first", SHARED)]);
    await h.run(["/Users/x/Documents/someone-elses-window.pdf"]);
    expect(h.updates).toEqual([]);
  });

  test("records on other paths are left alone", async () => {
    const other = "/Users/x/Documents/notes.pdf";
    disk.gone.add(SHARED);
    const h = harness([stub("first", SHARED), stub("other", other)]);

    await h.run([SHARED]);

    expect(h.updates.map((u) => u.id)).toEqual(["first"]);
  });
});
