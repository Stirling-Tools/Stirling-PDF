import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileId, StirlingFileStub } from "@app/types/fileContext";

const updateFileMetadata = vi.fn().mockResolvedValue(true);
const markFileAsLeaf = vi.fn().mockResolvedValue(true);

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata, markFileAsLeaf },
}));

const { undoConsumeFiles } = await import("@app/contexts/file/fileActions");

const stub = (id: string, localFilePath?: string) =>
  ({
    id: id as FileId,
    name: `${id}.pdf`,
    isLeaf: false,
    ...(localFilePath ? { localFilePath } : {}),
  }) as StirlingFileStub;

const runUndo = async (stubs: StirlingFileStub[]) => {
  const filesRef = { current: new Map<FileId, File>() };
  const files = stubs.map((s) => new File(["x"], s.name));
  await undoConsumeFiles(files, stubs, [], filesRef, vi.fn(), null);
};

describe("undoConsumeFiles persistence", () => {
  beforeEach(() => {
    updateFileMetadata.mockClear();
    markFileAsLeaf.mockClear();
  });

  it("persists the dirty mark for a disk-linked file, not just isLeaf", async () => {
    await runUndo([stub("A", "/tmp/a.pdf")]);

    expect(updateFileMetadata).toHaveBeenCalledWith("A", {
      isLeaf: true,
      isDirty: true,
    });
  });

  it("leaves a file with no disk link clean", async () => {
    await runUndo([stub("B")]);

    expect(updateFileMetadata).toHaveBeenCalledWith("B", { isLeaf: true });
  });
});
