import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";

/**
 * Whether an edit to this annotation must make the Annotate panel's save action
 * appear.
 *
 * A redaction mark is applied by the redaction flow, which owns its own save, so
 * surfacing the panel for one would promise a save that flow never makes.
 *
 * Stamps are deliberately *not* excluded. The only thing that distinguishes a
 * signature stamp from an image stamp is provenance, and provenance read off the
 * annotation is not trustworthy: an imported PDF can carry any author string, and
 * the signature image store also holds ordinary image stamps. Guessing wrong here
 * hides the save affordance for a real unsaved edit, so every stamp surfaces it —
 * the safe direction. The Sign tool opens the Annotate panel itself, so the
 * signature flow is unaffected.
 */
export function surfacesAnnotationSaveUi(
  annotation?: PdfAnnotationObject,
): boolean {
  if (!annotation) return false;
  return annotation.type !== PdfAnnotationSubtype.REDACT;
}
