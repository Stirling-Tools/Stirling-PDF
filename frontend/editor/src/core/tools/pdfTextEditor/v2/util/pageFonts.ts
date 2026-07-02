import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";
import { getCachedFontGlyphMap } from "@app/tools/pdfTextEditor/v2/charcode/CmapResolver";

/**
 * Editability status of a font as the v2 editor can determine it purely
 * client-side (from PDFium), without the backend JSON font model.
 *
 * In ALL three cases the EXISTING text edits perfectly - every glyph already
 * on the page is reused as-is. The status describes what happens to BRAND-NEW
 * characters the user types that the document didn't already contain:
 *
 *  - "standard": one of the base-14 PDF fonts (Helvetica/Times/Courier/...).
 *    The full standard (WinAnsi/Latin-1) character set is always available, so
 *    typing common new characters renders in the same font.
 *  - "embedded": a full (non-subset) embedded font. Its glyph repertoire ships
 *    in the PDF, but that repertoire is whatever the font file happens to hold
 *    - NOT every possible character. A new character the font includes renders
 *    in it; one it lacks (e.g. an accented or non-Latin glyph in a Latin-only
 *    font) falls back to a standard font.
 *  - "subset": only the glyphs the document already uses are embedded. A new
 *    character the document never used is almost always absent, so it falls
 *    back to a standard font.
 *
 * So "embedded" is NOT a guarantee of perfect new-character editing - it's
 * "better than subset, not as universal as standard". The UI labels it
 * accordingly rather than claiming zero issues.
 */
export type FontStatusV2 = "standard" | "embedded" | "subset";

/**
 * Whether the font has real glyphs for the basic alphanumerics (a-z A-Z 0-9).
 * Read CLIENT-SIDE from the embedded font's cmap, which the document loader
 * primes into a cache during its serialized text-read phase (reading font data
 * at render time corrupts PDFium - see CmapResolver.primeFontGlyphMap).
 *  - `known: true`  -> the cmap was available; `missing` lists the
 *    alphanumerics with no glyph (empty = full coverage).
 *  - `known: false` -> coverage couldn't be read (font not primed, or a Type3 /
 *    custom-encoded Type1 font with no parseable cmap).
 * Standard (base-14) fonts are always `known` with full coverage.
 */
export interface GlyphCoverage {
  known: boolean;
  missing: string[];
}

export interface PageFont {
  /** Stable de-dupe key (display name + status). */
  key: string;
  /** Display family name with any subset tag stripped. */
  name: string;
  status: FontStatusV2;
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

/**
 * Pure: which of a-z A-Z 0-9 are absent from a Unicode→glyphId cmap. Split out
 * so the (font-free) logic is unit-testable without a real PDFium font.
 */
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
function coverageFor(fontId: string, status: FontStatusV2): GlyphCoverage {
  // Base-14 fonts carry the whole standard set - always full, no cmap needed.
  if (status === "standard") return { known: true, missing: [] };
  const handle = fontHandleOf(fontId);
  if (!handle) return { known: false, missing: [] };
  const cmap = getCachedFontGlyphMap(handle);
  if (!cmap || cmap.size === 0) return { known: false, missing: [] };
  return { known: true, missing: missingAlnumFromCmap(cmap) };
}

// Symbol/ZapfDingbats are intentionally excluded: their a-z/A-Z slots are Greek
// letters / dingbats, not Latin alphanumerics, so they are not safe-fallback
// families and must not be badged "standard" with full alnum coverage.
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

/** Pull the readable family from a v2 fontId (`pdf:<ptr>:<family>` or `base14:<name>`). */
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
// with a base-14 root (e.g. "Arial Black", "Helvetica Neue Condensed"). Such a
// font is NOT guaranteed to be the always-available base-14 family, so it must
// fall through to the real coverage probe rather than be labelled "standard".
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
  // suffix (Bold/Italic/Oblique/MT/PS...). An open-ended startsWith would absorb
  // distinct families like "TimesTen-Roman" or "Courier Prime".
  return STANDARD_14.some(
    (p) =>
      f === p ||
      (f.startsWith(p) && BASE14_STYLE_SUFFIX.test(f.slice(p.length))),
  );
}

/**
 * Group every run across the given (loaded) pages into a de-duplicated list of
 * fonts with an editability status. A subset of a standard family (e.g.
 * "ABCDEF+Helvetica") is reported as "standard" because new characters can
 * safely fall back to the base-14 full font.
 */
export function analyzePageFonts(pages: PageSnapshot[]): PageFont[] {
  const map = new Map<string, PageFont>();
  for (const page of pages) {
    for (const run of page.runs) {
      const name = stripSubsetTag(familyOf(run.fontId)) || "Unknown font";
      let status: FontStatusV2;
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
