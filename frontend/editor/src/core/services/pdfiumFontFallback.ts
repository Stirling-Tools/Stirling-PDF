import { BASE_PATH } from "@app/constants/app";
import type { FontFallbackConfig } from "@embedpdf/engines";
import { FontCharset } from "@embedpdf/models";

export function getLocalFontFallbackConfig(): FontFallbackConfig {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = `${origin}${BASE_PATH}/fonts`;

  return {
    baseUrl,
    defaultFont: "NotoSans-Regular.ttf",
    fonts: {
      [FontCharset.ANSI]: "NotoSans-Regular.ttf",
      [FontCharset.DEFAULT]: "NotoSans-Regular.ttf",
      [FontCharset.CYRILLIC]: "NotoSans-Regular.ttf",
      [FontCharset.GREEK]: "NotoSans-Regular.ttf",
      [FontCharset.VIETNAMESE]: "NotoSans-Regular.ttf",
      [FontCharset.EASTERNEUROPEAN]: "NotoSans-Regular.ttf",
      [FontCharset.ARABIC]: "NotoSansArabic-Regular.ttf",
      [FontCharset.THAI]: "NotoSansThai-Regular.ttf",
      [FontCharset.SHIFTJIS]: "NotoSansJP-Regular.ttf",
      [FontCharset.HANGEUL]: "NotoSansKR-Regular.ttf",
      [FontCharset.GB2312]: "NotoSansSC-Regular.ttf",
      [FontCharset.CHINESEBIG5]: "NotoSansTC-Regular.ttf",
    },
  };
}
