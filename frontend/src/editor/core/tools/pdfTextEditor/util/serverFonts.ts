import apiClient from "@editor/services/apiClient";
import {
  normaliseName,
  pickLocalFontFace,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";

export const SERVER_FONTS_URL = "/api/v1/ui-data/editor-fonts";

export interface ServerFontFace {
  id: string;
  style: string;
  bold: boolean;
  italic: boolean;
  weight: number | null;
  postscriptName: string;
}

interface ServerFontFamily {
  family: string;
  faces: ServerFontFace[];
}

const FONT_ID = /^[0-9a-f]{64}$/;
export const SERVER_FONTS_REFRESH_MS = 30_000;
const FACE_DOWNLOAD_ATTEMPTS = 2;

let resolved: LocalFont[] | null = null;
let manifestPending: Promise<LocalFont[] | null> | null = null;
let refreshPending: Promise<void> | null = null;
let publishedManifest = "";
let fetchedAt = 0;
let generation = 0;
let faceByFont = new Map<LocalFont, ServerFontFace>();
const listeners = new Set<() => void>();
const bytesListeners = new Set<() => void>();
let bytesVersion = 0;
const bytesByFaceId = new Map<string, Uint8Array>();
const faceIdByName = new Map<string, string>();
const bytesPending = new Map<string, Promise<Uint8Array | null>>();
const facePending = new Map<string, Promise<Uint8Array | null>>();
const cssFacesRegistered = new Map<string, FontFace>();

function readFace(value: unknown): ServerFontFace | null {
  if (!value || typeof value !== "object") return null;
  const face = value as Record<string, unknown>;
  if (typeof face.id !== "string" || !FONT_ID.test(face.id)) return null;
  return {
    id: face.id,
    style: typeof face.style === "string" ? face.style.trim() : "",
    bold: face.bold === true,
    italic: face.italic === true,
    weight:
      typeof face.weight === "number" && Number.isFinite(face.weight)
        ? face.weight
        : null,
    postscriptName:
      typeof face.postscriptName === "string" ? face.postscriptName : "",
  };
}

function readFamilies(data: unknown): ServerFontFamily[] {
  if (!data || typeof data !== "object") return [];
  const families = (data as { families?: unknown }).families;
  if (!Array.isArray(families)) return [];
  const out: ServerFontFamily[] = [];
  for (const entry of families) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as { family?: unknown; faces?: unknown };
    if (typeof raw.family !== "string" || !raw.family.trim()) continue;
    if (!Array.isArray(raw.faces)) continue;
    const faces = raw.faces
      .map(readFace)
      .filter((face): face is ServerFontFace => face !== null);
    if (faces.length > 0) out.push({ family: raw.family.trim(), faces });
  }
  return out;
}

function publish(families: ServerFontFamily[]): LocalFont[] {
  publishedManifest = JSON.stringify(families);
  const fonts: LocalFont[] = [];
  const byFont = new Map<LocalFont, ServerFontFace>();
  for (const { family, faces } of families) {
    for (const face of faces) {
      const font: LocalFont = {
        family,
        fullName: face.style ? `${family} ${face.style}` : family,
        style: face.style,
        postscriptName: face.postscriptName,
        axes: { bold: face.bold, italic: face.italic, weight: face.weight },
      };
      fonts.push(font);
      byFont.set(font, face);
    }
  }
  faceByFont = byFont;
  resolved = fonts;
  forgetFaceBindings(new Set([...byFont.values()].map((face) => face.id)));
  notifyListeners();
  return fonts;
}

function forgetFaceBindings(listed: Set<string>): void {
  for (const [name, id] of faceIdByName) {
    if (serverFaceFor(name)?.id !== id) faceIdByName.delete(name);
  }
  bytesPending.clear();
  for (const id of bytesByFaceId.keys()) {
    if (!listed.has(id)) bytesByFaceId.delete(id);
  }
}

function notifyListeners(): void {
  for (const listener of [...listeners]) listener();
}

function notifyBytesChanged(): void {
  bytesVersion++;
  for (const listener of [...bytesListeners]) listener();
}

async function fetchManifest(): Promise<ServerFontFamily[] | null> {
  try {
    const res = await apiClient.get<unknown>(SERVER_FONTS_URL, {
      suppressErrorToast: true,
    });
    return readFamilies(res.data);
  } catch {
    return null;
  }
}

function refreshManifest(): void {
  if (refreshPending) return;
  const started = generation;
  fetchedAt = Date.now();
  const job = fetchManifest().then((families) => {
    if (refreshPending === job) refreshPending = null;
    if (started !== generation || !families) return;
    if (JSON.stringify(families) !== publishedManifest) publish(families);
  });
  refreshPending = job;
}

export function loadServerFonts(): Promise<LocalFont[] | null> {
  if (resolved) {
    if (Date.now() - fetchedAt >= SERVER_FONTS_REFRESH_MS) refreshManifest();
    return Promise.resolve(resolved);
  }
  if (!manifestPending) {
    const started = generation;
    fetchedAt = Date.now();
    manifestPending = fetchManifest().then((families) => {
      if (started !== generation) return null;
      if (families) return publish(families);
      manifestPending = null;
      return null;
    });
  }
  return manifestPending;
}

function documentFonts(): FontFaceSet | null {
  if (typeof document === "undefined") return null;
  return (document as Document & { fonts?: FontFaceSet }).fonts ?? null;
}

export function forgetServerFontList(): void {
  generation++;
  resolved = null;
  manifestPending = null;
  refreshPending = null;
  publishedManifest = "";
  fetchedAt = 0;
  faceByFont = new Map();
  bytesByFaceId.clear();
  faceIdByName.clear();
  bytesPending.clear();
  facePending.clear();
  const fonts = documentFonts();
  for (const css of cssFacesRegistered.values()) fonts?.delete(css);
  cssFacesRegistered.clear();
  notifyListeners();
  notifyBytesChanged();
}

export function loadedServerFonts(): LocalFont[] | null {
  return resolved;
}

export function subscribeServerFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fires when a requested name gains or loses readable face bytes, which {@link subscribeServerFonts} does not report. */
export function subscribeServerFontBytes(listener: () => void): () => void {
  bytesListeners.add(listener);
  return () => bytesListeners.delete(listener);
}

export function serverFontBytesVersion(): number {
  return bytesVersion;
}

export function serverFaceFor(requested: string): ServerFontFace | null {
  if (!resolved || resolved.length === 0) return null;
  const font = pickLocalFontFace(resolved, requested);
  return font ? (faceByFont.get(font) ?? null) : null;
}

export function getServerFaceId(requested: string): string | null {
  return faceIdByName.get(normaliseName(requested)) ?? null;
}

export function getServerFontBytes(requested: string): Uint8Array | null {
  const id = getServerFaceId(requested);
  return id ? (bytesByFaceId.get(id) ?? null) : null;
}

function cssFamilyForFace(id: string): string {
  return `serverface-${id}`;
}

export function serverFontCssFamily(requested: string): string | null {
  const id = getServerFaceId(requested);
  return id && cssFacesRegistered.has(id) ? cssFamilyForFace(id) : null;
}

function shared<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job = run().finally(() => {
    if (pending.get(key) === job) pending.delete(key);
  });
  pending.set(key, job);
  return job;
}

function fetchFaceBytes(id: string): Promise<Uint8Array | null> {
  const cached = bytesByFaceId.get(id);
  if (cached) return Promise.resolve(cached);
  return shared(facePending, id, () => downloadFace(id));
}

async function downloadFace(id: string): Promise<Uint8Array | null> {
  const started = generation;
  for (let attempt = 0; attempt < FACE_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const res = await apiClient.get<ArrayBuffer>(
        `${SERVER_FONTS_URL}/${id}`,
        {
          responseType: "arraybuffer",
          suppressErrorToast: true,
        },
      );
      if (started !== generation) return null;
      const bytes = new Uint8Array(res.data);
      if (bytes.length > 0) {
        bytesByFaceId.set(id, bytes);
        return bytes;
      }
    } catch {
      continue;
    }
  }
  if (started === generation) fetchedAt = 0;
  return null;
}

async function registerCssFace(
  face: ServerFontFace,
  bytes: Uint8Array,
): Promise<void> {
  if (cssFacesRegistered.has(face.id)) return;
  if (typeof FontFace === "undefined") return;
  const fonts = documentFonts();
  if (!fonts) return;
  const started = generation;
  try {
    const css = new FontFace(cssFamilyForFace(face.id), bytes.slice(), {
      style: face.italic ? "italic" : "normal",
      weight: "1 1000",
    });
    await css.load();
    if (started !== generation || cssFacesRegistered.has(face.id)) return;
    fonts.add(css);
    cssFacesRegistered.set(face.id, css);
  } catch {
    return;
  }
}

export async function loadServerFontBytes(
  requested: string,
): Promise<Uint8Array | null> {
  const key = normaliseName(requested);
  if (!key) return null;
  const cached = getServerFontBytes(requested);
  if (cached) return cached;
  return shared(bytesPending, key, async () => {
    const started = generation;
    await loadServerFonts();
    if (started !== generation) return null;
    const face = serverFaceFor(requested);
    if (!face) return null;
    const bytes = await fetchFaceBytes(face.id);
    if (!bytes || started !== generation) return null;
    await registerCssFace(face, bytes);
    if (started !== generation) return null;
    if (serverFaceFor(requested)?.id === face.id) {
      faceIdByName.set(key, face.id);
      notifyBytesChanged();
    }
    return bytes;
  });
}
