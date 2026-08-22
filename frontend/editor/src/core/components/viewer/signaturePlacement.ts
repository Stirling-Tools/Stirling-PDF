import { PdfAnnotationSubtype } from "@embedpdf/models";

interface AutoExitCandidate {
  type?: unknown;
  object?: { type?: unknown };
}

export interface AutoExitPlacementParams {
  /** The annotation carried by the `create` event. */
  annotation: AutoExitCandidate | null | undefined;
  /** User opted into dropping several stamps in a row. */
  placeMultiple: boolean;
  /** Only the stamp/sign tools opt in; Annotate shares the "stamp" tool id. */
  autoExitEnabled: boolean;
  /** True when the user placed the stamp with the pointer, not a paste/undo. */
  userPlaced: boolean;
}

/**
 * Whether placement mode should auto-exit after a `create` annotation event.
 *
 * Only stamp annotations placed by the user while a stamp/sign tool is mounted
 * trigger auto-exit. Ink strokes also raise `create` events, but a multi-stroke
 * signature would break if we deactivated the tool after the first stroke.
 * Programmatic creates (Ctrl+V paste, undo/redo restore) must never disarm the
 * tool the user has armed.
 */
export function shouldAutoExitPlacement(
  params: AutoExitPlacementParams,
): boolean {
  if (!params.autoExitEnabled || !params.userPlaced || params.placeMultiple) {
    return false;
  }
  const type =
    params.annotation?.type ?? params.annotation?.object?.type ?? null;
  return type === PdfAnnotationSubtype.STAMP;
}
