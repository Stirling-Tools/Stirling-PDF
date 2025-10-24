import { PDFFont, PDFDocument, StandardFonts } from 'pdf-lib';

type FontSource =
  | { type: 'standard'; name: StandardFonts }
  | { type: 'remote'; url: string };

const FONT_SOURCES: Record<string, FontSource> = {
  roman: { type: 'standard', name: StandardFonts.Helvetica },
  arabic: { type: 'remote', url: '/static/fonts/NotoSansArabic-Regular.ttf' },
  japanese: { type: 'remote', url: '/static/fonts/Meiryo.ttf' },
  korean: { type: 'remote', url: '/static/fonts/malgun.ttf' },
  chinese: { type: 'remote', url: '/static/fonts/SimSun.ttf' },
  thai: { type: 'remote', url: '/static/fonts/NotoSansThai-Regular.ttf' },
};

const fontBytesCache = new Map<string, Uint8Array>();

const embeddedFontCache = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();

const FALLBACK_FONT: FontSource = { type: 'standard', name: StandardFonts.Helvetica };

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const cached = fontBytesCache.get(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch font from ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  fontBytesCache.set(url, bytes);
  return bytes;
}

export async function loadFontForAlphabet(
  pdfDoc: PDFDocument,
  alphabet: string | undefined
): Promise<PDFFont> {
  const key = alphabet && FONT_SOURCES[alphabet] ? alphabet : 'roman';
  const source = FONT_SOURCES[key] ?? FALLBACK_FONT;

  let perDocCache = embeddedFontCache.get(pdfDoc);
  if (!perDocCache) {
    perDocCache = new Map<string, Promise<PDFFont>>();
    embeddedFontCache.set(pdfDoc, perDocCache);
  }

  const cacheKey = source.type === 'standard' ? source.name : source.url;
  const existing = perDocCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  let fontPromise: Promise<PDFFont>;
  if (source.type === 'standard') {
    fontPromise = pdfDoc.embedFont(source.name, { subset: true });
  } else {
    fontPromise = fetchFontBytes(source.url)
      .then(bytes => pdfDoc.embedFont(bytes, { subset: true }))
      .catch(async () => {
        // Fall back to a standard font if remote font loading fails
        return pdfDoc.embedFont(FALLBACK_FONT.name, { subset: true });
      });
  }

  perDocCache.set(cacheKey, fontPromise);
  return fontPromise;
}
