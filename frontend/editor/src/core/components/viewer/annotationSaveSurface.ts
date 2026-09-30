import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";
import { SIGNATURE_ANNOTATION_AUTHOR } from "@app/constants/app";

/**
 * Whether an edit to this annotation must make the Annotate panel's save action
 * appear.
 *
 * Redaction marks and signatures are applied by their own flows, so surfacing
 * the panel for them would promise a save that those flows do not use. A STAMP
 * is only a signature when SignatureAPIBridge placed it: an image stamp from the
 * Annotate panel, or one already in an uploaded PDF, is saved from the panel
 * like any other annotation.
 */
export function surfacesAnnotationSaveUi(
  annotation?: PdfAnnotationObject,
): boolean {
  if (!annotation) return false;
  if (annotation.type === PdfAnnotationSubtype.REDACT) return false;
  const isSignature =
    annotation.type === PdfAnnotationSubtype.STAMP &&
    annotation.author === SIGNATURE_ANNOTATION_AUTHOR;
  return !isSignature;
}
