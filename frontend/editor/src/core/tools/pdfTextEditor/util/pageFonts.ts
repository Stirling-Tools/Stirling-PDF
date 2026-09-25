import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";
import { getCachedFontGlyphMap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";

// Editability status of a font as the PDF text editor can determine it purely
// client-side (from PDFium), without the backend JSON font model.
export type FontStatus = "standard" | "embedded" | "subset";

// Whether the font has real glyphs for the basic alphanumerics (a-z A-Z 0-9).
export interface GlyphCoverage {
  known: boolean;
  missing: string[];
}

export interface PageFont {
  /** Stable de-dupe key (display name + status). */
  key: string;
  /** Display family name with any subset tag stripped. */
  name: string;
  status: FontStatus;
  /** 1-based page numbers this font appears on (across loaded pages). */
  pages: number[];
  /** Basic-alphanumeric glyph coverage (from the loader-primed cmap cache). */
  coverage: GlyphCoverage;
}

/** Code points for a-z, A-Z, 0-9 - the "can I type a letter/number?" probe. */
const ALNUM_CODEPOINTS: readonly number[] = (() => {
  const out: number[] = [];
  for (let c = 0x30; c <= 0x39; c++) out.push(c); // 0-9
  for (let c = 0x41; c <= 0x5a; c++) out.push(c); // A-Z
  for (let c = 0x61; c <= 0x7a; c++) out.push(c); // a-z
  return out;
})();

/** Pure: which of a-z A-Z 0-9 are absent from a Unicode→glyphId cmap. */
export function missingAlnumFromCmap(cmap: Map<number, number>): string[] {
  const out: string[] = [];
  for (const cp of ALNUM_CODEPOINTS)
    if (!cmap.has(cp)) out.push(String.fromCodePoint(cp));
  return out;
}

/** Parse the live PDFium font handle out of a `pdf:<ptr>:<family>` fontId. */
function fontHandleOf(fontId: string): number {
  if (!fontId.startsWith("pdf:")) return 0;
  const n = Number(fontId.split(":")[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** a-zA-Z0-9 coverage for a font, from the loader-primed cache (no WASM). */
function coverageFor(fontId: string, status: FontStatus): GlyphCoverage {
  // Base-14 fonts carry the whole standard set - always full, no cmap needed.
  if (status === "standard") return { known: true, missing: [] };
  const handle = fontHandleOf(fontId);
  if (!handle) return { known: false, missing: [] };
  const cmap = getCachedFontGlyphMap(handle);
  if (!cmap || cmap.size === 0) return { known: false, missing: [] };
  return { known: true, missing: missingAlnumFromCmap(cmap) };
}

// Symbol/ZapfDingbats are intentionally excluded: their a-z/A-Z slots are Greek
// letters / dingbats, not Latin alphanumerics.
const STANDARD_14 = [
  "helvetica",
  "arial",
  "times",
  "timesroman",
  "timesnewroman",
  "courier",
  "couriernew",
];

// Style suffixes a genuine base-14 family may carry once separators are stripped
// (e.g. "Helvetica-BoldOblique", "ArialMT", "Times-Roman").
const BASE14_STYLE_SUFFIX = /^(bold|italic|oblique|regular|roman|mt|ps)+$/;

/** Pull the readable family from a fontId (`pdf:<ptr>:<family>` or `base14:<name>`). */
function familyOf(fontId: string): string {
  if (fontId.startsWith("base14:")) return fontId.slice("base14:".length);
  const parts = fontId.split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : fontId;
}

/** Subset fonts carry a 6-letter "ABCDEF+" tag; strip it for display. */
function stripSubsetTag(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, "");
}

// Weight/width modifiers that mark a DIFFERENT font even when the name starts
// with a base-14 root (e.g. "Arial Black", "Helvetica Neue Condensed").
const NON_BASE14_MODIFIERS = [
  "black",
  "rounded",
  "narrow",
  "condensed",
  "light",
  "thin",
  "hairline",
  "semibold",
  "demibold",
  "demi",
  "medium",
  "heavy",
  "ultra",
  "display",
  "neue",
];

function isStandard14(fontId: string): boolean {
  // Callers pass the full fontId (`pdf:<ptr>:Family`); reduce to the bare
  // family first so the `pdf:<ptr>:` prefix can't defeat the prefix match.
  const f = stripSubsetTag(familyOf(fontId))
    .toLowerCase()
    .replace(/[-_\s]/g, "");
  if (NON_BASE14_MODIFIERS.some((mod) => f.includes(mod))) return false;
  // Exact match, or a base-14 root whose remainder is ONLY a recognised style
  // suffix (Bold/Italic/Oblique/MT/PS...).
  return STANDARD_14.some(
    (p) =>
      f === p ||
      (f.startsWith(p) && BASE14_STYLE_SUFFIX.test(f.slice(p.length))),
  );
}

// Group every run across the given (loaded) pages into a de-duplicated list of
// fonts with an editability status.
export function analyzePageFonts(pages: PageSnapshot[]): PageFont[] {
  const map = new Map<string, PageFont>();
  for (const page of pages) {
    for (const run of page.runs) {
      const name = stripSubsetTag(familyOf(run.fontId)) || "Unknown font";
      let status: FontStatus;
      if (run.fontId.startsWith("base14:") || isStandard14(run.fontId)) {
        status = "standard";
      } else if (run.fontSubset) {
        status = "subset";
      } else {
        status = "embedded";
      }
      const key = `${name}|${status}`;
      const pageNo = page.pageIndex + 1;
      const existing = map.get(key);
      if (existing) {
        if (!existing.pages.includes(pageNo)) existing.pages.push(pageNo);
      } else {
        map.set(key, {
          key,
          name,
          status,
          pages: [pageNo],
          coverage: coverageFor(run.fontId, status),
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
