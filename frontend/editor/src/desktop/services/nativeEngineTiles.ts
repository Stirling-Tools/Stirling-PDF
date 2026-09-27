import {
  PdfTaskHelper,
  type PdfDocumentObject,
  type PdfEngine,
  type PdfPageObject,
  type PdfRenderPageOptions,
  type PdfTask,
  type Rect,
} from "@embedpdf/models";
import { isTauri } from "@tauri-apps/api/core";
import { renderNativePdfRectBlob } from "@app/services/nativePdfRender";
import type { NativePdfRect } from "@core/services/nativePdfRender";

// Shadow of the core identity; @app alias order gives desktop builds this one.

/**
 * Set `stirling.nativeTiles` to `off` in localStorage to send rendering back to
 * the engine worker without a rebuild, e.g. while checking a rendering bug.
 */
const KILL_SWITCH_KEY = "stirling.nativeTiles";

function nativeTilesEnabled(): boolean {
  try {
    return localStorage.getItem(KILL_SWITCH_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Routes the viewer's tile rasterization through the OS PDF engine: the tiling
 * plugin's geometry (text, annotations, overlays) still comes from the engine,
 * only the pixels change source. Every call falls back to the engine when the
 * file has no disk path, the page is rotated, or the native render returns
 * nothing, so a native miss degrades to today's behaviour instead of failing.
 */
export function wrapEngineForNativeTiles<T extends PdfEngine<Blob>>(
  engine: T,
  getFilePath: () => string | null,
): T {
  if (!isTauri() || !nativeTilesEnabled()) return engine;
  const engineRenderPageRect = engine.renderPageRect.bind(engine);
  return new Proxy(engine, {
    get(target, prop, receiver) {
      if (prop === "renderPageRect") {
        return (
          doc: PdfDocumentObject,
          page: PdfPageObject,
          rect: Rect,
          options?: PdfRenderPageOptions,
        ) =>
          renderTileTask(
            engineRenderPageRect,
            getFilePath(),
            doc,
            page,
            rect,
            options,
          );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

/**
 * Tiles the viewer has already fetched, keyed by document id + path + page +
 * rect + scale. Scrolling back or toggling zoom re-requests identical tiles;
 * the engine's own task cache is bypassed on this path, so without this every
 * revisit paid the render and the IPC again. The engine document id is part of
 * the key, so a reload of changed bytes (new id) never serves stale pixels.
 * Small and bounded; blobs are cheap to retain at tile sizes.
 */
const TILE_CACHE_LIMIT = 128;
const tileCache = new Map<string, Blob>();

function tileCacheKey(
  documentId: string,
  path: string,
  rect: NativePdfRect,
): string {
  return `${documentId}\u0000${path}\u0000${rect.page}\u0000${rect.x},${rect.y},${rect.width},${rect.height}@${rect.scale}`;
}

function rememberTile(key: string, blob: Blob): Blob {
  tileCache.delete(key);
  tileCache.set(key, blob);
  while (tileCache.size > TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
  return blob;
}

function renderTileTask(
  engineRenderPageRect: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ) => PdfTask<Blob>,
  filePath: string | null,
  doc: PdfDocumentObject,
  page: PdfPageObject,
  rect: Rect,
  options?: PdfRenderPageOptions,
): PdfTask<Blob> {
  if (!filePath) {
    return engineRenderPageRect(doc, page, rect, options);
  }

  const task = PdfTaskHelper.create<Blob>();
  const fallback = () =>
    engineRenderPageRect(doc, page, rect, options).wait(
      (result) => task.resolve(result),
      (error) => task.fail(error),
    );

  const { width, height } = rect.size;
  const nativeRect: NativePdfRect = {
    page: page.index + 1,
    x: rect.origin.x,
    // The tiling plugin measures y from the page top; PDF space is bottom-up.
    y: page.size.height - rect.origin.y - height,
    width,
    height,
    scale: (options?.scaleFactor ?? 1) * (options?.dpr ?? 1),
  };
  const cacheKey = tileCacheKey(doc.id, filePath, nativeRect);
  const cached = tileCache.get(cacheKey);
  if (cached) {
    task.resolve(cached);
    return task;
  }
  void renderNativePdfRectBlob(filePath, nativeRect).then(
    (blob) => {
      if (!blob) {
        fallback();
        return;
      }
      if (import.meta.env.DEV) {
        console.info(
          `[nativeTiles] page ${page.index + 1} ${Math.round(width)}x${Math.round(height)} native`,
        );
      }
      task.resolve(rememberTile(cacheKey, blob));
    },
    () => fallback(),
  );
  return task;
}
