import { describe, expect, test } from "vitest";
import type { DrawnGlyph } from "@editor/tools/pdfTextEditor/pdfium/drawnGlyphs";
import { readDrawnLine } from "@editor/tools/pdfTextEditor/pdfium/drawnLine";

const WIDTH = 6;

// One object per string, set left to right with no gaps unless `gapBefore` names the object.
function objects(texts: string[], gapBefore = -1): DrawnGlyph[][] {
  let pen = 0;
  return texts.map((text, i) => {
    if (i === gapBefore) pen += WIDTH;
    return [...text].map((char) => {
      const glyph = { text: char, left: pen, right: pen + WIDTH, baseline: 0 };
      pen += WIDTH;
      return glyph;
    });
  });
}

const read = (drawn: DrawnGlyph[][]) =>
  readDrawnLine(drawn, [], 12, (gapPt) => (gapPt > 2 ? 1 : 0));

describe("readDrawnLine", () => {
  test("reads right-to-left objects from the right and a number among them left to right", () => {
    const line = read(objects(["ג", "1", "2", "ב", "א"]));

    expect(line.text).toBe("אב12ג");
    expect(line.faithful).toBe(true);
    expect(line.spans.map(({ start }) => start)).toEqual([4, 2, 3, 1, 0]);
  });

  test("keeps the letters of one left-to-right object in the order they are drawn", () => {
    const line = read(objects(["ב", "ISO 50001", "א"]));

    expect(line.text).toBe("אISO 50001ב");
    expect(line.spans[1]).toEqual({ start: 1, end: 10 });
  });

  test("turns a pair of brackets reported facing the same way to face each other", () => {
    expect(read(objects(["(", "ב", "א", "("])).text).toBe("(אב)");
    expect(read(objects([")", "1", "2", "("])).text).toBe("(12)");
  });

  test("reads a gap between two objects as a space", () => {
    expect(read(objects(["ב", "א"], 1)).text).toBe("א ב");
  });

  test("puts a mark drawn as its own object after the letter it sits on", () => {
    const [letter] = objects(["ש"]);
    const mark = [{ text: "ָ", left: 3, right: 3, baseline: 0 }];

    const line = read([mark, letter]);

    expect(line.text).toBe("שָ");
    expect(line.spans).toEqual([
      { start: 2, end: 2 },
      { start: 0, end: 2 },
    ]);
  });
});
