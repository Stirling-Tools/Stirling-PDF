/**
 * Map a source font id to the base-14 Helvetica variant that best
 * preserves its bold/italic style. We fall back to Helvetica when the
 * source is a subset font / form-xobject text we can't reuse, so this
 * picks the variant that keeps bolding/italicising visible.
 */
export function helveticaVariantFor(fontId: string): string {
  const bold = /bold/i.test(fontId);
  const italic = /italic|oblique/i.test(fontId);
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
