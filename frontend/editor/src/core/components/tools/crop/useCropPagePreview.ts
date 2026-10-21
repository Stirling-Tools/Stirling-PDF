import { useEffect, useState } from "react";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import type { StirlingFile } from "@app/types/fileContext";
import {
  normalizeRotation,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";

export interface CropPagePreview {
  imageUrl: string | null;
  geometry: CropPageGeometry | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: CropPagePreview = {
  imageUrl: null,
  geometry: null,
  loading: false,
  error: false,
};

/**
 * Renders the first page once at a resolution that survives zooming, and
 * reports the page geometry the crop request needs. One render per document:
 * the crop surface itself never asks PDF.js for pixels.
 */
export function useCropPagePreview(file: StirlingFile | null): CropPagePreview {
  const [preview, setPreview] = useState<CropPagePreview>(EMPTY);
  const fileKey = file ? `${file.fileId}:${file.quickKey}` : null;

  useEffect(() => {
    if (!file || !fileKey) {
      setPreview(EMPTY);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    let documentProxy: Awaited<
      ReturnType<typeof pdfWorkerManager.createDocument>
    > | null = null;

    const run = async () => {
      setPreview({
        imageUrl: null,
        geometry: null,
        loading: true,
        error: false,
      });
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
          disableAutoFetch: true,
          disableStream: true,
          stopAtErrors: false,
        });
        documentProxy = pdf;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const rotation = normalizeRotation(page.rotate);
        const viewBox = base.viewBox as [number, number, number, number];

        // 1800px on the long edge keeps 4x zoom legible without a decode cost
        // large enough to stall a phone.
        const renderScale = Math.min(
          3,
          Math.max(1, 1800 / Math.max(base.width, base.height)),
        );
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D is unavailable");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;
        page.cleanup();

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", 0.95);
        });
        canvas.width = 0;
        canvas.height = 0;

        if (cancelled) return;
        if (!blob) throw new Error("Page render produced no image");
        objectUrl = URL.createObjectURL(blob);
        setPreview({
          imageUrl: objectUrl,
          geometry: { viewBox, rotation },
          loading: false,
          error: false,
        });
      } catch {
        if (!cancelled) {
          setPreview({
            imageUrl: null,
            geometry: null,
            loading: false,
            error: true,
          });
        }
      } finally {
        if (documentProxy) pdfWorkerManager.destroyDocument(documentProxy);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, fileKey]);

  return preview;
}
