import type { PdfEngine } from "@embedpdf/models";

/**
 * Seam for rasterizing viewer tiles in the OS engine. Non-desktop builds get
 * this identity via @app alias order and keep the engine worker's tiles.
 */
export function wrapEngineForNativeTiles<T extends PdfEngine<Blob>>(
  engine: T,
  _getFilePath: () => string | null,
): T {
  return engine;
}
