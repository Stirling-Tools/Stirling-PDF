import { useCallback, useEffect, useRef, useState } from "react";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PagePreview } from "@app/types/compare";

const DISPLAY_SCALE = 1;
const BATCH_SIZE = 10; // Render 10 pages at a time

const getDevicePixelRatio = () =>
  typeof window !== "undefined" ? window.devicePixelRatio : 1;

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

  const pageBlobRegistryRef = useRef<Map<number, string>>(new Map());

  const revokePageBlob = useCallback((pageNum: number) => {
    const url = pageBlobRegistryRef.current.get(pageNum);
    if (url) {
      URL.revokeObjectURL(url);
      pageBlobRegistryRef.current.delete(pageNum);
    }
  }, []);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const createdBlobUrlsRef = useRef<Set<string>>(new Set());

  const revokeAll = useCallback(() => {
    createdBlobUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    createdBlobUrlsRef.current.clear();
    pageBlobRegistryRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    pageBlobRegistryRef.current.clear();
  }, []);

  const renderPageBatch = useCallback(
    async (
      pdf: PDFDocumentProxy,
      pageNumbers: number[],
      signal: AbortSignal,
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
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          canvas.width = Math.round(renderViewport.width);
          canvas.height = Math.round(renderViewport.height);

          if (!context) {
            page.cleanup();
            continue;
          }

          await page.render({
            canvasContext: context,
            viewport: renderViewport,
            canvas,
          }).promise;

          const url = await new Promise<string>((resolve) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // Revoke previous blob URL first if exists
                  const existingUrl =
                    pageBlobRegistryRef.current.get(pageNumber);
                  if (existingUrl) {
                    URL.revokeObjectURL(existingUrl);
                    createdBlobUrlsRef.current.delete(existingUrl);
                  }
                  const bUrl = URL.createObjectURL(blob);
                  pageBlobRegistryRef.current.set(pageNumber, bUrl);
                  createdBlobUrlsRef.current.add(bUrl);
                  resolve(bUrl);
                } else {
                  resolve("");
                }
              },
              "image/webp",
              0.85,
            );
          });

          if (url) {
            previews.push({
              pageNumber,
              width: Math.round(displayViewport.width),
              height: Math.round(displayViewport.height),
              rotation: (page.rotate || 0) % 360,
              url,
            });
          }

          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
        } catch (error) {
          console.error(
            `[progressive-pages] failed to render page ${pageNumber}:`,
            error,
          );
        }
      }

      return previews;
    },
    [],
  );

  const loadPageRange = useCallback(
    async (startPage: number, endPage: number, signal: AbortSignal) => {
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
      setState((prev) => ({
        ...prev,
        loadingPages: new Set([
          ...prev.loadingPages,
          ...pagesToLoad.map((p) => p - 1),
        ]),
      }));

      try {
        const pdfDoc = pdfRef.current;
        if (!pdfDoc) return;
        const previews = await renderPageBatch(pdfDoc, pagesToLoad, signal);

        if (!signal.aborted) {
          setState((prev) => {
            const newPages = [...prev.pages];
            const newLoadedPages = new Set(prev.loadedPages);
            const newLoadingPages = new Set(prev.loadingPages);

            // Add new previews and mark as loaded
            for (const preview of previews) {
              const pageIndex = preview.pageNumber - 1; // Convert to 0-based
              newLoadedPages.add(pageIndex);
              newLoadingPages.delete(pageIndex);

              // Insert preview in correct position
              const insertIndex = newPages.findIndex(
                (p) => p.pageNumber > preview.pageNumber,
              );
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
          console.error(
            "[progressive-pages] failed to load page batch:",
            error,
          );
        }
      } finally {
        if (!signal.aborted) {
          setState((prev) => {
            const newLoadingPages = new Set(prev.loadingPages);
            pagesToLoad.forEach((p) => newLoadingPages.delete(p - 1));
            return { ...prev, loadingPages: newLoadingPages };
          });
        }
      }
    },
    [state.loadedPages, state.loadingPages, state.totalPages, renderPageBatch],
  );

  // Initialize PDF and load first batch
  useEffect(() => {
    let cancelled = false;

    if (!file || !enabled) {
      revokeAll();
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
        setState((prev) => ({ ...prev, loading: true }));

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

        setState((prev) => ({
          ...prev,
          totalPages,
          loading: false,
        }));

        // Load first batch of pages using a real abort controller
        const initAbort = new AbortController();
        const firstBatchEnd = Math.min(BATCH_SIZE - 1, totalPages - 1);
        await loadPageRange(0, firstBatchEnd, initAbort.signal);
      } catch (error) {
        console.error("[progressive-pages] failed to initialize PDF:", error);
        if (!cancelled) {
          setState((prev) => ({
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
      revokeAll();
    };
  }, [file, enabled, cacheKey, loadPageRange, revokeAll]);

  // Load pages based on visible range and evict/revoke pages outside viewport (with ±3 page buffer)
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

    // Evict pages outside ±3 of the visible viewport [start, end]
    const keepStart = Math.max(1, start + 1 - 3);
    const keepEnd = Math.min(state.totalPages, end + 1 + 3);

    const toRevoke: number[] = [];
    pageBlobRegistryRef.current.forEach((_, pageNum) => {
      if (pageNum < keepStart || pageNum > keepEnd) {
        toRevoke.push(pageNum);
      }
    });

    if (toRevoke.length > 0) {
      toRevoke.forEach((pageNum) => {
        revokePageBlob(pageNum);
      });

      setState((prev) => {
        const newPages = prev.pages.filter(
          (p) => !toRevoke.includes(p.pageNumber),
        );
        const newLoadedPages = new Set(prev.loadedPages);
        toRevoke.forEach((pageNum) => {
          newLoadedPages.delete(pageNum - 1);
        });
        return {
          ...prev,
          pages: newPages,
          loadedPages: newLoadedPages,
        };
      });
    }

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
      revokeAll();
    };
  }, [revokeAll]);

  return {
    pages: state.pages,
    loading: state.loading,
    totalPages: state.totalPages,
    loadedPages: state.loadedPages,
    loadingPages: state.loadingPages,
  };
};

export type UseProgressivePagePreviewsReturn = ReturnType<
  typeof useProgressivePagePreviews
>;
