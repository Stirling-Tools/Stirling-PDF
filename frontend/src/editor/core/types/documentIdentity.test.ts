import { describe, it, expect } from "vitest";
import {
  createStirlingFile,
  getFormFillFileId,
  documentBytesReplaced,
} from "@app/types/fileContext";
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

describe("documentBytesReplaced", () => {
  const identity = (id: string, key: string) => ({ id: id as FileId, key });

  it("reports a disk reload that swapped the bytes under one id", () => {
    expect(
      documentBytesReplaced(identity(ID, "before"), identity(ID, "after")),
    ).toBe(true);
  });

  it("ignores a switch to a different file", () => {
    expect(
      documentBytesReplaced(
        identity(ID, "before"),
        identity("file-2", "after"),
      ),
    ).toBe(false);
  });

  it("ignores a re-render that changed nothing", () => {
    expect(
      documentBytesReplaced(identity(ID, "same"), identity(ID, "same")),
    ).toBe(false);
  });

  it("ignores a first sighting and an emptied viewer", () => {
    expect(documentBytesReplaced(null, identity(ID, "after"))).toBe(false);
    expect(documentBytesReplaced(identity(ID, "before"), null)).toBe(false);
  });
});
