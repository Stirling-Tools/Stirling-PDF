import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

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

export interface PageFont {
  /** Stable de-dupe key (display name + status). */
  key: string;
  /** Display family name with any subset tag stripped. */
  name: string;
  status: FontStatusV2;
  /** 1-based page numbers this font appears on (across loaded pages). */
  pages: number[];
}

const STANDARD_14 = [
  "helvetica",
  "arial",
  "times",
  "timesroman",
  "timesnewroman",
  "courier",
  "couriernew",
  "symbol",
  "zapfdingbats",
];

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

function isStandard14(family: string): boolean {
  const f = stripSubsetTag(family)
    .toLowerCase()
    .replace(/[-_\s]/g, "");
  return STANDARD_14.some((p) => f === p || f.includes(p));
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
        map.set(key, { key, name, status, pages: [pageNo] });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
