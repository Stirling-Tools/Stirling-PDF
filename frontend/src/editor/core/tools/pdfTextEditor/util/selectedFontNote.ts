import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  analyzePageFonts,
  isDeviceFontId,
  missingAlnumFromCmap,
} from "@editor/tools/pdfTextEditor/util/pageFonts";
import { deviceFontCoverage } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  familyOf,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";

const MAX_LISTED_GLYPHS = 6;
const PDF_FONT_FALLBACK = "Helvetica";

export type SelectedFontNote =
  | { kind: "scanned" }
  | { kind: "embeddedUnknown" }
  | { kind: "gap"; name: string; glyphs: string; fallback: string }
  | { kind: "deviceUnknown"; name: string; fallback: string };

interface SelectedRuns {
  fontIds: Set<string>;
  text: string;
  scanned: number;
}

function collectSelectedRuns(
  pages: PageSnapshot[],
  runIds: string[],
): SelectedRuns {
  const picked = new Set(runIds);
  const fontIds = new Set<string>();
  let text = "";
  let scanned = 0;
  for (const page of pages)
    for (const run of page.runs)
      if (picked.has(run.id)) {
        fontIds.add(run.fontId);
        text += run.text;
        if (run.renderMode === 3) scanned++;
      }
  return { fontIds, text, scanned };
}

function standardFallbackName(family: string): string {
  return nearestStandardFont(family).split("-")[0];
}

function missingFromCoverage(
  coverage: Map<number, number>,
  text: string,
): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0);
    if (cp !== undefined && !coverage.has(cp)) missing.add(ch);
  }
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

function documentFontNote(
  pages: PageSnapshot[],
  fontIds: Set<string>,
): SelectedFontNote | null {
  const fonts = analyzePageFonts(pages).filter((f) =>
    Array.from(fontIds).some((id) => id.endsWith(f.name)),
  );
  if (fonts.length !== 1) return null;
  const font = fonts[0];
  const gaps = font.coverage.known ? font.coverage.missing : [];
  if (gaps.length > 0) {
    return {
      kind: "gap",
      name: font.name,
      glyphs: gaps.slice(0, MAX_LISTED_GLYPHS).join(" "),
      fallback: PDF_FONT_FALLBACK,
    };
  }
  if (font.status === "standard" || font.coverage.known) return null;
  return { kind: "embeddedUnknown" };
}

export function selectedFontNote(
  pages: PageSnapshot[],
  runIds: string[],
): SelectedFontNote | null {
  if (runIds.length === 0) return null;
  const { fontIds, text, scanned } = collectSelectedRuns(pages, runIds);
  if (fontIds.size === 0) return null;
  if (scanned === runIds.length) return { kind: "scanned" };
  const ids = [...fontIds];
  if (ids.every(isDeviceFontId)) {
    const families = [...new Set(ids.map(familyOf))];
    return families.length === 1 ? deviceFontNote(families[0], text) : null;
  }
  if (ids.some(isDeviceFontId)) return null;
  return documentFontNote(pages, fontIds);
}
