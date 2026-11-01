// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  FileContextAction,
  FileContextState,
} from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";
import { isDamageCheckPending } from "@editor/services/pendingDamageChecks";

// Damage is only known once hydration has parsed a file, so the check must be open before the
// upload is published (or a policy could read the file first) and must close however hydration ends.

const generateThumbnailPairWithMetadata = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: {
    storeStirlingFile: vi.fn().mockResolvedValue(undefined),
    updateThumbnail: vi.fn(),
  },
}));
vi.mock("@editor/utils/thumbnailUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@editor/utils/thumbnailUtils")>()),
  generateThumbnailPairWithMetadata,
  generateThumbnailForFile: vi.fn(),
}));
vi.mock("@editor/services/fileAnalyzer", () => ({
  FileAnalyzer: { isPDFEncrypted: vi.fn().mockResolvedValue(false) },
}));

import { addFiles } from "@editor/contexts/file/fileActions";
import { LARGE_PDF_PARSE_LIMIT } from "@editor/utils/thumbnailUtils";

function harness() {
  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const pendingAtPublish: boolean[] = [];
  const dispatch = vi.fn((action: FileContextAction) => {
    if (action.type === "ADD_FILES")
      for (const stub of action.payload.stirlingFileStubs)
        pendingAtPublish.push(isDamageCheckPending(stub.id));
  });
  const lifecycleManager = {
    updateStirlingFileStub: vi.fn(),
    removeFiles: vi.fn(),
    trackBlobUrl: vi.fn(),
  };
  return {
    stateRef: { current: state },
    filesRef: { current: new Map<FileId, File>() },
    dispatch,
    lifecycleManager,
    pendingAtPublish,
  };
}

const run = (h: ReturnType<typeof harness>, file: File) =>
  addFiles(
    { files: [file], skipUploadTracking: true },
    h.stateRef,
    h.filesRef,
    h.dispatch,
    h.lifecycleManager as never,
    false,
  );

const pdf = (name = "broken.pdf") =>
  new File(["%PXF-1.7"], name, { type: "application/pdf" });

beforeEach(() => generateThumbnailPairWithMetadata.mockReset());

describe("damage checks during import", () => {
  test("open before publishing and record the damage when hydration settles", async () => {
    generateThumbnailPairWithMetadata.mockResolvedValue({
      unrotated: { thumbnail: "", pageCount: 0, isDamaged: true },
      rotated: { thumbnail: "", pageCount: 0, isDamaged: true },
    });
    const h = harness();
    const [added] = await run(h, pdf());

    expect(h.pendingAtPublish).toEqual([true]);
    await vi.waitFor(() =>
      expect(isDamageCheckPending(added.fileId)).toBe(false),
    );
    expect(h.lifecycleManager.updateStirlingFileStub).toHaveBeenCalledWith(
      added.fileId,
      expect.objectContaining({
        processedFile: expect.objectContaining({ isDamaged: true }),
      }),
      h.stateRef,
    );
  });

  test("settle when hydration ends without metadata", async () => {
    // A non-damage failure (timeout, memory) resolves with no thumbnail and no damage flag.
    generateThumbnailPairWithMetadata.mockResolvedValue({
      unrotated: { thumbnail: "", pageCount: 0, isDamaged: false },
      rotated: { thumbnail: "", pageCount: 0, isDamaged: false },
    });
    const h = harness();
    const [added] = await run(h, pdf("fails.pdf"));
    await vi.waitFor(() =>
      expect(isDamageCheckPending(added.fileId)).toBe(false),
    );
    expect(h.lifecycleManager.updateStirlingFileStub).not.toHaveBeenCalled();
  });

  test("never hold a large file, whose prefix parse cannot prove damage", async () => {
    const h = harness();
    const large = pdf("large.pdf");
    Object.defineProperty(large, "size", { value: LARGE_PDF_PARSE_LIMIT });
    await run(h, large);
    expect(h.pendingAtPublish).toEqual([false]);
  });
});
