import { describe, expect, test, vi } from "vitest";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * A clicked file is only visible once hydration DISPATCHES: the workbench reads
 * files out of a ref, so `activeFiles` stays empty until then. Parsing must not
 * gate that - a PDF engine that stalls used to leave the workbench on its empty
 * state with the row showing as open, and clicks doing nothing.
 */

const getStirlingFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile },
}));
/** The stall under test: the page parse never settles. */
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));

const stub = (id: string): StirlingFileStub =>
  ({
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 10,
    lastModified: 0,
  }) as StirlingFileStub;

async function harness(ids: string[]) {
  vi.resetModules();
  getStirlingFile.mockImplementation(
    async (id: FileId) =>
      new File(["%PDF-1.7"], `${id}.pdf`, { type: "application/pdf" }),
  );
  const { addStirlingFileStubs } =
    await import("@app/contexts/file/fileActions");

  const stubs = ids.map(stub);
  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const stateRef = { current: state };
  const filesRef = { current: new Map<FileId, File>() };
  const published: FileId[] = [];
  const lifecycleManager = {
    updateStirlingFileStub: (fileId: FileId) => published.push(fileId),
    removeFiles: () => {},
    trackBlobUrl: () => {},
  };

  await addStirlingFileStubs(
    stubs,
    {},
    stateRef,
    filesRef,
    () => {},
    lifecycleManager as never,
  );
  return { filesRef, published };
}

describe("workbench hydration — a stalled parse can't hide the file", () => {
  test("publishes every file's bytes while their parses hang", async () => {
    // Three, because the parse queue only runs two at a time: the third proves
    // loading isn't queued behind parses that never finish.
    const { filesRef, published } = await harness(["a", "b", "c"]);

    await vi.waitFor(() => expect(published).toHaveLength(3));
    expect([...filesRef.current.keys()]).toEqual(["a", "b", "c"]);
  });
});
