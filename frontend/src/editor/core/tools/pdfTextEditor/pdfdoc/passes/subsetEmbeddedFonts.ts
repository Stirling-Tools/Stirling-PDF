import {
  concatBytes,
  deflate,
  fromLatin1,
  toLatin1,
} from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { tokenize } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { RawPdf, setDictEntry } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { streamObject } from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { subsetTrueType } from "@editor/tools/pdfTextEditor/util/ttfSubset";

// A subset this close to the original is not worth rewriting the file for.
const WORTHWHILE_RATIO = 0.9;
const SUBSET_TAG = /^[A-Z]{6}\+/;
const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
const RESOURCE_REF = /\/([^\s/<>[\]()%{}]+)\s+(\d+)\s+0\s+R/g;

/** Raised when a file holds something this cannot read with certainty. */
class Unreadable extends Error {}

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

interface Replacement {
  num: number;
  body: Uint8Array;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function dictPart(body: string): string {
  const stream = body.search(/stream\r?\n/);
  return stream < 0 ? body : body.slice(0, stream);
}

function collectDicts(pdf: RawPdf): Dict[] {
  const out: Dict[] = [];
  for (let num = 1; num <= pdf.highestObjectNumber; num++) {
    if (pdf.bodyOffset(num) < 0) continue;
    const body = pdf.objectBody(num);
    if (body) out.push({ num, text: dictPart(body) });
  }
  return out;
}

async function findFontFiles(
  pdf: RawPdf,
  dicts: Dict[],
  files: readonly Uint8Array[],
): Promise<Map<number, Uint8Array>> {
  const found = new Map<number, Uint8Array>();
  for (const { num, text } of dicts) {
    const length1 = pdf.dictInt(text, "Length1");
    if (length1 === null) continue;
    const sameLength = files.filter((file) => file.length === length1);
    if (sameLength.length === 0) continue;
    const data = await pdf.streamData(num);
    const file = data && sameLength.find((f) => sameBytes(f, data));
    if (file) found.set(num, file);
  }
  return found;
}

// Text addresses a font by glyph id only when it is a CID TrueType font with an
// identity mapping. Any other use of the file means the codes in the content
// are not glyph ids, so the font is left whole.
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
    const descendants = pdf.valueSpan(d.text, "DescendantFonts");
    if (!descendants) continue;
    const refs = [...descendants.text.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) =>
      parseInt(m[1], 10),
    );
    if (!refs.some((ref) => cidFonts.includes(ref))) continue;
    const encoding = pdf.dictName(d.text, "Encoding");
    if (encoding !== "Identity-H" && encoding !== "Identity-V") return null;
    type0.push(d.num);
  }
  return type0.length > 0 ? { descriptors, cidFonts, type0 } : null;
}

/** Every resource name any dictionary binds to one of `fonts`. */
function resourceNames(dicts: Dict[], fonts: number[]): Set<string> {
  const names = new Set<string>();
  for (const { text } of dicts) {
    if (!text.includes("/Font")) continue;
    for (const m of text.matchAll(RESOURCE_REF)) {
      if (fonts.includes(parseInt(m[2], 10))) names.add(m[1]);
    }
  }
  return names;
}

function literalBytes(token: string): number[] {
  const out: number[] = [];
  const text = token.slice(1, -1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "\\") {
      out.push(text.charCodeAt(i) & 0xff);
      continue;
    }
    i += 1;
    const next = text[i];
    if (next === undefined) break;
    const octal = /^[0-7]{1,3}/.exec(text.slice(i, i + 3));
    if (octal) {
      out.push(parseInt(octal[0], 8) & 0xff);
      i += octal[0].length - 1;
    } else if (next === "\r") {
      if (text[i + 1] === "\n") i += 1;
    } else if (next !== "\n") {
      out.push(ESCAPES[next] ?? next.charCodeAt(0) & 0xff);
    }
  }
  return out;
}

function hexBytes(token: string): number[] {
  const digits = token.slice(1, -1).replace(/[^0-9a-fA-F]/g, "");
  const padded = digits.length % 2 ? `${digits}0` : digits;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2)
    out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

// Glyph ids a stream shows, by the resource name of the font in force.
// UNKNOWN_FONT holds text shown before the stream selects any font, which a
// form XObject may inherit from its caller: every font has to count those.
type ScannedStream = Map<string, number[]>;
const UNKNOWN_FONT = "";

// The font is part of the graphics state, so `q`/`Q` save and restore it.
function scanContent(content: Uint8Array): ScannedStream {
  const tokens = tokenize(toLatin1(content));
  const shown: ScannedStream = new Map();
  const saved: string[] = [];
  let font = UNKNOWN_FONT;
  for (let i = 0; i < tokens.length; i++) {
    const text = tokens[i].text;
    // An inline image carries raw bytes the tokeniser cannot be trusted past.
    if (text === "BI") throw new Unreadable();
    if (text === "q") saved.push(font);
    else if (text === "Q") font = saved.pop() ?? UNKNOWN_FONT;
    else if (text === "Tf" && i >= 2 && tokens[i - 2].text.startsWith("/"))
      font = tokens[i - 2].text.slice(1);
    const literal = text.startsWith("(");
    if (!literal && !(text.startsWith("<") && !text.startsWith("<<"))) continue;
    const bytes = literal ? literalBytes(text) : hexBytes(text);
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
): Promise<ScannedStream[]> {
  const out: ScannedStream[] = [];
  for (const pageNum of pdf.pageNumbers()) {
    const body = pdf.objectBody(pageNum);
    if (!body) throw new Unreadable();
    if (pdf.contentRefs(body).length === 0) continue;
    const content = await pdf.pageContent(pageNum);
    if (!content) throw new Unreadable();
    out.push(scanContent(content));
  }
  for (const { num, text } of dicts) {
    if (!/\/Subtype\s*\/Form\b/.test(text) && !text.includes("/PatternType"))
      continue;
    const content = await pdf.streamData(num);
    if (!content) throw new Unreadable();
    out.push(scanContent(content));
  }
  return out;
}

function subsetTag(glyphs: Set<number>): string {
  let hash = 2166136261;
  for (const gid of [...glyphs].sort((a, b) => a - b))
    hash = Math.imul(hash ^ gid, 16777619) >>> 0;
  let tag = "";
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26) + i * 7919;
  }
  return tag;
}

// ISO 32000-1 9.6.4: a subset font's name carries a six-letter tag.
function tagged(
  pdf: RawPdf,
  num: number,
  key: string,
  tag: string,
): Replacement | null {
  const body = pdf.objectBody(num);
  const name = body && pdf.dictName(body, key);
  if (!body || !name || SUBSET_TAG.test(name)) return null;
  const renamed = setDictEntry(body, key, `/${tag}+${name}`);
  return renamed ? { num, body: fromLatin1(renamed.trim()) } : null;
}

// PDFium writes a width for every glyph the font has; only the used ones are
// ever read, and the full list outweighs a subset font several times over.
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
  num: number,
  tag: string,
  used: Set<number>,
): Replacement[] {
  const renamed = tagged(pdf, num, "BaseFont", tag);
  const body = renamed ? toLatin1(renamed.body) : pdf.objectBody(num)?.trim();
  const widths = body ? pdf.resolve(body, "W") : null;
  const trimmed = widths === null ? null : usedWidths(widths, used);
  const updated =
    body && trimmed !== null ? setDictEntry(body, "W", trimmed) : null;
  if (!body || !updated) return renamed ? [renamed] : [];
  const out: Replacement[] = [{ num, body: fromLatin1(updated) }];
  // The array moves inline; an indirect one would otherwise stay in the file
  // at full size with nothing pointing at it.
  const indirect = pdf.dictRef(body, "W");
  if (indirect !== null) out.push({ num: indirect, body: fromLatin1("null") });
  return out;
}

function objectEnd(pdf: RawPdf, num: number, start: number): number {
  const body = pdf.objectBody(num);
  if (!body) return -1;
  const stream = /stream\r?\n/.exec(body);
  if (!stream) return pdf.src.indexOf("endobj", start);
  const length = pdf.dictInt(body.slice(0, stream.index), "Length");
  if (length === null) return -1;
  return pdf.src.indexOf(
    "endobj",
    start + stream.index + stream[0].length + length,
  );
}

// Rewrites the file in place instead of appending a revision: an appended
// revision keeps the old object, and the old object is the megabytes this pass
// exists to drop. Only a single classic cross-reference table is rewritten.
function replaceObjects(
  pdf: RawPdf,
  replacements: Replacement[],
): Uint8Array | null {
  const xref = pdf.startXref;
  if (pdf.src.slice(xref, xref + 4) !== "xref") return null;
  const tail = pdf.src.slice(xref);
  const trailerAt = tail.indexOf("trailer");
  const startxrefAt = tail.lastIndexOf("startxref");
  if (trailerAt < 0 || startxrefAt < trailerAt) return null;
  const trailer = tail.slice(trailerAt, startxrefAt);
  if (/\/(Prev|XRefStm)\b/.test(trailer)) return null;

  const spans: Array<{
    start: number;
    end: number;
    bytes: Uint8Array;
    delta: number;
  }> = [];
  for (const { num, body } of replacements) {
    const start = pdf.bodyOffset(num);
    const end = start < 0 ? -1 : objectEnd(pdf, num, start);
    if (end < 0 || end > xref) return null;
    const bytes = concatBytes([fromLatin1("\n"), body, fromLatin1("\n")]);
    spans.push({ start, end, bytes, delta: bytes.length - (end - start) });
  }
  spans.sort((a, b) => a.start - b.start);
  const shifted = (offset: number): number =>
    spans.reduce((at, s) => (s.start < offset ? at + s.delta : at), offset);

  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) return null;
    parts.push(pdf.bytes.subarray(cursor, span.start), span.bytes);
    cursor = span.end;
  }
  parts.push(pdf.bytes.subarray(cursor, xref));
  const table = tail
    .slice(0, trailerAt)
    .replace(
      /(\d{10}) (\d{5}) n/g,
      (_entry, offset: string, generation: string) =>
        `${String(shifted(parseInt(offset, 10))).padStart(10, "0")} ${generation} n`,
    );
  parts.push(
    fromLatin1(`${table}${trailer}startxref\n${shifted(xref)}\n%%EOF\n`),
  );
  return concatBytes(parts);
}

/**
 * Replace each of `fontFiles` that the saved file embeds whole with a copy
 * holding only the glyphs the file's content draws. `fontFiles` are the exact
 * font programs embedded during this session; fonts the document already had
 * are never touched.
 *
 * Must run on the bytes PDFium wrote, before any pass appends a revision: it
 * rewrites the cross-reference table in place. Never throws and never guesses:
 * whenever a font's use or a content stream cannot be read with certainty, that
 * font (or the whole file) is returned unchanged, which only costs size.
 */
export async function subsetEmbeddedFonts(
  bytes: Uint8Array,
  fontFiles: readonly Uint8Array[],
): Promise<Uint8Array> {
  if (fontFiles.length === 0) return bytes;
  try {
    const pdf = await RawPdf.parse(bytes);
    if (!pdf || pdf.encrypted || pdf.usesXrefStream) return bytes;
    const dicts = collectDicts(pdf);
    const embedded = await findFontFiles(pdf, dicts, fontFiles);
    if (embedded.size === 0) return bytes;
    const streams = await scanAllContent(pdf, dicts);

    const replacements: Replacement[] = [];
    for (const [fileNum, file] of embedded) {
      const users = fontUsers(pdf, dicts, fileNum);
      if (!users) continue;
      const names = resourceNames(dicts, users.type0);
      const used = new Set<number>([0]);
      for (const stream of streams) {
        for (const [font, glyphs] of stream) {
          if (font !== UNKNOWN_FONT && !names.has(font)) continue;
          for (const gid of glyphs) used.add(gid);
        }
      }
      const subset = subsetTrueType(file, used);
      if (!subset || subset.length > file.length * WORTHWHILE_RATIO) continue;
      const packed = await deflate(subset);
      replacements.push({
        num: fileNum,
        body: packed
          ? streamObject(
              `<< /Length1 ${subset.length} /Filter /FlateDecode >>`,
              packed,
            )
          : streamObject(`<< /Length1 ${subset.length} >>`, subset),
      });
      const tag = subsetTag(used);
      const renames = [
        ...users.type0.map((n) => tagged(pdf, n, "BaseFont", tag)),
        ...users.cidFonts.flatMap((n) => retitledCidFont(pdf, n, tag, used)),
        ...users.descriptors.map((n) => tagged(pdf, n, "FontName", tag)),
      ];
      for (const rename of renames) if (rename) replacements.push(rename);
    }
    if (replacements.length === 0) return bytes;
    return replaceObjects(pdf, replacements) ?? bytes;
  } catch {
    return bytes;
  }
}
