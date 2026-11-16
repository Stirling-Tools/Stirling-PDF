import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { readObjFill } from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/coloured-word-sample.pdf",
);
// The sample sets its lines 15pt apart.
const LINE_PT = 15;

/** Opens the coloured-word sample, or `bytes`; the caller disposes the document. */
export async function openSample(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

export type Colour = "blue" | "black" | "other";
export type Face = "bold" | "regular";

function colourOf(doc: EditorDocument, obj: number): Colour {
  const fill = readObjFill(doc.module, obj);
  if (!fill) return "other";
  if (fill.b > 150 && fill.r < 80) return "blue";
  if (Math.max(fill.r, fill.g, fill.b) < 60) return "black";
  return "other";
}

function faceOf(doc: EditorDocument, obj: number): Face {
  const m = doc.module;
  const font = m.FPDFTextObj_GetFont(obj);
  const len = m.FPDFFont_GetBaseFontName(font, 0, 0);
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFFont_GetBaseFontName(font, buf, len);
    return /bold/i.test(m.pdfium.UTF8ToString(buf)) ? "bold" : "regular";
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

interface DrawnChar {
  ch: string;
  x: number;
  line: number;
  c: Colour;
  face: Face;
}

// Each drawn letter of the page in reading order, by where it sits.
function drawnChars(doc: EditorDocument): DrawnChar[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const xy = m.pdfium.wasmExports.malloc(16);
  const chars: DrawnChar[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      const ch = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (!/\S/.test(ch)) continue;
      m.FPDFText_GetCharOrigin(textPage, i, xy, xy + 8);
      const obj = m.FPDFText_GetTextObject(textPage, i);
      chars.push({
        ch,
        x: m.pdfium.getValue(xy, "double"),
        line: Math.round(m.pdfium.getValue(xy + 8, "double") / LINE_PT),
        c: colourOf(doc, obj),
        face: faceOf(doc, obj),
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(xy);
  }
  return chars.sort((a, b) => b.line - a.line || a.x - b.x);
}

function drawnWord(doc: EditorDocument, word: string): DrawnChar[] {
  const chars = drawnChars(doc);
  const at = chars
    .map(({ ch }) => ch)
    .join("")
    .indexOf(word);
  expect(at, `"${word}" is drawn`).toBeGreaterThanOrEqual(0);
  return chars.slice(at, at + word.length);
}

export const wordColours = (doc: EditorDocument, word: string): Colour[] =>
  drawnWord(doc, word).map(({ c }) => c);

export const wordFaces = (doc: EditorDocument, word: string): Face[] =>
  drawnWord(doc, word).map(({ face }) => face);

export const sameColour = (c: Colour, n: number) => Array<Colour>(n).fill(c);
