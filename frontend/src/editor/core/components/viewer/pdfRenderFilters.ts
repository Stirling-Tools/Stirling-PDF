import type { PdfRenderMode } from "@editor/services/preferencesService";

/**
 * Tints a page bitmap for the viewer's reading modes. Applied to the rendered
 * page only, never to UI chrome, so selection rings and controls stay legible.
 */
export const PDF_RENDER_FILTERS: Record<PdfRenderMode, string | undefined> = {
  normal: undefined,
  dark: "invert(1) hue-rotate(180deg)",
  sepia: "sepia(0.7) brightness(0.85)",
};
