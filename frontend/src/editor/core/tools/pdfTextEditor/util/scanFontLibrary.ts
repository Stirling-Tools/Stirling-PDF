import {
  faceStyleFlags,
  retryLocalFonts,
  loadLocalFontBytes,
  loadedLocalFonts,
  pickLocalFontFace,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { loadServerFontBytes } from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  parseFontMetrics,
  type FaceKind,
  type FontMetrics,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";

type FaceSource = "base14" | "bundled" | "device";

export interface Face {
  label: string;
  family: string;
  bold: string;
  cap: number;
  asc: number;
  xh: number;
  kind: FaceKind;
  source: FaceSource;
  metrics?: Map<string, FontMetrics>;
}

export const HELVETICA: Face = {
  label: "Helvetica / Arial",
  family: "Helvetica",
  bold: "Helvetica-Bold",
  cap: 718,
  asc: 718,
  xh: 523,
  kind: "sans",
  source: "base14",
};
export const TIMES: Face = {
  label: "Times",
  family: "Times-Roman",
  bold: "Times-Bold",
  cap: 662,
  asc: 683,
  xh: 450,
  kind: "serif",
  source: "base14",
};
export const COURIER: Face = {
  label: "Courier",
  family: "Courier",
  bold: "Courier-Bold",
  cap: 562,
  asc: 629,
  xh: 426,
  kind: "mono",
  source: "base14",
};
export const BASE14_FACES: Face[] = [HELVETICA, TIMES, COURIER];

export const BUNDLED_SCAN_FONTS: Array<
  Pick<Face, "label" | "family" | "bold">
> = [
  {
    label: "Calibri (Carlito)",
    family: "Carlito",
    bold: "Carlito Bold",
  },
  {
    label: "Cambria (Caladea)",
    family: "Caladea",
    bold: "Caladea Bold",
  },
  {
    label: "DejaVu Sans",
    family: "DejaVu Sans",
    bold: "DejaVu Sans Bold",
  },
  {
    label: "DejaVu Serif",
    family: "DejaVu Serif",
    bold: "DejaVu Serif Bold",
  },
];

const DEVICE_TEXT_FAMILIES = [
  "Arial",
  "Arial Narrow",
  "Aptos",
  "Book Antiqua",
  "Bookman Old Style",
  "Calibri",
  "Cambria",
  "Candara",
  "Century Gothic",
  "Century Schoolbook",
  "Consolas",
  "Constantia",
  "Corbel",
  "Courier New",
  "Franklin Gothic Book",
  "Garamond",
  "EB Garamond",
  "Georgia",
  "Gill Sans MT",
  "Lato",
  "Lucida Console",
  "Lucida Sans",
  "Noto Sans",
  "Noto Serif",
  "Open Sans",
  "Palatino Linotype",
  "Roboto",
  "Segoe UI",
  "Source Sans Pro",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "American Typewriter",
  "Arial Black",
  "Avenir",
  "Avenir Next",
  "Baskerville",
  "Bodoni 72",
  "Cochin",
  "Comic Sans MS",
  "Copperplate",
  "Didot",
  "Futura",
  "Gill Sans",
  "Helvetica",
  "Helvetica Neue",
  "Hoefler Text",
  "Impact",
  "Optima",
  "Palatino",
  "Rockwell",
];

let bundled: Face[] = [];
let device: Face[] = [];
let deviceRead = false;
let bundledJob: Promise<void> | null = null;
let deviceJob: Promise<number> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeScanFaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function scanFaces(): Face[] {
  return [...BASE14_FACES, ...bundled, ...device];
}

export function deviceScanFaceCount(): number | null {
  return deviceRead ? device.length : null;
}

export function faceFromBytes(
  spec: Pick<Face, "label" | "family" | "bold" | "source">,
  regular: Uint8Array,
  boldBytes: Uint8Array | null,
): Face | null {
  const regularMetrics = parseFontMetrics(regular);
  if (!regularMetrics || regularMetrics.restricted) return null;
  const metrics = new Map<string, FontMetrics>([[spec.family, regularMetrics]]);
  let bold = spec.bold;
  const boldMetrics = boldBytes ? parseFontMetrics(boldBytes) : null;
  if (boldBytes && boldMetrics && !boldMetrics.restricted) {
    metrics.set(spec.bold, boldMetrics);
  } else {
    bold = spec.family;
  }
  return {
    ...spec,
    bold,
    cap: regularMetrics.cap,
    asc: regularMetrics.asc,
    xh: regularMetrics.xh,
    kind: regularMetrics.kind,
    metrics,
  };
}

export function loadBundledScanFaces(): Promise<void> {
  if (bundledJob) return bundledJob;
  const job = (async () => {
    const faces = await Promise.all(
      BUNDLED_SCAN_FONTS.map(async (spec) => {
        const [regular, boldBytes] = await Promise.all([
          loadServerFontBytes(spec.family),
          loadServerFontBytes(spec.bold),
        ]);
        if (!regular) return null;
        return faceFromBytes(
          { ...spec, source: "bundled" },
          regular,
          boldBytes,
        );
      }),
    );
    bundled = faces.filter((f): f is Face => f !== null);
    if (bundled.length < BUNDLED_SCAN_FONTS.length) bundledJob = null;
    notify();
  })();
  bundledJob = job;
  return job;
}

export function setBundledScanFaces(faces: Face[]): void {
  bundled = faces;
  bundledJob = Promise.resolve();
  notify();
}

export function resetScanFaces(): void {
  bundled = [];
  device = [];
  deviceRead = false;
  bundledJob = null;
  deviceJob = null;
  notify();
}

async function deviceFace(family: string): Promise<Face | null> {
  const fonts = loadedLocalFonts();
  if (!fonts) return null;
  const regularFace = pickLocalFontFace(fonts, family);
  if (!regularFace || regularFace.family.toLowerCase() !== family.toLowerCase())
    return null;
  const boldName = `${family} Bold`;
  const boldFace = pickLocalFontFace(fonts, boldName);
  const hasBold = !!boldFace && faceStyleFlags(boldFace).bold;
  const [regular, boldBytes] = await Promise.all([
    loadLocalFontBytes(family),
    hasBold ? loadLocalFontBytes(boldName) : Promise.resolve(null),
  ]);
  if (!regular) return null;
  return faceFromBytes(
    { label: family, family, bold: boldName, source: "device" },
    regular,
    boldBytes,
  );
}

export function loadDeviceScanFaces(): Promise<number> {
  if (deviceJob) return deviceJob;
  const job = (async () => {
    const fonts = await retryLocalFonts();
    if (!fonts) {
      deviceJob = null;
      return 0;
    }
    const faces: Face[] = [];
    for (const family of DEVICE_TEXT_FAMILIES) {
      const face = await deviceFace(family);
      if (face) faces.push(face);
    }
    device = faces;
    deviceRead = true;
    notify();
    return faces.length;
  })();
  deviceJob = job;
  return job;
}
