/** Text-carrying annotation that the editor renders but cannot edit. */

/** PDFium FPDF_ANNOTATION_SUBTYPE values the editor cares about. */
export const ANNOT_SUBTYPE_FREETEXT = 3;
export const ANNOT_SUBTYPE_STAMP = 13;
export const ANNOT_SUBTYPE_WIDGET = 20;

export type AnnotationKind = "freetext" | "widget" | "stamp";

export interface AnnotationBox {
  id: string;
  kind: AnnotationKind;
  /** Raw PDF page-space rect (y-up), pre-DisplayTransform. */
  rect: { x: number; y: number; width: number; height: number };
}

export function annotationKindFor(subtype: number): AnnotationKind | null {
  if (subtype === ANNOT_SUBTYPE_FREETEXT) return "freetext";
  if (subtype === ANNOT_SUBTYPE_WIDGET) return "widget";
  if (subtype === ANNOT_SUBTYPE_STAMP) return "stamp";
  return null;
}
