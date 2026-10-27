import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileId, StirlingFileStub } from "@editor/types/fileContext";

const updateFileMetadata = vi.fn();
const getStirlingFileStub = vi.fn();

vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata, getStirlingFileStub },
}));

const { undoConsumeFiles } = await import("@editor/contexts/file/fileActions");

const input = {
  id: "input" as FileId,
  name: "input.pdf",
  isLeaf: false,
} as StirlingFileStub;
const outputId = "output" as FileId;
const outputFile = new File(["out"], "output.pdf");

const runUndo = async ({
  restoreSucceeds,
  inputStored = true,
}: {
  restoreSucceeds: boolean;
  inputStored?: boolean;
}) => {
  const calls: string[] = [];
  updateFileMetadata.mockImplementation(async (id: FileId) => {
    calls.push(`restore:${id}`);
    return restoreSucceeds;
  });
  getStirlingFileStub.mockResolvedValue(inputStored ? input : null);
  const indexedDB = {
    saveFile: vi.fn(),
    deleteFile: vi.fn(async (id: FileId) => {
      calls.push(`delete:${id}`);
    }),
    bumpRevision: vi.fn(),
  };
  const filesRef = { current: new Map<FileId, File>([[outputId, outputFile]]) };
  const dispatch = vi.fn();
  const undone = undoConsumeFiles(
    [new File(["x"], input.name)],
    [input],
    [outputId],
    filesRef,
    dispatch,
    indexedDB,
  );
  return { undone, calls, indexedDB, filesRef, dispatch };
};

describe("undoConsumeFiles — a chain always keeps a leaf", () => {
  beforeEach(() => {
    updateFileMetadata.mockReset();
    getStirlingFileStub.mockReset();
  });

  it("restores the input as a leaf before deleting the output", async () => {
    const { undone, calls, dispatch } = await runUndo({
      restoreSucceeds: true,
    });
    await undone;

    expect(calls).toEqual(["restore:input", "delete:output"]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("rejects without touching the workspace when a stored input cannot be restored", async () => {
    const { undone, calls, filesRef, dispatch } = await runUndo({
      restoreSucceeds: false,
    });

    await expect(undone).rejects.toThrow(/Could not restore/);
    expect(calls).toEqual(["restore:input"]);
    expect(dispatch).not.toHaveBeenCalled();
    expect([...filesRef.current.keys()]).toEqual([outputId]);
  });

  it("proceeds when the input was never stored", async () => {
    const { undone, calls, dispatch } = await runUndo({
      restoreSucceeds: false,
      inputStored: false,
    });
    await undone;

    expect(calls).toEqual(["restore:input", "delete:output"]);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
