import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { pdfWorkerManager } from "@editor/services/pdfWorkerManager";
import type { StirlingFile } from "@editor/types/fileContext";
import {
  getDisplaySize,
  type CropPageGeometry,
} from "@editor/utils/cropPageGeometry";

export interface CropPageBlend {
  /** Composited ghost of the other pages, or null when there is nothing to blend. */
  blendUrl: string | null;
  /** Pages the composite covers; 0 when blending is off or the file is single-page. */
  blendedPages: number;
  loading: boolean;
}

const EMPTY: CropPageBlend = {
  blendUrl: null,
  blendedPages: 0,
  loading: false,
};

/**
 * Beyond this the composite stops adding signal and starts costing render
 * time on documents built for sequential paging anyway.
 */
const MAX_BLEND_PAGES = 24;

/** Ghost resolution cap: the blend is a placement hint, not a print. */
const BLEND_RENDER_EDGE = 360;

const BLEND_ALPHA = 0.3;

/**
 * Composites the document's other pages into one low-opacity ghost so a crop
 * drawn against the current page cannot silently cut content that only another
 * page carries (#2959). The ghost fits the current page's display box; pages
 * with a different aspect are contained and centred rather than stretched.
 */
export function useCropPageBlend(
  file: StirlingFile | null,
  geometry: CropPageGeometry | null,
  enabled: boolean,
  excludePage: number,
): CropPageBlend {
  const [blend, setBlend] = useState<CropPageBlend>(EMPTY);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const blendUrlRef = useRef<string | null>(null);
  const fileKey = file ? `${file.fileId}:${file.quickKey}` : null;

  useEffect(() => {
    const clearBlend = () => {
      if (blendUrlRef.current) URL.revokeObjectURL(blendUrlRef.current);
      blendUrlRef.current = null;
      setBlend(EMPTY);
    };

    const display = geometry ? getDisplaySize(geometry) : null;
    if (!file || !fileKey || !geometry || !display || !enabled) {
      clearBlend();
      return;
    }

    let cancelled = false;
    const replaceBlend = (next: CropPageBlend) => {
      if (blendUrlRef.current) URL.revokeObjectURL(blendUrlRef.current);
      blendUrlRef.current = next.blendUrl;
      setBlend(next);
    };

    const run = async () => {
      setBlend((previous) => ({ ...previous, loading: true }));
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
        if (cancelled || pdf.numPages <= 1) {
          if (!cancelled) replaceBlend({ ...EMPTY, loading: false });
          return;
        }

        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(display.width));
        canvas.height = Math.max(1, Math.round(display.height));
        const composite = canvas.getContext("2d");
        if (!composite) throw new Error("Canvas 2D is unavailable");

        const lastPage = Math.min(pdf.numPages, MAX_BLEND_PAGES);
        let drawn = 0;
        for (let page = 1; page <= lastPage; page++) {
          if (cancelled) return;
          if (page === excludePage) continue;

          const proxy = await pdf.getPage(page);
          if (cancelled) return;
          const base = proxy.getViewport({ scale: 1 });
          const scale = Math.min(
            1,
            BLEND_RENDER_EDGE / Math.max(base.width, base.height),
          );
          const viewport = proxy.getViewport({ scale });
          const pageCanvas = window.document.createElement("canvas");
          pageCanvas.width = Math.round(viewport.width);
          pageCanvas.height = Math.round(viewport.height);
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error("Canvas 2D is unavailable");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          await proxy.render({
            canvasContext: context,
            viewport,
            canvas: pageCanvas,
          }).promise;
          proxy.cleanup();

          const fit = Math.min(
            canvas.width / pageCanvas.width,
            canvas.height / pageCanvas.height,
          );
          const width = pageCanvas.width * fit;
          const height = pageCanvas.height * fit;
          composite.globalAlpha = BLEND_ALPHA;
          composite.drawImage(
            pageCanvas,
            (canvas.width - width) / 2,
            (canvas.height - height) / 2,
            width,
            height,
          );
          composite.globalAlpha = 1;
          pageCanvas.width = 0;
          pageCanvas.height = 0;
          drawn += 1;
        }

        if (cancelled || drawn === 0) return;
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", 0.8);
        });
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return;

        const blendUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blendUrl);
          return;
        }
        replaceBlend({ blendUrl, blendedPages: drawn, loading: false });
      } catch {
        if (!cancelled) replaceBlend({ ...EMPTY, loading: false });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [file, fileKey, geometry, enabled, excludePage]);

  // A different document invalidates the open proxy and the composite bitmap.
  useEffect(() => {
    return () => {
      const pdf = documentRef.current;
      documentRef.current = null;
      if (pdf) pdfWorkerManager.destroyDocument(pdf);
      if (blendUrlRef.current) {
        URL.revokeObjectURL(blendUrlRef.current);
        blendUrlRef.current = null;
      }
    };
  }, [fileKey]);

  return blend;
}
