// Seam for rendering PDF pages in the OS engine. Non-desktop builds get this
// no-op via @app alias order and keep the in-webview engine.

/** Thumbnail raster width: the sidebar shows ~120 CSS px, so 240 covers 2x. */
export const NATIVE_THUMBNAIL_WIDTH = 240;

// False on web: page thumbnails come from the engine worker or the local parse.
export const canRenderNativeThumbnails = false;

/** One page as the OS engine reports it: crop size in points, rotation in degrees. */
export interface NativePageInfo {
  width: number;
  height: number;
  rotation: number;
}

/** Page count plus the first pages' geometry, enough to lay pages out. */
export interface NativeDocumentInfo {
  pageCount: number;
  pages: NativePageInfo[];
}

/**
 * What the OS engine knows about the document before any parse: page count and
 * the first pages' crop sizes and rotations. Null when the platform cannot
 * answer, and the caller waits for the engine instead.
 */
export async function renderNativeDocumentInfo(
  _path: string,
): Promise<NativeDocumentInfo | null> {
  return null;
}

/** One viewer tile: page-space points, crop-box origin at (0, 0). */
export interface NativePdfRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixels per point (viewer zoom x device pixel ratio). */
  scale: number;
}

/**
 * Page `page` (1-based) of the PDF at `path` as a JPEG Blob sized close to
 * `maxWidth`, or null when the platform cannot render it.
 */
export async function renderNativePdfPageBlob(
  _path: string,
  _page: number,
  _maxWidth: number,
): Promise<Blob | null> {
  return null;
}

/**
 * JPEG data URL for `page` (1-based) of the PDF at `path`, or null when the
 * platform cannot render it (the caller then falls back to the engine).
 */
export async function renderNativeThumbnail(
  _path: string,
  _page: number,
  _maxWidth: number,
): Promise<string | null> {
  return null;
}

/**
 * JPEG data URL for one tile of the PDF at `path`, or null when the platform
 * cannot render it (the caller then falls back to the engine).
 */
export async function renderNativePdfRect(
  _path: string,
  _rect: NativePdfRect,
): Promise<string | null> {
  return null;
}

/**
 * The same tile as a Blob, for callers that hand it straight to the canvas and
 * would only pay base64 encoding on the way back.
 */
export async function renderNativePdfRectBlob(
  _path: string,
  _rect: NativePdfRect,
): Promise<Blob | null> {
  return null;
}
