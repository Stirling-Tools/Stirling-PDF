// Helpers for inspecting and flipping the bold/italic variants of the PDF
// base-14 font families used by the toolbar.

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

/** Build the EXACT base-14 PostScript name for a root + bold/italic combo. */
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

/** The Helvetica variant for a bold/italic combo. */
export function helveticaWith(bold: boolean, italic: boolean): string {
  return base14Name("Helvetica", bold, italic);
}

// Map a base-14 family to its bold variant (or back), preserving the current
// italic/oblique state.
export function flipBold(currentFamily: string, on: boolean): string | null {
  const root = base14Root(currentFamily);
  if (!root) return null;
  return base14Name(root, on, isItalicFamily(currentFamily));
}

// Map a base-14 family to its italic/oblique variant (or back), preserving the
// current bold state.
export function flipItalic(currentFamily: string, on: boolean): string | null {
  const root = base14Root(currentFamily);
  if (!root) return null;
  return base14Name(root, isBoldFamily(currentFamily), on);
}

/** Exact names PDFium will build a text object for. */
const STANDARD_FONTS = new Set([
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
  "Symbol",
  "ZapfDingbats",
]);

const WIN_ANSI_EXTRAS = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6,
  0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

export function encodesInBase14(cp: number): boolean {
  return (
    (cp >= 0x20 && cp < 0x7f) ||
    (cp >= 0xa0 && cp <= 0xff) ||
    WIN_ANSI_EXTRAS.has(cp)
  );
}

// The standard PDF font that best stands in for an arbitrary family: PDFium
// can only build a text object for one of the 14, so approximate, don't drop.
export function nearestStandardFont(family: string): string {
  if (STANDARD_FONTS.has(family)) return family;
  const name = family.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(name);
  const italic = /italic|oblique/.test(name);
  if (/mono|courier|consol|menlo|code/.test(name)) {
    return base14Name("Courier", bold, italic);
  }
  if (
    /serif|times|georgia|garamond|book|roman|minion|cambria|palatino/.test(name)
  ) {
    return base14Name("Times", bold, italic);
  }
  return base14Name("Helvetica", bold, italic);
}
