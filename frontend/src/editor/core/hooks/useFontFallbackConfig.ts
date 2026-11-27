import { useMemo } from "react";
import { getLocalFontFallbackConfig } from "@editor/services/pdfiumFontFallback";

/**
 * PDFium fallback-font configuration. Stable for the viewer's lifetime: a new
 * object recreates the PDFium engine.
 */
export function useFontFallbackConfig() {
  return useMemo(() => getLocalFontFallbackConfig(), []);
}
