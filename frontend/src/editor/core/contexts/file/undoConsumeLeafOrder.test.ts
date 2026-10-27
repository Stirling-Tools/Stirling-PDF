import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectConsole } from "@editor/tests/failOnConsole";
import type { FileId, StirlingFileStub } from "@editor/types/fileContext";

const updateFileMetadata = vi.fn();

vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata },
}));

const { undoConsumeFiles } = await import("@editor/contexts/file/fileActions");

const input = {
  id: "input" as FileId,
  name: "input.pdf",
  isLeaf: false,
} as StirlingFileStub;
const outputId = "output" as FileId;
let restoreSucceeds = true;

const runUndo = async () => {
  const calls: string[] = [];
  updateFileMetadata.mockImplementation(async (id: FileId) => {
    calls.push(`restore:${id}`);
    return restoreSucceeds;
  });
  const indexedDB = {
    saveFile: vi.fn(),
    deleteFile: vi.fn(async (id: FileId) => {
      calls.push(`delete:${id}`);
    }),
    bumpRevision: vi.fn(),
  };
  await undoConsumeFiles(
    [new File(["x"], input.name)],
    [input],
    [outputId],
    { current: new Map<FileId, File>() },
    vi.fn(),
    indexedDB,
  );
  return { calls, indexedDB };
};

describe("undoConsumeFiles — a chain always keeps a leaf", () => {
  beforeEach(() => {
    updateFileMetadata.mockReset();
    restoreSucceeds = true;
  });

  it("restores the input as a leaf before deleting the output", async () => {
    const { calls } = await runUndo();

    expect(calls).toEqual(["restore:input", "delete:output"]);
  });

  it("keeps the output when the input could not be restored", async () => {
    expectConsole.warn(/Keeping outputs in IDB/);
    restoreSucceeds = false;

    const { calls, indexedDB } = await runUndo();

    expect(calls).toEqual(["restore:input"]);
    expect(indexedDB.deleteFile).not.toHaveBeenCalled();
    expect(indexedDB.bumpRevision).toHaveBeenCalled();
  });
});
