import { useEffect, useRef, useState } from "react";
import { ignore, type Logger, type PdfEngine } from "@embedpdf/models";
import type {
  CreatePdfiumEngineOptions,
  FontFallbackConfig,
} from "@embedpdf/engines/pdfium-worker-engine";
import {
  pdfiumWasmModulePromise,
  startEagerWasmCompilation,
} from "@app/services/wasmPrecompiler";

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
        const [precompiled, { createPdfiumEngine }] = await Promise.all([
          pdfiumWasmModulePromise,
          import("@embedpdf/engines/pdfium-worker-engine"),
        ]);
        const options: CreatePdfiumEngineOptions & {
          wasmModule?: WebAssembly.Module;
        } = { logger, encoderPoolSize, fontFallback };
        if (precompiled) {
          options.wasmModule = precompiled;
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
