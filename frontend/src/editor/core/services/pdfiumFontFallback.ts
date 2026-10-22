import { getFontBaseUrl } from "@app/services/fontBaseUrl";
import type { FontFallbackConfig, FontVariant } from "@embedpdf/engines";
import { FontCharset } from "@embedpdf/models";

const liberation = (family: "Sans" | "Serif" | "Mono"): FontVariant[] => [
  { url: `Liberation${family}-Regular.ttf`, weight: 400 },
  { url: `Liberation${family}-Bold.ttf`, weight: 700 },
  { url: `Liberation${family}-Italic.ttf`, weight: 400, italic: true },
  { url: `Liberation${family}-BoldItalic.ttf`, weight: 700, italic: true },
];

// The WASM PDFium build ships no standard-14 fonts, so a document's
// non-embedded Helvetica or Arial is drawn with this face. It must share their
// advance widths: a wider face overruns the PDF's glyph positions, swallowing
// word spaces or pushing justified lines past the margin.
const METRIC_COMPATIBLE_SANS = liberation("Sans");

/**
 * Fonts the engine substitutes for characters missing from a document.
 *
 * Must always return the object: the EmbedPDF engine selects its jsDelivr
 * defaults when `fontFallback` is omitted, and disables fallback entirely when
 * it is `null`. Keeping the files here and the base on our own `/fonts` route
 * is what keeps that CDN out of the render path. Charsets without a face
 * (SYMBOL) resolve to `defaultFont`.
 */
export function getLocalFontFallbackConfig(): FontFallbackConfig {
  return {
    baseUrl: getFontBaseUrl(),
    defaultFont: "NotoSans-Regular.ttf",
    fonts: {
      [FontCharset.ANSI]: METRIC_COMPATIBLE_SANS,
      [FontCharset.DEFAULT]: METRIC_COMPATIBLE_SANS,
      [FontCharset.CYRILLIC]: METRIC_COMPATIBLE_SANS,
      [FontCharset.GREEK]: METRIC_COMPATIBLE_SANS,
      [FontCharset.VIETNAMESE]: "NotoSans-Regular.ttf",
      [FontCharset.EASTERNEUROPEAN]: METRIC_COMPATIBLE_SANS,
      [FontCharset.ARABIC]: "NotoSansArabic-Regular.ttf",
      [FontCharset.HEBREW]: "NotoSansHebrew-Regular.ttf",
      [FontCharset.THAI]: "NotoSansThai-Regular.ttf",
      [FontCharset.SHIFTJIS]: "NotoSansJP-Regular.ttf",
      [FontCharset.HANGEUL]: "NotoSansKR-Regular.ttf",
      [FontCharset.GB2312]: "NotoSansSC-Regular.ttf",
      [FontCharset.CHINESEBIG5]: "NotoSansTC-Regular.ttf",
    },
    // Times and Courier counterparts with matching widths; selected by the
    // local @embedpdf/engines patch (scripts/patch-embedpdf-font-fallback.mjs).
    fontFamilies: {
      serif: liberation("Serif"),
      monospace: liberation("Mono"),
    },
  };
}
