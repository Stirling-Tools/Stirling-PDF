import { describe, it, expect } from "vitest";
import { analyzePageFonts } from "@app/tools/pdfTextEditor/v2/util/pageFonts";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

function mkRun(id: string, fontId: string, fontSubset = false) {
  return {
    id,
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text: "x",
    fontId,
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset,
  };
}
function mkPage(pageIndex: number, runs: ReturnType<typeof mkRun>[]) {
  return {
    pageIndex,
    width: 100,
    height: 100,
    revision: 0,
    dirty: false,
    runs,
    images: [],
  } as unknown as PageSnapshot;
}

describe("analyzePageFonts", () => {
  it("classifies base-14 / standard families as standard", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [
        mkRun("a", "base14:Helvetica"),
        mkRun("b", "pdf:11:Times-Roman"),
        mkRun("c", "pdf:12:Courier"),
      ]),
    ]);
    expect(fonts.every((f) => f.status === "standard")).toBe(true);
  });

  it("classifies a fully embedded non-subset font as embedded", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "pdf:2212776:LMRoman12", false)]),
    ]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].status).toBe("embedded");
    expect(fonts[0].name).toBe("LMRoman12");
  });

  it("flags a non-standard subset font as subset and strips the tag", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "pdf:9:ABCDEF+LMRoman10", true)]),
    ]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].status).toBe("subset");
    expect(fonts[0].name).toBe("LMRoman10");
  });

  it("treats a subset of a standard family as standard (base-14 fallback is safe)", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "pdf:3:ABCDEF+Helvetica", true)]),
    ]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].status).toBe("standard");
  });

  it("de-duplicates the same font across pages and records page numbers", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "pdf:5:LMRoman12", false)]),
      mkPage(2, [mkRun("b", "pdf:5:LMRoman12", false)]),
    ]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].pages).toEqual([1, 3]);
  });

  it("returns nothing when there are no runs", () => {
    expect(analyzePageFonts([mkPage(0, [])])).toEqual([]);
  });
});
