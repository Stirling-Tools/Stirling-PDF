import {
  faceStyleFlags,
  retryLocalFonts,
  loadLocalFontBytes,
  loadedLocalFonts,
  pickLocalFontFace,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  loadServerFontBytes,
  loadServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
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

type Script =
  | "hangul"
  | "kana"
  | "han"
  | "arabic"
  | "hebrew"
  | "thai"
  | "devanagari"
  | "malayalam"
  | "tibetan";

interface ScriptFonts {
  script: Script;
  chars: RegExp;
  server: RegExp;
  device: string[];
}

const SCRIPTS: ScriptFonts[] = [
  {
    script: "hangul",
    chars: /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/,
    server: /\b(KR|Korean)\b/i,
    device: [
      "Malgun Gothic",
      "AppleGothic",
      "Gulim",
      "Dotum",
      "Batang",
      "NanumGothic",
      "Noto Sans KR",
      "UnDotum",
    ],
  },
  {
    script: "kana",
    chars: /[\u3040-\u30ff]/,
    server: /\b(JP|Japanese)\b/i,
    device: [
      "Yu Gothic",
      "Meiryo",
      "MS Gothic",
      "MS PGothic",
      "MS Mincho",
      "Osaka",
      "Noto Sans JP",
      "TakaoGothic",
    ],
  },
  {
    script: "han",
    chars: /[\u3400-\u4dbf\u4e00-\u9fff]/,
    server: /\b(SC|TC|HK|JP|Chinese)\b/i,
    device: [
      "Microsoft YaHei",
      "SimSun",
      "SimHei",
      "Microsoft JhengHei",
      "PMingLiU",
      "MingLiU",
      "Heiti SC",
      "Heiti TC",
      "STHeiti",
      "Noto Sans SC",
      "Noto Sans TC",
      "WenQuanYi Micro Hei",
      "AR PL UMing CN",
    ],
  },
  {
    script: "arabic",
    chars: /[\u0600-\u06ff\u0750-\u077f]/,
    server: /Arabic/i,
    device: ["Noto Naskh Arabic", "Geeza Pro", "Segoe UI"],
  },
  {
    script: "hebrew",
    chars: /[\u0590-\u05ff]/,
    server: /Hebrew/i,
    device: ["Noto Sans Hebrew", "Arial Hebrew", "David"],
  },
  {
    script: "thai",
    chars: /[\u0e00-\u0e7f]/,
    server: /Thai/i,
    device: ["Noto Sans Thai", "Tahoma", "Leelawadee UI", "Thonburi"],
  },
  {
    script: "devanagari",
    chars: /[\u0900-\u097f]/,
    server: /Devanagari/i,
    device: ["Noto Sans Devanagari", "Mangal", "Kohinoor Devanagari"],
  },
  {
    script: "malayalam",
    chars: /[\u0d00-\u0d7f]/,
    server: /Malayalam/i,
    device: ["Noto Sans Malayalam", "Kartika"],
  },
  {
    script: "tibetan",
    chars: /[\u0f00-\u0fff]/,
    server: /Tibetan/i,
    device: ["Noto Serif Tibetan", "Microsoft Himalaya"],
  },
];

const WIN_ANSI_EXTRAS = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6,
  0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

const COVERAGE = 0.9;

export function faceCovers(face: Face, text: string): boolean {
  const advances = face.metrics?.get(face.family)?.advances;
  let total = 0;
  let drawable = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    total++;
    if (advances ? advances.has(cp) : cp <= 0xff || WIN_ANSI_EXTRAS.has(cp))
      drawable++;
  }
  return drawable >= total * COVERAGE;
}

function scriptsOf(text: string): ScriptFonts[] {
  return SCRIPTS.filter((s) => s.chars.test(text));
}

let bundled: Face[] = [];
let scriptFaces: Face[] = [];
const neededScripts = new Set<Script>();
const scriptJobs = new Map<Script, Promise<void>>();
const serverFamiliesTaken = new Set<string>();
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
  return [...BASE14_FACES, ...bundled, ...scriptFaces, ...device];
}

export function deviceScanFaceCount(): number | null {
  return deviceRead ? device.length : null;
}

type FaceSpec = Pick<Face, "label" | "family" | "bold" | "source">;

function drawableMetrics(
  bytes: Uint8Array | null,
  weight: (variable: number) => boolean,
): FontMetrics | null {
  const metrics = bytes ? parseFontMetrics(bytes) : null;
  if (!metrics || metrics.restricted || metrics.cff) return null;
  if (metrics.variableWeight !== null && !weight(metrics.variableWeight))
    return null;
  return metrics;
}

export function faceFromBytes(
  spec: FaceSpec,
  regular: Uint8Array,
  boldBytes: Uint8Array | null,
): Face | null {
  const regularMetrics = drawableMetrics(regular, (w) => w >= 300);
  if (!regularMetrics) return null;
  const metrics = new Map<string, FontMetrics>([[spec.family, regularMetrics]]);
  const boldMetrics = drawableMetrics(boldBytes, (w) => w >= 600);
  if (boldMetrics) metrics.set(spec.bold, boldMetrics);
  return {
    ...spec,
    bold: boldMetrics ? spec.bold : spec.family,
    cap: regularMetrics.cap,
    asc: regularMetrics.asc,
    xh: regularMetrics.xh,
    kind: regularMetrics.kind,
    metrics,
  };
}

async function loadFace(
  spec: FaceSpec,
  load: (family: string) => Promise<Uint8Array | null>,
  hasBold = true,
): Promise<Face | null> {
  const [regular, boldBytes] = await Promise.all([
    load(spec.family),
    hasBold ? load(spec.bold) : Promise.resolve(null),
  ]);
  return regular ? faceFromBytes(spec, regular, boldBytes) : null;
}

export function loadBundledScanFaces(): Promise<void> {
  if (bundledJob) return bundledJob;
  const job = (async () => {
    const faces = await Promise.all(
      BUNDLED_SCAN_FONTS.map((spec) =>
        loadFace({ ...spec, source: "bundled" }, loadServerFontBytes),
      ),
    );
    bundled = faces.filter((f): f is Face => f !== null);
    if (bundled.length < BUNDLED_SCAN_FONTS.length) bundledJob = null;
    notify();
  })();
  bundledJob = job;
  return job;
}

async function loadServerScript(script: ScriptFonts): Promise<void> {
  const fonts = await loadServerFonts();
  if (!fonts) return;
  const families = [...new Set(fonts.map((f) => f.family))].filter(
    (family) =>
      script.server.test(family) &&
      !serverFamiliesTaken.has(family) &&
      !scanFaces().some((face) => face.family === family),
  );
  for (const family of families) serverFamiliesTaken.add(family);
  for (const family of families) {
    const face = await loadFace(
      { label: family, family, bold: `${family} Bold`, source: "bundled" },
      loadServerFontBytes,
      fonts.some((f) => f.family === family && faceStyleFlags(f).bold),
    );
    if (face) {
      scriptFaces = [...scriptFaces, face];
      notify();
    }
  }
}

export function loadScriptScanFaces(text: string): Promise<void> {
  const jobs = scriptsOf(text).map((script) => {
    neededScripts.add(script.script);
    let job = scriptJobs.get(script.script);
    if (!job) {
      job = loadServerScript(script).catch(() => undefined);
      scriptJobs.set(script.script, job);
    }
    return job;
  });
  return Promise.all(jobs).then(() => undefined);
}

export function setBundledScanFaces(faces: Face[]): void {
  bundled = faces;
  bundledJob = Promise.resolve();
  notify();
}

export function resetScanFaces(): void {
  bundled = [];
  scriptFaces = [];
  neededScripts.clear();
  scriptJobs.clear();
  serverFamiliesTaken.clear();
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
  const bold = `${family} Bold`;
  const boldFace = pickLocalFontFace(fonts, bold);
  return loadFace(
    { label: family, family, bold, source: "device" },
    loadLocalFontBytes,
    !!boldFace && faceStyleFlags(boldFace).bold,
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
    const families = new Set([
      ...DEVICE_TEXT_FAMILIES,
      ...SCRIPTS.filter((s) => neededScripts.has(s.script)).flatMap(
        (s) => s.device,
      ),
    ]);
    const faces = await Promise.all([...families].map(deviceFace));
    device = faces.filter((f): f is Face => f !== null);
    deviceRead = true;
    notify();
    return device.length;
  })();
  deviceJob = job;
  return job;
}
