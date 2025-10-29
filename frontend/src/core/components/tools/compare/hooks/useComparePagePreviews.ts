import { useEffect, useRef, useState } from 'react';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import type { PagePreview } from '@app/types/compare';

const DISPLAY_SCALE = 1;

const getDevicePixelRatio = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

const renderPdfDocumentToImages = async (
  file: File,
  onBatch?: (previews: PagePreview[]) => void,
  batchSize: number = 12,
  onInitTotal?: (totalPages: number) => void,
): Promise<PagePreview[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
    disableAutoFetch: true,
    disableStream: true,
  });

  try {
    const previews: PagePreview[] = [];
    const dpr = getDevicePixelRatio();
    const renderScale = Math.max(2, Math.min(3, dpr * 2));
    onInitTotal?.(pdf.numPages);

    let batch: PagePreview[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const displayViewport = page.getViewport({ scale: DISPLAY_SCALE });
      const renderViewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.width = Math.round(renderViewport.width);
      canvas.height = Math.round(renderViewport.height);

      if (!context) {
        page.cleanup();
        continue;
      }

      await page.render({ canvasContext: context, viewport: renderViewport, canvas }).promise;
      const preview: PagePreview = {
        pageNumber,
        width: Math.round(displayViewport.width),
        height: Math.round(displayViewport.height),
        rotation: (page.rotate || 0) % 360,
        url: canvas.toDataURL(),
      };
      previews.push(preview);
      if (onBatch) {
        batch.push(preview);
        if (batch.length >= batchSize) {
          onBatch(batch);
          batch = [];
        }
      }

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    if (onBatch && batch.length > 0) onBatch(batch);
    return previews;
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
};

interface UseComparePagePreviewsOptions {
  file: File | null;
  enabled: boolean;
  cacheKey: number | null;
}

export const useComparePagePreviews = ({
  file,
  enabled,
  cacheKey,
}: UseComparePagePreviewsOptions) => {
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const inFlightRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    if (!file || !enabled) {
      setPages([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const render = async () => {
      setLoading(true);
      try {
        inFlightRef.current += 1;
        const current = inFlightRef.current;
        const previews = await renderPdfDocumentToImages(
          file,
          (batch) => {
            if (cancelled || current !== inFlightRef.current) return;
            // Stream batches into state
            setPages((prev) => {
              const next = [...prev];
              for (const p of batch) {
                const idx = next.findIndex((x) => x.pageNumber > p.pageNumber);
                if (idx === -1) next.push(p); else next.splice(idx, 0, p);
              }
              return next;
            });
          },
          16,
          (total) => {
            if (!cancelled && current === inFlightRef.current) setTotalPages(total);
          }
        );
        if (!cancelled) {
          setPages(previews);
        }
      } catch (error) {
        console.error('[compare] failed to render document preview', error);
        if (!cancelled) {
          setPages([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [file, enabled, cacheKey]);

  return { pages, loading, totalPages, renderedPages: pages.length };
};

export type UseComparePagePreviewsReturn = ReturnType<typeof useComparePagePreviews>;
