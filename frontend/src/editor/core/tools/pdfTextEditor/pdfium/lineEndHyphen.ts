/**
 * PDFium's text page reports a hyphen that ends a line as U+0002 instead of
 * U+002D, so a caller joining lines into prose can drop it. The editor keeps
 * the page as drawn, where that glyph is a hyphen: left as U+0002 no font can
 * encode it, and every re-emit of the line silently loses the hyphen.
 *
 * Every read of text or code points from a PDFium text page goes through here,
 * so the run text and the per-glyph code points it is matched against agree.
 */
import { marksAfterLetters } from "@editor/tools/pdfTextEditor/util/bidi";

const LINE_END_HYPHEN_MARKER = 0x0002;
const HYPHEN = 0x002d;
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = 0xfffd;

/**
 * The character a text page reports, as a code point String.fromCodePoint
 * accepts. A font with no /ToUnicode whose encoding is a multi-byte CMap
 * reports the raw character code, which can be past U+10FFFF or, once wasm
 * hands back its sign bit, negative: those read as U+FFFD.
 */
export function validCodePoint(unicode: number): number {
  return unicode >= 0 && unicode <= MAX_CODE_POINT
    ? unicode
    : REPLACEMENT_CHARACTER;
}

export function drawnCodePoint(codePoint: number): number {
  return codePoint === LINE_END_HYPHEN_MARKER
    ? HYPHEN
    : validCodePoint(codePoint);
}

/** An object's text as drawn, with right-to-left marks back after their letters. */
export function drawnText(text: string): string {
  return marksAfterLetters(text.replaceAll("\u0002", "-"));
}
