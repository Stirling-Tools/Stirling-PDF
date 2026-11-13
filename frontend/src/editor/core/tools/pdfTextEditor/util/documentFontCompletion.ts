import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  documentFontHandle,
  familyOf,
  nearestStandardFont,
  stripSubsetTag,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  getExternalFontBytes,
  loadExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  faceStyleFlags,
  pickLocalFontFace,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { embeddedFontProgram } from "@editor/tools/pdfTextEditor/util/embeddedFace";
import { compareFontPrograms } from "@editor/tools/pdfTextEditor/util/fontProgramMatch";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";

// Which font draws the characters an embedded subset lacks: the same typeface when installed or served, else the closest available one.

/** `original` is the document's own typeface; `closest` is a lookalike. */
export type FontCompletionSource = "original" | "closest";

export interface FontCompletion {
  /** A family the text emitter can draw in right now. */
  family: string;
  source: FontCompletionSource;
}

// Keyed by PDFium font handle, unique only within one open document: EditorStore resets them with its other pointer-keyed caches.
const completions = new Map<number, FontCompletion>();
const refused = new Set<number>();
const lookedUp = new Map<number, LocalFont[]>();
const lookingUp = new Set<number>();
const listeners = new Set<() => void>();
let generation = 0;

function changed(): void {
  generation++;
  for (const listener of listeners) listener();
}

export function subscribeFontCompletions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fontCompletionsGeneration(): number {
  return generation;
}

export function resetFontCompletions(): void {
  completions.clear();
  refused.clear();
  lookedUp.clear();
  lookingUp.clear();
  changed();
}

function drawable(family: string): boolean {
  return (
    nearestStandardFont(family) === family || !!getExternalFontBytes(family)
  );
}

/** The font standing in for the characters `fontId` lacks, once one is known. */
export function fontCompletionFor(fontId: string): FontCompletion | null {
  const found = completions.get(documentFontHandle(fontId));
  return found && drawable(found.family) ? found : null;
}

/** True when a font with this document font's name is available but is a different typeface, so the name alone must not be trusted. */
export function fontNameRefused(fontId: string): boolean {
  return refused.has(documentFontHandle(fontId));
}

/** Whether {@link resolveOriginalFonts} has finished looking for `fontId`. */
export function originalFontLookedUp(fontId: string): boolean {
  return lookedUp.has(documentFontHandle(fontId));
}

export function setClosestFont(fontId: string, family: string): void {
  const handle = documentFontHandle(fontId);
  if (!handle || completions.get(handle)?.source === "original") return;
  completions.set(handle, { family, source: "closest" });
  changed();
}

function baseFontName(m: WrappedPdfiumModule, handle: number): string | null {
  const name = readFontName(m, handle);
  return name ? stripSubsetTag(name) : null;
}

/** Whether `fontId` is the document's own font and may need completing; judged by the PDF's /BaseFont, since a named standard font is drawn by a stand-in ("Chrom Sans OTF"). */
export function fontCanBeCompleted(
  m: WrappedPdfiumModule,
  fontId: string,
): boolean {
  const handle = documentFontHandle(fontId);
  const family = familyOf(fontId);
  if (!handle || !family || nearestStandardFont(family) === family)
    return false;
  const named = baseFontName(m, handle);
  return !named || nearestStandardFont(named) !== named;
}

const letters = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// A PostScript name identifies one face, where a family name needs the style guessed: "Arial-BoldMT" is the bold cut of "Arial".
function requestForPostScriptName(
  fonts: LocalFont[],
  name: string,
): string | null {
  const wanted = letters(name);
  const face = wanted
    ? fonts.find((font) => letters(font.postscriptName) === wanted)
    : undefined;
  if (!face) return null;
  const { bold, italic } = faceStyleFlags(face);
  const flagged = [face.family, bold ? "Bold" : "", italic ? "Italic" : ""]
    .filter(Boolean)
    .join(" ");
  if (pickLocalFontFace(fonts, flagged) === face) return flagged;
  return pickLocalFontFace(fonts, face.fullName) === face
    ? face.fullName
    : null;
}

function candidateRequests(
  fonts: LocalFont[],
  baseName: string | null,
  family: string,
): string[] {
  const byName = baseName ? requestForPostScriptName(fonts, baseName) : null;
  const byFamily = pickLocalFontFace(fonts, family) ? family : null;
  return [...new Set([byName, byFamily].filter((r): r is string => !!r))];
}

function readEmbeddedProgram(
  m: WrappedPdfiumModule,
  handle: number,
): Uint8Array | null {
  try {
    return embeddedFontProgram(m, handle);
  } catch {
    return null;
  }
}

type Lookup =
  | { kind: "accepted"; family: string }
  | { kind: "mismatched" }
  | { kind: "none" }
  | { kind: "closed" };

async function lookUpOriginal(
  m: WrappedPdfiumModule,
  fontId: string,
  fonts: LocalFont[],
  stillOpen: () => boolean,
): Promise<Lookup> {
  const handle = documentFontHandle(fontId);
  const requests = candidateRequests(
    fonts,
    baseFontName(m, handle),
    familyOf(fontId),
  );
  if (requests.length === 0) return { kind: "none" };
  const embedded = readEmbeddedProgram(m, handle);
  let mismatched = false;
  for (const request of requests) {
    const bytes = await loadExternalFontBytes(request);
    if (!stillOpen()) return { kind: "closed" };
    if (!bytes) continue;
    const verdict = embedded ? compareFontPrograms(embedded, bytes) : "unknown";
    if (verdict !== "different") return { kind: "accepted", family: request };
    mismatched = true;
  }
  return mismatched ? { kind: "mismatched" } : { kind: "none" };
}

function record(handle: number, lookup: Lookup): void {
  if (lookup.kind === "accepted") {
    refused.delete(handle);
    completions.set(handle, { family: lookup.family, source: "original" });
  } else if (lookup.kind === "mismatched") {
    refused.add(handle);
    if (completions.get(handle)?.source === "original")
      completions.delete(handle);
  }
}

/** Finds each embedded font's installed or served namesake and keeps it only if its glyphs agree; `stillOpen` is asked after every file read. */
export async function resolveOriginalFonts(
  m: WrappedPdfiumModule,
  fontIds: Iterable<string>,
  stillOpen: () => boolean,
): Promise<void> {
  const fonts = loadedExternalFonts();
  if (!fonts || fonts.length === 0) return;
  const ids = new Set(fontIds);
  for (const fontId of ids) {
    const handle = documentFontHandle(fontId);
    if (lookedUp.get(handle) === fonts || lookingUp.has(handle)) continue;
    if (!fontCanBeCompleted(m, fontId)) continue;
    lookingUp.add(handle);
    const lookup = await lookUpOriginal(m, fontId, fonts, stillOpen);
    if (lookup.kind === "closed") return;
    lookingUp.delete(handle);
    record(handle, lookup);
    lookedUp.set(handle, fonts);
    changed();
  }
  // A call made while this one was reading skipped the fonts it was looking up.
  if (stillOpen() && loadedExternalFonts() !== fonts)
    await resolveOriginalFonts(m, ids, stillOpen);
}
