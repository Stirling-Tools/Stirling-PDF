import { useEffect, useState } from "react";
import { getDocumentBytes } from "@app/services/documentBytesCache";
import { getPageLabels } from "@app/services/pdfiumService";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";

// `/PageLabels` is immutable for a given set of bytes and the viewer re-renders
// on every page turn, so labels are parsed once per document and cached by
// content key. `undefined` means "not read yet", `null` means "no labels".
const cache = new Map<string, string[] | null>();

/**
 * Page labels for the given document, or `null` when it defines none (callers
 * then fall back to plain page numbers).
 *
 * `documentKey` must identify the bytes rather than the workbench record: a
 * disk reload under an unchanged file id has to invalidate the cached labels.
 *
 * `enabled` defers the first read until the viewer has opened the document.
 * Reading labels copies the whole file into PDFium's wasm heap, so racing it
 * against the viewer's own read of the same bytes delays the initial paint.
 */
export function usePageLabels(
  file: File | Blob | null | undefined,
  documentKey: string | undefined,
  enabled = true,
): string[] | null {
  const [labels, setLabels] = useState<string[] | null>(() =>
    documentKey ? (cache.get(documentKey) ?? null) : null,
  );

  useEffect(() => {
    if (!file || !documentKey) {
      setLabels(null);
      return;
    }
    const cached = cache.get(documentKey);
    if (cached !== undefined) {
      setLabels(cached);
      return;
    }
    if (!enabled) return;
    setLabels(null);
    let cancelled = false;
    void (async () => {
      try {
        // Share the viewer's document bytes and take a turn in the PDFium scan
        // queue: PDFium is single-threaded and every open copies the document
        // into wasm memory, so a concurrent scan would double the heap.
        const bytes = await getDocumentBytes(file);
        const result = await runPdfiumScan(() => getPageLabels(bytes));
        cache.set(documentKey, result);
        if (!cancelled) setLabels(result);
      } catch {
        // A transient read failure keeps plain numbers and is deliberately not
        // cached, so the next mount retries instead of staying unlabelled.
        if (!cancelled) setLabels(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, documentKey, enabled]);

  return labels;
}
