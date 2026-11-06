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
  weight: number;
  postscriptName: string;
  format: string;
  size: number;
}

interface ServerFontFamily {
  family: string;
  faces: ServerFontFace[];
}

const FONT_ID = /^[0-9a-f]{64}$/;

let resolved: LocalFont[] | null = null;
let manifestPending: Promise<LocalFont[] | null> | null = null;
let faceByFont = new Map<LocalFont, ServerFontFace>();
const listeners = new Set<() => void>();
const bytesByFaceId = new Map<string, Uint8Array>();
const bytesByName = new Map<string, Uint8Array>();
const bytesPending = new Map<string, Promise<Uint8Array | null>>();
const cssFacesRegistered = new Set<string>();

function readFace(value: unknown): ServerFontFace | null {
  if (!value || typeof value !== "object") return null;
  const face = value as Record<string, unknown>;
  if (typeof face.id !== "string" || !FONT_ID.test(face.id)) return null;
  return {
    id: face.id,
    style: typeof face.style === "string" ? face.style.trim() : "",
    bold: face.bold === true,
    italic: face.italic === true,
    weight: typeof face.weight === "number" ? face.weight : 400,
    postscriptName:
      typeof face.postscriptName === "string" ? face.postscriptName : "",
    format: typeof face.format === "string" ? face.format : "ttf",
    size: typeof face.size === "number" ? face.size : 0,
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
  const fonts: LocalFont[] = [];
  const byFont = new Map<LocalFont, ServerFontFace>();
  for (const { family, faces } of families) {
    for (const face of faces) {
      const font: LocalFont = {
        family,
        fullName: face.style ? `${family} ${face.style}` : family,
        style: face.style,
        postscriptName: face.postscriptName,
      };
      fonts.push(font);
      byFont.set(font, face);
    }
  }
  faceByFont = byFont;
  resolved = fonts;
  for (const listener of [...listeners]) listener();
  return fonts;
}

export function loadServerFonts(): Promise<LocalFont[] | null> {
  if (resolved) return Promise.resolve(resolved);
  if (!manifestPending) {
    manifestPending = (async () => {
      try {
        const res = await apiClient.get<unknown>(SERVER_FONTS_URL, {
          suppressErrorToast: true,
        });
        return publish(readFamilies(res.data));
      } catch {
        manifestPending = null;
        return null;
      }
    })();
  }
  return manifestPending;
}

export function loadedServerFonts(): LocalFont[] | null {
  return resolved;
}

export function subscribeServerFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function serverFaceFor(requested: string): ServerFontFace | null {
  if (!resolved || resolved.length === 0) return null;
  const font = pickLocalFontFace(resolved, requested);
  return font ? (faceByFont.get(font) ?? null) : null;
}

export function isServerFontFamily(family: string): boolean {
  const key = normaliseName(family);
  return !!resolved?.some((font) => normaliseName(font.family) === key);
}

export function getServerFontBytes(requested: string): Uint8Array | null {
  return bytesByName.get(normaliseName(requested)) ?? null;
}

async function fetchFaceBytes(id: string): Promise<Uint8Array | null> {
  const cached = bytesByFaceId.get(id);
  if (cached) return cached;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await apiClient.get<ArrayBuffer>(
        `${SERVER_FONTS_URL}/${id}`,
        {
          responseType: "arraybuffer",
          suppressErrorToast: true,
        },
      );
      const bytes = new Uint8Array(res.data);
      if (bytes.length > 0) {
        bytesByFaceId.set(id, bytes);
        return bytes;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function registerCssFace(
  name: string,
  face: ServerFontFace,
  bytes: Uint8Array,
): Promise<void> {
  const key = normaliseName(name);
  if (cssFacesRegistered.has(key)) return;
  if (typeof FontFace === "undefined" || typeof document === "undefined") {
    return;
  }
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    const css = new FontFace(name, bytes.slice(), {
      style: face.italic ? "italic" : "normal",
      weight: "1 1000",
    });
    await css.load();
    fonts.add(css);
    cssFacesRegistered.add(key);
  } catch {
    return;
  }
}

export async function loadServerFontBytes(
  requested: string,
): Promise<Uint8Array | null> {
  const key = normaliseName(requested);
  if (!key) return null;
  const cached = bytesByName.get(key);
  if (cached) return cached;
  const inFlight = bytesPending.get(key);
  if (inFlight) return inFlight;
  const job = (async (): Promise<Uint8Array | null> => {
    await loadServerFonts();
    const face = serverFaceFor(requested);
    if (!face) return null;
    const bytes = await fetchFaceBytes(face.id);
    if (!bytes) return null;
    await registerCssFace(requested.trim(), face, bytes);
    bytesByName.set(key, bytes);
    return bytes;
  })();
  bytesPending.set(key, job);
  try {
    return await job;
  } finally {
    bytesPending.delete(key);
  }
}

export function resetServerFontsCache(): void {
  resolved = null;
  manifestPending = null;
  faceByFont = new Map();
  bytesByFaceId.clear();
  bytesByName.clear();
  bytesPending.clear();
  cssFacesRegistered.clear();
}
