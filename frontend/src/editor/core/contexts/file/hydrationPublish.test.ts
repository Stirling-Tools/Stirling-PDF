import { describe, expect, test, vi } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

/**
 * A clicked file is only visible once hydration DISPATCHES: the workbench reads
 * files out of a ref, so `activeFiles` stays empty until then. Parsing must not
 * gate that - a PDF engine that stalls used to leave the workbench on its empty
 * state with the row showing as open, and clicks doing nothing.
 */

const getStirlingFile = vi.hoisted(() => vi.fn());
const generateThumbnailPairWithMetadata = vi.hoisted(() =>
  vi.fn(() => new Promise(() => {})),
);
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { getStirlingFile },
}));
/** The stall under test: the page parse never settles. */
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata,
}));

const stub = (id: string): StirlingFileStub =>
  ({
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 10,
    lastModified: 0,
  }) as StirlingFileStub;

async function harness(ids: string[], encrypted = false) {
  vi.resetModules();
  generateThumbnailPairWithMetadata.mockClear();
  getStirlingFile.mockImplementation(
    async (id: FileId) =>
      new File(["%PDF-1.7"], `${id}.pdf`, { type: "application/pdf" }),
  );
  const { addStirlingFileStubs } =
    await import("@editor/contexts/file/fileActions");

  const stubs = ids.map(stub);
  if (encrypted)
    for (const stub of stubs)
      stub.processedFile = {
        pages: [],
        isEncrypted: true,
        requiresOpeningPassword: true,
      };
  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const stateRef = { current: state };
  const filesRef = { current: new Map<FileId, File>() };
  const published: FileId[] = [];
  const updateStirlingFileStub = vi.fn();
  const lifecycleManager = {
    updateStirlingFileStub,
    removeFiles: () => {},
    trackBlobUrl: () => {},
  };

  await addStirlingFileStubs(
    stubs,
    {},
    stateRef,
    filesRef,
    (action) => {
      if (action.type === "ADD_FILES")
        published.push(
          ...action.payload.stirlingFileStubs.map((stub) => stub.id),
        );
    },
    lifecycleManager as never,
  );
  return { filesRef, published, updateStirlingFileStub };
}

describe("workbench hydration — a stalled parse can't hide the file", () => {
  test("does not parse locked library files for thumbnails before authentication", async () => {
    const { published } = await harness(
      ["locked-a", "locked-b", "locked-c"],
      true,
    );
    expect(published).toHaveLength(3);
    expect(generateThumbnailPairWithMetadata).not.toHaveBeenCalled();
  });
  test("publishes every file's bytes while their parses hang", async () => {
    // Three, because the parse queue only runs two at a time: the third proves
    // loading isn't queued behind parses that never finish.
    const { filesRef, published, updateStirlingFileStub } = await harness([
      "a",
      "b",
      "c",
    ]);

    await vi.waitFor(() => expect(published).toHaveLength(3));
    expect([...filesRef.current.keys()]).toEqual(["a", "b", "c"]);
    expect(updateStirlingFileStub).not.toHaveBeenCalled();
  });
});
