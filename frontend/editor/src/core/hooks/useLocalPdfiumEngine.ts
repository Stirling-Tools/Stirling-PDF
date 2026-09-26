/**
 * Viewer engine lifecycle. `usePdfiumEngine` from `@embedpdf/engines/react` does
 * not forward a precompiled module option, so this twin exists to hand the worker
 * the module `wasmPrecompiler` already compiled instead of fetching and
 * recompiling pdfium.wasm; the patched engine falls back to the URL when the
 * module cannot be cloned across.
 */
import { useEffect, useRef, useState } from "react";
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

export function useLocalPdfiumEngine({
  wasmUrl,
  logger,
  encoderPoolSize,
  fontFallback,
}: LocalPdfiumEngineOptions) {
  const [engine, setEngine] = useState<PdfEngine<Blob> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const engineRef = useRef<PdfEngine<Blob> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        startEagerWasmCompilation();
        const precompiled = await Promise.race([
          pdfiumWasmModulePromise,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), PRECOMPILED_WAIT_MS),
          ),
        ]);
        const options: CreatePdfiumEngineOptions & {
          wasmModule?: WebAssembly.Module;
        } = { logger, encoderPoolSize, fontFallback };
        if (precompiled?.module) {
          options.wasmModule = precompiled.module;
        }
        const pdfEngine = createPdfiumEngine(wasmUrl, options);
        if (cancelled) {
          pdfEngine
            .closeAllDocuments?.()
            ?.wait(() => pdfEngine.destroy?.(), ignore);
          return;
        }
        engineRef.current = pdfEngine;
        setEngine(pdfEngine);
        setIsLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const current = engineRef.current;
      engineRef.current = null;
      current?.closeAllDocuments?.()?.wait(() => current?.destroy?.(), ignore);
    };
  }, [wasmUrl, logger, encoderPoolSize, fontFallback]);

  return { engine, isLoading, error };
}
