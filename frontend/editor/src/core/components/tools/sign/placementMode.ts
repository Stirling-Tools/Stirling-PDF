interface PausePlacementParams {
  /** Whether placement mode was active on the previous render. */
  wasInPlacementMode: boolean;
  /** Whether placement mode is active now. */
  isInPlacementMode: boolean;
  /** User opted into dropping several stamps in a row. */
  placeMultiple: boolean;
  /** True once placed signatures have been flattened/applied to the document. */
  signaturesApplied: boolean;
  /** Whether a signature is configured and placement is allowed. */
  placementEnabled: boolean;
  /** Whether placement is already manually paused. */
  alreadyPaused: boolean;
}

/**
 * Whether placement should be paused after the viewer auto-exits placement mode.
 *
 * The SignatureAPIBridge drops out of placement mode after a single stamp is
 * placed (unless "place multiple" is on). Without pausing, SignSettings' own
 * auto-activate effect would immediately re-enter placement mode, so single
 * placement would never stick and the "place multiple" checkbox would appear to
 * do nothing. We only react to the placement-mode exit (the bridge already
 * limits auto-exit to stamp placements, never mid-signature ink strokes).
 */
export function shouldPausePlacementAfterExit(
  params: PausePlacementParams,
): boolean {
  const justExitedPlacement =
    params.wasInPlacementMode && !params.isInPlacementMode;

  return (
    justExitedPlacement &&
    !params.placeMultiple &&
    !params.signaturesApplied &&
    params.placementEnabled &&
    !params.alreadyPaused
  );
}
