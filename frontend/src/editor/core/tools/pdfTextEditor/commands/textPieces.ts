/**
 * Redrawing part of a text object's text as an object of its own, for giving
 * that part a tag of its own. PDFium shares one set of marks between every
 * object a marked-content sequence draws, so changing one object's marks
 * changes them all; a fresh object has marks of its own.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { writeUtf16 } from "@editor/services/pdfiumService";
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
 * Where each character starting at the wanted code units of each object's
 * text is drawn, in page space. An object is left out when the text page's
 * characters for it do not tile `lengths` code units, so none of its
 * positions can be trusted.
 */
export function charOrigins(
  m: WrappedPdfiumModule,
  pagePtr: number,
  wanted: ReadonlyMap<number, ReadonlySet<number>>,
  lengths: ReadonlyMap<number, number>,
): Map<number, Map<number, Point>> {
  const found = new Map<number, Map<number, Point>>();
  const units = new Map<number, number>();
  const textPage = m.FPDFText_LoadPage(pagePtr);
  if (!textPage) return found;
  try {
    const xPtr = scratchPtr(m, SCRATCH.splitOriginX, 8);
    const yPtr = scratchPtr(m, SCRATCH.splitOriginY, 8);
    const count = m.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const objPtr = m.FPDFText_GetTextObject(textPage, i);
      const offsets = wanted.get(objPtr);
      if (!offsets || m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      const at = units.get(objPtr) ?? 0;
      if (
        offsets.has(at) &&
        m.FPDFText_GetCharOrigin(textPage, i, xPtr, yPtr)
      ) {
        const origins = found.get(objPtr) ?? new Map<number, Point>();
        origins.set(at, {
          x: m.pdfium.getValue(xPtr, "double"),
          y: m.pdfium.getValue(yPtr, "double"),
        });
        found.set(objPtr, origins);
      }
      units.set(
        objPtr,
        at + (m.FPDFText_GetUnicode(textPage, i) > 0xffff ? 2 : 1),
      );
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
  for (const objPtr of [...found.keys()]) {
    if (units.get(objPtr) !== lengths.get(objPtr)) found.delete(objPtr);
  }
  return found;
}

/**
 * Draw `text` as `source` draws its own, starting at `origin`, as a new
 * object last on the page carrying `tags`. Re-encoded through the font, so
 * any kerning or character spacing the source applied is lost. Returns 0
 * when PDFium cannot create it.
 */
export function addTextPiece(
  m: WrappedPdfiumModule,
  docPtr: number,
  page: Page,
  source: TextSource,
  text: string,
  origin: Point,
  tags: readonly TagMark[],
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
  m.FPDFPage_InsertObject(page.pagePtr, ptr);
  return ptr;
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
