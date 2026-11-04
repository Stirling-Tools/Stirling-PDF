/**
 * Redrawing part of a text object's text as an object of its own, for giving
 * that part a tag of its own. PDFium shares one set of marks between every
 * object a marked-content sequence draws, so changing one object's marks
 * changes them all; a fresh object has marks of its own.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { writeUtf16 } from "@editor/services/pdfiumService";
import { removeAndDestroyObject } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import {
  readObjFill,
  readObjStroke,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import {
  addTagMark,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

const FPDF_PAGEOBJ_TEXT = 1;

/** A glyph further than this from where its source drew it starts an object of its own. */
const SPLIT_AT_PT = 0.01;
/** A piece that cannot be drawn with every glyph this close to its source's is refused. */
const REFUSE_AT_PT = 0.1;

/** How a text object draws its text, read before it is changed. */
export interface TextSource {
  font: number;
  size: number;
  matrix: Float32Array;
  fill: RGBA | null;
  stroke: RGBA | null;
  strokeWidth: number | null;
  renderMode: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Null for an object that is not text, or whose font or matrix cannot be read. */
export function readTextSource(
  m: WrappedPdfiumModule,
  objPtr: number,
): TextSource | null {
  if (m.FPDFPageObj_GetType(objPtr) !== FPDF_PAGEOBJ_TEXT) return null;
  const font = m.FPDFTextObj_GetFont(objPtr);
  const sizePtr = scratchPtr(m, SCRATCH.splitFontSize, 4);
  const matrix = readMatrix(m, objPtr);
  if (!font || !matrix || !m.FPDFTextObj_GetFontSize(objPtr, sizePtr)) {
    return null;
  }
  const width = scratchPtr(m, SCRATCH.splitStrokeWidth, 4);
  return {
    font,
    size: m.pdfium.getValue(sizePtr, "float"),
    matrix,
    fill: readObjFill(m, objPtr),
    stroke: readObjStroke(m, objPtr),
    strokeWidth: m.FPDFPageObj_GetStrokeWidth(objPtr, width)
      ? m.pdfium.getValue(width, "float")
      : null,
    renderMode: m.FPDFTextObj_GetTextRenderMode(objPtr),
  };
}

/**
 * Where each object draws each character of its text, by the code unit it
 * starts at, in page space. The text page's characters for an object are
 * matched to its text in order, past any space the text page inferred from a
 * gap rather than read from a glyph, which has no place. An object whose
 * characters do not spell its text is left out, so none of its places are
 * trusted.
 */
export function charOrigins(
  m: WrappedPdfiumModule,
  pagePtr: number,
  texts: ReadonlyMap<number, string>,
): Map<number, Map<number, Point>> {
  const found = new Map<number, Map<number, Point>>(
    [...texts.keys()].map((ptr) => [ptr, new Map()]),
  );
  const read = new Map<number, number>();
  const textPage = m.FPDFText_LoadPage(pagePtr);
  if (!textPage) return new Map();
  try {
    const xPtr = scratchPtr(m, SCRATCH.splitOriginX, 8);
    const yPtr = scratchPtr(m, SCRATCH.splitOriginY, 8);
    const count = m.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const objPtr = m.FPDFText_GetTextObject(textPage, i);
      const text = texts.get(objPtr);
      const origins = found.get(objPtr);
      if (text === undefined || !origins) continue;
      if (m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      const char = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      const at = nextMatch(text, read.get(objPtr) ?? 0, char);
      if (at === null) {
        found.delete(objPtr);
        continue;
      }
      if (m.FPDFText_GetCharOrigin(textPage, i, xPtr, yPtr)) {
        origins.set(at, {
          x: m.pdfium.getValue(xPtr, "double"),
          y: m.pdfium.getValue(yPtr, "double"),
        });
      }
      read.set(objPtr, at + char.length);
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
  for (const [ptr, text] of texts) {
    if (/\S/.test(text.slice(read.get(ptr) ?? 0))) found.delete(ptr);
  }
  return found;
}

/** Where `char` comes next in `text` from code unit `at`, past spaces; null when it does not. */
function nextMatch(text: string, at: number, char: string): number | null {
  let unit = at;
  while (!text.startsWith(char, unit) && /\s/.test(text[unit] ?? "")) unit++;
  return text.startsWith(char, unit) ? unit : null;
}

/** The code units at which each character of `text` starts. */
export function charStarts(text: string): number[] {
  const starts: number[] = [];
  for (let at = 0; at < text.length;) {
    starts.push(at);
    at += text.codePointAt(at)! > 0xffff ? 2 : 1;
  }
  return starts;
}

/** Where each character from code unit `from` to `to` of `text` that draws ink starts. */
export function inkStarts(text: string, from: number, to: number): number[] {
  return charStarts(text).filter(
    (at) =>
      at >= from &&
      at < to &&
      /\S/u.test(String.fromCodePoint(text.codePointAt(at)!)),
  );
}

/**
 * Where to start drawing a piece of `text` from code unit `from`: the
 * source's place for the first character from there that a glyph drew, or
 * failing that the last before it. A piece needing the second is only spaces
 * no glyph drew, so where it lands cannot show. Null when no glyph drew any of
 * `text`.
 */
export function pieceOrigin(
  origins: ReadonlyMap<number, Point>,
  text: string,
  from: number,
): Point | null {
  const starts = charStarts(text).filter((at) => origins.has(at));
  const at = starts.find((start) => start >= from) ?? starts.at(-1);
  return at === undefined ? null : origins.get(at)!;
}

/**
 * Draw `text` as `source` draws its own, starting at `origin`, as a new
 * object carrying `tags`, at page object `index` or last on the page.
 * Re-encoded through the font, so any kerning or character spacing the
 * source applied is lost. Returns 0 when PDFium cannot create it.
 */
export function addTextPiece(
  m: WrappedPdfiumModule,
  docPtr: number,
  page: Page,
  source: TextSource,
  text: string,
  origin: Point,
  tags: readonly TagMark[],
  index?: number,
): number {
  const ptr = m.FPDFPageObj_CreateTextObj(docPtr, source.font, source.size);
  if (!ptr) return 0;
  if (!setText(m, ptr, text)) {
    m.FPDFPageObj_Destroy(ptr);
    return 0;
  }
  const matrix = Float32Array.from(source.matrix);
  matrix[4] = origin.x;
  matrix[5] = origin.y;
  writeMatrix(m, ptr, matrix);
  const { fill, stroke } = source;
  if (fill) m.FPDFPageObj_SetFillColor(ptr, fill.r, fill.g, fill.b, fill.a);
  if (stroke) {
    m.FPDFPageObj_SetStrokeColor(ptr, stroke.r, stroke.g, stroke.b, stroke.a);
  }
  if (source.strokeWidth !== null) {
    m.FPDFPageObj_SetStrokeWidth(ptr, source.strokeWidth);
  }
  m.FPDFTextObj_SetTextRenderMode(ptr, source.renderMode);
  for (const tag of tags) addTagMark(m, docPtr, ptr, tag);
  if (index === undefined) m.FPDFPage_InsertObject(page.pagePtr, ptr);
  else m.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, index);
  return ptr;
}

/** An object drawing code units `from` to `to` of a source object's text. */
export interface Placed {
  ptr: number;
  from: number;
  to: number;
}

/** A piece of a source object's text, drawn so far by object `ptr` alone. */
export interface Placing extends Placed {
  /** The source object's whole text. */
  text: string;
  source: TextSource;
  /** Where the source drew each character of `text`, as `charOrigins` reads it. */
  origins: ReadonlyMap<number, Point>;
  tags: readonly TagMark[];
  /** Drawn by a new object, which lays its text out with no spacing of its own. */
  fresh: boolean;
}

/**
 * Split each piece's object wherever PDFium lays a glyph out elsewhere than
 * the source drew it, each new part a new object starting exactly there and
 * drawn right after the part before it. Undoing pushes onto `undo`. Returns
 * the objects drawing each piece, in order. Throws when a glyph still lands
 * further than REFUSE_AT_PT from where the source drew it.
 */
export function placeGlyphs(
  m: WrappedPdfiumModule,
  docPtr: number,
  page: Page,
  pieces: readonly Placing[],
  undo: Array<() => void>,
): Placed[][] {
  const placed = pieces.map(({ ptr, from, to }) => [{ ptr, from, to }]);
  let pending = pieces.map((piece, i) => ({
    piece,
    parts: placed[i],
    head: placed[i][0],
    fresh: piece.fresh,
  }));
  while (pending.length > 0) {
    const drawn = drawnOrigins(
      m,
      page.pagePtr,
      pending.map(({ piece, head }) => ({ piece, part: head })),
    );
    const next: typeof pending = [];
    for (const { piece, parts, head, fresh } of pending) {
      const breaks = misplaced(piece, head, drawn.get(head.ptr)!);
      // Past its first break, an object keeping the source's spacing goes on
      // as a new object, which lays out without it, so is measured afresh.
      const cuts = fresh ? breaks : breaks.slice(0, 1);
      if (cuts.length === 0) continue;
      if (
        !setPieceText(m, head.ptr, piece.text.slice(head.from, cuts[0]), null)
      ) {
        throw new Error("PDFium could not redraw the text");
      }
      let index = pageObjectIndex(m, page, head.ptr);
      const ends = [...cuts.slice(1), head.to];
      const added = cuts.map((from, i) => {
        const ptr = addTextPiece(
          m,
          docPtr,
          page,
          piece.source,
          piece.text.slice(from, ends[i]),
          piece.origins.get(from)!,
          piece.tags,
          ++index,
        );
        if (!ptr) throw new Error("PDFium could not draw the text");
        undo.push(() => removeAndDestroyObject(m, page.pagePtr, ptr));
        return { ptr, from, to: ends[i] };
      });
      head.to = cuts[0];
      parts.splice(parts.indexOf(head) + 1, 0, ...added);
      if (!fresh) next.push({ piece, parts, head: added[0], fresh: true });
    }
    pending = next;
  }
  verifyPlaced(m, page, pieces, placed);
  return placed;
}

/**
 * The glyphs of `head` that need an object of their own: each landing
 * further than SPLIT_AT_PT from where the source drew it, once every glyph
 * before it is drawn where the source drew it.
 */
function misplaced(
  piece: Placing,
  head: Placed,
  drawn: ReadonlyMap<number, Point>,
): number[] {
  const breaks: number[] = [];
  let shift: Point = { x: 0, y: 0 };
  for (const at of inkStarts(piece.text, head.from, head.to)) {
    const got = drawn.get(at - head.from)!;
    const want = piece.origins.get(at)!;
    const off = Math.hypot(got.x + shift.x - want.x, got.y + shift.y - want.y);
    if (at > head.from && off > SPLIT_AT_PT) {
      breaks.push(at);
      shift = { x: want.x - got.x, y: want.y - got.y };
    }
  }
  return breaks;
}

function verifyPlaced(
  m: WrappedPdfiumModule,
  page: Page,
  pieces: readonly Placing[],
  placed: readonly Placed[][],
): void {
  const parts = pieces.flatMap((piece, i) =>
    placed[i].map((part) => ({ piece, part })),
  );
  const drawn = drawnOrigins(m, page.pagePtr, parts);
  for (const { piece, part } of parts) {
    for (const at of inkStarts(piece.text, part.from, part.to)) {
      const got = drawn.get(part.ptr)!.get(at - part.from)!;
      const want = piece.origins.get(at)!;
      if (Math.hypot(got.x - want.x, got.y - want.y) > REFUSE_AT_PT) {
        throw new Error("PDFium cannot draw the text where it was drawn");
      }
    }
  }
}

/**
 * Where each part's object draws its glyphs, by code unit of the part's
 * text. Throws when the text page cannot place every one.
 */
function drawnOrigins(
  m: WrappedPdfiumModule,
  pagePtr: number,
  parts: ReadonlyArray<{ piece: Placing; part: Placed }>,
): Map<number, Map<number, Point>> {
  const texts = new Map(
    parts.map(({ piece, part }) => [
      part.ptr,
      piece.text.slice(part.from, part.to),
    ]),
  );
  const found = charOrigins(m, pagePtr, texts);
  for (const [ptr, text] of texts) {
    const drawn = found.get(ptr);
    if (
      !drawn ||
      inkStarts(text, 0, text.length).some((at) => !drawn.has(at))
    ) {
      throw new Error("PDFium cannot place a piece of the text");
    }
  }
  return found;
}

/** Give an existing object `text`, starting at `origin`: its own when null. */
export function setPieceText(
  m: WrappedPdfiumModule,
  objPtr: number,
  text: string,
  origin: Point | null,
): boolean {
  const matrix = readMatrix(m, objPtr);
  if (!matrix || !setText(m, objPtr, text)) return false;
  if (origin) {
    matrix[4] = origin.x;
    matrix[5] = origin.y;
  }
  writeMatrix(m, objPtr, matrix);
  return true;
}

/** Restore an object `setPieceText` changed. */
export function restoreText(
  m: WrappedPdfiumModule,
  objPtr: number,
  text: string,
  matrix: Float32Array,
): void {
  setText(m, objPtr, text);
  writeMatrix(m, objPtr, matrix);
}

export function readMatrix(
  m: WrappedPdfiumModule,
  objPtr: number,
): Float32Array | null {
  const buf = scratchPtr(m, SCRATCH.splitMatrix, 6 * 4);
  if (!m.FPDFPageObj_GetMatrix(objPtr, buf)) return null;
  return Float32Array.from({ length: 6 }, (_, i) =>
    m.pdfium.getValue(buf + i * 4, "float"),
  );
}

function writeMatrix(
  m: WrappedPdfiumModule,
  objPtr: number,
  matrix: Float32Array,
): void {
  const buf = scratchPtr(m, SCRATCH.splitMatrix, 6 * 4);
  matrix.forEach((value, i) => m.pdfium.setValue(buf + i * 4, value, "float"));
  m.FPDFPageObj_SetMatrix(objPtr, buf);
}

function setText(m: WrappedPdfiumModule, objPtr: number, text: string) {
  const buf = writeUtf16(m, text);
  try {
    return m.FPDFText_SetText(objPtr, buf);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function pageObjectIndex(
  m: WrappedPdfiumModule,
  page: Page,
  ptr: number,
): number {
  const count = m.FPDFPage_CountObjects(page.pagePtr);
  for (let i = 0; i < count; i++) {
    if (m.FPDFPage_GetObject(page.pagePtr, i) === ptr) return i;
  }
  throw new Error("The text is not on the page");
}
