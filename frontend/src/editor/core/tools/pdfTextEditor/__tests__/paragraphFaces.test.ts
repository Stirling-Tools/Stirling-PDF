// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  LineGrouper,
  lineFontIds,
} from "@editor/tools/pdfTextEditor/pdfium/LineGrouper";
import { ParagraphGrouper } from "@editor/tools/pdfTextEditor/pdfium/ParagraphGrouper";

const SIZE = 11;
const PITCH = 14;
const LETTER = SIZE * 0.5;
let ptr = 3000;

// Fonts by id: the family a name table reports, and the face /BaseFont names.
const FACES: Record<string, string> = {
  "pdf:1:Georgia": "Georgia",
  "pdf:2:Georgia-Bold": "Georgia-Bold",
  "pdf:3:Georgia": "Georgia-Bold",
  "pdf:4:Helvetica": "Helvetica",
};

function piece(x: number, row: number, text: string, fontId: string): TextRun {
  const f = 700 - row * PITCH;
  return new TextRun({
    id: `r${ptr}`,
    pageIndex: 0,
    bounds: { x, y: f, width: text.trimEnd().length * LETTER, height: SIZE },
    matrix: { a: SIZE, b: 0, c: 0, d: SIZE, e: x, f },
    text,
    fontId,
    fontSize: SIZE,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
  });
}

// One line of pieces laid end to end.
function line(row: number, parts: Array<[string, string]>): TextRun[] {
  let x = 40;
  return parts.map(([text, fontId]) => {
    const run = piece(x, row, text, fontId);
    x += text.length * LETTER;
    return run;
  });
}

function paragraphs(runs: TextRun[]): string[] {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.loaded = true;
  const lines = LineGrouper.apply(page);
  ParagraphGrouper.apply(
    page,
    undefined,
    lineFontIds(lines),
    (fontId) => FACES[fontId] ?? null,
  );
  return page.runs.map((run) => run.text);
}

describe("grouping lines into paragraphs by face", () => {
  it("keeps a bold line apart from a regular one of the same family", () => {
    const runs = [
      ...line(0, [["Plain Georgia sentence here.", "pdf:1:Georgia"]]),
      ...line(1, [
        ["Xk ", "pdf:3:Georgia"],
        ["Bold Georgia ", "pdf:2:Georgia-Bold"],
        ["Quixotic ", "pdf:3:Georgia"],
        ["sentence.", "pdf:2:Georgia-Bold"],
      ]),
    ];

    expect(paragraphs(runs)).toHaveLength(2);
  });

  it("joins a line whose typed words outnumber its own letters", () => {
    const runs = [
      ...line(0, [
        ["First ", "pdf:1:Georgia"],
        ["Xk Wj9 Quixotic Pasted words ", "pdf:4:Helvetica"],
        ["item", "pdf:1:Georgia"],
      ]),
      ...line(1, [["Second bullet item", "pdf:1:Georgia"]]),
    ];

    expect(paragraphs(runs)).toHaveLength(1);
  });
});
