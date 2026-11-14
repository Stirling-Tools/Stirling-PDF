// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { LineGrouper } from "@editor/tools/pdfTextEditor/pdfium/LineGrouper";

const FONT_SIZE = 18;
const LETTER = FONT_SIZE * 0.5;
let ptr = 2000;

function piece(x: number, text: string): TextRun {
  const ink = text.trimEnd().length * LETTER;
  return new TextRun({
    id: `r${ptr}`,
    pageIndex: 0,
    bounds: { x, y: 700, width: ink, height: FONT_SIZE },
    matrix: { a: FONT_SIZE, b: 0, c: 0, d: FONT_SIZE, e: x, f: 700 },
    text,
    fontId: "pdf:1:Helvetica",
    fontSize: FONT_SIZE,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
  });
}

function lines(runs: TextRun[]): string[] {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.loaded = true;
  LineGrouper.apply(page);
  return page.runs.map((run) => run.text);
}

describe("joining pieces of a line", () => {
  it("joins across a gap its own typed spaces account for", () => {
    const first = piece(40, "Heading a   ");
    const gap = 3.2 * LETTER;
    const second = piece(40 + "Heading a".length * LETTER + gap, "next");

    expect(lines([first, second])).toEqual(["Heading a   next"]);
  });

  it("still keeps apart pieces a wide empty gap separates", () => {
    const first = piece(40, "Heading");
    const second = piece(40 + "Heading".length * LETTER + 6 * LETTER, "next");

    expect(lines([first, second]).sort()).toEqual(["Heading", "next"]);
  });
});
