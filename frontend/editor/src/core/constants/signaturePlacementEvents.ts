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
