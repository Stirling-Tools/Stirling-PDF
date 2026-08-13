const DEVICE_FONT_PREFIX = "device:";

// Map a source font id to the base-14 family + style that best preserves its
// broad class.
export function helveticaVariantFor(fontId: string): string {
  // A run already carrying an embedded device font keeps it; mapping to
  // base-14 here is what reverted "Segoe UI" to Helvetica on the next edit.
  if (fontId.startsWith(DEVICE_FONT_PREFIX)) {
    return fontId.slice(DEVICE_FONT_PREFIX.length);
  }
  const bold = /bold|black|heavy/i.test(fontId);
  const italic = /italic|oblique/i.test(fontId);
  const mono = /mono|courier|consol/i.test(fontId);
  // "roman"/"cmr"/"lmroman" cover LaTeX Computer Modern serif families.
  const serif =
    !mono &&
    /times|serif|roman|georgia|garamond|minion|palatino|cambria|book\s?antiqua|(^|[^a-z])(cmr|lmroman|lmr)/i.test(
      fontId,
    );
  if (mono) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (serif) {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
