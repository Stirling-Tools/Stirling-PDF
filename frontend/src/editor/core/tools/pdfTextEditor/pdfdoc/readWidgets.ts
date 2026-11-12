import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";
import {
  annotationsByPage,
  holderKey,
  numbers,
} from "@editor/tools/pdfTextEditor/pdfdoc/readLinks";
import type { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

/** /F bits for an annotation no reader shows (ISO 32000-1 12.5.3): Hidden, NoView. */
const UNSHOWN = 2 | 32;
const MAX_FIELD_DEPTH = 32;

/**
 * The widget annotations of each page, by page index, that PDF/UA-1 7.18.4
 * wants in a Form element: those the page's /Annots references and a reader
 * shows. `treeRoot` resolves the element each is given to; null for a file
 * with no structure tree. Pages with none are left out.
 */
export function readWidgets(
  pdf: RawPdf,
  treeRoot: number | null,
): Map<number, WidgetAnnotation[]> {
  return annotationsByPage(pdf, (num, position) =>
    readWidget(pdf, num, position, treeRoot),
  );
}

/**
 * The object number of the field a widget is a kid of; null when the widget
 * is its own field. One with no /T but a /Parent is a kid, as PDFBox reads it.
 */
export function separateField(pdf: RawPdf, widget: string): number | null {
  if (pdf.valueSpan(widget, "T") !== null) return null;
  return pdf.dictRef(widget, "Parent");
}

function readWidget(
  pdf: RawPdf,
  num: number,
  position: number,
  treeRoot: number | null,
): WidgetAnnotation | null {
  const body = pdf.objectBody(num);
  if (!body || pdf.dictName(body, "Subtype") !== "Widget") return null;
  if (((pdf.dictInt(body, "F") ?? 0) & UNSHOWN) !== 0) return null;
  const rect = numbers(pdf.resolve(body, "Rect"));
  if (rect?.length !== 4) return null;
  const [x1, y1, x2, y2] = rect;
  const area = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
  if (area.width <= 0 || area.height <= 0) return null;
  const parent = separateField(pdf, body);
  const field = parent === null ? body : pdf.objectBody(parent);
  const tooltip = field ? pdf.resolve(field, "TU") : null;
  return {
    annotation: num,
    position,
    rect: area,
    fieldType: fieldType(pdf, body),
    tooltip: tooltip === null ? null : decodeTextString(tooltip.trim()),
    holder: holderKey(pdf, body, treeRoot),
  };
}

/** /FT, which a field inherits from its ancestors (ISO 32000-1 12.7.3.1). */
function fieldType(pdf: RawPdf, widget: string): string | null {
  let body: string | null = widget;
  const seen = new Set<number>();
  for (let depth = 0; body && depth < MAX_FIELD_DEPTH; depth++) {
    const type = pdf.dictName(body, "FT");
    if (type !== null) return type;
    const parent = pdf.dictRef(body, "Parent");
    if (parent === null || seen.has(parent)) return null;
    seen.add(parent);
    body = pdf.objectBody(parent);
  }
  return null;
}
