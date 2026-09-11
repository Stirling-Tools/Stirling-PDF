import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// Version History hands its records straight to addStirlingFileStubs, and a
// superseded version still carries the path its child was saved over. Disk
// therefore reads as changed while these bytes are the only copy that version
// has, so reloading it here destroys the journey the modal exists to show.

const getDiskFileState = vi.hoisted(() => vi.fn());
const readFileFromDisk = vi.hoisted(() => vi.fn());
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk,
}));

const getStirlingFile = vi.hoisted(() => vi.fn());
const updateFileMetadata = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile,
    deleteStirlingFile: vi.fn(async () => undefined),
    updateFileMetadata,
  },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));

const alert = vi.hoisted(() => vi.fn());
vi.mock("@app/components/toast", () => ({ alert }));

const PATH = "C:/docs/report.pdf";
const V1_BYTES = "%PDF-v1";
const SAVED_CHILD_BYTES = "%PDF-v2-on-disk";

const versionStub = (isLeaf: boolean): StirlingFileStub =>
  ({
    id: "v1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: V1_BYTES.length,
    lastModified: 1_000,
    isLeaf,
    originalFileId: "v1",
    versionNumber: 1,
    localFilePath: PATH,
    // Stamped when v1 was the live file, so it predates the child's write.
    diskSyncedSize: V1_BYTES.length,
    diskSyncedModifiedMs: 1_000,
  }) as StirlingFileStub;

beforeEach(() => {
  vi.clearAllMocks();
  getStirlingFile.mockImplementation(
    async () => new File([V1_BYTES], "report.pdf", { type: "application/pdf" }),
  );
  getDiskFileState.mockImplementation(async () => ({
    availability: "present" as const,
    size: SAVED_CHILD_BYTES.length,
    modifiedMs: 9_000,
  }));
  readFileFromDisk.mockImplementation(
    async () => new TextEncoder().encode(SAVED_CHILD_BYTES).buffer,
  );
});

async function openFromHistory(isLeaf: boolean) {
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
    [versionStub(isLeaf)],
    {},
    stateRef,
    filesRef,
    () => {},
    lifecycleManager as never,
  );
  return { updates, filesRef };
}

describe("opening an earlier version from Version History", () => {
  test("opens that version's own bytes, not what is on the path today", async () => {
    const { filesRef } = await openFromHistory(false);

    await vi.waitFor(() =>
      expect(filesRef.current.get("v1" as FileId)).toBeDefined(),
    );
    // The two versions differ in length, so size alone says which one opened.
    expect(filesRef.current.get("v1" as FileId)?.size).toBe(V1_BYTES.length);
  });

  test("never writes today's disk bytes over the stored version", async () => {
    const { updates } = await openFromHistory(false);

    // The marker patch is the last thing hydration does on this branch, so the
    // fire-and-forget persist would already have been queued behind it.
    await vi.waitFor(() => expect(updates.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateFileMetadata).not.toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ data: expect.anything() }),
    );
    expect(readFileFromDisk).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated from disk" }),
    );
  });

  test("still reloads the leaf, which does answer for that path", async () => {
    const { filesRef } = await openFromHistory(true);

    await vi.waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Updated from disk" }),
      ),
    );
    expect(filesRef.current.get("v1" as FileId)?.size).toBe(
      SAVED_CHILD_BYTES.length,
    );
  });
});
