/**
 * PDFium's text page reports a hyphen that ends a line as U+0002 instead of
 * U+002D, so a caller joining lines into prose can drop it. The editor keeps
 * the page as drawn, where that glyph is a hyphen: left as U+0002 no font can
 * encode it, and every re-emit of the line silently loses the hyphen.
 *
 * Every read of text or code points from a PDFium text page goes through here,
 * so the run text and the per-glyph code points it is matched against agree.
 */
const LINE_END_HYPHEN_MARKER = 0x0002;
const HYPHEN = 0x002d;

export function drawnCodePoint(codePoint: number): number {
  return codePoint === LINE_END_HYPHEN_MARKER ? HYPHEN : codePoint;
}

export function drawnText(text: string): string {
  return text.replaceAll("\u0002", "-");
}
