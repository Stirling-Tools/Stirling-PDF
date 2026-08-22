import { describe, it, expect } from "vitest";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";

function mkSlot(): ParagraphLineSlot {
  return {
    startChar: 0,
    endChar: 5,
    baselineY: 100,
    matrixE: 10,
    containerPtr: 0,
    fontId: "pdf:1:Helvetica",
    fontSize: 12,
    fontSubset: false,
    mergedFromPtrs: [11, 22],
    mergedFromTexts: ["He", "llo"],
    mergedFromBounds: [
      { x: 0, right: 5 },
      { x: 5, right: 10 },
    ],
    mergedFromCharStarts: [0, 2],
  };
}

describe("cloneParagraphLineSlot", () => {
  it("produces an equal but independent copy", () => {
    const src = mkSlot();
    const copy = cloneParagraphLineSlot(src);
    expect(copy).toEqual(src);
    // Nested arrays/objects must be fresh references, not shared.
    expect(copy.mergedFromPtrs).not.toBe(src.mergedFromPtrs);
    expect(copy.mergedFromTexts).not.toBe(src.mergedFromTexts);
    expect(copy.mergedFromBounds).not.toBe(src.mergedFromBounds);
    expect(copy.mergedFromBounds[0]).not.toBe(src.mergedFromBounds[0]);
    expect(copy.mergedFromCharStarts).not.toBe(src.mergedFromCharStarts);
  });

  it("mutating the copy never touches the source (snapshot-safety)", () => {
    const src = mkSlot();
    const snapshot = cloneParagraphLineSlot(src);
    // Simulate a later in-place edit of the live slot.
    src.mergedFromPtrs.push(33);
    src.mergedFromTexts[0] = "XX";
    src.mergedFromBounds[0].right = 999;
    src.mergedFromCharStarts[1] = 7;
    expect(snapshot.mergedFromPtrs).toEqual([11, 22]);
    expect(snapshot.mergedFromTexts).toEqual(["He", "llo"]);
    expect(snapshot.mergedFromBounds[0].right).toBe(5);
    expect(snapshot.mergedFromCharStarts).toEqual([0, 2]);
  });
});
