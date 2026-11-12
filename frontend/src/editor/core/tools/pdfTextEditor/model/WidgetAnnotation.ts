import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** A form field's widget annotation, as the save addresses it. */
export interface WidgetAnnotation {
  /** Its object number, which the save gives it a Form element by. */
  annotation: number;
  /** Its /Rect, in page space (y-up). */
  rect: PageRect;
  /** Its field's /FT, inherited through /Parent; null when none says. */
  fieldType: string | null;
  /** Its field's /TU as the file has it; null when it has none. */
  tooltip: string | null;
  /** The key of the element the file gives it to; null when none. */
  holder: string | null;
}
