import { PdfAnnotationSubtype } from "@embedpdf/models";

interface AutoExitCandidate {
  type?: unknown;
  object?: { type?: unknown };
}

/**
 * Whether placement mode should auto-exit after a `create` annotation event.
 *
 * Only stamp annotations trigger auto-exit. Ink strokes also raise `create`
 * events, but a multi-stroke signature would break if we deactivated the tool
 * after the first stroke. When `placeMultiple` is true the user has opted in
 * to dropping several stamps in a row, so we never auto-exit.
 */
export function shouldAutoExitPlacement(
  annotation: AutoExitCandidate | null | undefined,
  placeMultiple: boolean,
): boolean {
  if (placeMultiple) return false;
  const type = annotation?.type ?? annotation?.object?.type ?? null;
  return type === PdfAnnotationSubtype.STAMP;
}
