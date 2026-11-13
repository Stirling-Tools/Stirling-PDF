import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** A form field's widget annotation, as the save addresses it. */
export interface WidgetAnnotation {
  /** Its object number, which the save gives it a Form element by. */
  annotation: number;
  /** Its index in the page's /Annots: the AnnotationBox.index PDFium reads it at. */
  position: number;
  /** The object number of the field whose /TU names it: its /Parent when it is a kid, else itself. */
  field: number;
  /** True when another widget a page shows belongs to its field too, as a radio group's do. */
  fieldShared: boolean;
  /** Its /Rect, in page space (y-up). */
  rect: PageRect;
  /** Its field's /FT, inherited through /Parent; null when none says. */
  fieldType: string | null;
  /** Its field's /TU as the file has it; null when it has none. */
  tooltip: string | null;
  /** The key of the element the file gives it to; null when none. */
  holder: string | null;
}
