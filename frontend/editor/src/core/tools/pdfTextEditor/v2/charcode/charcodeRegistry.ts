import {
  BackendResolver,
  findFontForChar,
  fontIsReusable,
  prewarmBackendCacheForPage,
  styleClassFromName,
} from "@app/tools/pdfTextEditor/v2/charcode/BackendResolver";

/** Re-export so the emit path can do per-char font lookup. */
export {
  findFontForChar,
  fontIsReusable,
  prewarmBackendCacheForPage,
  styleClassFromName,
};
import {
  CharcodeResolver,
  CharcodeStrategy,
  getActiveCharcodeStrategy,
  ResolverContext,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";
import { CmapResolver } from "@app/tools/pdfTextEditor/v2/charcode/CmapResolver";
import { ContentStreamResolver } from "@app/tools/pdfTextEditor/v2/charcode/ContentStreamResolver";

/** Per-emit telemetry. */
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
  // Expose recent events on window for emit-path-aware Playwright tests.
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
    // performance.now is available in browser + Node 16+.
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

// Get the resolver for the currently active strategy. Returns null for
// `helvetica` (the legacy "always fall back" mode).
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

/** Write `charcodes` into `textObj` via FPDFText_SetCharcodes. */
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
  allowContentStreamFallback = false,
): {
  strategy: CharcodeStrategy;
  result: ReturnType<CharcodeResolver["resolve"]>;
} | null {
  const r = activeResolver();
  if (r) {
    const result = r.resolve(font, text, ctx);
    if (result && result.coverage === text.length) {
      return { strategy: r.name, result };
    }
    // Active resolver (e.g. backend with a cold cache) did not fully cover the
    // text.
    if (allowContentStreamFallback && r.name !== "content-stream") {
      const cs = resolvers["content-stream"];
      const csResult = cs?.resolve(font, text, ctx);
      if (csResult && csResult.coverage === text.length) {
        return { strategy: "content-stream", result: csResult };
      }
    }
    return { strategy: r.name, result };
  }
  // No active resolver (helvetica strategy). Still try the client-side
  // content-stream reuse when explicitly allowed.
  if (allowContentStreamFallback) {
    const cs = resolvers["content-stream"];
    const csResult = cs?.resolve(font, text, ctx);
    if (csResult && csResult.coverage === text.length) {
      return { strategy: "content-stream", result: csResult };
    }
  }
  return null;
}
