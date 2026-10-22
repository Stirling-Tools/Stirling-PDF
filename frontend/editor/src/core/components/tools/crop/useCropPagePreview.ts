import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import type { StirlingFile } from "@app/types/fileContext";
import {
  normalizeRotation,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";

export interface CropPagePreview {
  imageUrl: string | null;
  geometry: CropPageGeometry | null;
  pageNumber: number;
  pageCount: number;
  loading: boolean;
  error: boolean;
}

const EMPTY: CropPagePreview = {
  imageUrl: null,
  geometry: null,
  pageNumber: 1,
  pageCount: 0,
  loading: false,
  error: false,
};

interface CachedPage {
  imageUrl: string;
  geometry: CropPageGeometry;
}

const CACHE_LIMIT = 2;
const MAX_RENDER_EDGE = 1600;

/**
 * Renders the requested page once at a resolution that survives zooming and
 * caches it for the document's lifetime, so paging back and forth does not
 * re-rasterise. The crop surface itself never talks to PDF.js.
 */
export function useCropPagePreview(
  file: StirlingFile | null,
  pageNumber: number,
): CropPagePreview {
  const [preview, setPreview] = useState<CropPagePreview>(EMPTY);
  const cacheRef = useRef<Map<number, CachedPage>>(new Map());
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const fileKey = file ? `${file.fileId}:${file.quickKey}` : null;
  const pageCountRef = useRef(0);

  useEffect(() => {
    if (!file || !fileKey) {
      setPreview(EMPTY);
      return;
    }

    let cancelled = false;
    const cache = cacheRef.current;
    const page = Math.max(1, pageNumber);

    const cached = cache.get(page);
    if (cached) {
      setPreview({
        imageUrl: cached.imageUrl,
        geometry: cached.geometry,
        pageNumber: page,
        pageCount: pageCountRef.current,
        loading: false,
        error: false,
      });
      return;
    }

    const run = async () => {
      setPreview((previous) => ({
        ...previous,
        imageUrl: null,
        geometry: null,
        pageNumber: page,
        loading: true,
        error: false,
      }));

      try {
        if (!documentRef.current) {
          const arrayBuffer = await file.arrayBuffer();
          documentRef.current = await pdfWorkerManager.createDocument(
            arrayBuffer,
            {
              disableAutoFetch: true,
              disableStream: true,
              stopAtErrors: false,
            },
          );
        }
        const pdf = documentRef.current;
        const pageCount = pdf.numPages;
        pageCountRef.current = pageCount;
        const target = await pdf.getPage(Math.min(page, pageCount));
        const base = target.getViewport({ scale: 1 });
        const rotation = normalizeRotation(target.rotate);
        const viewBox = base.viewBox as [number, number, number, number];

        const renderScale = Math.min(
          3,
          Math.max(1, MAX_RENDER_EDGE / Math.max(base.width, base.height)),
        );
        const viewport = target.getViewport({ scale: renderScale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D is unavailable");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await target.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;
        target.cleanup();

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", 0.95);
        });
        canvas.width = 0;
        canvas.height = 0;

        if (cancelled) return;
        if (!blob) throw new Error("Page render produced no image");
        const imageUrl = URL.createObjectURL(blob);
        cache.set(page, {
          imageUrl,
          geometry: { viewBox, rotation },
        });
        while (cache.size > CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          const entry = cache.get(oldest);
          cache.delete(oldest);
          if (entry) URL.revokeObjectURL(entry.imageUrl);
        }

        setPreview({
          imageUrl,
          geometry: { viewBox, rotation },
          pageNumber: page,
          pageCount,
          loading: false,
          error: false,
        });
      } catch {
        if (!cancelled) {
          setPreview({
            imageUrl: null,
            geometry: null,
            pageNumber: page,
            pageCount: documentRef.current?.numPages ?? 0,
            loading: false,
            error: true,
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [file, fileKey, pageNumber]);

  // A different document invalidates both the open proxy and every bitmap.
  useEffect(() => {
    return () => {
      const pdf = documentRef.current;
      documentRef.current = null;
      if (pdf) pdfWorkerManager.destroyDocument(pdf);
      for (const entry of cacheRef.current.values()) {
        URL.revokeObjectURL(entry.imageUrl);
      }
      cacheRef.current.clear();
    };
  }, [fileKey]);

  return preview;
}
