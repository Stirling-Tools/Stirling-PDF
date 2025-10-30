import { useEffect, useRef, useState } from 'react';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import type { PagePreview } from '@app/types/compare';

const DISPLAY_SCALE = 1;

const getDevicePixelRatio = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

// Simple shared cache so rendering progress can resume across unmounts/remounts
const previewCache: Map<string, { pages: PagePreview[]; total: number }> = new Map();

const renderPdfDocumentToImages = async (
  file: File,
  onBatch?: (previews: PagePreview[]) => void,
  batchSize: number = 12,
  onInitTotal?: (totalPages: number) => void,
  startAtPage: number = 1,
  shouldAbort?: () => boolean,
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
    const shouldStop = () => Boolean(shouldAbort?.());

    for (let pageNumber = Math.max(1, startAtPage); pageNumber <= pdf.numPages; pageNumber += 1) {
      if (shouldStop()) break;
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

      try {
        await page.render({ canvasContext: context, viewport: renderViewport, canvas }).promise;
        if (shouldStop()) break;

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
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }

      if (shouldStop()) break;
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
      setTotalPages(0);
      return () => {
        cancelled = true;
      };
    }

    const key = `${(file as any).name || 'file'}:${(file as any).size || 0}:${cacheKey ?? 'none'}`;
    const cached = previewCache.get(key);
    const cachedTotal = cached?.total ?? (cached?.pages.length ?? 0);
    let lastKnownTotal = cachedTotal;
    const isFullyCached = Boolean(cached && cached.pages.length > 0 && cachedTotal > 0 && cached.pages.length >= cachedTotal);

    if (cached) {
      setPages(cached.pages.slice());
      setTotalPages(cachedTotal);
    } else {
      setTotalPages(0);
    }

    setLoading(!isFullyCached);

    if (isFullyCached) {
      return () => {
        cancelled = true;
      };
    }

    const render = async () => {
      setLoading(true);
      try {
        inFlightRef.current += 1;
        const current = inFlightRef.current;
        const startAt = (cached?.pages?.length ?? 0) + 1;
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
              // Update shared cache
              previewCache.set(key, { pages: next, total: lastKnownTotal || cachedTotal });
              return next;
            });
          },
          16,
          (total) => {
            if (!cancelled && current === inFlightRef.current) {
              lastKnownTotal = total;
              setTotalPages(total);
              // Initialize or update cache record while preserving any pages
              const existingPages = previewCache.get(key)?.pages ?? [];
              previewCache.set(key, { pages: existingPages.slice(), total });
            }
          },
          startAt,
          () => cancelled || current !== inFlightRef.current
        );
        if (!cancelled && current === inFlightRef.current) {
          const cacheEntry = previewCache.get(key);
          const finalTotal = lastKnownTotal || cachedTotal || cacheEntry?.total || previews.length;
          lastKnownTotal = finalTotal;
          const finalPages = cacheEntry ? cacheEntry.pages.slice() : previews.slice();
          previewCache.set(key, { pages: finalPages.slice(), total: finalTotal });
          setPages(finalPages);
          setTotalPages(finalTotal);
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
