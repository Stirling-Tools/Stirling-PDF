import { useEffect, useState } from 'react';
import { pdfWorkerManager } from '../../../../services/pdfWorkerManager';
import type { PagePreview } from '../../../../hooks/useProgressivePagePreviews';

const DISPLAY_SCALE = 1;

const getDevicePixelRatio = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

const renderPdfDocumentToImages = async (file: File): Promise<PagePreview[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
    disableAutoFetch: true,
    disableStream: true,
  });

  try {
    const previews: PagePreview[] = [];
    const dpr = getDevicePixelRatio();
    const renderScale = Math.max(2, Math.min(3, dpr * 2));

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
      previews.push({
        pageNumber,
        width: Math.round(displayViewport.width),
        height: Math.round(displayViewport.height),
        rotation: (page.rotate || 0) % 360,
        url: canvas.toDataURL(),
      });

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

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
        const previews = await renderPdfDocumentToImages(file);
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

  return { pages, loading };
};

export type UseComparePagePreviewsReturn = ReturnType<typeof useComparePagePreviews>;
