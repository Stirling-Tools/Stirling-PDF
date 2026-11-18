import { getFontBaseUrl } from "@editor/services/fontBaseUrl";
import {
  faceStyleFlags,
  retryLocalFonts,
  loadLocalFontBytes,
  loadedLocalFonts,
  normaliseName,
  pickLocalFontFace,
  registerFontBytes,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { localFontPermission } from "@editor/tools/pdfTextEditor/util/localFontSource";
import {
  loadServerFontBytes,
  loadServerFonts,
  serverFontCssFamily,
  serverFontsGeneration,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  embeddingForbidden,
  hasTrueTypeOutlines,
  parseFontMetrics,
  type FaceKind,
  type FontMetrics,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";
import { encodesInBase14 } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { visibleCodePoints } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";

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
  twin?: Face;
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

type BundledScanFont = Pick<Face, "label" | "family" | "bold"> & {
  files: [regular: string, bold: string];
};

export const BUNDLED_SCAN_FONTS: BundledScanFont[] = [
  {
    label: "Calibri (Carlito)",
    family: "Carlito",
    bold: "Carlito Bold",
    files: ["Carlito-Regular.ttf", "Carlito-Bold.ttf"],
  },
  {
    label: "Cambria (Caladea)",
    family: "Caladea",
    bold: "Caladea Bold",
    files: ["Caladea-Regular.ttf", "Caladea-Bold.ttf"],
  },
  {
    label: "DejaVu Sans",
    family: "DejaVu Sans",
    bold: "DejaVu Sans Bold",
    files: ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"],
  },
  {
    label: "DejaVu Serif",
    family: "DejaVu Serif",
    bold: "DejaVu Serif Bold",
    files: ["DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf"],
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

export type Script =
  | "greekCyrillic"
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
  servedBy?: Script;
  clones?: Record<string, { label: string; twin: Face }>;
}

const SCRIPTS: ScriptFonts[] = [
  {
    script: "greekCyrillic",
    chars: /[\u0370-\u03ff\u0400-\u04ff]/,
    server: /^Liberation (Sans|Serif|Mono)$/,
    device: [],
    clones: {
      "Liberation Sans": { label: "Arial (Liberation Sans)", twin: HELVETICA },
      "Liberation Serif": {
        label: "Times New Roman (Liberation Serif)",
        twin: TIMES,
      },
      "Liberation Mono": {
        label: "Courier New (Liberation Mono)",
        twin: COURIER,
      },
    },
  },
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
    servedBy: "kana",
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

const COVERAGE = 0.9;

export function faceCovers(face: Face, text: string): boolean {
  const advances = face.metrics?.get(face.family)?.advances;
  const codePoints = visibleCodePoints(text);
  const drawable = codePoints.filter((cp) =>
    advances ? advances.has(cp) : encodesInBase14(cp),
  ).length;
  return drawable >= codePoints.length * COVERAGE;
}

export function candidateFaces(text: string): Face[] {
  return scanFaces().filter(
    (face) =>
      faceCovers(face, text) && !(face.twin && faceCovers(face.twin, text)),
  );
}

const DEVICE_TEXT_SCRIPTS =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

export function deviceFontsCouldCover(text: string): boolean {
  for (const ch of text) {
    if (!/\p{L}/u.test(ch) || DEVICE_TEXT_SCRIPTS.test(ch)) continue;
    if (!SCRIPTS.some((s) => s.device.length > 0 && s.chars.test(ch)))
      return false;
  }
  return true;
}

export function scanScriptsOf(text: string): Script[] {
  return SCRIPTS.filter((s) => s.chars.test(text)).map((s) => s.script);
}

let bundled: Face[] = [];
let scriptFaces: Face[] = [];
const neededScripts = new Set<Script>();
const scriptJobs = new Map<Script, Promise<void>>();
const serverFamiliesTaken = new Set<string>();
let serverFontsSeen = serverFontsGeneration();
let device: Face[] = [];
let deviceRead = false;
const deviceFamiliesRead = new Set<string>();
let bundledJob: Promise<void> | null = null;
let deviceJob: Promise<number> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function notify(): void {
  generation++;
  for (const listener of [...listeners]) listener();
}

export function subscribeScanFaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function scanFacesGeneration(): number {
  return generation;
}

const generationAtRanking = new WeakMap<object, number>();

export function noteRankedWithCurrentFaces(ranked: object): void {
  generationAtRanking.set(ranked, generation);
}

export function rankedWithCurrentFaces(ranked: object): boolean {
  return generationAtRanking.get(ranked) === generation;
}

export function scanFaces(): Face[] {
  return [...BASE14_FACES, ...bundled, ...scriptFaces, ...device];
}

/** CSS `font-family` list that draws a scan face by its family or bold name; give a bold name weight 700, as the regular family's CSS face carries the bold cut. */
export function scanFaceCssFamily(family: string): string {
  const face = scanFaces().find(
    (f) => f.family === family || f.bold === family,
  );
  const names = [family, face?.family ?? family].flatMap((name) => {
    const server = serverFontCssFamily(name);
    return server ? [server, name] : [name];
  });
  const named = [...new Set(names)].map((name) => `"${name}", `).join("");
  if (face?.kind === "serif")
    return `${named}"Liberation Serif", "Times New Roman", Times, serif`;
  if (face?.kind === "mono")
    return `${named}"Liberation Mono", "Courier New", Courier, monospace`;
  return `${named}"Liberation Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;
}

function hasFaceFor(family: string): boolean {
  const key = normaliseName(family);
  return scanFaces().some((face) => normaliseName(face.family) === key);
}

export function deviceScanFaceCount(): number | null {
  return deviceRead ? device.length : null;
}

type FaceSpec = Pick<Face, "label" | "family" | "bold" | "source" | "twin">;

function drawableMetrics(
  bytes: Uint8Array | null,
  weight: (variable: number) => boolean,
): FontMetrics | null {
  if (!bytes || embeddingForbidden(bytes) || !hasTrueTypeOutlines(bytes))
    return null;
  const metrics = parseFontMetrics(bytes);
  if (!metrics) return null;
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

type FontBytesLoader = (family: string) => Promise<Uint8Array | null>;

async function loadFace(
  spec: FaceSpec,
  load: FontBytesLoader,
  hasBold = true,
): Promise<Face | "unusable" | null> {
  const [regular, boldBytes] = await Promise.all([
    load(spec.family),
    hasBold ? load(spec.bold) : Promise.resolve(null),
  ]);
  if (!regular) return null;
  return faceFromBytes(spec, regular, boldBytes) ?? "unusable";
}

const cssFacesAdded = new Set<string>();

async function addCssFace(
  family: string,
  bytes: Uint8Array,
  bold: boolean,
): Promise<void> {
  const key = `${family}|${bold}`;
  if (cssFacesAdded.has(key) || typeof FontFace === "undefined") return;
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return;
  cssFacesAdded.add(key);
  try {
    const face = new FontFace(family, bytes.slice().buffer, {
      weight: bold ? "700" : "400",
    });
    await face.load();
    fonts.add(face);
  } catch {
    cssFacesAdded.delete(key);
  }
}

async function loadJarFontBytes(
  spec: BundledScanFont,
  family: string,
): Promise<Uint8Array | null> {
  const base = getFontBaseUrl();
  if (!base) return null;
  const bold = family !== spec.family;
  try {
    const res = await fetch(`${base}/${spec.files[bold ? 1 : 0]}`);
    const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    if (!bytes || bytes.length === 0) return null;
    registerFontBytes(family, bytes);
    void addCssFace(spec.family, bytes, bold);
    return bytes;
  } catch {
    return null;
  }
}

function bundledFontBytes(spec: BundledScanFont): FontBytesLoader {
  return async (family) =>
    (await loadServerFontBytes(family)) ?? loadJarFontBytes(spec, family);
}

function isFace(face: Face | "unusable" | null): face is Face {
  return face !== null && face !== "unusable";
}

function forgetFacesOfResetServer(): void {
  if (serverFontsSeen === serverFontsGeneration()) return;
  serverFontsSeen = serverFontsGeneration();
  bundledJob = null;
  scriptJobs.clear();
  serverFamiliesTaken.clear();
  if (scriptFaces.length === 0) return;
  scriptFaces = [];
  notify();
}

export function loadBundledScanFaces(): Promise<void> {
  forgetFacesOfResetServer();
  if (bundledJob) return bundledJob;
  let job: Promise<void> | null = null;
  const started = serverFontsGeneration();
  job = (async () => {
    const faces = await Promise.all(
      BUNDLED_SCAN_FONTS.map((spec) =>
        loadFace(
          {
            label: spec.label,
            family: spec.family,
            bold: spec.bold,
            source: "bundled",
          },
          bundledFontBytes(spec),
        ),
      ),
    );
    if (bundledJob !== job || started !== serverFontsGeneration()) return;
    bundled = faces.filter(isFace);
    if (faces.includes(null)) bundledJob = null;
    notify();
  })();
  bundledJob = job;
  return job;
}

function serverCandidates(script: ScriptFonts, fonts: LocalFont[]): string[] {
  const families = [...new Set(fonts.map((f) => f.family))];
  const named = script.device.flatMap((name) =>
    families.filter((family) => normaliseName(family) === normaliseName(name)),
  );
  const matched = families.filter((family) => script.server.test(family));
  return [...new Set([...named, ...matched])];
}

async function loadServerScript(script: ScriptFonts): Promise<boolean> {
  const started = serverFontsGeneration();
  const fonts = await loadServerFonts();
  if (!fonts || started !== serverFontsGeneration()) return false;
  for (const family of serverCandidates(script, fonts)) {
    if (hasFaceFor(family)) {
      if (!script.clones) break;
      continue;
    }
    const key = normaliseName(family);
    if (serverFamiliesTaken.has(key)) continue;
    serverFamiliesTaken.add(key);
    const clone = script.clones?.[family];
    const face = await loadFace(
      {
        label: clone?.label ?? family,
        family,
        bold: `${family} Bold`,
        source: "bundled",
        twin: clone?.twin,
      },
      loadServerFontBytes,
      fonts.some((f) => f.family === family && faceStyleFlags(f).bold),
    );
    if (started !== serverFontsGeneration()) return false;
    if (face === null) {
      serverFamiliesTaken.delete(key);
      return false;
    }
    if (face === "unusable") continue;
    scriptFaces = [...scriptFaces, face];
    notify();
    if (!script.clones) break;
  }
  return true;
}

export function loadScriptScanFaces(scripts: readonly Script[]): Promise<void> {
  forgetFacesOfResetServer();
  const wanted = SCRIPTS.filter((s) => scripts.includes(s.script));
  const jobs = wanted.map((script) => {
    neededScripts.add(script.script);
    const server = wanted.find((other) => other.script === script.servedBy);
    if (!server) return scriptJob(script);
    return scriptJob(server).then(() =>
      scriptFaces.some((face) => script.server.test(face.family))
        ? undefined
        : scriptJob(script),
    );
  });
  return Promise.all(jobs).then(() => undefined);
}

function scriptJob(script: ScriptFonts): Promise<void> {
  let job = scriptJobs.get(script.script);
  if (!job) {
    job = loadServerScript(script)
      .catch(() => false)
      .then((settled) => {
        if (!settled && scriptJobs.get(script.script) === job)
          scriptJobs.delete(script.script);
      });
    scriptJobs.set(script.script, job);
  }
  return job;
}

export function _setBundledScanFacesForTests(faces: Face[]): void {
  bundled = faces;
  bundledJob = Promise.resolve();
  notify();
}

export function _resetScanFacesForTests(): void {
  bundled = [];
  scriptFaces = [];
  neededScripts.clear();
  scriptJobs.clear();
  serverFamiliesTaken.clear();
  serverFontsSeen = serverFontsGeneration();
  device = [];
  deviceRead = false;
  deviceFamiliesRead.clear();
  bundledJob = null;
  deviceJob = null;
  cssFacesAdded.clear();
  notify();
}

// Null when reading the installed file failed, which a later read may not.
async function deviceFace(family: string): Promise<Face | "unusable" | null> {
  const fonts = loadedLocalFonts();
  if (!fonts) return null;
  const regularFace = pickLocalFontFace(fonts, family);
  if (!regularFace || regularFace.family.toLowerCase() !== family.toLowerCase())
    return "unusable";
  const bold = `${family} Bold`;
  const boldFace = pickLocalFontFace(fonts, bold);
  const face = await loadFace(
    { label: family, family, bold, source: "device" },
    loadLocalFontBytes,
    !!boldFace && faceStyleFlags(boldFace).bold,
  );
  return face;
}

function sameOutlines(a: Face, b: Face): boolean {
  const key = a.metrics?.get(a.family)?.outlines;
  return !!key && key === b.metrics?.get(b.family)?.outlines;
}

async function readDeviceFaces(
  families: string[],
  known: Face[],
): Promise<Face[]> {
  const faces = [...known];
  for (const family of families) {
    if (serverFamiliesTaken.has(normaliseName(family)) || hasFaceFor(family)) {
      deviceFamiliesRead.add(family);
      continue;
    }
    const face = await deviceFace(family);
    if (face === null) continue;
    deviceFamiliesRead.add(family);
    if (isFace(face) && !faces.some((other) => sameOutlines(other, face)))
      faces.push(face);
  }
  return faces;
}

function unreadDeviceFamilies(): string[] {
  const families = [
    ...DEVICE_TEXT_FAMILIES,
    ...SCRIPTS.filter((s) => neededScripts.has(s.script)).flatMap(
      (s) => s.device,
    ),
  ];
  return [...new Set(families)].filter((f) => !deviceFamiliesRead.has(f));
}

/** Reads the installed fonts for Latin text and every script requested so far; a later call reads only the families a newly requested script adds. */
export function loadDeviceScanFaces(): Promise<number> {
  if (deviceJob && unreadDeviceFamilies().length === 0) return deviceJob;
  const previous = deviceJob;
  let job: Promise<number> | null = null;
  job = (async () => {
    await previous?.catch(() => undefined);
    const fonts = await retryLocalFonts();
    if (!fonts) {
      if (deviceJob === job) deviceJob = null;
      return device.length;
    }
    device = await readDeviceFaces(unreadDeviceFamilies(), device);
    deviceRead = true;
    notify();
    return device.length;
  })();
  deviceJob = job;
  return job;
}

/** Reads device fonts for scan matching only when that cannot prompt (granted earlier, or no permission needed); otherwise resolves at once. */
export async function loadDeviceScanFacesIfAllowed(): Promise<void> {
  if ((await localFontPermission()) === "granted") await loadDeviceScanFaces();
}
