import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// updateStirlingFileStub drops updates for a file not yet in filesRef, so marking
// the conflict before the bytes are published loses the badge with no visible failure.

const diskState = vi.hoisted(() => ({
  state: { exists: true, size: 999, modifiedMs: 9_000 },
}));
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState: vi.fn(async () => diskState.state),
  pathExistsOnDisk: vi.fn(async () => true),
  readFileFromDisk: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));

const getStirlingFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile, updateFileMetadata: vi.fn(async () => true) },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

const dirtyLinkedStub = (): StirlingFileStub =>
  ({
    id: "f1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 10,
    lastModified: 0,
    localFilePath: "C:/docs/report.pdf",
    // Baseline differs from the disk state above, so the file has moved on...
    diskSyncedSize: 10,
    diskSyncedModifiedMs: 1_000,
    // ...and unsaved edits mean we keep ours: a conflict.
    isDirty: true,
  }) as StirlingFileStub;

beforeEach(() => {
  getStirlingFile.mockImplementation(
    async () =>
      new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" }),
  );
});

async function hydrate() {
  vi.resetModules();
  const { addStirlingFileStubs } =
    await import("@app/contexts/file/fileActions");

  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const stateRef = { current: state };
  const filesRef = { current: new Map<FileId, File>() };
  const updates: Partial<StirlingFileStub>[] = [];

  const lifecycleManager = {
    // Mirrors the real guard: an update for a file absent from filesRef is
    // dropped. Without this the test would pass against the broken ordering.
    updateStirlingFileStub: (
      fileId: FileId,
      patch: Partial<StirlingFileStub>,
    ) => {
      if (!filesRef.current.has(fileId)) return;
      updates.push(patch);
    },
    removeFiles: () => {},
    trackBlobUrl: () => {},
  };

  await addStirlingFileStubs(
    [dirtyLinkedStub()],
    {},
    stateRef,
    filesRef,
    () => {},
    lifecycleManager as never,
  );
  return updates;
}

describe("a disk conflict is recorded on the stub, not just toasted", () => {
  test("diskConflictAt survives the filesRef ordering guard", async () => {
    const updates = await hydrate();
    await vi.waitFor(() =>
      expect(updates.some((u) => typeof u.diskConflictAt === "number")).toBe(
        true,
      ),
    );
  });
});
