import {
  deflate,
  fromLatin1,
  toLatin1,
} from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { tokenize } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import {
  arrayItems,
  RawPdf,
  referencedObject,
  removeDictEntry,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  replaceObjects,
  streamObject,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { stringBytes } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import { subsetTrueType } from "@editor/tools/pdfTextEditor/util/ttfSubset";

// A subset this close to the original is not worth rewriting the file for.
const WORTHWHILE_RATIO = 0.9;
const SUBSET_TAG = /^[A-Z]{6}\+/;
const RESOURCE_REF = /\/([^\s/<>[\]()%{}]+)\s+(\d+)\s+0\s+R/g;
const TAG_LENGTH = 6;
const TAG_LETTERS = 26;
const TAG_SPREAD = 7919;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

interface Dict {
  num: number;
  /** The object's dictionary, without any stream payload. */
  text: string;
}

interface FontUsers {
  descriptors: number[];
  cidFonts: number[];
  type0: number[];
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function collectDicts(pdf: RawPdf): Dict[] {
  const out: Dict[] = [];
  for (const num of pdf.objectNumbers()) {
    const extent = pdf.objectExtent(num);
    if (extent)
      out.push({ num, text: pdf.src.slice(extent.start, extent.dictEnd) });
  }
  return out;
}

// A stream that cannot be decoded counts as matching every same-length file when `matchUnreadable`.
async function matchFontStreams(
  pdf: RawPdf,
  dicts: Dict[],
  files: readonly Uint8Array[],
  matchUnreadable: boolean,
): Promise<Array<[number, Uint8Array]>> {
  const matches: Array<[number, Uint8Array]> = [];
  for (const { num, text } of dicts) {
    const length1 = pdf.dictInt(text, "Length1");
    if (length1 === null) continue;
    const sameLength = files.filter((file) => file.length === length1);
    if (sameLength.length === 0) continue;
    const data = pdf.encrypted ? null : await pdf.streamData(num);
    for (const file of sameLength)
      if (data ? sameBytes(file, data) : matchUnreadable)
        matches.push([num, file]);
  }
  return matches;
}

/** Drop files the opened document already embedded: that copy may serve text this pass never sees. */
async function newToDocument(
  opened: Uint8Array,
  files: readonly Uint8Array[],
): Promise<Uint8Array[]> {
  if (opened.length === 0) return [...files];
  const pdf = await RawPdf.parse(opened);
  if (!pdf) return [];
  const matches = await matchFontStreams(pdf, collectDicts(pdf), files, true);
  const had = new Set(matches.map(([, file]) => file));
  return files.filter((file) => !had.has(file));
}

// Only an Identity-mapped CID TrueType font is addressed by glyph id; any other use keeps it whole.
function fontUsers(pdf: RawPdf, dicts: Dict[], file: number): FontUsers | null {
  const descriptors = dicts
    .filter((d) => pdf.dictRef(d.text, "FontFile2") === file)
    .map((d) => d.num);
  const cidFonts: number[] = [];
  for (const d of dicts) {
    const descriptor = pdf.dictRef(d.text, "FontDescriptor");
    if (descriptor === null || !descriptors.includes(descriptor)) continue;
    if (pdf.dictName(d.text, "Subtype") !== "CIDFontType2") return null;
    const map = pdf.valueSpan(d.text, "CIDToGIDMap");
    if (map && pdf.dictName(d.text, "CIDToGIDMap") !== "Identity") return null;
    cidFonts.push(d.num);
  }
  const type0: number[] = [];
  for (const d of dicts) {
    const descendants = pdf.resolve(d.text, "DescendantFonts")?.trim();
    const items = descendants ? arrayItems(descendants) : null;
    const refs = items?.map((item) => referencedObject(item.text)) ?? [];
    if (!refs.some((ref) => ref !== null && cidFonts.includes(ref))) continue;
    const encoding = pdf.dictName(d.text, "Encoding");
    if (encoding !== "Identity-H" && encoding !== "Identity-V") return null;
    type0.push(d.num);
  }
  return type0.length > 0 ? { descriptors, cidFonts, type0 } : null;
}

/** Every resource name any dictionary binds to one of `fonts`. */
function resourceNames(dicts: Dict[], fonts: number[]): Set<string> {
  const names = new Set<string>();
  // Scan every dictionary: a font map can be indirect, and a stray name only keeps more glyphs.
  for (const { text } of dicts) {
    for (const m of text.matchAll(RESOURCE_REF)) {
      if (fonts.includes(parseInt(m[2], 10))) names.add(m[1]);
    }
  }
  return names;
}

// Glyph ids by font resource name; UNKNOWN_FONT holds text shown before any Tf, counted for all.
type ScannedStream = Map<string, number[]>;
const UNKNOWN_FONT = "";

// `q`/`Q` save and restore the font; null on an inline image, whose raw bytes the tokeniser cannot pass.
function scanContent(content: Uint8Array | null): ScannedStream | null {
  if (!content) return null;
  const tokens = tokenize(toLatin1(content));
  const shown: ScannedStream = new Map();
  const saved: string[] = [];
  let font = UNKNOWN_FONT;
  for (let i = 0; i < tokens.length; i++) {
    const text = tokens[i].text;
    if (text === "BI") return null;
    if (text === "q") saved.push(font);
    else if (text === "Q") font = saved.pop() ?? UNKNOWN_FONT;
    else if (text === "Tf" && i >= 2 && tokens[i - 2].text.startsWith("/"))
      font = tokens[i - 2].text.slice(1);
    // An ExtGState may set the font too, and which one is not read here.
    else if (text === "gs") font = UNKNOWN_FONT;
    if (!/^[(<]/.test(text) || text.startsWith("<<")) continue;
    const bytes = stringBytes(text);
    if (!bytes) return null;
    let glyphs = shown.get(font);
    if (!glyphs) shown.set(font, (glyphs = []));
    for (let k = 0; k < bytes.length; k += 2)
      glyphs.push((bytes[k] << 8) | (bytes[k + 1] ?? 0));
  }
  return shown;
}

async function scanAllContent(
  pdf: RawPdf,
  dicts: Dict[],
): Promise<ScannedStream[] | null> {
  const out: ScannedStream[] = [];
  for (const pageNum of pdf.pageNumbers()) {
    const body = pdf.objectBody(pageNum);
    if (!body) return null;
    if (pdf.contentRefs(body).length === 0) continue;
    const scanned = scanContent(await pdf.pageContent(pageNum));
    if (!scanned) return null;
    out.push(scanned);
  }
  for (const { num, text } of dicts) {
    if (!/\/Subtype\s*\/Form\b/.test(text) && !text.includes("/PatternType"))
      continue;
    const scanned = scanContent(await pdf.streamData(num));
    if (!scanned) return null;
    out.push(scanned);
  }
  return out;
}

function usedGlyphs(streams: ScannedStream[], names: Set<string>): Set<number> {
  const used = new Set<number>([0]);
  for (const stream of streams) {
    for (const [font, glyphs] of stream) {
      if (font !== UNKNOWN_FONT && !names.has(font)) continue;
      for (const gid of glyphs) used.add(gid);
    }
  }
  return used;
}

function subsetTag(glyphs: Set<number>): string {
  let hash = FNV_OFFSET_BASIS;
  for (const gid of [...glyphs].sort((a, b) => a - b))
    hash = Math.imul(hash ^ gid, FNV_PRIME) >>> 0;
  let tag = "";
  for (let i = 0; i < TAG_LENGTH; i++) {
    tag += String.fromCharCode("A".charCodeAt(0) + (hash % TAG_LETTERS));
    hash = Math.floor(hash / TAG_LETTERS) + i * TAG_SPREAD;
  }
  return tag;
}

// ISO 32000-1 9.6.4: a subset font's name carries a six-letter tag.
function withTag(
  pdf: RawPdf,
  body: string,
  key: string,
  tag: string,
): string | null {
  const name = pdf.dictName(body, key);
  if (!name || SUBSET_TAG.test(name)) return null;
  return setDictEntry(body, key, `/${tag}+${name}`);
}

function tagged(
  pdf: RawPdf,
  num: number,
  key: string,
  tag: string,
): RevisionObject | null {
  const body = pdf.objectBody(num);
  const renamed = body && withTag(pdf, body, key, tag);
  return renamed ? { num, body: fromLatin1(renamed.trim()) } : null;
}

// A CIDSet would still list every glyph the subset emptied.
function retitledDescriptor(
  pdf: RawPdf,
  num: number,
  tag: string,
): RevisionObject | null {
  const body = pdf.objectBody(num);
  if (!body) return null;
  const updated = removeDictEntry(
    withTag(pdf, body, "FontName", tag) ?? body,
    "CIDSet",
  );
  return updated === body ? null : { num, body: fromLatin1(updated.trim()) };
}

// PDFium writes every glyph's width; keep only the used ones, as the full list outweighs the subset.
function usedWidths(widths: string, used: Set<number>): string | null {
  const tokens = widths.match(/\[|\]|-?\d*\.?\d+/g);
  if (!tokens || tokens[0] !== "[" || tokens[tokens.length - 1] !== "]")
    return null;
  const kept = new Map<number, string>();
  let i = 1;
  while (i < tokens.length - 1) {
    const first = Number(tokens[i]);
    if (!Number.isInteger(first)) return null;
    if (tokens[i + 1] === "[") {
      let gid = first;
      for (i += 2; tokens[i] !== "]"; i++, gid++) {
        if (tokens[i] === undefined || tokens[i] === "[") return null;
        if (used.has(gid)) kept.set(gid, tokens[i]);
      }
      i += 1;
    } else {
      const last = Number(tokens[i + 1]);
      const width = tokens[i + 2];
      if (!Number.isInteger(last) || width === undefined || width === "]")
        return null;
      for (const gid of used)
        if (gid >= first && gid <= last) kept.set(gid, width);
      i += 3;
    }
  }
  const sorted = [...kept].sort((a, b) => a[0] - b[0]);
  return `[${sorted.map(([gid, width]) => `${gid} [${width}]`).join(" ")}]`;
}

function retitledCidFont(
  pdf: RawPdf,
  dicts: Dict[],
  num: number,
  tag: string,
  used: Set<number>,
): RevisionObject[] {
  const renamed = tagged(pdf, num, "BaseFont", tag);
  const body = renamed ? toLatin1(renamed.body) : pdf.objectBody(num)?.trim();
  const widths = body ? pdf.resolve(body, "W") : null;
  const trimmed = widths === null ? null : usedWidths(widths, used);
  const updated =
    body && trimmed !== null ? setDictEntry(body, "W", trimmed) : null;
  if (!body || !updated) return renamed ? [renamed] : [];
  const out: RevisionObject[] = [{ num, body: fromLatin1(updated) }];
  // Inline the array, or the indirect one stays in the file at full size, unreferenced.
  const indirect = pdf.dictRef(body, "W");
  const shared = dicts.some(
    (d) => d.num !== num && pdf.dictRef(d.text, "W") === indirect,
  );
  if (indirect !== null && !shared)
    out.push({ num: indirect, body: fromLatin1("null") });
  return out;
}

function renamedFontObjects(
  pdf: RawPdf,
  dicts: Dict[],
  users: FontUsers,
  used: Set<number>,
): RevisionObject[] {
  const tag = subsetTag(used);
  const renames = [
    ...users.type0.map((n) => tagged(pdf, n, "BaseFont", tag)),
    ...users.cidFonts.flatMap((n) => retitledCidFont(pdf, dicts, n, tag, used)),
    ...users.descriptors.map((n) => retitledDescriptor(pdf, n, tag)),
  ];
  return renames.filter((rename) => rename !== null);
}

async function fontFileObject(
  num: number,
  subset: Uint8Array,
): Promise<RevisionObject> {
  const packed = await deflate(subset);
  return {
    num,
    body: packed
      ? streamObject(
          `<< /Length1 ${subset.length} /Filter /FlateDecode >>`,
          packed,
        )
      : streamObject(`<< /Length1 ${subset.length} >>`, subset),
  };
}

/** Subset session-embedded fonts to their used glyphs; run before any appended revision, else returns `bytes`. */
export async function subsetEmbeddedFonts(
  bytes: Uint8Array,
  fontFiles: readonly Uint8Array[],
  opened: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  if (fontFiles.length === 0) return bytes;
  const added = await newToDocument(opened, fontFiles);
  if (added.length === 0) return bytes;
  const pdf = await RawPdf.parse(bytes);
  if (!pdf || pdf.encrypted || pdf.usesXrefStream) return bytes;
  const dicts = collectDicts(pdf);
  const embedded = new Map(await matchFontStreams(pdf, dicts, added, false));
  if (embedded.size === 0) return bytes;
  const streams = await scanAllContent(pdf, dicts);
  if (!streams) return bytes;

  const replacements: RevisionObject[] = [];
  for (const [fileNum, file] of embedded) {
    const users = fontUsers(pdf, dicts, fileNum);
    if (!users) continue;
    const used = usedGlyphs(streams, resourceNames(dicts, users.type0));
    const subset = subsetTrueType(file, used);
    if (!subset || subset.length > file.length * WORTHWHILE_RATIO) continue;
    replacements.push(
      await fontFileObject(fileNum, subset),
      ...renamedFontObjects(pdf, dicts, users, used),
    );
  }
  if (replacements.length === 0) return bytes;
  return replaceObjects(pdf, replacements) ?? bytes;
}
