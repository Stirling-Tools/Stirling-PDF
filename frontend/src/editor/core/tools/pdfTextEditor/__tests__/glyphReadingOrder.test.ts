// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  inReadingOrder,
  type PlacedGlyph,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const glyph = (ch: string, x: number, bottom: number): PlacedGlyph => ({
  cp: ch.codePointAt(0)!,
  x,
  end: x + 5,
  bottom,
});

const read = (glyphs: PlacedGlyph[]) =>
  inReadingOrder(glyphs, 10)
    .map((g) => String.fromCodePoint(g.cp))
    .join("");

describe("inReadingOrder", () => {
  test("moves redrawn glyphs listed last back into their line", () => {
    // Line one keeps "ab", line two is "ef"; "cd" was redrawn onto line one
    // and so comes last in the page content.
    const listed = [
      glyph("a", 0, 700),
      glyph("b", 6, 700),
      glyph("e", 0, 688),
      glyph("f", 6, 688),
      glyph("c", 12, 700.6),
      glyph("d", 18, 699.4),
    ];
    expect(read(listed)).toBe("abcdef");
  });

  test("keeps separate lines apart", () => {
    const listed = [glyph("b", 0, 688), glyph("a", 40, 700)];
    expect(read(listed)).toBe("ab");
  });
});
