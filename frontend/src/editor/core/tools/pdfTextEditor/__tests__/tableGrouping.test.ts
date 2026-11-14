// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { LineGrouper } from "@editor/tools/pdfTextEditor/pdfium/LineGrouper";
import { ParagraphGrouper } from "@editor/tools/pdfTextEditor/pdfium/ParagraphGrouper";
import { RENDER_MODE_INVISIBLE } from "@editor/tools/pdfTextEditor/types";

const FONT_SIZE = 9;
// Tight enough for the rows to pass as lines of one paragraph.
const ROW_PITCH = 16;
let ptr = 1000;

function cell(x: number, row: number, text: string, renderMode = 0): TextRun {
  const f = 700 - row * ROW_PITCH;
  return new TextRun({
    id: `r${ptr}`,
    pageIndex: 0,
    bounds: {
      x,
      y: f,
      width: text.length * FONT_SIZE * 0.5,
      height: FONT_SIZE,
    },
    matrix: { a: FONT_SIZE, b: 0, c: 0, d: FONT_SIZE, e: x, f },
    text,
    fontId: "pdf:1:Test",
    fontSize: FONT_SIZE,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
    renderMode,
  });
}

function group(runs: TextRun[]): string[] {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.loaded = true;
  LineGrouper.apply(page);
  ParagraphGrouper.apply(page);
  return page.runs.map((run) => run.text);
}

describe("grouping a table", () => {
  it("keeps every cell of a tightly set table its own box", () => {
    const rows = [
      ["Item", "Qty", "Price", "Total"],
      ["Widget 1", "10", "13.20", "16.30"],
      ["Widget 2", "17", "20.20", "23.30"],
      ["Widget 3", "24", "27.20", "30.30"],
    ];
    const runs = rows.flatMap((row, r) =>
      row.map((text, c) => cell(40 + c * 60, r, text)),
    );

    expect(group(runs).sort()).toEqual(rows.flat().sort());
  });

  it("keeps a two-column table of labels and amounts apart", () => {
    const rows = [
      ["Subtotal", "1,204.00"],
      ["Tax", "240.80"],
      ["Total", "1,444.80"],
    ];
    const runs = rows.flatMap((row, r) =>
      row.map((text, c) => cell(40 + c * 120, r, text)),
    );

    expect(group(runs).sort()).toEqual(rows.flat().sort());
  });

  it("still joins narrow columns of running text into paragraphs", () => {
    const left = ["The quick brown", "fox jumps over", "the lazy dog"];
    const right = ["Pack my box", "with five dozen", "liquor jugs"];
    const runs = [
      ...left.map((text, r) => cell(40, r, text)),
      ...right.map((text, r) => cell(200, r, text)),
    ];

    expect(group(runs).sort()).toEqual(
      [left.join("\n"), right.join("\n")].sort(),
    );
  });

  it("keeps a scanned paragraph whole when a typed word sits on one of its lines", () => {
    const ocr = [
      "This agreement is made between",
      "the supplier and the customer",
      "within fourteen days",
    ];
    const runs = [
      ...ocr.map((text, r) => cell(40, r, text, RENDER_MODE_INVISIBLE)),
      cell(200, 0, "Yp3"),
    ];

    expect(group(runs).sort()).toEqual(["Yp3", ocr.join("\n")].sort());
  });
});
