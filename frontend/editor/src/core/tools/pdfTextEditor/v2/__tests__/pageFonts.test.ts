import { describe, it, expect } from "vitest";
import {
  analyzePageFonts,
  missingAlnumFromCmap,
} from "@app/tools/pdfTextEditor/v2/util/pageFonts";
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

  it("classifies base-14 bold/italic variants as standard", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [
        mkRun("a", "pdf:1:Helvetica-BoldOblique"),
        mkRun("b", "pdf:2:Times-BoldItalic"),
        mkRun("c", "pdf:3:Courier-Oblique"),
        mkRun("d", "pdf:4:ArialMT"),
      ]),
    ]);
    expect(fonts.every((f) => f.status === "standard")).toBe(true);
  });

  it("does NOT mislabel a custom font that merely contains a base-14 substring", () => {
    // "Arial Black" / "Helvetica Neue" are distinct fonts, and a custom font
    // with "arial" mid-name is not base-14 - all must fall through to embedded.
    const fonts = analyzePageFonts([
      mkPage(0, [
        mkRun("a", "pdf:5:ArialBlack", false),
        mkRun("b", "pdf:6:HelveticaNeue", false),
        mkRun("c", "pdf:7:MyArialClone", false),
      ]),
    ]);
    expect(fonts.every((f) => f.status !== "standard")).toBe(true);
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

  it("reports standard fonts as full a-zA-Z0-9 coverage (no cmap read needed)", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "base14:Helvetica")]),
    ]);
    expect(fonts[0].coverage).toEqual({ known: true, missing: [] });
  });

  it("reports coverage unknown for an embedded font with no primed cmap", () => {
    const fonts = analyzePageFonts([
      mkPage(0, [mkRun("a", "pdf:777777:LMRoman12", false)]),
    ]);
    expect(fonts[0].coverage.known).toBe(false);
  });
});

describe("missingAlnumFromCmap", () => {
  function cmapWith(...codepoints: number[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const cp of codepoints) m.set(cp, cp + 1); // glyphId is arbitrary
    return m;
  }
  const ALL = (() => {
    const cps: number[] = [];
    for (let c = 0x30; c <= 0x39; c++) cps.push(c);
    for (let c = 0x41; c <= 0x5a; c++) cps.push(c);
    for (let c = 0x61; c <= 0x7a; c++) cps.push(c);
    return cps;
  })();

  it("returns [] when every a-zA-Z0-9 glyph is present", () => {
    expect(missingAlnumFromCmap(cmapWith(...ALL))).toEqual([]);
  });

  it("lists exactly the absent alphanumerics", () => {
    const present = ALL.filter((c) => c !== 0x71 && c !== 0x57 && c !== 0x37);
    expect(missingAlnumFromCmap(cmapWith(...present)).sort()).toEqual(
      ["7", "W", "q"].sort(),
    );
  });

  it("reports all 62 missing for an empty cmap", () => {
    expect(missingAlnumFromCmap(new Map()).length).toBe(62);
  });

  it("ignores non-alphanumeric glyphs in the cmap", () => {
    expect(missingAlnumFromCmap(cmapWith(0x21, 0x2e, 0x2c)).length).toBe(62);
  });
});
