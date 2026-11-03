// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FileContextState } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";
import { createNewStirlingFileStub } from "@editor/types/fileContext";
import { expectConsole } from "@editor/tests/failOnConsole";

// A bulk import the user is not looking at (the onboarding Downloads sweep) must not
// parse every PDF a second time for a thumbnail, nor keep hundreds of Files in memory
// for the rest of the session. skipMetadataHydration is the option that promises both.

const storeStirlingFile = vi.hoisted(() => vi.fn());
const getStirlingFile = vi.hoisted(() => vi.fn());
const generateThumbnailPairWithMetadata = vi.hoisted(() => vi.fn());
const isPDFEncrypted = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { storeStirlingFile, getStirlingFile, updateThumbnail: vi.fn() },
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata,
  generateThumbnailForFile: vi.fn(),
}));
vi.mock("@editor/services/fileAnalyzer", () => ({
  FileAnalyzer: { isPDFEncrypted },
}));

import {
  addFiles,
  addStirlingFileStubs,
} from "@editor/contexts/file/fileActions";

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
  getStirlingFile.mockReset();
  generateThumbnailPairWithMetadata.mockReset();
  isPDFEncrypted.mockReset().mockResolvedValue(false);
});

describe("addFiles with skipMetadataHydration", () => {
  test.each(["import", "library"])(
    "deduplicates against a concurrent %s before React commits",
    async (source) => {
      const h = harness();
      const duplicate = pdf("duplicate.pdf");
      let finish!: (encrypted: boolean) => void;
      isPDFEncrypted.mockResolvedValueOnce(false).mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      );
      const importFiles = (files: File[]) =>
        addFiles(
          { files, skipMetadataHydration: true, skipUploadTracking: true },
          h.stateRef,
          h.filesRef,
          h.dispatch,
          h.lifecycleManager as never,
          true,
        );
      const importing = importFiles([pdf("first.pdf"), duplicate]);
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      try {
        if (source === "import") await importFiles([duplicate]);
        else {
          const stub = createNewStirlingFileStub(
            duplicate,
            "library-id" as FileId,
          );
          stub.processedFile = { pages: [], isEncrypted: true };
          getStirlingFile.mockResolvedValue(duplicate);
          await addStirlingFileStubs(
            [stub],
            {},
            h.stateRef,
            h.filesRef,
            h.dispatch,
            h.lifecycleManager as never,
          );
        }
        expect(h.stateRef.current.files.ids).toEqual([]);
      } finally {
        finish(false);
        await importing;
      }
      expect(
        [...h.filesRef.current.values()].filter(
          (file) => file.name === duplicate.name,
        ),
      ).toHaveLength(1);
    },
  );

  test.each([true, false])(
    "waits for a pending library restore (success: %s) before deduplicating",
    async (succeeds) => {
      const h = harness();
      const duplicate = pdf("duplicate.pdf");
      const stub = createNewStirlingFileStub(duplicate, "library-id" as FileId);
      stub.processedFile = { pages: [], isEncrypted: true };
      let finish!: (file: File | undefined) => void;
      getStirlingFile.mockImplementationOnce(
        () =>
          new Promise<File | undefined>((resolve) => {
            finish = resolve;
          }),
      );
      const restoring = addStirlingFileStubs(
        [stub],
        {},
        h.stateRef,
        h.filesRef,
        h.dispatch,
        h.lifecycleManager as never,
      );
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      const importing = addFiles(
        {
          files: [duplicate],
          skipMetadataHydration: true,
          skipUploadTracking: true,
        },
        h.stateRef,
        h.filesRef,
        h.dispatch,
        h.lifecycleManager as never,
        true,
      );
      try {
        await vi.waitFor(() =>
          expect(isPDFEncrypted).toHaveBeenCalledWith(duplicate),
        );
        await addFiles(
          {
            files: [pdf("other.pdf")],
            skipMetadataHydration: true,
            skipUploadTracking: true,
          },
          h.stateRef,
          h.filesRef,
          h.dispatch,
          h.lifecycleManager as never,
          true,
        );
        expect(
          [...h.filesRef.current.values()].map((file) => file.name),
        ).toEqual(["other.pdf"]);
      } finally {
        if (!succeeds)
          expectConsole.error(/No readable data for duplicate.pdf/);
        finish(succeeds ? duplicate : undefined);
        await restoring;
      }
      expect(await importing).toHaveLength(succeeds ? 0 : 1);
      expect(
        [...h.filesRef.current.values()].filter(
          (file) => file.name === duplicate.name,
        ),
      ).toHaveLength(1);
    },
  );

  test("still permits explicitly requested duplicates", async () => {
    const h = harness();
    const duplicate = pdf("duplicate.pdf");
    await addFiles(
      {
        files: [duplicate, duplicate],
        allowDuplicates: true,
        skipMetadataHydration: true,
        skipUploadTracking: true,
      },
      h.stateRef,
      h.filesRef,
      h.dispatch,
      h.lifecycleManager as never,
      true,
    );
    expect(h.filesRef.current.size).toBe(2);
  });

  test("publishes the first rows before the last file's admission read finishes", async () => {
    let finish!: (encrypted: boolean) => void;
    isPDFEncrypted.mockImplementation((file: File) =>
      file.name === "slow.pdf"
        ? new Promise<boolean>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(false),
    );
    const h = harness();
    const importing = addFiles(
      {
        files: [pdf("first.pdf"), pdf("slow.pdf")],
        skipMetadataHydration: true,
        skipUploadTracking: true,
      },
      h.stateRef,
      h.filesRef,
      h.dispatch,
      h.lifecycleManager as never,
      true,
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    try {
      expect(h.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_FILES",
          payload: {
            stirlingFileStubs: [expect.objectContaining({ name: "first.pdf" })],
          },
        }),
      );
    } finally {
      finish(false);
      await importing;
    }
  });
  test("a pending permission inspection does not block another import", async () => {
    let finishInspection!: (encrypted: boolean) => void;
    isPDFEncrypted.mockImplementation((file: File) =>
      file.name === "slow.pdf"
        ? new Promise<boolean>((resolve) => {
            finishInspection = resolve;
          })
        : Promise.resolve(false),
    );
    const h = harness();
    const importFile = (name: string) =>
      addFiles(
        {
          files: [pdf(name)],
          skipMetadataHydration: true,
          skipUploadTracking: true,
        },
        h.stateRef,
        h.filesRef,
        h.dispatch,
        h.lifecycleManager as never,
        true,
      );
    const slow = importFile("slow.pdf");
    await vi.waitFor(() => expect(finishInspection).toBeTypeOf("function"));
    try {
      const fast = importFile("fast.pdf");
      await vi.waitFor(() => expect(h.filesRef.current.size).toBe(1));
      await fast;
      expect([...h.filesRef.current.values()][0].name).toBe("fast.pdf");
    } finally {
      finishInspection(false);
      await slow;
    }
    expect(h.filesRef.current.size).toBe(2);
  });

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
