import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";

/**
 * Whether an edit to this annotation must make the Annotate panel's save action
 * appear.
 *
 * Redaction marks are excluded: the redaction flow applies them and owns its own
 * save, so surfacing the panel would promise a save that flow never makes.
 *
 * Stamps are not excluded, because provenance read off the annotation cannot
 * tell a signature from an imported image stamp (any PDF can carry any author
 * string), and guessing wrong here hides the save affordance for a real unsaved
 * edit. The Sign tool opens the Annotate panel itself, so signatures are
 * unaffected either way.
 */
export function surfacesAnnotationSaveUi(
  annotation?: PdfAnnotationObject,
): boolean {
  if (!annotation) return false;
  return annotation.type !== PdfAnnotationSubtype.REDACT;
}
