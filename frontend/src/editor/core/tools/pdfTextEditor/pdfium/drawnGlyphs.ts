/**
 * What a page draws, glyph by glyph, with where each sits. PDFium's text page
 * lists a line's characters in its own guess at reading order, which reverses
 * words and digit groups on lines mixing directions; the pen positions it
 * reports are the page's own, so a line read from them is in drawn order.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  drawnCodePoint,
  drawnText,
} from "@editor/tools/pdfTextEditor/pdfium/lineEndHyphen";
import type { CharOriginModule } from "@editor/tools/pdfTextEditor/pdfium/objectTexts";
import { hasRtl } from "@editor/tools/pdfTextEditor/util/bidi";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

export interface DrawnGlyph {
  /** What the glyph says, in reading order: a letter with its marks, or the letters of a ligature. */
  text: string;
  /** The pen position it is drawn from. */
  left: number;
  /** Where its advance ends. */
  right: number;
  baseline: number;
}

/** A space drawn as an object of its own. */
export interface SpaceGlyph extends DrawnGlyph {
  ptr: number;
}

export interface PageGlyphs {
  /** Each text object's glyphs, in the order the text page lists them. */
  byObject: Map<number, DrawnGlyph[]>;
  /** The objects that draw one space and nothing else. */
  spaces: SpaceGlyph[];
}

interface GlyphModule extends CharOriginModule {
  FPDFText_GetLooseCharBox?: (tp: number, i: number, rect: number) => boolean;
}

interface PlacedChar {
  char: string;
  x: number;
  y: number;
  boxLeft: number;
  boxRight: number;
}

const SAME_PEN_PT = 0.01;
const MARK = /\p{M}/u;

// Characters sharing a pen position are one glyph's ActualText or ToUnicode string. PDFium hands a right-to-left ligature's letters back to front when it slices the glyph's box between them, left to right.
function glyphText(chars: readonly PlacedChar[]): string {
  const text = chars.map(({ char }) => char).join("");
  const letters = chars.filter(({ char }) => !MARK.test(char));
  const sliced = chars.every(
    (c, i) => i === 0 || c.boxLeft > chars[i - 1].boxLeft + SAME_PEN_PT,
  );
  if (letters.length > 1 && sliced && hasRtl(text))
    return chars
      .map(({ char }) => char)
      .reverse()
      .join("");
  return drawnText(text);
}

function glyphsOf(chars: readonly PlacedChar[]): DrawnGlyph[] {
  const glyphs: DrawnGlyph[] = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i++) {
    const first = chars[start];
    if (
      i < chars.length &&
      Math.abs(chars[i].x - first.x) < SAME_PEN_PT &&
      Math.abs(chars[i].y - first.y) < SAME_PEN_PT
    )
      continue;
    const cluster = chars.slice(start, i);
    glyphs.push({
      text: glyphText(cluster),
      left: first.x,
      right: Math.max(first.x, ...cluster.map(({ boxRight }) => boxRight)),
      baseline: first.y,
    });
    start = i;
  }
  return glyphs;
}

/** The glyphs of every text object on a text page; null when this build cannot place a character. */
export function readPageGlyphs(
  m: WrappedPdfiumModule,
  textPagePtr: number,
): PageGlyphs | null {
  const probe = m as unknown as GlyphModule;
  const origin = probe.FPDFText_GetCharOrigin;
  const looseBox = probe.FPDFText_GetLooseCharBox;
  if (!origin || !looseBox || typeof m.FPDFText_GetTextObject !== "function")
    return null;
  const rect = scratchPtr(m, SCRATCH.readerCharRect, 16);
  const xPtr = scratchPtr(m, SCRATCH.readerCharX, 8);
  const yPtr = scratchPtr(m, SCRATCH.readerCharY, 8);
  const chars = new Map<number, PlacedChar[]>();
  const count = m.FPDFText_CountChars(textPagePtr);
  for (let i = 0; i < count; i++) {
    const ptr = m.FPDFText_GetTextObject(textPagePtr, i);
    if (!ptr || m.FPDFText_IsGenerated(textPagePtr, i) === 1) continue;
    const codePoint = drawnCodePoint(m.FPDFText_GetUnicode(textPagePtr, i));
    if (!codePoint || !origin(textPagePtr, i, xPtr, yPtr)) continue;
    const x = m.pdfium.getValue(xPtr, "double");
    const y = m.pdfium.getValue(yPtr, "double");
    const boxed = looseBox(textPagePtr, i, rect);
    const list = chars.get(ptr) ?? [];
    if (list.length === 0) chars.set(ptr, list);
    list.push({
      char: String.fromCodePoint(codePoint),
      x,
      y,
      boxLeft: boxed ? m.pdfium.getValue(rect, "float") : x,
      boxRight: boxed ? m.pdfium.getValue(rect + 8, "float") : x,
    });
  }
  const byObject = new Map<number, DrawnGlyph[]>();
  const spaces: SpaceGlyph[] = [];
  for (const [ptr, placed] of chars) {
    const glyphs = glyphsOf(placed);
    byObject.set(ptr, glyphs);
    if (glyphs.length === 1 && glyphs[0].text.trim() === "")
      spaces.push({ ...glyphs[0], ptr });
  }
  return { byObject, spaces };
}
