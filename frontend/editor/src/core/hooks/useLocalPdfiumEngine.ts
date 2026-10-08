import { useEffect, useRef, useState } from "react";
import { type Logger, type PdfEngine } from "@embedpdf/models";
import type { FontFallbackConfig } from "@embedpdf/engines/pdfium-worker-engine";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

interface LocalPdfiumEngineOptions {
  wasmUrl: string;
  logger?: Logger;
  encoderPoolSize?: number;
  fontFallback?: FontFallbackConfig | null;
}

/**
 * Destroy an engine once its documents are closed. `wait` runs only one of its
 * two callbacks, so destroy has to be registered on both — a failed close would
 * otherwise leave the worker running for the lifetime of the app.
 */
function destroyEngine(engine: PdfEngine<Blob> | null): void {
  if (!engine) return;
  const destroy = () => engine.destroy?.();
  engine.closeAllDocuments?.()?.wait(destroy, destroy);
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
    // Reset per attempt so the render tree never exposes the engine this run is
    // about to destroy, nor a stale error left over from an earlier failure.
    setEngine(null);
    setError(null);
    setIsLoading(true);

    (async () => {
      try {
        startEagerWasmCompilation();
        const { createPdfiumEngine } =
          await import("@embedpdf/engines/pdfium-worker-engine");
        // The worker engine resolves pdfium from wasmUrl itself, so the
        // precompiled module (a main-thread optimization) must not gate
        // creation — awaiting it here only delayed the engine.
        const pdfEngine = createPdfiumEngine(wasmUrl, {
          logger,
          encoderPoolSize,
          fontFallback,
        });
        if (cancelled) {
          destroyEngine(pdfEngine);
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
      destroyEngine(current);
    };
  }, [wasmUrl, logger, encoderPoolSize, fontFallback]);

  return { engine, isLoading, error };
}
