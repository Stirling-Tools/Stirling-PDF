/** Where the editor gets this device's installed fonts: the seam a build shadows when the Chromium-only, permission-gated Local Font Access API is not the source. */

import type { LocalFont } from "@editor/tools/pdfTextEditor/util/localFonts";

export type LocalFontPermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

type QueryLocalFonts = () => Promise<unknown[]>;

interface BlobSource {
  blob?: () => Promise<unknown>;
}

interface BlobBytes {
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

const sourceOf = new WeakMap<LocalFont, unknown>();

function browserQuery(): QueryLocalFonts | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { queryLocalFonts?: QueryLocalFonts };
  if (typeof w.queryLocalFonts !== "function") return null;
  // Bound: Chrome throws "Illegal invocation" when the method is detached.
  return w.queryLocalFonts.bind(w);
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

/** Whether this build has any way to list device fonts. Never prompts. */
export function hasDeviceFontSource(): boolean {
  return browserQuery() !== null;
}

/** The installed faces. May prompt; rejects when the user refuses or there is no source. */
export async function listDeviceFaces(): Promise<LocalFont[]> {
  const query = browserQuery();
  if (!query) throw new Error("No device font source");
  const faces = await query();
  if (!Array.isArray(faces)) throw new TypeError("Unexpected font list");
  const fonts: LocalFont[] = [];
  for (const face of faces) {
    const font = toLocalFont(face);
    if (!font) continue;
    sourceOf.set(font, face);
    fonts.push(font);
  }
  return fonts;
}

/** The font file behind a face {@link listDeviceFaces} returned, or null when it cannot be read. Never throws. */
export async function readDeviceFace(
  face: LocalFont,
): Promise<Uint8Array | null> {
  const source = sourceOf.get(face);
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

async function permissionStatus(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({
      name: "local-fonts" as PermissionName,
    });
  } catch {
    return null;
  }
}

/** Whether listing would prompt. Never prompts itself. */
export async function localFontPermission(): Promise<LocalFontPermission> {
  if (!hasDeviceFontSource()) return "unsupported";
  return (await permissionStatus())?.state ?? "prompt";
}

/** Calls `listener` on each later permission change, never with the current value; the returned stop also cancels a pending registration. */
export function watchLocalFontPermission(
  listener: (permission: LocalFontPermission) => void,
): () => void {
  if (!hasDeviceFontSource()) return () => {};
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
