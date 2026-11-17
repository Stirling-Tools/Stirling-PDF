import {
  getLocalFaceKey,
  getLocalFontBytes,
  loadedLocalFonts,
  loadLocalFont,
  normaliseName,
  subscribeLocalFonts,
  type LocalFont,
  type LocalFontLoad,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  getServerFaceId,
  getServerFontBytes,
  loadedServerFonts,
  loadServerFontBytes,
  serverFaceFor,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

let lastServer: LocalFont[] | null = null;
let lastDevice: LocalFont[] | null = null;
let merged: LocalFont[] | null = null;

export function loadedExternalFonts(): LocalFont[] | null {
  const server = loadedServerFonts();
  const device = loadedLocalFonts();
  if (server === lastServer && device === lastDevice) return merged;
  lastServer = server;
  lastDevice = device;
  if (!server && !device) {
    merged = null;
    return merged;
  }
  const serverFamilies = new Set(
    (server ?? []).map((font) => normaliseName(font.family)),
  );
  merged = [
    ...(server ?? []),
    ...(device ?? []).filter(
      (font) => !serverFamilies.has(normaliseName(font.family)),
    ),
  ];
  return merged;
}

export function subscribeExternalFonts(listener: () => void): () => void {
  const offDevice = subscribeLocalFonts(listener);
  const offServer = subscribeServerFonts(listener);
  return () => {
    offDevice();
    offServer();
  };
}

export function getExternalFontBytes(family: string): Uint8Array | null {
  return getServerFontBytes(family) ?? getLocalFontBytes(family);
}

export function externalFaceKey(family: string): string {
  const server = getServerFaceId(family);
  if (server) return `server:${server}`;
  const local = getLocalFaceKey(family);
  return local ? `local:${local}` : normaliseName(family);
}

/** A family's bytes from the server when it supplies the family, else from the device; never refused for licence when the server supplies it. */
export async function loadExternalFont(family: string): Promise<LocalFontLoad> {
  if (!serverFaceFor(family)) return loadLocalFont(family);
  const bytes = await loadServerFontBytes(family);
  return bytes ? { bytes } : { refused: "unavailable" };
}

export async function loadExternalFontBytes(
  family: string,
): Promise<Uint8Array | null> {
  const load = await loadExternalFont(family);
  return "bytes" in load ? load.bytes : null;
}
