import { describe, it, expect } from "vitest";
import { createStirlingFile, getFormFillFileId } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const ID = "file-1" as FileId;

function diskFile(bytes: number[], modifiedMs: number): File {
  return new File([new Uint8Array(bytes)], "report.pdf", {
    type: "application/pdf",
    lastModified: modifiedMs,
  });
}

describe("getFormFillFileId", () => {
  it("turns over when a disk reload swaps the bytes under one id", () => {
    // The viewer keys its mount, its blob URL and its form state on this. An
    // id-only key left the previous document on screen under "Updated from disk".
    const before = createStirlingFile(diskFile([1, 2, 3], 5000), ID);
    const after = createStirlingFile(diskFile([1, 2, 3, 4], 9000), ID);

    expect(after.fileId).toBe(before.fileId);
    expect(getFormFillFileId(after)).not.toBe(getFormFillFileId(before));
  });

  it("is stable while the same bytes are re-wrapped each render", () => {
    const first = createStirlingFile(diskFile([1, 2, 3], 5000), ID);
    const second = createStirlingFile(diskFile([1, 2, 3], 5000), ID);
    expect(getFormFillFileId(second)).toBe(getFormFillFileId(first));
  });

  it("still separates two files that share content", () => {
    const mine = createStirlingFile(diskFile([1, 2, 3], 5000), ID);
    const theirs = createStirlingFile(
      diskFile([1, 2, 3], 5000),
      "file-2" as FileId,
    );
    expect(getFormFillFileId(theirs)).not.toBe(getFormFillFileId(mine));
  });
});
