import { describe, expect, it } from "vitest";

import { groupPageTextElements } from "@app/tools/pdfTextEditor/pdfTextEditorUtils";
import type {
  PdfJsonPage,
  PdfJsonTextElement,
} from "@app/tools/pdfTextEditor/pdfTextEditorTypes";

const FONT_SIZE = 10;
const SPACE_WIDTH = 2.78;
const BASELINE = 700;

/**
 * Builds a text element the way PdfJsonConversionService emits them: position
 * carried by the text matrix, width being the summed glyph advances of the run.
 */
const textElement = (
  text: string,
  x: number,
  width: number,
  fontId: string,
): PdfJsonTextElement => ({
  text,
  fontId,
  fontSize: FONT_SIZE,
  fontMatrixSize: FONT_SIZE,
  spaceWidth: SPACE_WIDTH,
  width,
  height: FONT_SIZE,
  textMatrix: [1, 0, 0, 1, x, BASELINE],
});

const pageOf = (elements: PdfJsonTextElement[]): PdfJsonPage => ({
  pageNumber: 1,
  width: 595,
  height: 842,
  textElements: elements,
});

const groupTextOf = (elements: PdfJsonTextElement[]): string =>
  groupPageTextElements(pageOf(elements), 0, undefined, "singleLine")
    .map((group) => group.text)
    .join("");

describe("groupPageTextElements word reconstruction", () => {
  it("keeps a word intact when a fallback font splits it mid-word", () => {
    // A run only breaks where the text state changes. "ű" (U+0171) is outside
    // WinAnsiEncoding, so producers emit it from a fallback font and the run
    // splits mid-word - with the two halves still flush against each other.
    const head = textElement("Középfeszültség", 100, 70, "F1");
    const tail = textElement("ű", 170, 5.56, "F2");

    expect(groupTextOf([head, tail])).toBe("Középfeszültségű");
  });

  it("keeps the spaces a run already carries", () => {
    // Runs span whole phrases including their spaces, so nothing needs to be
    // inserted for the word breaks inside one.
    const head = textElement("HÁLÓZATON VÉGZEND", 100, 80, "F1");
    const tail = textElement("Ő", 180, 6.5, "F2");

    expect(groupTextOf([head, tail])).toBe("HÁLÓZATON VÉGZENDŐ");
  });

  it("inserts a space when the geometry shows a real gap", () => {
    // Separately positioned runs - table cells, columns - carry no space glyph
    // between them, so the gap is the only signal that a break belongs there.
    const first = textElement("Középfeszültség", 100, 70, "F1");
    const second = textElement("hálózat", 100 + 70 + SPACE_WIDTH, 33, "F1");

    expect(groupTextOf([first, second])).toBe("Középfeszültség hálózat");
  });
});
