import {
  getLocalFontBytes,
  loadedLocalFonts,
  loadLocalFontBytes,
  normaliseName,
  subscribeLocalFonts,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
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

export async function loadExternalFontBytes(
  family: string,
): Promise<Uint8Array | null> {
  if (serverFaceFor(family)) return loadServerFontBytes(family);
  return loadLocalFontBytes(family);
}
