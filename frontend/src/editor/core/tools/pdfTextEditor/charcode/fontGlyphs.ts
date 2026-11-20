/**
 * What a font's own program draws for a character, which its encoding cannot
 * say: a subset keeps the code for a letter it dropped the glyph of, and can
 * hold two letters only as one ligature glyph.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { setCharcodesOn } from "@editor/tools/pdfTextEditor/charcode/charcodeRegistry";
import { drawnCodePoint } from "@editor/tools/pdfTextEditor/pdfium/lineEndHyphen";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

/**
 * "outline": the font draws the character with a glyph of its own.
 * "box": it draws the glyph it shows for every character it lacks.
 * "none": PDFium reads no outline, as for every character of a Type 3 font.
 */
type Glyph = "outline" | "box" | "none";

// Characters a subset rarely holds. Two of them drawn with one outline are both the font's missing-glyph box: no font draws two of these alike.
const RARE_CHARACTERS =
  "^`|~{}\u00a4\u00ac\u00b1\u00f7\u00de\u00f0\u00fe\u0192";
const PROBE_FONT_SIZE = 12;
const SINGLE_BYTE_CODES = 255;
const SCRATCH_GRID = 16;
const SCRATCH_STEP_PT = 30;

const outlines = new Map<number, Map<string, string | null>>();
const missingOutlines = new Map<number, string | null>();
const codeTexts = new Map<number, Map<string, number>>();

/** Font pointers are reused across documents, so every document starts empty. */
export function resetFontGlyphs(): void {
  outlines.clear();
  missingOutlines.clear();
  codeTexts.clear();
}

function outlineOf(
  m: WrappedPdfiumModule,
  font: number,
  ch: string,
): string | null {
  let perFont = outlines.get(font);
  if (!perFont) {
    perFont = new Map();
    outlines.set(font, perFont);
  }
  const known = perFont.get(ch);
  if (known !== undefined) return known;
  let outline: string | null = null;
  try {
    outline = readOutline(m, font, ch);
  } catch {
    outline = null;
  }
  perFont.set(ch, outline);
  return outline;
}

function readOutline(
  m: WrappedPdfiumModule,
  font: number,
  ch: string,
): string | null {
  const path = m.FPDFFont_GetGlyphPath(
    font,
    ch.codePointAt(0)!,
    PROBE_FONT_SIZE,
  );
  if (!path) return null;
  const count = m.FPDFGlyphPath_CountGlyphSegments(path);
  const point = scratchPtr(m, SCRATCH.glyphPoint, 8);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const segment = m.FPDFGlyphPath_GetGlyphPathSegment(path, i);
    if (!m.FPDFPathSegment_GetPoint(segment, point, point + 4)) return null;
    parts.push(
      `${m.FPDFPathSegment_GetType(segment)} ${m.pdfium.getValue(point, "float").toFixed(4)} ${m.pdfium.getValue(point + 4, "float").toFixed(4)}`,
    );
  }
  return parts.join(";");
}

function missingOutlineOf(m: WrappedPdfiumModule, font: number): string | null {
  const known = missingOutlines.get(font);
  if (known !== undefined) return known;
  const seen = new Set<string>();
  let missing: string | null = null;
  for (const ch of RARE_CHARACTERS) {
    const outline = outlineOf(m, font, ch);
    if (!outline) continue;
    if (seen.has(outline)) {
      missing = outline;
      break;
    }
    seen.add(outline);
  }
  missingOutlines.set(font, missing);
  return missing;
}

function glyphOf(m: WrappedPdfiumModule, font: number, ch: string): Glyph {
  const outline = outlineOf(m, font, ch);
  if (outline === null) return "none";
  return outline === missingOutlineOf(m, font) ? "box" : "outline";
}

/**
 * The letters of `text` that `font` has no glyph of their own for: each is drawn as
 * the font's missing-glyph box, or has no outline where another letter of `text` has
 * one, which a subset font draws blank. A font PDFium reads no outline from at all is
 * not judged, so none of its letters are returned.
 */
export function lettersWithoutGlyph(
  m: WrappedPdfiumModule,
  font: number,
  text: string,
): string[] {
  if (!font) return [];
  // Control and private-use codes reach a glyph by the font's own code, never by Unicode.
  const letters = [...new Set(text.replace(/[\s\p{C}]+/gu, ""))];
  const glyphs = letters.map((ch) => glyphOf(m, font, ch));
  const readable = glyphs.includes("outline");
  return letters.filter(
    (_, i) => glyphs[i] === "box" || (readable && glyphs[i] === "none"),
  );
}

/**
 * The text each single-byte code of `font` reads as, lowest code first. Each
 * code is drawn on the page as an object of its own, read back through one
 * text page, and taken off again.
 */
function codeTextsOf(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  font: number,
): Map<string, number> {
  const known = codeTexts.get(font);
  if (known) return known;
  const drawn = new Map<number, { code: number; text: string }>();
  for (let c = 1; c <= SINGLE_BYTE_CODES; c++) {
    const ptr = m.FPDFPageObj_CreateTextObj(docPtr, font, PROBE_FONT_SIZE);
    if (!ptr) continue;
    if (!setCharcodesOn(m, ptr, [c])) {
      m.FPDFPageObj_Destroy(ptr);
      continue;
    }
    // Apart, so the text page reads each as a line of its own and not as one drawn twice.
    m.FPDFPageObj_Transform(
      ptr,
      1,
      0,
      0,
      1,
      (c % SCRATCH_GRID) * SCRATCH_STEP_PT,
      Math.floor(c / SCRATCH_GRID) * SCRATCH_STEP_PT,
    );
    m.FPDFPage_InsertObject(pagePtr, ptr);
    drawn.set(ptr, { code: c, text: "" });
  }
  const textPage = m.FPDFText_LoadPage(pagePtr);
  try {
    const count = textPage ? m.FPDFText_CountChars(textPage) : 0;
    for (let i = 0; i < count; i++) {
      const entry = drawn.get(m.FPDFText_GetTextObject(textPage, i));
      if (!entry || m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      const unicode = drawnCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (unicode) entry.text += String.fromCodePoint(unicode);
    }
  } finally {
    if (textPage) m.FPDFText_ClosePage(textPage);
    for (const ptr of drawn.keys()) {
      m.FPDFPage_RemoveObject(pagePtr, ptr);
      m.FPDFPageObj_Destroy(ptr);
    }
  }
  const codes = new Map<string, number>();
  for (const { code: c, text } of drawn.values())
    if (text && !codes.has(text)) codes.set(text, c);
  codeTexts.set(font, codes);
  return codes;
}

/**
 * The codes that draw `text` in `font` where FPDFText_SetText would draw a
 * missing-glyph box or nothing: it encodes one character at a time, and the
 * font holds some of them only inside a ligature. Null when every letter of
 * `text` has a glyph of its own, or when the font's single-byte codes cannot
 * draw all of it.
 */
export function ligatureCodes(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  font: number,
  text: string,
): number[] | null {
  if (!font || !docPtr || !pagePtr || [...text].length < 2) return null;
  try {
    const lacking = new Set(lettersWithoutGlyph(m, font, text));
    if (lacking.size === 0) return null;
    const lacks = (drawn: string) => [...drawn].some((ch) => lacking.has(ch));
    const codes = codeTextsOf(m, docPtr, pagePtr, font);
    const ligatures = [...codes.keys()]
      .filter((drawn) => [...drawn].length > 1)
      .sort((a, b) => b.length - a.length);
    const out: number[] = [];
    for (let at = 0; at < text.length;) {
      const ligature = ligatures.find(
        (drawn) => text.startsWith(drawn, at) && lacks(drawn),
      );
      const piece = ligature ?? String.fromCodePoint(text.codePointAt(at)!);
      const code = codes.get(piece);
      if (code === undefined || (!ligature && lacks(piece))) return null;
      out.push(code);
      at += piece.length;
    }
    return out;
  } catch {
    return null;
  }
}
