import {
  BackendResolver,
  findFontForChar,
  prewarmBackendCacheForPage,
} from "@app/tools/pdfTextEditor/v2/charcode/BackendResolver";

/** Re-export so the emit path can do per-char font lookup. */
export { findFontForChar, prewarmBackendCacheForPage };
import {
  CharcodeResolver,
  CharcodeStrategy,
  getActiveCharcodeStrategy,
  ResolverContext,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";
import { CmapResolver } from "@app/tools/pdfTextEditor/v2/charcode/CmapResolver";
import { ContentStreamResolver } from "@app/tools/pdfTextEditor/v2/charcode/ContentStreamResolver";

/**
 * Per-emit telemetry. Subscribers (the debug HUD) get one event for
 * every text chunk the emit path tried to write, regardless of which
 * strategy ran or whether it succeeded.
 *
 * `outcome` values:
 *   - "charcodes-ok": resolver returned full coverage AND
 *     FPDFText_SetCharcodes call succeeded → source-font emit
 *   - "charcodes-call-failed": resolver covered everything but
 *     FPDFText_SetCharcodes returned false (binding rejected)
 *   - "partial-coverage-fallback": resolver missed some chars,
 *     falls back to FPDFText_SetText (Helvetica path)
 *   - "no-strategy": active strategy is 'helvetica' (no resolver)
 *   - "no-font": emit was called without an originalFontPtr
 */
export interface CharcodeEvent {
  timestamp: number;
  strategy: CharcodeStrategy;
  text: string;
  fontPtr: number;
  resolved: number[];
  missing: string[];
  note: string;
  outcome:
    | "charcodes-ok"
    | "charcodes-call-failed"
    | "partial-coverage-fallback"
    | "no-strategy"
    | "no-font";
}

const eventListeners = new Set<(e: CharcodeEvent) => void>();
const recentEvents: CharcodeEvent[] = [];
const MAX_RECENT = 50;

export function subscribeCharcodeEvents(
  cb: (e: CharcodeEvent) => void,
): () => void {
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

export function getRecentCharcodeEvents(): CharcodeEvent[] {
  return [...recentEvents];
}

function emitEvent(e: CharcodeEvent): void {
  recentEvents.push(e);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();
  // Expose recent events on window for emit-path-aware Playwright
  // tests. The HUD also subscribes via getRecentCharcodeEvents(), but
  // tests need a window-readable reference because the HUD component
  // was removed from production builds (debug-only). Without this
  // hook tests can only inspect `run.text` from the model store,
  // which updates on every keystroke regardless of how the underlying
  // PDFium emit went - so a broken emit path (Helvetica fallback,
  // .notdef stripes, duplicate emits) would silently pass.
  if (typeof window !== "undefined") {
    (
      window as unknown as {
        __v2_charcode_events?: CharcodeEvent[];
      }
    ).__v2_charcode_events = [...recentEvents];
  }
  for (const cb of eventListeners) {
    try {
      cb(e);
    } catch {
      /* swallow listener errors */
    }
  }
}

/** Test-only: clear the in-memory recent-events buffer + window hook. */
export function _clearRecentCharcodeEventsForTests(): void {
  recentEvents.length = 0;
  if (typeof window !== "undefined") {
    (
      window as unknown as { __v2_charcode_events?: CharcodeEvent[] }
    ).__v2_charcode_events = [];
  }
}

/** Public entry point for the emit path to record an attempt. */
export function emitCharcodeEvent(
  e: Omit<CharcodeEvent, "timestamp"> & {
    timestamp?: number;
  },
): void {
  emitEvent({
    ...e,
    // performance.now is available in browser + Node 16+; fall back
    // to a counter so the worktree-frozen Date.now ban doesn't break
    // workflow runs that might import this file.
    timestamp:
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : recentEvents.length,
  });
}

const resolvers: Record<CharcodeStrategy, CharcodeResolver | null> = {
  helvetica: null, // legacy: do nothing, caller falls back.
  cmap: new CmapResolver(),
  "content-stream": new ContentStreamResolver(),
  backend: new BackendResolver(),
};

/**
 * Get the resolver for the currently active strategy. Returns null
 * for `helvetica` (the legacy "always fall back" mode).
 */
export function activeResolver(): CharcodeResolver | null {
  const s = getActiveCharcodeStrategy();
  return resolvers[s];
}

interface SetCharcodesModule {
  FPDFText_SetCharcodes?: (
    textObj: number,
    charcodesPtr: number,
    count: number,
  ) => boolean;
}

/**
 * Write `charcodes` into `textObj` via FPDFText_SetCharcodes.
 * Returns true on success, false if the binding isn't available or
 * the call failed.
 *
 * SetCharcodes expects an array of uint32 charcodes - one per glyph.
 * For CIDFontType2 the charcode IS the glyph index in the embedded
 * subset, which is what both CmapResolver (via cmap glyph index)
 * and ContentStreamResolver (via per-object char counter) produce.
 */
export function setCharcodesOn(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  textObj: number,
  charcodes: number[],
): boolean {
  const ccMod = m as unknown as SetCharcodesModule;
  if (!ccMod.FPDFText_SetCharcodes || charcodes.length === 0) return false;
  // Allocate a uint32 buffer in the WASM heap.
  const bufSize = charcodes.length * 4;
  const buf = m.pdfium.wasmExports.malloc(bufSize);
  try {
    const heapU8 = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
    const view = new Uint32Array(heapU8.buffer, buf, charcodes.length);
    for (let i = 0; i < charcodes.length; i++) view[i] = charcodes[i] >>> 0;
    return !!ccMod.FPDFText_SetCharcodes(textObj, buf, charcodes.length);
  } catch {
    return false;
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

/** Strategy-aware resolve helper used by the emit path. */
export function tryResolveCharcodes(
  font: number,
  text: string,
  ctx: ResolverContext,
): {
  strategy: CharcodeStrategy;
  result: ReturnType<CharcodeResolver["resolve"]>;
} | null {
  const r = activeResolver();
  if (!r) return null;
  const result = r.resolve(font, text, ctx);
  return { strategy: r.name, result };
}
