import { getFontBaseUrl } from "@app/services/fontBaseUrl";
import type { FontFallbackConfig } from "@embedpdf/engines";
import { FontCharset } from "@embedpdf/models";

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
      [FontCharset.ANSI]: "NotoSans-Regular.ttf",
      [FontCharset.DEFAULT]: "NotoSans-Regular.ttf",
      [FontCharset.CYRILLIC]: "NotoSans-Regular.ttf",
      [FontCharset.GREEK]: "NotoSans-Regular.ttf",
      [FontCharset.VIETNAMESE]: "NotoSans-Regular.ttf",
      [FontCharset.EASTERNEUROPEAN]: "NotoSans-Regular.ttf",
      [FontCharset.ARABIC]: "NotoSansArabic-Regular.ttf",
      [FontCharset.HEBREW]: "NotoSansHebrew-Regular.ttf",
      [FontCharset.THAI]: "NotoSansThai-Regular.ttf",
      [FontCharset.SHIFTJIS]: "NotoSansJP-Regular.ttf",
      [FontCharset.HANGEUL]: "NotoSansKR-Regular.ttf",
      [FontCharset.GB2312]: "NotoSansSC-Regular.ttf",
      [FontCharset.CHINESEBIG5]: "NotoSansTC-Regular.ttf",
    },
  };
}
