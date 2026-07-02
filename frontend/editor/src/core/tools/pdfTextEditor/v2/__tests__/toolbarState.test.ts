import { describe, it, expect } from "vitest";
import { deriveToolbarState } from "@app/tools/pdfTextEditor/v2/util/toolbarState";
import type {
  PageSnapshot,
  SelectionState,
} from "@app/tools/pdfTextEditor/v2/types";

function mkRun(id: string, fontId: string, fontSize = 12) {
  return {
    id,
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text: "x",
    fontId,
    fontSize,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}
function mkPages(runs: ReturnType<typeof mkRun>[]): PageSnapshot[] {
  return [
    {
      pageIndex: 0,
      width: 100,
      height: 100,
      revision: 0,
      dirty: false,
      runs,
      images: [],
    } as unknown as PageSnapshot,
  ];
}
function mkSel(runIds: string[]): SelectionState {
  return { runIds, imageIds: [] } as unknown as SelectionState;
}

describe("deriveToolbarState mixed.fontFamily", () => {
  it("flags fontFamily mixed when selected runs differ", () => {
    const s = deriveToolbarState(
      mkPages([mkRun("a", "pdf:1:Arial"), mkRun("b", "pdf:2:Times")]),
      mkSel(["a", "b"]),
    );
    expect(s.mixed.fontFamily).toBe(true);
  });

  it("does not flag fontFamily mixed when fontIds match", () => {
    const s = deriveToolbarState(
      mkPages([mkRun("a", "pdf:1:Arial"), mkRun("b", "pdf:1:Arial")]),
      mkSel(["a", "b"]),
    );
    expect(s.mixed.fontFamily).toBe(false);
  });
});
