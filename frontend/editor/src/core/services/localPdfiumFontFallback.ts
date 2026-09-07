import { fonts as latinFonts } from "@embedpdf/fonts-latin";
import { FontCharset } from "@embedpdf/models";
import { withBasePath } from "@app/constants/app";

const localLatinFonts = latinFonts.map(({ file, weight, italic }) => ({
  url: withBasePath(`/pdfium/fonts/${file}`),
  weight,
  ...(italic ? { italic } : {}),
}));

// PDFium/WASM cannot discover Windows fonts. Keep the fallback assets inside the
// desktop bundle so non-embedded Cyrillic fonts also render while offline.
export const localPdfiumFontFallback = {
  fonts: {
    [FontCharset.CYRILLIC]: localLatinFonts,
    [FontCharset.GREEK]: localLatinFonts,
    [FontCharset.VIETNAMESE]: localLatinFonts,
  },
  defaultFont: localLatinFonts,
};
