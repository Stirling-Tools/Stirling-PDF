import { describe, expect, it } from "vitest";
import {
  analyzePageFonts,
  pageFontKey,
  UNNAMED_FONT,
} from "@editor/tools/pdfTextEditor/util/pageFonts";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

function pageWith(runs: { fontId: string; fontSubset?: boolean }[]) {
  return {
    pageIndex: 0,
    runs: runs.map((run, i) => ({
      id: `r${i}`,
      fontId: run.fontId,
      fontSubset: run.fontSubset ?? false,
    })),
  } as unknown as PageSnapshot;
}

describe("pageFontKey", () => {
  it("is the key the font list gives the run's font", () => {
    const runs = [
      { fontId: "pdf:1:OpenSans" },
      { fontId: "pdf:2:ABCDEF+Arial", fontSubset: true },
      { fontId: "base14:Helvetica" },
    ];
    const keys = analyzePageFonts([pageWith(runs)]).map((f) => f.key);
    expect(
      runs.map((r) => pageFontKey(r.fontId, r.fontSubset ?? false)),
    ).toEqual(expect.arrayContaining(keys));
    expect(
      new Set(runs.map((r) => pageFontKey(r.fontId, r.fontSubset ?? false))),
    ).toEqual(new Set(keys));
  });

  it("does not take one font's name for the end of another's", () => {
    expect(pageFontKey("pdf:1:OpenSans", false)).not.toBe(
      pageFontKey("pdf:2:Sans", false),
    );
  });

  it("keeps a subset apart from the whole font of the same name", () => {
    expect(pageFontKey("pdf:1:ABCDEF+Caladea", true)).not.toBe(
      pageFontKey("pdf:2:Caladea", false),
    );
  });

  it("lists a font the PDF does not name under the unnamed font's name", () => {
    const [font] = analyzePageFonts([pageWith([{ fontId: "pdf:9:" }])]);
    expect(font.name).toBe(UNNAMED_FONT);
    expect(pageFontKey("pdf:9:", false)).toBe(font.key);
  });
});
