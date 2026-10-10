import type { Rectangle } from "@app/utils/cropCoordinates";

/**
 * Window events carrying signature placement between the cert-sign tool and the viewer.
 *
 * The viewer is rendered far from the tool panel, so a shared context would have to be
 * threaded through the whole viewer tree for one optional feature. The project already
 * hands data to a tool this way for the guided tour's crop step.
 */

/** Tool -> viewer: start letting the user drag a signature box on the page. */
export const SIGNATURE_PLACEMENT_START_EVENT = "certSign:startPlacement";

/** Either direction: leave placement mode without having placed anything. */
export const SIGNATURE_PLACEMENT_CANCEL_EVENT = "certSign:cancelPlacement";

/** Viewer -> tool: the user finished dragging a box. */
export const SIGNATURE_PLACEMENT_DONE_EVENT = "certSign:placementDone";

export interface SignaturePlacementResult {
  /** 1-based page the box was drawn on; this becomes the signed page. */
  pageNumber: number;
  /** The box in PDF points, origin bottom-left - what the endpoint takes. */
  area: Rectangle;
}

/** Tool -> viewer: the box the signature will fill, or null when there is none to show. */
export const SIGNATURE_PLACEMENT_SHOW_EVENT = "certSign:showPlacement";

let shownPlacement: SignaturePlacementResult | null = null;

/**
 * Shows `placement` on the viewer until it is replaced, or hidden with null. Kept as well as
 * announced, because the viewer mounts a page's overlay only once that page scrolls into view.
 */
export function showSignaturePlacement(
  placement: SignaturePlacementResult | null,
): void {
  shownPlacement = placement;
  window.dispatchEvent(
    new CustomEvent<SignaturePlacementResult | null>(
      SIGNATURE_PLACEMENT_SHOW_EVENT,
      { detail: placement },
    ),
  );
}

export function currentSignaturePlacement(): SignaturePlacementResult | null {
  return shownPlacement;
}
