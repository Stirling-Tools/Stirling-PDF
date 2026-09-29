import { describe, it, expect } from "vitest";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { LineGrouper } from "@app/tools/pdfTextEditor/pdfium/LineGrouper";

let ptr = 5000;
function mkRun(opts: {
  x: number;
  width: number;
  f: number;
  fs: number;
  text: string;
}): TextRun {
  return new TextRun({
    id: `r${ptr}`,
    pageIndex: 0,
    bounds: { x: opts.x, y: opts.f, width: opts.width, height: opts.fs },
    matrix: { a: opts.fs, b: 0, c: 0, d: opts.fs, e: opts.x, f: opts.f },
    text: opts.text,
    fontId: "pdf:1:Helvetica",
    fontSize: opts.fs,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
  });
}

function lineOf(
  words: Array<{ text: string; width: number; gapAfter?: number }>,
  fs: number,
): TextRun[] {
  const runs: TextRun[] = [];
  let x = 72;
  for (const w of words) {
    runs.push(mkRun({ x, width: w.width, f: 500, fs, text: w.text }));
    x += w.width + (w.gapAfter ?? 0);
  }
  return runs;
}

function joinLine(runs: TextRun[]): string {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.loaded = true;
  const groups = LineGrouper.apply(page);
  expect(groups.length, "runs formed a single line group").toBe(1);
  return groups[0].representative.text;
}

function runsBetween(text: string, before: string, after: string): number {
  const m = new RegExp(`${before}( +)${after}`).exec(text);
  return m ? m[1].length : 0;
}

describe("LineGrouper inter-run space synthesis", () => {
  it("emits one space for normal 10pt word gaps", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "Hello", width: 25, gapAfter: 3.2 },
          { text: "brave", width: 26, gapAfter: 3.2 },
          { text: "world", width: 27 },
        ],
        10,
      ),
    );
    expect(text).toBe("Hello brave world");
  });

  it("keeps a justified stretched space as ONE space", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "The", width: 16, gapAfter: 7.4 },
          { text: "quick", width: 25, gapAfter: 7.4 },
          { text: "brown", width: 29, gapAfter: 7.4 },
          { text: "foxes", width: 26 },
        ],
        10,
      ),
    );
    expect(text).toBe("The quick brown foxes");
  });

  it("keeps a justified stretched space as ONE when the space glyph is already in the run", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "The ", width: 16, gapAfter: 7.4 },
          { text: "quick ", width: 25, gapAfter: 7.4 },
          { text: "brown ", width: 29, gapAfter: 7.4 },
          { text: "foxes", width: 26 },
        ],
        10,
      ),
    );
    expect(text).toBe("The quick brown foxes");
  });

  it("keeps a stretched space as ONE on a two-object line with no line evidence", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "widely", width: 30, gapAfter: 8 },
          { text: "spaced", width: 32 },
        ],
        10,
      ),
    );
    expect(text).toBe("widely spaced");
  });

  it("keeps a genuine double space as TWO spaces", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "Item", width: 20, gapAfter: 3.4 },
          { text: "one", width: 17, gapAfter: 6.6 },
          { text: "two", width: 18, gapAfter: 3.4 },
          { text: "three", width: 24 },
        ],
        10,
      ),
    );
    expect(text).toBe("Item one  two three");
  });

  it("expands a tab-like gap into several spaces", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "Chapter", width: 38, gapAfter: 3.2 },
          { text: "1", width: 5, gapAfter: 11.5 },
          { text: "12", width: 11 },
        ],
        10,
      ),
    );
    expect(runsBetween(text, "Chapter", "1")).toBe(1);
    expect(runsBetween(text, "1", "12")).toBeGreaterThanOrEqual(3);
  });

  it("scales with font size: a 24pt heading word gap stays one space", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "Big", width: 44, gapAfter: 9.5 },
          { text: "bold", width: 55, gapAfter: 9.5 },
          { text: "title", width: 48 },
        ],
        24,
      ),
    );
    expect(text).toBe("Big bold title");
  });

  it("does not synthesise a space for a hairline kerning gap", () => {
    const text = joinLine(
      lineOf(
        [
          { text: "Wa", width: 16, gapAfter: 0.6 },
          { text: "ter", width: 14 },
        ],
        10,
      ),
    );
    expect(text).toBe("Water");
  });
});
