import { useCallback, useEffect, useRef, useState } from 'react';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PagePreview } from '@app/types/compare';

const DISPLAY_SCALE = 1;
const BATCH_SIZE = 10; // Render 10 pages at a time

const getDevicePixelRatio = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

interface ProgressivePagePreviewsOptions {
  file: File | null;
  enabled: boolean;
  cacheKey: number | null;
  visiblePageRange?: { start: number; end: number }; // 0-based page indices
}

interface ProgressivePagePreviewsState {
  pages: PagePreview[];
  loading: boolean;
  totalPages: number;
  loadedPages: Set<number>; // 0-based page indices that have been loaded
  loadingPages: Set<number>; // 0-based page indices currently being loaded
}

export const useProgressivePagePreviews = ({
  file,
  enabled,
  cacheKey,
  visiblePageRange,
}: ProgressivePagePreviewsOptions) => {
  const [state, setState] = useState<ProgressivePagePreviewsState>({
    pages: [],
    loading: false,
    totalPages: 0,
    loadedPages: new Set(),
    loadingPages: new Set(),
  });

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const renderPageBatch = useCallback(async (
    pdf: PDFDocumentProxy,
    pageNumbers: number[],
    signal: AbortSignal
  ): Promise<PagePreview[]> => {
    const previews: PagePreview[] = [];
    const dpr = getDevicePixelRatio();
    const renderScale = Math.max(2, Math.min(3, dpr * 2));

    for (const pageNumber of pageNumbers) {
      if (signal.aborted) break;

      try {
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
      } catch (error) {
        console.error(`[progressive-pages] failed to render page ${pageNumber}:`, error);
      }
    }

    return previews;
  }, []);

  const loadPageRange = useCallback(async (
    startPage: number,
    endPage: number,
    signal: AbortSignal
  ) => {
    // Use the live PDF ref for bounds instead of possibly stale state
    const totalPages = pdfRef.current?.numPages ?? state.totalPages;
    if (startPage < 0 || endPage >= totalPages || startPage > endPage) {
      return;
    }

    // Check which pages need to be loaded
    const pagesToLoad: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      if (!state.loadedPages.has(i) && !state.loadingPages.has(i)) {
        pagesToLoad.push(i + 1); // Convert to 1-based page numbers
      }
    }

    if (pagesToLoad.length === 0) return;

    // Mark pages as loading
    setState(prev => ({
      ...prev,
      loadingPages: new Set([...prev.loadingPages, ...pagesToLoad.map(p => p - 1)]),
    }));

    try {
      const pdfDoc = pdfRef.current;
      if (!pdfDoc) return;
      const previews = await renderPageBatch(pdfDoc, pagesToLoad, signal);
      
      if (!signal.aborted) {
        setState(prev => {
          const newPages = [...prev.pages];
          const newLoadedPages = new Set(prev.loadedPages);
          const newLoadingPages = new Set(prev.loadingPages);

          // Add new previews and mark as loaded
          for (const preview of previews) {
            const pageIndex = preview.pageNumber - 1; // Convert to 0-based
            newLoadedPages.add(pageIndex);
            newLoadingPages.delete(pageIndex);
            
            // Insert preview in correct position
            const insertIndex = newPages.findIndex(p => p.pageNumber > preview.pageNumber);
            if (insertIndex === -1) {
              newPages.push(preview);
            } else {
              newPages.splice(insertIndex, 0, preview);
            }
          }

          return {
            ...prev,
            pages: newPages,
            loadedPages: newLoadedPages,
            loadingPages: newLoadingPages,
          };
        });
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error('[progressive-pages] failed to load page batch:', error);
      }
    } finally {
      if (!signal.aborted) {
        setState(prev => {
          const newLoadingPages = new Set(prev.loadingPages);
          pagesToLoad.forEach(p => newLoadingPages.delete(p - 1));
          return { ...prev, loadingPages: newLoadingPages };
        });
      }
    }
  }, [state.loadedPages, state.loadingPages, state.totalPages, renderPageBatch]);

  // Initialize PDF and load first batch
  useEffect(() => {
    let cancelled = false;

    if (!file || !enabled) {
      setState({
        pages: [],
        loading: false,
        totalPages: 0,
        loadedPages: new Set(),
        loadingPages: new Set(),
      });
      return () => {
        cancelled = true;
      };
    }

    const initialize = async () => {
      try {
        setState(prev => ({ ...prev, loading: true }));
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
          disableAutoFetch: true,
          disableStream: true,
        });

        if (cancelled) {
          pdfWorkerManager.destroyDocument(pdf);
          return;
        }

        pdfRef.current = pdf;
        const totalPages = pdf.numPages;

        setState(prev => ({
          ...prev,
          totalPages,
          loading: false,
        }));

        // Load first batch of pages using a real abort controller
        const initAbort = new AbortController();
        const firstBatchEnd = Math.min(BATCH_SIZE - 1, totalPages - 1);
        await loadPageRange(0, firstBatchEnd, initAbort.signal);

      } catch (error) {
        console.error('[progressive-pages] failed to initialize PDF:', error);
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            totalPages: 0,
          }));
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        pdfWorkerManager.destroyDocument(pdfRef.current);
        pdfRef.current = null;
      }
    };
  }, [file, enabled, cacheKey, loadPageRange]);

  // Load pages based on visible range
  useEffect(() => {
    if (!visiblePageRange || state.totalPages === 0) return;

    const { start, end } = visiblePageRange;
    const startPage = Math.max(0, start - 5); // Add buffer before
    const endPage = Math.min(state.totalPages - 1, end + 5); // Add buffer after

    // Cancel previous loading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    loadPageRange(startPage, endPage, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [visiblePageRange, state.totalPages, loadPageRange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pdfRef.current) {
        pdfWorkerManager.destroyDocument(pdfRef.current);
      }
    };
  }, []);

  return {
    pages: state.pages,
    loading: state.loading,
    totalPages: state.totalPages,
    loadedPages: state.loadedPages,
    loadingPages: state.loadingPages,
  };
};

export type UseProgressivePagePreviewsReturn = ReturnType<typeof useProgressivePagePreviews>;
