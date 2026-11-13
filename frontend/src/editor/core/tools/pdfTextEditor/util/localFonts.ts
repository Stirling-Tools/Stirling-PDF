// Local Font Access API wrapper. Chromium-only and permission-gated, so every
// entry point degrades to null instead of throwing.

import { fontFace } from "@editor/tools/pdfTextEditor/util/fontCollection";

export interface FaceAxes {
  bold: boolean;
  italic: boolean;
  weight: number | null;
}

export interface LocalFont {
  family: string;
  fullName: string;
  style: string;
  postscriptName: string;
  /** Style axes the font source states outright; absent for device faces, whose axes are read from the style name. */
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

type QueryLocalFonts = () => Promise<unknown[]>;

function localFontQuery(): QueryLocalFonts | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { queryLocalFonts?: QueryLocalFonts };
  if (typeof w.queryLocalFonts !== "function") return null;
  // Bound: Chrome throws "Illegal invocation" when the method is detached.
  return w.queryLocalFonts.bind(w);
}

/** Feature detection only - never prompts and has no side effects. */
export function isLocalFontAccessSupported(): boolean {
  return localFontQuery() !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toLocalFont(face: unknown): LocalFont | null {
  if (!face || typeof face !== "object") return null;
  const data = face as Record<string, unknown>;
  const family = readString(data.family);
  if (!family) return null;
  return {
    family,
    fullName: readString(data.fullName) || family,
    style: readString(data.style),
    postscriptName: readString(data.postscriptName),
  };
}

// The raw `FontData` each mapped face came from: only it exposes `.blob()`,
// and `LocalFont` stays a plain data shape.
interface FaceEntry {
  font: LocalFont;
  source: unknown;
}

let faceEntries: FaceEntry[] = [];
let resolved: LocalFont[] | null = null;
const listeners = new Set<() => void>();

async function queryOnce(): Promise<LocalFont[] | null> {
  const query = localFontQuery();
  if (!query) return null;
  try {
    const faces = await query();
    if (!Array.isArray(faces)) return null;
    const entries: FaceEntry[] = [];
    for (const face of faces) {
      const font = toLocalFont(face);
      if (font) entries.push({ font, source: face });
    }
    faceEntries = entries;
    resolved = entries.map((entry) => entry.font);
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

export type LocalFontPermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

async function permissionStatus(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({
      name: "local-fonts" as PermissionName,
    });
  } catch {
    return null;
  }
}

export async function localFontPermission(): Promise<LocalFontPermission> {
  if (!isLocalFontAccessSupported()) return "unsupported";
  return (await permissionStatus())?.state ?? "prompt";
}

/** Lists the device's fonts only when that cannot prompt: access was granted earlier. Resolves to what is already loaded, or null without access. */
export async function listLocalFontsIfGranted(): Promise<LocalFont[] | null> {
  if (!isLocalFontAccessSupported() || resolved) return resolved;
  if ((await localFontPermission()) !== "granted") return null;
  return retryLocalFonts();
}

export function watchLocalFontPermission(
  listener: (permission: LocalFontPermission) => void,
): () => void {
  if (!isLocalFontAccessSupported()) return () => {};
  let status: PermissionStatus | null = null;
  let stopped = false;
  const onChange = () => {
    if (status) listener(status.state);
  };
  void permissionStatus().then((s) => {
    if (stopped || !s) return;
    status = s;
    s.addEventListener("change", onChange);
  });
  return () => {
    stopped = true;
    status?.removeEventListener("change", onChange);
  };
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
  faceEntries = [];
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
  const families = groupByFamily(fonts);
  const listed = new Set([
    ...hidden,
    ...families.map(({ family }) => normaliseName(family)),
  ]);
  const withBold = new Set<string>();
  for (const font of fonts) {
    const flags = faceStyleFlags(font);
    if (flags.bold && !flags.italic) withBold.add(normaliseName(font.family));
  }
  return families.flatMap(({ family }) => {
    const key = normaliseName(family);
    if (hidden.has(key)) return [];
    const options = [{ value: family, label: family }];
    if (withBold.has(key) && !listed.has(normaliseName(`${family} Bold`))) {
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

function scoreFace(
  font: LocalFont,
  wantBold: boolean,
  wantItalic: boolean,
): number {
  if (font.axes) return scoreStatedAxes(font.axes, wantBold, wantItalic);
  const style = faceStyleText(font);
  const bold = /bold|black|heavy|semib|demi/.test(style);
  const italic = /italic|oblique/.test(style);
  let score = 0;
  if (bold === wantBold) score += 4;
  if (italic === wantItalic) score += 4;
  if (/^(regular|book|normal|roman)?$/.test(style)) score += 2;
  // Tie-break towards the plainer cut: "Light Condensed" also matches an
  // upright non-bold request, but "Regular" is what the user meant.
  return score - Math.min(style.length, 32) / 100;
}

function scoreStatedAxes(
  axes: FaceAxes,
  wantBold: boolean,
  wantItalic: boolean,
): number {
  let score = 0;
  if (axes.bold === wantBold) score += 4;
  if (axes.italic === wantItalic) score += 4;
  const target = wantBold ? 700 : 400;
  const weight = axes.weight ?? (axes.bold ? 700 : 400);
  return score - Math.min(Math.abs(weight - target), 900) / 1000;
}

// The installed face best answering a family name, or null. An exact family
// hit wins, so "Arial Black" is not read as a bold cut of "Arial".
export function pickLocalFontFace(
  fonts: LocalFont[],
  requested: string,
): LocalFont | null {
  const name = normaliseName(requested);
  return (
    pickRequestedFace(fonts, resolveRequested(fonts, requested)) ??
    fonts.find((font) => normaliseName(font.fullName) === name) ??
    null
  );
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

interface BlobSource {
  blob?: () => Promise<unknown>;
}

interface BlobBytes {
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

async function readFaceBytes(source: unknown): Promise<Uint8Array | null> {
  if (!source || typeof source !== "object") return null;
  const read = (source as BlobSource).blob;
  if (typeof read !== "function") return null;
  try {
    const blob = await read.call(source);
    if (!blob || typeof blob !== "object") return null;
    const toBuffer = (blob as BlobBytes).arrayBuffer;
    if (typeof toBuffer !== "function") return null;
    const bytes = new Uint8Array(await toBuffer.call(blob));
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

const bytesByFamily = new Map<string, Uint8Array>();
const faceKeyByFamily = new Map<string, string>();
const bytesPending = new Map<string, Promise<Uint8Array | null>>();

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

// The font file bytes behind a family name, cached for the session. Null when
// unsupported, denied, unmatched, or unreadable - never throws.
export async function loadLocalFontBytes(
  family: string,
): Promise<Uint8Array | null> {
  const key = normaliseName(family);
  if (!key) return null;
  const cached = bytesByFamily.get(key);
  if (cached) return cached;
  const inFlight = bytesPending.get(key);
  if (inFlight) return inFlight;
  const job = (async (): Promise<Uint8Array | null> => {
    const fonts = await listLocalFonts();
    if (!fonts) return null;
    const picked = pickLocalFontFace(fonts, family);
    if (!picked) return null;
    const entry = faceEntries.find((candidate) => candidate.font === picked);
    const file = entry ? await readFaceBytes(entry.source) : null;
    const bytes = file ? fontFace(file, picked.postscriptName) : null;
    if (bytes) {
      bytesByFamily.set(key, bytes);
      faceKeyByFamily.set(key, picked.postscriptName || picked.fullName);
    }
    return bytes;
  })();
  bytesPending.set(key, job);
  try {
    return await job;
  } finally {
    // Only successes are cached: a transient blob failure must not disable
    // this family for the rest of the session.
    bytesPending.delete(key);
  }
}
