import i18n from "i18next";

/**
 * Text the editor cannot draw faithfully. A text object draws each code
 * point's own glyph with nothing between the text and the page to apply a
 * font's shaping tables, so these come out wrong rather than missing:
 *
 * - the vowel signs, viramas and subjoined letters of the Indic and other
 *   Brahmic scripts, which reorder, stack or form conjuncts;
 * - every letter of a joining script with no presentation forms to write it
 *   in (Arabic has them, see arabicShaping);
 * - Thai and Lao marks stacked on another mark, or set on a consonant whose
 *   ascender or descender the mark has to move clear of. A single mark on
 *   any other consonant sits where the font's default placement puts it,
 *   which is where shaping puts it too.
 *
 * Devanagari vowel signs that follow their consonant and join nothing are
 * drawn right as they are.
 */
const CLUSTERING_SCRIPT =
  /[\p{sc=Deva}\p{sc=Beng}\p{sc=Guru}\p{sc=Gujr}\p{sc=Orya}\p{sc=Taml}\p{sc=Telu}\p{sc=Knda}\p{sc=Mlym}\p{sc=Sinh}\p{sc=Tibt}\p{sc=Mymr}\p{sc=Khmr}\p{sc=Bali}\p{sc=Java}\p{sc=Sund}\p{sc=Lana}\p{sc=Tale}\p{sc=Cakm}\p{sc=Shrd}\p{sc=Takr}\p{sc=Gran}\p{sc=Newa}\p{sc=Mtei}\p{sc=Lepc}\p{sc=Limb}\p{sc=Bugi}\p{sc=Batk}\p{sc=Tglg}]/u;
const STACKING_SCRIPT = /[\p{sc=Thai}\p{sc=Laoo}]/u;
const TALL_OR_DEEP_THAI = /[\u0E0D\u0E10\u0E1B\u0E1D\u0E1F\u0E2C]/u;
const JOINING_SCRIPT = /[\p{sc=Syrc}\p{sc=Nkoo}\p{sc=Mong}\p{sc=Adlm}]/u;
const MARK = /\p{M}/u;
// Every spacing Devanagari sign but the pre-base i matras, U+093F and U+094E.
const DRAWN_IN_PLACE = /[\u0903\u093B\u093E\u0940\u0949-\u094C\u094F]/u;

export function needsShaping(text: string): boolean {
  let previous = "";
  for (const ch of text) {
    if (JOINING_SCRIPT.test(ch)) return true;
    if (MARK.test(ch)) {
      if (CLUSTERING_SCRIPT.test(ch) && !DRAWN_IN_PLACE.test(ch)) return true;
      if (
        STACKING_SCRIPT.test(ch) &&
        (MARK.test(previous) || TALL_OR_DEEP_THAI.test(previous))
      )
        return true;
    }
    previous = ch;
  }
  return false;
}

export function needsShapingMessage(): string {
  return i18n.t(
    "pdfTextEditor.error.needsShaping",
    "The editor can't yet draw this script's joined letters and vowel signs correctly, so this change was not made.",
  );
}
