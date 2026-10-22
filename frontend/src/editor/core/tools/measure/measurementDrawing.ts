import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentForEditing,
  readEffectivePageBox,
  saveRawDocument,
  writeUtf16,
  type PageBox,
} from "@app/services/pdfiumService";
import type { Measurement, PagePoint } from "@app/utils/measurementTypes";
import { polygonCentroid } from "@app/utils/measurementUtils";

export interface MeasurementToSave {
  measurement: Measurement;
  /** The label as shown in the viewer, e.g. "Kitchen: 12.40 m²". */
  text: string;
  color: string;
  strokeWidth: number;
}

/**
 * The PDF is encrypted. Content added here would be written into a file whose
 * permissions and encryption this tool does not manage, so it is refused.
 */
export class EncryptedPdfError extends Error {
  constructor() {
    super("Cannot add measurements to an encrypted PDF");
    this.name = "EncryptedPdfError";
  }
}

const LABEL_FONT = "Helvetica";
const LABEL_FONT_SIZE = 9;
const LABEL_PADDING = 2.5;
const LABEL_BORDER_WIDTH = 0.75;
const AREA_FILL_ALPHA = Math.round(0.14 * 255);
const OPAQUE = 255;
const WHITE = 255;
// FPDF_FILLMODE_*, FPDF_LINECAP_ROUND and FPDF_LINEJOIN_ROUND in fpdf_edit.h.
const FILL_NONE = 0;
const FILL_ALTERNATE = 1;
const ROUND = 1;
/** FPDF_GetSecurityHandlerRevision's answer for an unencrypted document. */
const NOT_ENCRYPTED = -1;

interface PdfPoint {
  x: number;
  y: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Page space (y down from the top of the crop box, as pdfium reports pages)
 * to PDF user space (y up from the origin).
 */
function toUserSpace(box: PageBox, point: PagePoint): PdfPoint {
  return { x: box.left + point.x, y: box.top - point.y };
}

function labelAnchor(kind: Measurement["kind"], points: PdfPoint[]): PdfPoint {
  if (kind === "area") return polygonCentroid(points);
  let best = { a: points[0], b: points[1], length: -1 };
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    if (length > best.length) best = { a: points[i - 1], b: points[i], length };
  }
  const dx = best.b.x - best.a.x;
  const dy = best.b.y - best.a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal pointing up the page, so the label sits above the line.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const offset = LABEL_FONT_SIZE;
  return {
    x: (best.a.x + best.b.x) / 2 + nx * offset,
    y: (best.a.y + best.b.y) / 2 + ny * offset,
  };
}

function objectBounds(m: WrappedPdfiumModule, objPtr: number): PageBox | null {
  const buf = m.pdfium.wasmExports.malloc(4 * 4);
  try {
    if (!m.FPDFPageObj_GetBounds(objPtr, buf, buf + 4, buf + 8, buf + 12)) {
      return null;
    }
    return {
      left: m.pdfium.getValue(buf, "float"),
      bottom: m.pdfium.getValue(buf + 4, "float"),
      right: m.pdfium.getValue(buf + 8, "float"),
      top: m.pdfium.getValue(buf + 12, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function drawShape(
  m: WrappedPdfiumModule,
  pagePtr: number,
  item: MeasurementToSave,
  points: PdfPoint[],
) {
  const [r, g, b] = hexToRgb(item.color);
  const path = m.FPDFPageObj_CreateNewPath(points[0].x, points[0].y);
  if (!path) return;
  for (const point of points.slice(1))
    m.FPDFPath_LineTo(path, point.x, point.y);
  m.FPDFPageObj_SetStrokeColor(path, r, g, b, OPAQUE);
  m.FPDFPageObj_SetStrokeWidth(path, item.strokeWidth);
  m.FPDFPageObj_SetLineCap(path, ROUND);
  m.FPDFPageObj_SetLineJoin(path, ROUND);
  if (item.measurement.kind === "area") {
    m.FPDFPath_Close(path);
    m.FPDFPageObj_SetFillColor(path, r, g, b, AREA_FILL_ALPHA);
    m.FPDFPath_SetDrawMode(path, FILL_ALTERNATE, true);
  } else {
    m.FPDFPath_SetDrawMode(path, FILL_NONE, true);
  }
  m.FPDFPage_InsertObject(pagePtr, path);
}

/** A boxed label centred on `anchor`; the box goes in first so it sits behind. */
function drawLabel(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  item: MeasurementToSave,
  anchor: PdfPoint,
) {
  const text = m.FPDFPageObj_NewTextObj(docPtr, LABEL_FONT, LABEL_FONT_SIZE);
  if (!text) return;
  const textPtr = writeUtf16(m, item.text);
  try {
    m.FPDFText_SetText(text, textPtr);
  } finally {
    m.pdfium.wasmExports.free(textPtr);
  }
  const bounds = objectBounds(m, text);
  if (!bounds || bounds.right <= bounds.left) {
    m.FPDFPageObj_Destroy(text);
    return;
  }

  const [r, g, b] = hexToRgb(item.color);
  const width = bounds.right - bounds.left;
  const boxHeight = LABEL_FONT_SIZE + LABEL_PADDING * 2;
  const box = m.FPDFPageObj_CreateNewRect(
    anchor.x - width / 2 - LABEL_PADDING,
    anchor.y - boxHeight / 2,
    width + LABEL_PADDING * 2,
    boxHeight,
  );
  if (box) {
    m.FPDFPageObj_SetFillColor(box, WHITE, WHITE, WHITE, OPAQUE);
    m.FPDFPageObj_SetStrokeColor(box, r, g, b, OPAQUE);
    m.FPDFPageObj_SetStrokeWidth(box, LABEL_BORDER_WIDTH);
    m.FPDFPath_SetDrawMode(box, FILL_ALTERNATE, true);
    m.FPDFPage_InsertObject(pagePtr, box);
  }

  m.FPDFPageObj_SetFillColor(text, r, g, b, OPAQUE);
  m.FPDFPageObj_Transform(
    text,
    1,
    0,
    0,
    1,
    anchor.x - (bounds.left + bounds.right) / 2,
    anchor.y - (bounds.bottom + bounds.top) / 2,
  );
  m.FPDFPage_InsertObject(pagePtr, text);
}

/**
 * Draw each measurement into its page as path and text objects through
 * pdfium, the same as the rest of the drawing. Deliberately not annotations:
 * viewers list annotations as comments, credited to whoever is signed in.
 * Each touched page's content stream is regenerated from pdfium's object
 * model. Returns the new bytes; throws EncryptedPdfError for an encrypted PDF.
 */
export async function drawMeasurementsIntoPdf(
  pdfBytes: ArrayBuffer,
  items: MeasurementToSave[],
): Promise<Uint8Array> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentForEditing(pdfBytes);
  try {
    if (m.FPDF_GetSecurityHandlerRevision(docPtr) !== NOT_ENCRYPTED) {
      throw new EncryptedPdfError();
    }

    const byPage = new Map<number, MeasurementToSave[]>();
    for (const item of items) {
      const pageIndex = item.measurement.points[0]?.pageIndex;
      if (pageIndex === undefined) continue;
      byPage.set(pageIndex, [...(byPage.get(pageIndex) ?? []), item]);
    }

    const pageCount = m.FPDF_GetPageCount(docPtr);
    for (const [pageIndex, pageItems] of byPage) {
      if (pageIndex < 0 || pageIndex >= pageCount) continue;
      const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
      if (!pagePtr) continue;
      try {
        const box = readEffectivePageBox(m, pagePtr);
        for (const item of pageItems) {
          const points = item.measurement.points.map((p) =>
            toUserSpace(box, p),
          );
          drawShape(m, pagePtr, item, points);
          drawLabel(
            m,
            docPtr,
            pagePtr,
            item,
            labelAnchor(item.measurement.kind, points),
          );
        }
        if (!m.FPDFPage_GenerateContent(pagePtr)) {
          throw new Error(
            `Could not write measurements to page ${pageIndex + 1}`,
          );
        }
      } finally {
        m.FPDF_ClosePage(pagePtr);
      }
    }

    return new Uint8Array(await saveRawDocument(docPtr));
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}
