/**
 * A deliberately small read-only view over raw PDF bytes.
 *
 * PDFium's public API cannot express some of the repairs the editor needs
 * (see `pdfdoc/passes/*`), so those passes work on the file itself. This is
 * the shared substrate: one scan builds the object index, one walk builds
 * the page list, and everything else is lookups.
 *
 * Everything here is best-effort by design. A file this cannot understand
 * makes every accessor return null, and the calling pass leaves the bytes
 * untouched rather than guessing.
 */
import {
  fromLatin1,
  inflate,
  toLatin1,
  undoPngPredictor,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";

/** No legitimate PDF object body runs longer than this. */
const MAX_OBJECT_BYTES = 32 * 1024 * 1024;

const WHITESPACE = new Set([" ", "\t", "\r", "\n", "\f", "\0"]);
const DELIMITER = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

/** Span of a dictionary entry's value inside an object body. */
export interface ValueSpan {
  /** Index of the first character of the value. */
  start: number;
  /** Index one past the last character of the value. */
  end: number;
  text: string;
}

interface ObjectSource {
  /** Generation the file declares for this object; almost always 0. */
  gen: number;
  /** Byte offset of the object's `obj` keyword, for top-level objects. */
  offset?: number;
  /** Pre-extracted body, for objects unpacked from an object stream. */
  body?: string;
}

export class RawPdf {
  readonly bytes: Uint8Array;
  readonly src: string;
  readonly rootNum: number;
  /** True when the file's newest cross-reference section is a stream. */
  readonly usesXrefStream: boolean;
  readonly startXref: number;
  readonly trailerId: string | null;
  /** True when the file has an /Encrypt dictionary. */
  readonly encrypted: boolean;

  private readonly objects: Map<number, ObjectSource>;
  private readonly bodyCache = new Map<number, string | null>();
  private pageNums: number[] | null = null;
  /** Highest object number the file has ever used, across all revisions. */
  private highestObj: number;

  private constructor(init: {
    bytes: Uint8Array;
    src: string;
    rootNum: number;
    maxObjNum: number;
    usesXrefStream: boolean;
    startXref: number;
    trailerId: string | null;
    encrypted: boolean;
    objects: Map<number, ObjectSource>;
  }) {
    this.bytes = init.bytes;
    this.src = init.src;
    this.rootNum = init.rootNum;
    this.highestObj = init.maxObjNum;
    this.usesXrefStream = init.usesXrefStream;
    this.startXref = init.startXref;
    this.trailerId = init.trailerId;
    this.encrypted = init.encrypted;
    this.objects = init.objects;
  }

  static async parse(bytes: Uint8Array): Promise<RawPdf | null> {
    const src = toLatin1(bytes);
    if (!src.startsWith("%PDF-") && src.indexOf("%PDF-") > 1024) return null;

    // ONE pass indexes every top-level object. A per-lookup scan of the
    // whole file makes every caller quadratic, and several passes run per
    // open - that is the difference between "opens instantly" and "the tab
    // freezes on a large book".
    const objects = new Map<number, ObjectSource>();
    let maxObjNum = 0;
    const objRe = /(\d+)[\t\r\n\f ]+(\d+)[\t\r\n\f ]+obj\b/g;
    for (let m = objRe.exec(src); m !== null; m = objRe.exec(src)) {
      const before = m.index > 0 ? src[m.index - 1] : "\n";
      // "12 0 obj" must not match inside "912 0 obj".
      if (before >= "0" && before <= "9") continue;
      const num = parseInt(m[1], 10);
      if (!Number.isFinite(num)) continue;
      // Later revisions shadow earlier ones, so the last definition wins.
      objects.set(num, {
        gen: parseInt(m[2], 10) || 0,
        offset: m.index + m[0].length,
      });
      if (num > maxObjNum) maxObjNum = num;
    }
    if (objects.size === 0) return null;

    const startXref = (() => {
      const at = src.lastIndexOf("startxref");
      if (at < 0) return -1;
      const n = parseInt(src.slice(at + 9, at + 40).trim(), 10);
      return Number.isFinite(n) ? n : -1;
    })();
    const usesXrefStream =
      startXref >= 0 && src.slice(startXref, startXref + 4) !== "xref";

    // /Root lives in a trailer dictionary, or - for cross-reference-stream
    // files, which have no `trailer` keyword at all - in the xref stream's
    // own dictionary. Updated files chain trailers and the newest one may
    // carry only /Size and /ID, so walk backwards until /Root turns up.
    let rootNum = -1;
    let trailerId: string | null = null;
    for (let at = src.length; ;) {
      at = src.lastIndexOf("trailer", at - 1);
      if (at < 0) break;
      const chunk = src.slice(at, at + 2048);
      if (trailerId === null) {
        const idm = chunk.match(/\/ID\s*(\[[^\]]*\])/);
        if (idm) trailerId = idm[1];
      }
      const rm = chunk.match(/\/Root\s+(\d+)\s+\d+\s+R/);
      if (rm) {
        rootNum = parseInt(rm[1], 10);
        break;
      }
      if (at === 0) break;
    }
    if (rootNum < 0) {
      const rm = src.match(/\/Root\s+(\d+)\s+\d+\s+R/);
      if (rm) rootNum = parseInt(rm[1], 10);
    }
    if (trailerId === null) {
      const idm = src.match(/\/ID\s*(\[[^\]]*\])/);
      if (idm) trailerId = idm[1];
    }
    if (rootNum < 0) return null;

    // Appended objects must number past every revision the file has, not
    // just the newest one, so /Size takes the maximum found anywhere.
    for (const m of src.matchAll(/\/Size\s+(\d+)/g)) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n - 1 > maxObjNum) maxObjNum = n - 1;
    }

    const pdf = new RawPdf({
      bytes,
      src,
      rootNum,
      maxObjNum,
      usesXrefStream,
      startXref,
      trailerId,
      encrypted: /\/Encrypt\s+\d+\s+\d+\s+R/.test(src),
      objects,
    });
    await pdf.indexObjectStreams();
    return pdf;
  }

  /**
   * Unpack `/Type /ObjStm` containers so objects stored inside them are
   * reachable. In a PDF 1.5+ file most of the structure - page dictionaries
   * included - lives in these, so without this step the passes see almost
   * nothing.
   */
  private async indexObjectStreams(): Promise<void> {
    const compressed = await this.compressedInNewestXref();
    const containers: number[] = [];
    for (const num of this.objects.keys()) {
      const body = this.objectBody(num);
      if (body && /\/Type\s*\/ObjStm\b/.test(body)) containers.push(num);
    }
    for (const num of containers) {
      const data = await this.streamData(num);
      if (!data) continue;
      const body = this.objectBody(num);
      if (!body) continue;
      const n = this.dictInt(body, "N");
      const first = this.dictInt(body, "First");
      if (n === null || first === null || first < 0) continue;
      const text = toLatin1(data);
      const header = text.slice(0, first).trim();
      const nums = header.length ? header.split(/\s+/).map(Number) : [];
      for (let i = 0; i < n; i += 1) {
        const objNum = nums[i * 2];
        const off = nums[i * 2 + 1];
        if (!Number.isFinite(objNum) || !Number.isFinite(off)) continue;
        // A top-level definition usually comes from a later revision and
        // wins - unless the newest xref says this object lives in a stream,
        // in which case the top-level copy is the stale one.
        if (this.objects.has(objNum) && !compressed.has(objNum)) continue;
        const nextOff = i + 1 < n ? nums[i * 2 + 3] : data.length - first;
        const end = Number.isFinite(nextOff) ? first + nextOff : text.length;
        // Objects inside an object stream are generation 0 by definition.
        this.objects.set(objNum, {
          gen: 0,
          body: text.slice(first + off, end),
        });
        // The container scan above cached the stale top-level body.
        this.bodyCache.delete(objNum);
        if (objNum > this.highestObj) this.highestObj = objNum;
      }
    }
  }

  // Object numbers the NEWEST cross-reference section stores inside an object
  // stream (entry type 2). Empty for classic tables, which have no type 2.
  private async compressedInNewestXref(): Promise<Set<number>> {
    const out = new Set<number>();
    if (this.startXref < 0 || !this.usesXrefStream) return out;
    const header = /^(\d+)\s+(\d+)\s+obj\b/.exec(
      this.src.slice(this.startXref, this.startXref + 64),
    );
    if (!header) return out;
    const num = parseInt(header[1], 10);
    const body = this.objectBody(num);
    if (!body || !/\/Type\s*\/XRef\b/.test(body)) return out;
    const data = await this.streamData(num);
    if (!data) return out;

    const wSpan = this.valueSpan(body, "W");
    const w = wSpan
      ? [...wSpan.text.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10))
      : [];
    if (w.length < 3) return out;
    const size = this.dictInt(body, "Size") ?? 0;
    const indexSpan = this.valueSpan(body, "Index");
    const index = indexSpan
      ? [...indexSpan.text.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10))
      : [0, size];

    const rowLen = w[0] + w[1] + w[2];
    if (rowLen <= 0) return out;
    let at = 0;
    for (let g = 0; g + 1 < index.length; g += 2) {
      for (let k = 0; k < index[g + 1]; k += 1) {
        if (at + rowLen > data.length) return out;
        let type = 1;
        if (w[0] > 0) {
          type = 0;
          for (let b = 0; b < w[0]; b += 1) type = (type << 8) | data[at + b];
        }
        if (type === 2) out.add(index[g] + k);
        at += rowLen;
      }
    }
    return out;
  }

  /** Object numbers appended by a revision must start above this. */
  get highestObjectNumber(): number {
    return this.highestObj;
  }

  /** Raw text of an object's body: everything between `obj` and `endobj`. */
  objectBody(num: number): string | null {
    const cached = this.bodyCache.get(num);
    if (cached !== undefined) return cached;
    const entry = this.objects.get(num);
    let body: string | null = null;
    if (entry?.body !== undefined) {
      body = entry.body;
    } else if (entry?.offset !== undefined) {
      // Bounded: an unterminated object in a hostile file would otherwise
      // make every lookup scan to end of file.
      const limit = Math.min(this.src.length, entry.offset + MAX_OBJECT_BYTES);
      const end = this.src.indexOf("endobj", entry.offset);
      body = end < 0 || end > limit ? null : this.src.slice(entry.offset, end);
    }
    this.bodyCache.set(num, body);
    return body;
  }

  /** Generation the file declares for an object, 0 when unknown. */
  generationOf(num: number): number {
    return this.objects.get(num)?.gen ?? 0;
  }

  hasObject(num: number): boolean {
    return this.objects.has(num);
  }

  /** Byte offset of the object body, or -1 when it lives in an ObjStm. */
  bodyOffset(num: number): number {
    return this.objects.get(num)?.offset ?? -1;
  }

  // --- dictionary access ---------------------------------------------------

  /** `/Key 12 0 R` -> 12. */
  dictRef(body: string, key: string): number | null {
    const span = this.valueSpan(body, key);
    if (!span) return null;
    const m = span.text.match(/^(\d+)\s+\d+\s+R\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * `/Key 42` -> 42, and null for anything else. Strict on purpose: a lax
   * match reads `/Length 12 0 R` as the integer 12 and truncates the stream.
   */
  dictInt(body: string, key: string): number | null {
    const span = this.valueSpan(body, key);
    if (!span) return null;
    return /^-?\d+$/.test(span.text.trim()) ? parseInt(span.text, 10) : null;
  }

  dictName(body: string, key: string): string | null {
    const span = this.valueSpan(body, key);
    if (!span) return null;
    const m = span.text.match(/^\/([^\s/<>()[\]{}%]*)/);
    return m ? m[1] : null;
  }

  /** Follow `/Key n 0 R` when indirect, else return the direct value text. */
  resolve(body: string, key: string): string | null {
    const span = this.valueSpan(body, key);
    if (!span) return null;
    const m = span.text.match(/^(\d+)\s+\d+\s+R\b/);
    if (m) return this.objectBody(parseInt(m[1], 10));
    return span.text;
  }

  /**
   * Locate the value of `/Key` in the object's OUTERMOST dictionary.
   *
   * Depth-aware on purpose: a naive regex happily matches a `/Contents`
   * buried in a nested annotation dictionary, and rewriting that instead of
   * the page's own entry produces a file that opens but renders nothing.
   */
  valueSpan(body: string, key: string): ValueSpan | null {
    const open = body.indexOf("<<");
    if (open < 0) return null;
    let i = open + 2;
    let depth = 1;
    while (i < body.length) {
      const ch = body[i];
      if (ch === "%") {
        while (i < body.length && body[i] !== "\n" && body[i] !== "\r") i += 1;
        continue;
      }
      if (ch === "(") {
        i = skipLiteralString(body, i);
        continue;
      }
      if (ch === "<" && body[i + 1] === "<") {
        depth += 1;
        i += 2;
        continue;
      }
      if (ch === ">" && body[i + 1] === ">") {
        depth -= 1;
        i += 2;
        if (depth === 0) return null;
        continue;
      }
      if (ch === "[" || ch === "]") {
        i += 1;
        continue;
      }
      if (ch === "/" && depth === 1) {
        const nameEnd = scanNameEnd(body, i + 1);
        if (body.slice(i + 1, nameEnd) === key) {
          const start = skipWhitespace(body, nameEnd);
          const end = scanValueEnd(body, start);
          return { start, end, text: body.slice(start, end) };
        }
        i = nameEnd;
        continue;
      }
      i += 1;
    }
    return null;
  }

  // --- streams -------------------------------------------------------------

  /** Decoded stream payload for an object, or null when unsupported. */
  async streamData(num: number): Promise<Uint8Array | null> {
    const entry = this.objects.get(num);
    if (!entry || entry.offset === undefined) return null;
    const body = this.objectBody(num);
    if (body === null) return null;
    const kw = body.indexOf("stream");
    if (kw < 0) return null;
    let dataStart = entry.offset + kw + "stream".length;
    if (this.src[dataStart] === "\r") dataStart += 1;
    if (this.src[dataStart] === "\n") dataStart += 1;

    let length = this.dictInt(body, "Length");
    if (length === null) {
      const ref = this.dictRef(body, "Length");
      if (ref !== null) {
        const lenBody = this.objectBody(ref);
        const m = lenBody?.match(/-?\d+/);
        if (m) length = parseInt(m[0], 10);
      }
    }
    let dataEnd = length !== null && length >= 0 ? dataStart + length : -1;
    // A wrong /Length is common enough in the wild that trusting it blindly
    // truncates real content; verify against the endstream keyword.
    const marker = this.src.indexOf("endstream", dataStart);
    if (dataEnd < 0 || marker < 0 || dataEnd > marker) {
      dataEnd = marker < 0 ? this.bytes.length : marker;
      while (
        dataEnd > dataStart &&
        (this.src[dataEnd - 1] === "\n" || this.src[dataEnd - 1] === "\r")
      ) {
        dataEnd -= 1;
      }
    }
    let data = this.bytes.subarray(dataStart, dataEnd);

    const filters = this.filterNames(body);
    if (filters === null) return null;
    if (filters.length === 0) return data;
    if (filters.some((f) => f !== "FlateDecode")) return null;
    for (let i = 0; i < filters.length; i += 1) {
      const out = await inflate(data);
      if (!out) return null;
      data = out;
    }
    return this.applyPredictor(body, data);
  }

  /** Null means "there is a filter here I cannot read", never "no filter". */
  private filterNames(body: string): string[] | null {
    const span = this.valueSpan(body, "Filter");
    if (!span) return [];
    // An indirect /Filter would otherwise look like no filter at all, and the
    // still-compressed bytes would be handed back as decoded content.
    if (/^\d+\s+\d+\s+R\b/.test(span.text)) return null;
    if (span.text.startsWith("/")) {
      const m = span.text.match(/^\/([^\s/<>()[\]{}%]*)/);
      return m ? [m[1]] : [];
    }
    if (span.text.startsWith("[")) {
      return [...span.text.matchAll(/\/([^\s/<>()[\]{}%]+)/g)].map((m) => m[1]);
    }
    return null;
  }

  private applyPredictor(body: string, data: Uint8Array): Uint8Array | null {
    const parms = this.valueSpan(body, "DecodeParms");
    if (!parms) return data;
    if (/^\d+\s+\d+\s+R\b/.test(parms.text)) return null;
    const dict = parms.text;
    const int = (key: string, dflt: number): number => {
      const m = dict.match(new RegExp(`/${key}\\s+(\\d+)`));
      return m ? parseInt(m[1], 10) : dflt;
    };
    const predictor = int("Predictor", 1);
    if (predictor < 10) return data;
    return undoPngPredictor(
      data,
      int("Colors", 1),
      int("BitsPerComponent", 8),
      int("Columns", 1),
    );
  }

  // --- page tree -----------------------------------------------------------

  /**
   * Object numbers of every page, in document order.
   *
   * Walked once and cached: re-walking from the root per page index turns a
   * few-hundred-page document into a quadratic traversal.
   */
  pageNumbers(): number[] {
    if (this.pageNums) return this.pageNums;
    const out: number[] = [];
    const root = this.objectBody(this.rootNum);
    const pagesNum = root ? this.dictRef(root, "Pages") : null;
    const seen = new Set<number>();
    const visit = (num: number, depth: number): void => {
      if (depth > 64 || seen.has(num)) return;
      seen.add(num);
      const body = this.objectBody(num);
      if (!body) return;
      const type = this.dictName(body, "Type");
      if (type === "Page") {
        out.push(num);
        return;
      }
      const kids = this.valueSpan(body, "Kids");
      if (!kids) {
        if (type === null) out.push(num);
        return;
      }
      for (const m of kids.text.matchAll(/(\d+)\s+\d+\s+R/g)) {
        visit(parseInt(m[1], 10), depth + 1);
      }
    };
    if (pagesNum !== null) visit(pagesNum, 0);
    this.pageNums = out;
    return out;
  }

  pageNumberAt(pageIndex: number): number | null {
    const pages = this.pageNumbers();
    return pageIndex >= 0 && pageIndex < pages.length ? pages[pageIndex] : null;
  }

  /**
   * Resolve a key on a page, walking `/Parent` for the inheritable ones
   * (`/Resources`, `/MediaBox`, `/CropBox`, `/Rotate`). A page that inherits
   * its resources is common, and treating it as having none silently
   * disables every pass that needs them.
   */
  pageInherited(pageNum: number, key: string): string | null {
    let num: number | null = pageNum;
    for (let depth = 0; num !== null && depth < 64; depth += 1) {
      const body: string | null = this.objectBody(num);
      if (!body) return null;
      const direct = this.resolve(body, key);
      if (direct !== null) return direct;
      num = this.dictRef(body, "Parent");
    }
    return null;
  }

  /** Concatenated, decoded content stream(s) of a page. */
  async pageContent(pageNum: number): Promise<Uint8Array | null> {
    const body = this.objectBody(pageNum);
    if (!body) return null;
    const refs = this.contentRefs(body);
    if (refs.length === 0) return null;
    const parts: Uint8Array[] = [];
    for (const ref of refs) {
      const data = await this.streamData(ref);
      if (!data) return null;
      parts.push(data);
      parts.push(fromLatin1("\n"));
    }
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  /** Object numbers backing a page's `/Contents`, in order. */
  contentRefs(pageBody: string): number[] {
    const span = this.valueSpan(pageBody, "Contents");
    if (!span) return [];
    if (span.text.startsWith("[")) {
      return [...span.text.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) =>
        parseInt(m[1], 10),
      );
    }
    const m = span.text.match(/^(\d+)\s+\d+\s+R\b/);
    return m ? [parseInt(m[1], 10)] : [];
  }
}

/**
 * Replace a dictionary entry's value, keeping the result lexable.
 *
 * Producers write `/Contents[8 0 R]` with no separator, so splicing a plain
 * `11 0 R` straight in yields the single name token `/Contents11` and the
 * page silently loses its content.
 */
export function spliceValue(
  body: string,
  span: ValueSpan,
  replacement: string,
): string {
  const before = body[span.start - 1];
  const needsGap =
    before !== undefined &&
    !WHITESPACE.has(before) &&
    !DELIMITER.has(before) &&
    !WHITESPACE.has(replacement[0]) &&
    !DELIMITER.has(replacement[0]);
  return (
    body.slice(0, span.start) +
    (needsGap ? " " : "") +
    replacement +
    body.slice(span.end)
  );
}

function skipWhitespace(text: string, at: number): number {
  let i = at;
  while (i < text.length && WHITESPACE.has(text[i])) i += 1;
  return i;
}

function scanNameEnd(text: string, at: number): number {
  let i = at;
  while (
    i < text.length &&
    !WHITESPACE.has(text[i]) &&
    !DELIMITER.has(text[i])
  ) {
    i += 1;
  }
  return i;
}

function skipLiteralString(text: string, at: number): number {
  let i = at + 1;
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  return i;
}

/** End index of one complete object starting at `at`. */
function scanValueEnd(text: string, at: number): number {
  let i = at;
  if (text[i] === "(") return skipLiteralString(text, i);
  if (text[i] === "<" && text[i + 1] === "<") {
    let depth = 0;
    while (i < text.length) {
      if (text[i] === "(") {
        i = skipLiteralString(text, i);
        continue;
      }
      if (text[i] === "<" && text[i + 1] === "<") {
        depth += 1;
        i += 2;
        continue;
      }
      if (text[i] === ">" && text[i + 1] === ">") {
        depth -= 1;
        i += 2;
        if (depth === 0) return i;
        continue;
      }
      i += 1;
    }
    return i;
  }
  if (text[i] === "<") {
    const close = text.indexOf(">", i);
    return close < 0 ? text.length : close + 1;
  }
  if (text[i] === "[") {
    let depth = 0;
    while (i < text.length) {
      if (text[i] === "(") {
        i = skipLiteralString(text, i);
        continue;
      }
      if (text[i] === "[") depth += 1;
      else if (text[i] === "]") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return i;
  }
  // Bare token(s). An indirect reference is three tokens, so consume them
  // together or `/Length 12 0 R` reads back as the integer 12.
  const refMatch = /^\d+\s+\d+\s+R\b/.exec(text.slice(i));
  if (refMatch) return i + refMatch[0].length;
  if (text[i] === "/") return scanNameEnd(text, i + 1);
  while (
    i < text.length &&
    !WHITESPACE.has(text[i]) &&
    !DELIMITER.has(text[i])
  ) {
    i += 1;
  }
  return i;
}
