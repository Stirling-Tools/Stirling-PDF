/**
 * Map a source font id to the base-14 family + style that best preserves its
 * broad class. We fall back to a base-14 font when the source is a subset /
 * form-xobject we can't reuse; picking Times for serif sources and Courier for
 * monospace ones (instead of always Helvetica) keeps a re-emitted run from
 * flipping to sans-serif - a serif LaTeX body or a monospace code listing keeps
 * its character. Bold/italic are preserved with each family's CANONICAL
 * base-14 spelling (Times uses Italic/BoldItalic; Helvetica/Courier use
 * Oblique/BoldOblique) so no viewer silently substitutes a missing name.
 *
 * Class + weight are sniffed from the font id string (the only signal available
 * here). A weight that lives solely in the FontDescriptor flags - not the name -
 * can't be seen and falls back to regular.
 */
export function helveticaVariantFor(fontId: string): string {
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
