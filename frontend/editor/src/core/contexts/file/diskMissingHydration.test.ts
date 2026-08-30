import { describe, expect, test, vi, beforeEach } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId, ToolOperation } from "@app/types/file";

// A vanished original must not take unsaved work or version history with it:
// only an unedited v1 passthrough holds nothing the disk file did not.

vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState: vi.fn(async () => ({
    exists: false,
    size: 0,
    modifiedMs: 0,
  })),
  pathExistsOnDisk: vi.fn(async () => false),
  readFileFromDisk: vi.fn(async () => null),
}));

const getStirlingFile = vi.hoisted(() => vi.fn());
const deleteStirlingFile = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile,
    deleteStirlingFile,
    updateFileMetadata: vi.fn(async () => true),
  },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

const LOST_PATH = "C:/docs/report.pdf";

const linkedStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub =>
  ({
    id: "f1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 10,
    lastModified: 0,
    isLeaf: true,
    versionNumber: 1,
    localFilePath: LOST_PATH,
    diskSyncedSize: 10,
    diskSyncedModifiedMs: 1_000,
    ...overrides,
  }) as StirlingFileStub;

beforeEach(() => {
  vi.clearAllMocks();
  getStirlingFile.mockImplementation(
    async () =>
      new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" }),
  );
});

async function hydrate(stub: StirlingFileStub) {
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
  const removed: FileId[] = [];

  const lifecycleManager = {
    // Mirrors the real guard: an update for a file absent from filesRef is
    // dropped, so a detach recorded too early would be lost.
    updateStirlingFileStub: (
      fileId: FileId,
      patch: Partial<StirlingFileStub>,
    ) => {
      if (!filesRef.current.has(fileId)) return;
      updates.push(patch);
    },
    removeFiles: (fileIds: FileId[]) => removed.push(...fileIds),
    trackBlobUrl: () => {},
  };

  await addStirlingFileStubs(
    [stub],
    {},
    stateRef,
    filesRef,
    () => {},
    lifecycleManager as never,
  );
  return { updates, removed, filesRef };
}

const operation: ToolOperation = { toolId: "split", timestamp: 1 };

// The link is cut, but the old path is kept so the badge can still say where
// the original was.
const detachUpdate = () =>
  expect.objectContaining({
    localFilePath: undefined,
    orphanedFilePath: LOST_PATH,
  });

describe("a linked file whose original vanished", () => {
  test("detaches an edited version instead of destroying its only copy", async () => {
    const { updates, removed, filesRef } = await hydrate(
      linkedStub({
        isDirty: true,
        versionNumber: 2,
        toolHistory: [operation],
      }),
    );

    await vi.waitFor(() => expect(updates).toContainEqual(detachUpdate()));
    expect(removed).toHaveLength(0);
    expect(deleteStirlingFile).not.toHaveBeenCalled();
    // Still served from the stored copy, so the document stays on screen.
    expect(filesRef.current.has("f1" as FileId)).toBe(true);
  });

  test("still deletes an unedited passthrough, which holds nothing extra", async () => {
    expectConsole.warn(/no longer exists at/);
    const { removed } = await hydrate(linkedStub());

    await vi.waitFor(() => expect(removed).toContain("f1" as FileId));
    await vi.waitFor(() =>
      expect(deleteStirlingFile).toHaveBeenCalledWith("f1"),
    );
  });

  test("detaches a non-leaf root, which version history still needs", async () => {
    const { updates, removed } = await hydrate(linkedStub({ isLeaf: false }));

    await vi.waitFor(() => expect(updates).toContainEqual(detachUpdate()));
    expect(removed).toHaveLength(0);
    expect(deleteStirlingFile).not.toHaveBeenCalled();
  });
});
