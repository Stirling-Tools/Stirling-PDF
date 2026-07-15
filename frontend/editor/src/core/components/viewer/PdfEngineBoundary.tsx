import React, { useEffect, useState } from "react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { Center, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";

/** Engine instance produced by usePdfiumEngine once initialisation succeeds. */
type PdfiumEngine = NonNullable<ReturnType<typeof usePdfiumEngine>["engine"]>;

/**
 * How long to wait for the PDFium WASM engine to initialise before treating the
 * load as failed. The engine normally initialises in well under a second; if it
 * has not resolved after this window it has almost certainly hung (e.g. the WASM
 * fetch stalled or the worker never reported back), so we surface an error with
 * a retry instead of spinning forever.
 */
const DEFAULT_ENGINE_LOAD_TIMEOUT_MS = 30_000;

interface PdfEngineBoundaryProps {
  /** Absolute URL of the pdfium.wasm binary to load. */
  wasmUrl: string;
  /** Invoked when the user asks to retry after a failed/hung load. */
  onRetry: () => void;
  /** Override the load timeout (mainly for tests). */
  timeoutMs?: number;
  /** Rendered once the engine is ready. */
  children: (engine: PdfiumEngine) => React.ReactNode;
}

/**
 * Loads the PDFium WASM engine and gates its children on success.
 *
 * The underlying `usePdfiumEngine` hook only re-initialises when its `wasmUrl`
 * changes, so retrying is handled by the parent remounting this component via a
 * `key`. Because the boundary owns the hook, a fresh mount runs the load again
 * from scratch.
 *
 * Without this boundary a failed or hung WASM load left the viewer showing an
 * infinite "Loading PDF Engine..." spinner with no error and no way to recover.
 */
export function PdfEngineBoundary({
  wasmUrl,
  onRetry,
  timeoutMs = DEFAULT_ENGINE_LOAD_TIMEOUT_MS,
  children,
}: PdfEngineBoundaryProps) {
  const { t } = useTranslation();
  const { engine, isLoading, error } = usePdfiumEngine({ wasmUrl });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (engine || error) return;
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [engine, error, isLoading, timeoutMs]);

  if (engine) {
    return <>{children(engine)}</>;
  }

  if (error || timedOut) {
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md" style={{ maxWidth: 420, padding: 16 }}>
          <div style={{ fontSize: "32px" }}>⚠️</div>
          <Text fw={600} size="md" style={{ textAlign: "center" }}>
            {t("viewer.engineLoadErrorTitle")}
          </Text>
          <Text c="dimmed" size="sm" style={{ textAlign: "center" }}>
            {t("viewer.engineLoadErrorBody")}
          </Text>
          <Button onClick={onRetry} variant="primary">
            {t("viewer.engineLoadErrorRetry")}
          </Button>
        </Stack>
      </Center>
    );
  }

  return <ToolLoadingFallback toolName="PDF Engine" />;
}
