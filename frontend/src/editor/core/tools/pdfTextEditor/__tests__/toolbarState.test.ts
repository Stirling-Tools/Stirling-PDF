// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveToolbarState } from "@editor/tools/pdfTextEditor/util/toolbarState";
import type {
  PageSnapshot,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";

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

describe("deriveToolbarState documentFontId", () => {
  const changed = (id: string, from: string) => ({
    ...mkRun(id, "device:Arial"),
    documentFontId: from,
  });

  it("is null while the runs are still in the PDF's own font", () => {
    const s = deriveToolbarState(
      mkPages([mkRun("a", "pdf:1:Garamond")]),
      mkSel(["a"]),
    );
    expect(s.documentFontId).toBeNull();
  });

  it("names the font every selected run was changed away from", () => {
    const s = deriveToolbarState(
      mkPages([changed("a", "pdf:1:Garamond"), changed("b", "pdf:1:Garamond")]),
      mkSel(["a", "b"]),
    );
    expect(s.documentFontId).toBe("pdf:1:Garamond");
  });

  it("is null when the runs came from different fonts", () => {
    const s = deriveToolbarState(
      mkPages([changed("a", "pdf:1:Garamond"), changed("b", "pdf:2:Bodoni")]),
      mkSel(["a", "b"]),
    );
    expect(s.documentFontId).toBeNull();
  });

  it("is null when only some runs were changed", () => {
    const s = deriveToolbarState(
      mkPages([changed("a", "pdf:1:Garamond"), mkRun("b", "device:Arial")]),
      mkSel(["a", "b"]),
    );
    expect(s.documentFontId).toBeNull();
  });
});
