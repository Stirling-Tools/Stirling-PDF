/**
 * Viewer engine lifecycle. `usePdfiumEngine` from `@embedpdf/engines/react` does
 * not forward a precompiled module option, so this twin exists to hand the worker
 * the module `wasmPrecompiler` already compiled instead of fetching and
 * recompiling pdfium.wasm; the patched engine falls back to the URL when the
 * module cannot be cloned across.
 *
 * The engine is a module-level singleton so `warmUpViewerEngine` can start it
 * before a document lands; the last viewer to unmount destroys it.
 */
import { useEffect, useState } from "react";
import { ignore, type Logger, type PdfEngine } from "@embedpdf/models";
import {
  createPdfiumEngine,
  type CreatePdfiumEngineOptions,
  type FontFallbackConfig,
} from "@embedpdf/engines/pdfium-worker-engine";
import {
  pdfiumWasmModulePromise,
  startEagerWasmCompilation,
} from "@app/services/wasmPrecompiler";

/** Past this wait the worker fetches the wasm URL itself; a pending compile
 *  (offline deployment, test harness) must not block engine creation. */
const PRECOMPILED_WAIT_MS = 3000;

interface LocalPdfiumEngineOptions {
  wasmUrl: string;
  logger?: Logger;
  encoderPoolSize?: number;
  fontFallback?: FontFallbackConfig | null;
}

let sharedEngine: PdfEngine<Blob> | null = null;
let sharedEnginePromise: Promise<PdfEngine<Blob>> | null = null;
let sharedEngineRefs = 0;

async function createViewerEngine(
  options: LocalPdfiumEngineOptions,
): Promise<PdfEngine<Blob>> {
  const { wasmUrl, logger, encoderPoolSize, fontFallback } = options;
  startEagerWasmCompilation();
  const precompiled = await Promise.race([
    pdfiumWasmModulePromise,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PRECOMPILED_WAIT_MS),
    ),
  ]);
  const engineOptions: CreatePdfiumEngineOptions & {
    wasmModule?: WebAssembly.Module;
  } = { logger, encoderPoolSize, fontFallback };
  if (precompiled?.module) {
    engineOptions.wasmModule = precompiled.module;
  }
  const engine = createPdfiumEngine(wasmUrl, engineOptions);
  sharedEngine = engine;
  return engine;
}

function destroySharedEngine(): void {
  const dying = sharedEngine;
  sharedEngine = null;
  sharedEnginePromise = null;
  dying?.closeAllDocuments?.()?.wait(() => dying?.destroy?.(), ignore);
}

/**
 * Start (or join) the shared viewer engine. The warm-up and the viewer must
 * pass the same options; the first caller's win, which the app keeps constant.
 */
export function warmUpViewerEngine(
  options: LocalPdfiumEngineOptions,
): Promise<PdfEngine<Blob>> {
  sharedEnginePromise ??= createViewerEngine(options).catch(
    (error: unknown) => {
      // A failed creation must stay retryable: the next caller tries again.
      sharedEnginePromise = null;
      throw error;
    },
  );
  return sharedEnginePromise;
}

export function useLocalPdfiumEngine(options: LocalPdfiumEngineOptions) {
  const { wasmUrl, logger, encoderPoolSize, fontFallback } = options;
  const [engine, setEngine] = useState<PdfEngine<Blob> | null>(sharedEngine);
  const [isLoading, setIsLoading] = useState(sharedEngine === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    sharedEngineRefs += 1;
    void warmUpViewerEngine({
      wasmUrl,
      logger,
      encoderPoolSize,
      fontFallback,
    }).then(
      (pdfEngine) => {
        if (cancelled) return;
        setEngine(pdfEngine);
        setIsLoading(false);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
      sharedEngineRefs -= 1;
      if (sharedEngineRefs <= 0) destroySharedEngine();
    };
    // The options are module constants in practice; a change recreates the
    // engine through the refcount teardown above.
  }, [wasmUrl, logger, encoderPoolSize, fontFallback]);

  return { engine, isLoading, error };
}
