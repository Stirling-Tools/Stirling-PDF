import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// Refs to keep Sets stable for loadPageRange callback
interface ProgressivePagePreviewsRefs {
  loadedPages: React.MutableRefObject<Set<number>>;
  loadingPages: React.MutableRefObject<Set<number>>;
  totalPages: React.MutableRefObject<number>;
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
  
  // Refs to keep Sets stable for loadPageRange callback
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const totalPagesRef = useRef<number>(0);
  
  // Keep refs in sync with state
  useEffect(() => {
    loadedPagesRef.current = state.loadedPages;
  }, [state.loadedPages]);
  
  useEffect(() => {
    loadingPagesRef.current = state.loadingPages;
  }, [state.loadingPages]);
  
  useEffect(() => {
    totalPagesRef.current = state.totalPages;
  }, [state.totalPages]);

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
        // Don't log RenderingCancelledException - it's expected when components unmount
        if (error && typeof error === 'object' && 'name' in error && error.name === 'RenderingCancelledException') {
          // Expected cancellation, skip this page and continue with others
          continue;
        }
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
    const pdfDoc = pdfRef.current;
    if (!pdfDoc) {
      console.warn('[progressive-pages] PDF doc not available for loading pages');
      return;
    }

    // Use refs for stable access to current values
    const totalPages = pdfDoc.numPages ?? totalPagesRef.current;
    
    // Guard: allow inclusive end, check correctly
    if (startPage < 0 || endPage < startPage || endPage >= totalPages) {
      console.warn(`[progressive-pages] Invalid range: startPage=${startPage}, endPage=${endPage}, totalPages=${totalPages}`);
      return;
    }

    // Check which pages need to be loaded using refs (always current)
    const loaded = loadedPagesRef.current;
    const loading = loadingPagesRef.current;
    const pagesToLoad: number[] = [];
    
    for (let i = startPage; i <= endPage; i++) {
      if (!loaded.has(i) && !loading.has(i)) {
        pagesToLoad.push(i + 1); // Convert to 1-based page numbers
      }
    }

    if (pagesToLoad.length === 0) {
      console.log(`[progressive-pages] All pages ${startPage}-${endPage} already loaded or loading`);
      return;
    }

    // Mark pages as loading
    setState(prev => ({
      ...prev,
      loadingPages: new Set([...prev.loadingPages, ...pagesToLoad.map(p => p - 1)]),
    }));

    try {
      console.log(`[progressive-pages] Loading pages ${pagesToLoad.join(', ')}`);
      const previews = await renderPageBatch(pdfDoc, pagesToLoad, signal);
      
      // Ensure previews is an array (should always be, but safety check)
      if (!Array.isArray(previews)) {
        console.warn('[progressive-pages] renderPageBatch did not return an array:', previews);
        return;
      }
      
      console.log(`[progressive-pages] Successfully loaded ${previews.length} pages:`, previews.map(p => p.pageNumber));
      
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

          console.log(`[progressive-pages] State updated. Total pages in state: ${newPages.length}, loaded pages:`, Array.from(newLoadedPages).sort((a, b) => a - b));

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
  }, [renderPageBatch]); // Only depend on renderPageBatch, not state

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
    if (!visiblePageRange || state.totalPages === 0 || !pdfRef.current) return;

    const { start, end } = visiblePageRange;
    const startPage = Math.max(0, start);
    const endPage = Math.min(state.totalPages - 1, end); // Ensure inclusive end is valid

    console.log('[progressive-pages] visiblePageRange effect:', { start, end, startPage, endPage, totalPages: state.totalPages });

    // Cancel previous loading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Load the range - loadPageRange will check if pages are already loaded
    loadPageRange(startPage, endPage, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [visiblePageRange, state.totalPages, loadPageRange]); // Now safe to depend on loadPageRange

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
