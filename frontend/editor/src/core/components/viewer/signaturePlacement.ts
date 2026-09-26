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
  /**
   * True when the `create` event carried a pointer context. Paste and the undo
   * of a delete carry none; a redo does carry one, so callers must additionally
   * pass each annotation through {@link createPlacementDecisionGate}.
   */
  userPlaced: boolean;
}

/**
 * Gate that yields true only for the first `create` event seen for an
 * annotation id.
 *
 * One pointer placement raises `create` twice: the plugin's history command
 * emits it with `committed: false`, then the engine round-trip emits it again
 * with `committed: true`. Both carry the pointer context, and history redo
 * re-runs the same command, so neither `ctx` nor `committed` separates a fresh
 * placement from a repeat. The annotation id does: every repeat reuses it, and
 * only a new placement mints a new one.
 */
export function createPlacementDecisionGate(): (
  annotationId: string,
) => boolean {
  const decided = new Set<string>();
  return (annotationId: string) => {
    if (decided.has(annotationId)) {
      return false;
    }
    decided.add(annotationId);
    return true;
  };
}

/**
 * Whether placement mode should auto-exit after a `create` annotation event.
 *
 * Only stamp annotations placed by the user while a stamp/sign tool is mounted
 * trigger auto-exit. Ink strokes also raise `create` events, but a multi-stroke
 * signature would break if we deactivated the tool after the first stroke.
 * Programmatic creates (Ctrl+V paste, an undone delete being restored) must
 * never disarm the tool the user has armed.
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

/**
 * Whether the stamp tool must be re-armed after a user placement.
 *
 * The shared "stamp" tool carries `deactivateToolAfterCreate`, so the plugin
 * disarms it after every placement. Without an explicit re-arm the panel keeps
 * offering "Pause placement" while clicking the page does nothing. The same
 * exclusions as auto-exit apply: only user-placed stamps count.
 */
export function shouldRearmPlacement(params: AutoExitPlacementParams): boolean {
  if (!params.autoExitEnabled || !params.userPlaced || !params.placeMultiple) {
    return false;
  }
  const type =
    params.annotation?.type ?? params.annotation?.object?.type ?? null;
  return type === PdfAnnotationSubtype.STAMP;
}
