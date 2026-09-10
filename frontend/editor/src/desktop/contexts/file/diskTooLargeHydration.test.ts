import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// Opening a linked file too large to re-read serves a copy we know is stale, so
// the open path has to say so exactly as the watcher does.

const AUTO_RELOAD_MAX_BYTES = 512 * 1024 * 1024;

const getDiskFileState = vi.hoisted(() => vi.fn());
const readFileFromDisk = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk,
}));

const getStirlingFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile,
    deleteStirlingFile: vi.fn(async () => undefined),
    updateFileMetadata: vi.fn(async () => true),
  },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));

const alert = vi.hoisted(() => vi.fn());
vi.mock("@app/components/toast", () => ({ alert }));

const PATH = "C:/docs/huge.pdf";
const STALE_BYTES = "%PDF-old";

const linkedStub = (): StirlingFileStub =>
  ({
    id: "f1" as FileId,
    name: "huge.pdf",
    type: "application/pdf",
    size: STALE_BYTES.length,
    lastModified: 0,
    isLeaf: true,
    versionNumber: 1,
    localFilePath: PATH,
    diskSyncedSize: STALE_BYTES.length,
    diskSyncedModifiedMs: 1_000,
  }) as StirlingFileStub;

beforeEach(() => {
  vi.clearAllMocks();
  getStirlingFile.mockImplementation(
    async () =>
      new File([STALE_BYTES], "huge.pdf", { type: "application/pdf" }),
  );
});

async function hydrate(diskSize: number) {
  getDiskFileState.mockImplementation(async () => ({
    availability: "present" as const,
    size: diskSize,
    modifiedMs: 2_000,
  }));
  readFileFromDisk.mockImplementation(
    async () => new TextEncoder().encode("%PDF-new") as unknown as null,
  );

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
    [linkedStub()],
    {},
    stateRef,
    filesRef,
    () => {},
    lifecycleManager as never,
  );
  return { updates, filesRef };
}

describe("opening a linked file that grew past the auto-reload ceiling", () => {
  test("says the file changed instead of serving stale bytes silently", async () => {
    const { filesRef } = await hydrate(AUTO_RELOAD_MAX_BYTES + 1);

    await vi.waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "File changed on disk",
          isPersistentPopup: true,
          buttonText: "Use disk version",
        }),
      ),
    );
    // The point of the ceiling: the stored copy is still what opens.
    expect(readFileFromDisk).not.toHaveBeenCalled();
    expect(filesRef.current.get("f1" as FileId)?.size).toBe(STALE_BYTES.length);
  });

  test("stays silent below the ceiling, where the change is just read", async () => {
    await hydrate(8);

    await vi.waitFor(() => expect(readFileFromDisk).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "File changed on disk" }),
    );
  });
});
