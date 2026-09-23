import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FileContextState } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// A bulk import the user is not looking at (the onboarding Downloads sweep) must not
// parse every PDF a second time for a thumbnail, nor keep hundreds of Files in memory
// for the rest of the session. skipMetadataHydration is the option that promises both.

const storeStirlingFile = vi.hoisted(() => vi.fn());
const generateThumbnailPairWithMetadata = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { storeStirlingFile, updateThumbnail: vi.fn() },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata,
  generateThumbnailForFile: vi.fn(),
}));
vi.mock("@app/services/fileAnalyzer", () => ({
  FileAnalyzer: { isPDFUserPasswordProtected: async () => false },
}));

import { addFiles } from "@app/contexts/file/fileActions";

function harness() {
  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const filesRef = { current: new Map<FileId, File>() };
  const dispatch = vi.fn();
  const lifecycleManager = {
    updateStirlingFileStub: vi.fn(),
    removeFiles: vi.fn(),
    trackBlobUrl: vi.fn(),
  };
  return { stateRef: { current: state }, filesRef, dispatch, lifecycleManager };
}

const pdf = (name: string) =>
  new File(["%PDF-1.7"], name, { type: "application/pdf" });

beforeEach(() => {
  storeStirlingFile.mockReset().mockResolvedValue(undefined);
  generateThumbnailPairWithMetadata.mockReset();
});

describe("addFiles with skipMetadataHydration", () => {
  test("writes the locked stub, parses nothing, and lets go of the bytes", async () => {
    const h = harness();
    await addFiles(
      {
        files: [pdf("a.pdf"), pdf("b.pdf")],
        skipWorkspaceDispatch: true,
        skipMetadataHydration: true,
        skipUploadTracking: true,
        presetClassification: { labels: ["invoice"], confidence: "low" },
      },
      h.stateRef,
      h.filesRef,
      h.dispatch,
      h.lifecycleManager as never,
      true,
    );

    expect(storeStirlingFile).toHaveBeenCalledTimes(2);
    const [, stub] = storeStirlingFile.mock.calls[0];
    expect(stub).toMatchObject({
      classificationLabels: ["invoice"],
      classificationLocked: true,
    });
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.filesRef.current.size).toBe(0);
    // No hydration was queued, so nothing can start parsing later either.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(generateThumbnailPairWithMetadata).not.toHaveBeenCalled();
  });

  test("an ordinary add still hydrates and keeps the File for the workbench", async () => {
    generateThumbnailPairWithMetadata.mockReturnValue(new Promise(() => {}));
    const h = harness();
    await addFiles(
      { files: [pdf("a.pdf")], skipUploadTracking: true },
      h.stateRef,
      h.filesRef,
      h.dispatch,
      h.lifecycleManager as never,
      true,
    );

    expect(h.dispatch).toHaveBeenCalled();
    expect(h.filesRef.current.size).toBe(1);
    await vi.waitFor(() =>
      expect(generateThumbnailPairWithMetadata).toHaveBeenCalledTimes(1),
    );
  });

  test("keeps the bytes when the file is dispatched to the workbench, hydration or not", async () => {
    const h = harness();
    await addFiles(
      {
        files: [pdf("a.pdf")],
        skipMetadataHydration: true,
        skipUploadTracking: true,
      },
      h.stateRef,
      h.filesRef,
      h.dispatch,
      h.lifecycleManager as never,
      true,
    );
    // In state, so the workbench will read it: release only applies off-workspace.
    expect(h.filesRef.current.size).toBe(1);
  });
});
