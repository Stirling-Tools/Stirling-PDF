import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import type { ViewerZoomSetting } from "@editor/services/preferencesService";

/** Typed zoom is held to the range the zoom buttons step through. */
export const MIN_ZOOM_PERCENT = 20;
export const MAX_ZOOM_PERCENT = 500;

/**
 * The zoom that resetting returns to. "auto" picks fit-to-width or a fixed
 * zoom per document on open; afterwards, fitting the width is its reset.
 */
export function defaultZoomLevel(setting: ViewerZoomSetting): ZoomLevel {
  switch (setting) {
    case "auto":
    case "fitWidth":
      return ZoomMode.FitWidth;
    case "fitPage":
      return ZoomMode.FitPage;
    default:
      return Number(setting) / 100;
  }
}
