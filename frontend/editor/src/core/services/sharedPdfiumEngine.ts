import { useEffect, useState } from "react";
import {
  PdfEngine,
  PdfiumNative,
  browserImageDataToBlobConverter,
  type FontFallbackConfig,
} from "@embedpdf/engines";
import type { PdfEngine as PdfEngineContract } from "@embedpdf/models";
import { getPdfiumModule } from "@app/services/pdfiumService";

/**
 * A viewer engine on the same PDFium instance every other feature uses, so a
 * document the viewer opened is addressable by the text editor with no second
 * parse. Runs on the main thread. Never destroyed: its destroy() tears down the
 * shared library under every other reader.
 */
let enginePromise: Promise<PdfEngineContract> | null = null;

export function sharedEngineEnabled(): boolean {
  try {
    return localStorage.getItem("spike.sharedEngine") === "1";
  } catch {
    return false;
  }
}

export function getSharedPdfiumEngine(
  fontFallback: FontFallbackConfig | null,
): Promise<PdfEngineContract> {
  if (!enginePromise) {
    enginePromise = getPdfiumModule().then((module) => {
      const native = new PdfiumNative(module, { fontFallback });
      return new PdfEngine(native, {
        imageConverter: browserImageDataToBlobConverter,
      });
    });
  }
  return enginePromise;
}

/** The raw document handle the viewer holds for `docId`, or null. */
export function sharedDocumentPtr(
  engine: PdfEngineContract,
  docId: string,
): number | null {
  const executor = (
    engine as unknown as {
      executor?: {
        cache?: { getContext(id: string): { docPtr: number } | undefined };
      };
    }
  ).executor;
  return executor?.cache?.getContext(docId)?.docPtr ?? null;
}

export function useSharedPdfiumEngine(
  enabled: boolean,
  fontFallback: FontFallbackConfig | null,
) {
  const [engine, setEngine] = useState<PdfEngineContract | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getSharedPdfiumEngine(fontFallback).then(
      (e) => !cancelled && setEngine(e),
      (e: unknown) =>
        !cancelled && setError(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, fontFallback]);
  return { engine, isLoading: enabled && !engine && !error, error };
}

/** Viewer document id per workbench file, while the viewer holds it open. */
const viewerDocuments = new Map<string, string>();

export function registerViewerDocument(fileId: string, docId: string) {
  viewerDocuments.set(fileId, docId);
  return () => {
    if (viewerDocuments.get(fileId) === docId) viewerDocuments.delete(fileId);
  };
}

/** Raw handle of the document the viewer has open for `fileId`, or null. */
export async function viewerDocumentPtr(
  fileId: string | undefined,
): Promise<number | null> {
  if (!fileId || !enginePromise) return null;
  const docId = viewerDocuments.get(fileId);
  if (!docId) return null;
  return sharedDocumentPtr(await enginePromise, docId);
}

export function SharedDocumentRegistration({
  fileId,
  documentId,
}: {
  fileId: string | undefined;
  documentId: string;
}) {
  useEffect(() => {
    if (!fileId) return;
    return registerViewerDocument(fileId, documentId);
  }, [fileId, documentId]);
  return null;
}
