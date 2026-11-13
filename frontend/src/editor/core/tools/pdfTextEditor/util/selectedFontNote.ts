import {
  RENDER_MODE_INVISIBLE,
  type PageSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import {
  analyzePageFonts,
  coverageFor,
  missingAlnumFromCmap,
  type FontStatus,
  type GlyphCoverage,
} from "@editor/tools/pdfTextEditor/util/pageFonts";
import {
  deviceFontCoverage,
  visibleCodePoints,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  familyOf,
  isDeviceFontId,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  fontCompletionFor,
  type FontCompletionSource,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";

const MAX_LISTED_GLYPHS = 6;
const PDF_FONT_FALLBACK = "Helvetica";

export type SelectedFontNote =
  | { kind: "scanned" }
  | { kind: "embeddedUnknown" }
  | { kind: "gap"; name: string; glyphs: string; fallback: string }
  | { kind: "deviceUnknown"; name: string; fallback: string }
  | { kind: "completed"; name: string; source: FontCompletionSource };

interface SelectedRuns {
  fontIds: Set<string>;
  /** Those of `fontIds` the document embeds only in part. */
  subsetFontIds: Set<string>;
  text: string;
  scanned: number;
}

function collectSelectedRuns(
  pages: PageSnapshot[],
  runIds: string[],
): SelectedRuns {
  const picked = new Set(runIds);
  const fontIds = new Set<string>();
  const subsetFontIds = new Set<string>();
  let text = "";
  let scanned = 0;
  for (const page of pages)
    for (const run of page.runs)
      if (picked.has(run.id)) {
        fontIds.add(run.fontId);
        if (run.fontSubset) subsetFontIds.add(run.fontId);
        text += run.text;
        if (run.renderMode === RENDER_MODE_INVISIBLE) scanned++;
      }
  return { fontIds, subsetFontIds, text, scanned };
}

function standardFallbackName(family: string): string {
  return nearestStandardFont(family).split("-")[0];
}

function missingFromCoverage(
  coverage: ReadonlySet<number>,
  text: string,
): string[] {
  const missing = new Set<string>();
  for (const cp of visibleCodePoints(text))
    if (!coverage.has(cp)) missing.add(String.fromCodePoint(cp));
  for (const ch of missingAlnumFromCmap(coverage)) missing.add(ch);
  return [...missing];
}

function deviceFontNote(family: string, text: string): SelectedFontNote | null {
  const fallback = standardFallbackName(family);
  const coverage = deviceFontCoverage(family);
  if (!coverage) return { kind: "deviceUnknown", name: family, fallback };
  const missing = missingFromCoverage(coverage, text);
  if (missing.length === 0) return null;
  return {
    kind: "gap",
    name: family,
    glyphs: missing.slice(0, MAX_LISTED_GLYPHS).join(" "),
    fallback,
  };
}

function completedNote(fontIds: Iterable<string>): SelectedFontNote | null {
  const found = [...fontIds].map(fontCompletionFor);
  const first = found[0];
  if (!first || found.some((c) => c?.family !== first.family)) return null;
  const source = found.every((c) => c?.source === "original")
    ? "original"
    : "closest";
  return { kind: "completed", name: first.family, source };
}

// analyzePageFonts merges same-named fonts, device faces included, so read each selected font's own coverage.
function selectedCoverage(
  fontIds: Set<string>,
  status: FontStatus,
): GlyphCoverage {
  const missing = new Set<string>();
  let known = true;
  for (const id of fontIds) {
    const coverage = coverageFor(id, status);
    known &&= coverage.known;
    for (const ch of coverage.missing) missing.add(ch);
  }
  return { known, missing: [...missing] };
}

function documentFontNote(
  pages: PageSnapshot[],
  fontIds: Set<string>,
  allSubset: boolean,
): SelectedFontNote | null {
  const fonts = analyzePageFonts(pages).filter((f) =>
    Array.from(fontIds).some((id) => id.endsWith(f.name)),
  );
  const font = fonts.length === 1 ? fonts[0] : null;
  const coverage = font ? selectedCoverage(fontIds, font.status) : null;
  const gaps = coverage?.missing ?? [];
  const complete = !!font && (font.status === "standard" || !!coverage?.known);
  // A subset says so itself, whatever the page-wide coverage scan concludes.
  const mayLack = allSubset || (!!font && (gaps.length > 0 || !complete));
  const completed = mayLack ? completedNote(fontIds) : null;
  if (completed) return completed;
  if (!font) return null;
  if (gaps.length > 0) {
    return {
      kind: "gap",
      name: font.name,
      glyphs: gaps.slice(0, MAX_LISTED_GLYPHS).join(" "),
      fallback: PDF_FONT_FALLBACK,
    };
  }
  return complete ? null : { kind: "embeddedUnknown" };
}

export function selectedFontNote(
  pages: PageSnapshot[],
  runIds: string[],
): SelectedFontNote | null {
  if (runIds.length === 0) return null;
  const { fontIds, subsetFontIds, text, scanned } = collectSelectedRuns(
    pages,
    runIds,
  );
  if (fontIds.size === 0) return null;
  if (scanned === runIds.length) return { kind: "scanned" };
  const ids = [...fontIds];
  if (ids.every(isDeviceFontId)) {
    const families = [...new Set(ids.map(familyOf))];
    return families.length === 1 ? deviceFontNote(families[0], text) : null;
  }
  if (ids.some(isDeviceFontId)) return null;
  return documentFontNote(pages, fontIds, subsetFontIds.size === fontIds.size);
}
