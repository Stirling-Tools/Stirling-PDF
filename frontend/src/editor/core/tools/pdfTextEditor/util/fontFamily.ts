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

/** Whether a fontId names a font carried by the PDF itself. */
export function isDocumentFontId(fontId: string): boolean {
  return fontId.startsWith("pdf:");
}

/** The PDFium font handle in a pdf:<ptr>:<family> fontId, or 0; valid while some object uses it. */
export function documentFontHandle(fontId: string): number {
  if (!isDocumentFontId(fontId)) return 0;
  const n = Number(fontId.split(":")[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const DEVICE_FONT_PREFIX = "device:";
const BASE14_FONT_PREFIX = "base14:";

/** Whether a fontId names an installed or server font embedded by the editor. */
export function isDeviceFontId(fontId: string): boolean {
  return fontId.startsWith(DEVICE_FONT_PREFIX);
}

export function isBase14FontId(fontId: string): boolean {
  return fontId.startsWith(BASE14_FONT_PREFIX);
}

export function deviceFontId(family: string): string {
  return `${DEVICE_FONT_PREFIX}${family}`;
}

export function base14FontId(family: string): string {
  return `${BASE14_FONT_PREFIX}${family}`;
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
