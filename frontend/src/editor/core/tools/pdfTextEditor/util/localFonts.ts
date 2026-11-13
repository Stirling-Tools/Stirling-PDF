// The fonts installed on this device; the source may be missing or refuse, so every entry point degrades instead of throwing.

import { fontFace } from "@editor/tools/pdfTextEditor/util/fontCollection";
import {
  embeddingForbidden,
  hasTrueTypeOutlines,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";
import {
  hasDeviceFontSource,
  listDeviceFaces,
  localFontPermission,
  readDeviceFace,
} from "@editor/tools/pdfTextEditor/util/localFontSource";

/** A face's style axes as its font file declares them; a source that can read them sets them so style names in any language never decide bold or italic. */
export interface FaceAxes {
  weight: number;
  bold: boolean;
  italic: boolean;
}

export interface LocalFont {
  family: string;
  fullName: string;
  style: string;
  postscriptName: string;
  axes?: FaceAxes;
}

export interface FontFamilyOption {
  value: string;
  label: string;
}

export interface LocalFontFamily {
  family: string;
  styles: string[];
}

/** Feature detection only - never prompts and has no side effects. */
export function isLocalFontAccessSupported(): boolean {
  return hasDeviceFontSource();
}

let resolved: LocalFont[] | null = null;
const listeners = new Set<() => void>();

async function queryOnce(): Promise<LocalFont[] | null> {
  if (!hasDeviceFontSource()) return null;
  try {
    resolved = await listDeviceFaces();
    for (const listener of [...listeners]) listener();
    return resolved;
  } catch {
    // SecurityError, NotAllowedError, a dismissed prompt and anything
    // unexpected all mean the same thing to callers: no device fonts.
    return null;
  }
}

let pending: Promise<LocalFont[] | null> | null = null;

/** The installed faces, or null. Memoised so the prompt fires at most once. */
export async function listLocalFonts(): Promise<LocalFont[] | null> {
  if (!pending) pending = queryOnce();
  return pending;
}

export async function retryLocalFonts(): Promise<LocalFont[] | null> {
  if (pending && (await pending) === null) pending = null;
  return listLocalFonts();
}

/** Lists the device's fonts only when that cannot prompt: access was granted earlier. Resolves to what is already loaded, or null without access. */
export async function listLocalFontsIfGranted(): Promise<LocalFont[] | null> {
  if (!isLocalFontAccessSupported() || resolved) return resolved;
  if ((await localFontPermission()) !== "granted") return null;
  return listLocalFonts();
}

/**
 * The faces {@link listLocalFonts} has already resolved, or null.
 *
 * Never prompts and never awaits, so render-time callers (a toolbar deciding
 * whether italic is even possible) can read the list without granting
 * themselves permission the user has not given. Reference-stable, so it is a
 * valid `useSyncExternalStore` snapshot.
 */
export function loadedLocalFonts(): LocalFont[] | null {
  return resolved;
}

/** Fires once the device fonts resolve, so derived UI state can recompute. */
export function subscribeLocalFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Drops the memoised result. Exists for tests. */
export function resetLocalFontsCache(): void {
  pending = null;
  resolved = null;
  bytesByFamily.clear();
  faceKeyByFamily.clear();
  bytesPending.clear();
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Collapse the face list into families with styles, sorted and de-duplicated. */
export function groupByFamily(fonts: LocalFont[]): LocalFontFamily[] {
  const byFamily = new Map<string, LocalFontFamily>();
  for (const font of fonts) {
    if (!font.family) continue;
    const key = font.family.toLowerCase();
    let entry = byFamily.get(key);
    if (!entry) {
      entry = { family: font.family, styles: [] };
      byFamily.set(key, entry);
    }
    const style = font.style;
    if (!style) continue;
    const seen = entry.styles.some(
      (s) => s.toLowerCase() === style.toLowerCase(),
    );
    if (!seen) entry.styles.push(style);
  }
  const families = [...byFamily.values()];
  for (const entry of families) entry.styles.sort(compareNames);
  families.sort((a, b) => compareNames(a.family, b.family));
  return families;
}

/** Picker options per family, plus a Bold entry where an upright bold cut exists; `taken` names are left out. */
export function familyOptions(
  fonts: LocalFont[] | null,
  taken: string[],
): FontFamilyOption[] {
  if (!fonts) return [];
  const hidden = new Set(taken.map(normaliseName));
  const withBold = new Set<string>();
  for (const font of fonts) {
    const flags = faceStyleFlags(font);
    if (flags.bold && !flags.italic) withBold.add(normaliseName(font.family));
  }
  return groupByFamily(fonts).flatMap(({ family }) => {
    const key = normaliseName(family);
    if (hidden.has(key)) return [];
    const options = [{ value: family, label: family }];
    if (withBold.has(key)) {
      options.push({ value: `${family} Bold`, label: `${family} Bold` });
    }
    return options;
  });
}

/** Case/separator-insensitive key, so "Segoe-UI" and "Segoe UI" are one name. */
export function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

export interface RequestedFace {
  family: string;
  bold: boolean;
  italic: boolean;
}

const STYLE_WORDS = /\b(bold|italic|oblique|regular|book|normal|roman)\b/gi;

function styleAxes(text: string): { bold: boolean; italic: boolean } {
  return {
    bold: /\bbold\b/i.test(text),
    italic: /\b(italic|oblique)\b/i.test(text),
  };
}

// Split a picker value into family plus style axes, so "Segoe UI Bold" finds
// "Segoe UI". A bare name yields the upright regular cut.
export function splitRequested(requested: string): RequestedFace {
  const spaced = requested.trim().replace(/[_-]+/g, " ");
  const family = spaced.replace(STYLE_WORDS, " ").replace(/\s+/g, " ").trim();
  return { family: family || spaced, ...styleAxes(spaced) };
}

export function knownFamilyOf(
  fonts: LocalFont[],
  requested: string,
): RequestedFace | null {
  const name = normaliseName(requested);
  let best: RequestedFace | null = null;
  let bestLength = 0;
  for (const font of fonts) {
    const family = normaliseName(font.family);
    if (!family || family.length <= bestLength) continue;
    if (name !== family && !name.startsWith(`${family} `)) continue;
    const rest = name.slice(family.length);
    if (rest.replace(STYLE_WORDS, "").trim()) continue;
    best = { family: font.family, ...styleAxes(rest) };
    bestLength = family.length;
  }
  return best;
}

export function resolveRequested(
  fonts: LocalFont[],
  requested: string,
): RequestedFace {
  return knownFamilyOf(fonts, requested) ?? splitRequested(requested);
}

// The style words of a face. The family is excluded on purpose so a face of
// the family "Arial Black" is not read as a bold cut.
function faceStyleText(font: LocalFont): string {
  if (font.style) return font.style.toLowerCase();
  const dash = font.postscriptName.indexOf("-");
  return dash >= 0 ? font.postscriptName.slice(dash + 1).toLowerCase() : "";
}

/**
 * The style axes an installed face actually carries.
 *
 * Callers use it to tell "this family really has an italic cut" from
 * "pickLocalFontFace returned the upright cut because there was nothing else".
 */
export function faceStyleFlags(font: LocalFont): {
  bold: boolean;
  italic: boolean;
} {
  if (font.axes) return { bold: font.axes.bold, italic: font.axes.italic };
  const style = faceStyleText(font);
  return {
    bold: /bold|black|heavy|semib|demi/.test(style),
    // A family NAMED "Foo Italic" carries the axis even if its style says
    // "Regular", which is how several shipped fonts describe themselves.
    italic: /italic|oblique/.test(`${style} ${font.family.toLowerCase()}`),
  };
}

const REGULAR_WEIGHT = 400;

function scoreFace(
  font: LocalFont,
  wantBold: boolean,
  wantItalic: boolean,
): number {
  const style = faceStyleText(font);
  const { bold, italic } = font.axes ?? {
    bold: /bold|black|heavy|semib|demi/.test(style),
    italic: /italic|oblique/.test(style),
  };
  const plain = font.axes
    ? font.axes.weight === REGULAR_WEIGHT && !italic
    : /^(regular|book|normal|roman)?$/.test(style);
  let score = 0;
  if (bold === wantBold) score += 4;
  if (italic === wantItalic) score += 4;
  if (plain) score += 2;
  // Tie-break towards the plainer cut: "Light Condensed" also matches an
  // upright non-bold request, but "Regular" is what the user meant.
  return score - Math.min(style.length, 32) / 100;
}

// The installed face best answering a family name, or null. An exact family
// hit wins, so "Arial Black" is not read as a bold cut of "Arial".
export function pickLocalFontFace(
  fonts: LocalFont[],
  requested: string,
): LocalFont | null {
  return pickRequestedFace(fonts, resolveRequested(fonts, requested));
}

export function pickRequestedFace(
  fonts: LocalFont[],
  wanted: RequestedFace,
): LocalFont | null {
  const family = normaliseName(wanted.family);
  let best: LocalFont | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const font of fonts) {
    if (normaliseName(font.family) !== family) continue;
    const score = scoreFace(font, wanted.bold, wanted.italic);
    if (score > bestScore) {
      best = font;
      bestScore = score;
    }
  }
  return best;
}

/** A device face's bytes, or why there are none: its licence forbids embedding, or it is missing, unreadable or not TrueType. */
export type LocalFontLoad =
  | { bytes: Uint8Array }
  | { refused: "licence" | "unavailable" };

const UNAVAILABLE: LocalFontLoad = { refused: "unavailable" };

const bytesByFamily = new Map<string, Uint8Array>();
const faceKeyByFamily = new Map<string, string>();
const bytesPending = new Map<string, Promise<LocalFontLoad>>();

export function registerFontBytes(family: string, bytes: Uint8Array): void {
  const key = normaliseName(family);
  if (key && bytes.length > 0) bytesByFamily.set(key, bytes);
}

/** Already-read bytes for a family, or null. Never prompts, never awaits. */
export function getLocalFontBytes(family: string): Uint8Array | null {
  return bytesByFamily.get(normaliseName(family)) ?? null;
}

/** Which installed face the bytes for `family` were read from, or null. */
export function getLocalFaceKey(family: string): string | null {
  return faceKeyByFamily.get(normaliseName(family)) ?? null;
}

async function readFamily(family: string): Promise<LocalFontLoad> {
  const fonts = await listLocalFonts();
  const picked = fonts ? pickLocalFontFace(fonts, family) : null;
  if (!picked) return UNAVAILABLE;
  const file = await readDeviceFace(picked);
  const bytes = file ? fontFace(file, picked.postscriptName) : null;
  if (!bytes) return UNAVAILABLE;
  if (embeddingForbidden(bytes)) return { refused: "licence" };
  if (!hasTrueTypeOutlines(bytes)) return UNAVAILABLE;
  const key = normaliseName(family);
  bytesByFamily.set(key, bytes);
  faceKeyByFamily.set(key, picked.postscriptName || picked.fullName);
  return { bytes };
}

/** The font file behind a family name, cached for the session. Never throws. */
export async function loadLocalFont(family: string): Promise<LocalFontLoad> {
  const key = normaliseName(family);
  if (!key) return UNAVAILABLE;
  const cached = bytesByFamily.get(key);
  if (cached) return { bytes: cached };
  const inFlight = bytesPending.get(key);
  if (inFlight) return inFlight;
  const job = readFamily(family);
  bytesPending.set(key, job);
  try {
    return await job;
  } finally {
    // Only successes are cached: a transient blob failure must not disable
    // this family for the rest of the session.
    bytesPending.delete(key);
  }
}

/** {@link loadLocalFont}'s bytes, or null whatever the reason. */
export async function loadLocalFontBytes(
  family: string,
): Promise<Uint8Array | null> {
  const load = await loadLocalFont(family);
  return "bytes" in load ? load.bytes : null;
}
