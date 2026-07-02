/**
 * Helpers for inspecting and flipping the bold/italic variants of the
 * PDF base-14 font families used by the toolbar.
 */

export function isBoldFamily(fontId: string): boolean {
  return /bold/i.test(fontId);
}

export function isItalicFamily(fontId: string): boolean {
  return /italic|oblique/i.test(fontId);
}

/** Strip any `prefix:` qualifier that `PdfiumTextReader` adds to font ids. */
export function familyOf(fontId: string): string {
  const idx = fontId.lastIndexOf(":");
  return idx >= 0 ? fontId.slice(idx + 1) : fontId;
}

type Base14Root = "Helvetica" | "Times" | "Courier";

/** Which base-14 family a name belongs to, or null if it isn't base-14. */
function base14Root(family: string): Base14Root | null {
  if (/^Helvetica/i.test(family)) return "Helvetica";
  if (/^Times/i.test(family)) return "Times";
  if (/^Courier/i.test(family)) return "Courier";
  return null;
}

/**
 * Build the EXACT base-14 PostScript name for a root + bold/italic combo. The
 * combined styles have specific spellings (Times uses Roman/Italic/BoldItalic;
 * Helvetica/Courier use Oblique/BoldOblique) - concatenating "-Bold" onto
 * "-Oblique" or "-Italic" produces a non-existent font that the viewer silently
 * substitutes, so the names must be assembled, never string-spliced.
 */
function base14Name(root: Base14Root, bold: boolean, italic: boolean): string {
  if (root === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  // Helvetica + Courier share the Oblique spelling.
  if (bold && italic) return `${root}-BoldOblique`;
  if (bold) return `${root}-Bold`;
  if (italic) return `${root}-Oblique`;
  return root;
}

/**
 * Map a base-14 family to its bold variant (or back), preserving the current
 * italic/oblique state. Returns null if the family isn't base-14.
 */
export function flipBold(currentFamily: string, on: boolean): string | null {
  const root = base14Root(currentFamily);
  if (!root) return null;
  return base14Name(root, on, isItalicFamily(currentFamily));
}

/**
 * Map a base-14 family to its italic/oblique variant (or back), preserving the
 * current bold state. Returns null if the family isn't base-14.
 */
export function flipItalic(currentFamily: string, on: boolean): string | null {
  const root = base14Root(currentFamily);
  if (!root) return null;
  return base14Name(root, isBoldFamily(currentFamily), on);
}
