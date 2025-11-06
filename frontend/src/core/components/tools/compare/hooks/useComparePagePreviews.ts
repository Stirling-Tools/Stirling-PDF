import { useEffect, useRef, useState } from 'react';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import type { PagePreview } from '@app/types/compare';

const DISPLAY_SCALE = 1;

const getDevicePixelRatio = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

// Observable preview cache so rendering progress can resume across remounts and view switches
type CacheEntry = { pages: PagePreview[]; total: number; subscribers: Set<() => void> };
const previewCache: Map<string, CacheEntry> = new Map();
const latestVersionMap: Map<string, symbol> = new Map();

const getOrCreateEntry = (key: string): CacheEntry => {
  let entry = previewCache.get(key);
  if (!entry) {
    entry = { pages: [], total: 0, subscribers: new Set() };
    previewCache.set(key, entry);
  }
  return entry;
};

const notify = (entry: CacheEntry) => {
  entry.subscribers.forEach((fn) => {
    try { fn(); } catch { /* no-op */ }
  });
};

const subscribe = (key: string, fn: () => void): (() => void) => {
  const entry = getOrCreateEntry(key);
  entry.subscribers.add(fn);
  return () => entry.subscribers.delete(fn);
};

const appendBatchToCache = (key: string, batch: PagePreview[], provisionalTotal?: number) => {
  const entry = getOrCreateEntry(key);
  const next = entry.pages.slice();
  for (const p of batch) {
    const idx = next.findIndex((x) => x.pageNumber > p.pageNumber);
    if (idx === -1) next.push(p); else next.splice(idx, 0, p);
  }
  entry.pages = next;
  if (typeof provisionalTotal === 'number' && entry.total === 0) entry.total = provisionalTotal;
  notify(entry);
};

const setTotalInCache = (key: string, total: number) => {
  const entry = getOrCreateEntry(key);
  entry.total = total;
  notify(entry);
};

const replacePagesInCache = (key: string, pages: PagePreview[], total?: number) => {
  const entry = getOrCreateEntry(key);
  entry.pages = pages.slice();
  if (typeof total === 'number') entry.total = total;
  notify(entry);
};


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

    const key = `${file.name || 'file'}:${file.size || 0}:${cacheKey ?? 'none'}`;
    const refreshVersion = Symbol(key);
    latestVersionMap.set(key, refreshVersion);
    const entry = getOrCreateEntry(key);
    const cachedTotal = entry.total ?? (entry.pages.length ?? 0);
    let lastKnownTotal = cachedTotal;
    const isFullyCached = Boolean(entry.pages.length > 0 && cachedTotal > 0 && entry.pages.length >= cachedTotal);

    if (entry.pages.length > 0) {
      const nextPages = entry.pages.slice();
      setPages(nextPages);
      setTotalPages(cachedTotal);
    } else {
      setTotalPages(0);
    }

    setLoading(!isFullyCached);

    const unsubscribe = subscribe(key, () => {
      const e = getOrCreateEntry(key);
      setPages(e.pages.slice());
      setTotalPages(e.total);
      const done = e.pages.length > 0 && e.total > 0 && e.pages.length >= e.total;
      setLoading(!done);
    });

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
        const startAt = (entry?.pages?.length ?? 0) + 1;
        const previews = await renderPdfDocumentToImages(
          file,
          (batch) => {
            if (cancelled || current !== inFlightRef.current) return;
            appendBatchToCache(key, batch, lastKnownTotal || cachedTotal);
          },
          16,
          (total) => {
            if (!cancelled && current === inFlightRef.current) {
              lastKnownTotal = total;
              setTotalInCache(key, total);
            }
          },
          startAt,
          () => cancelled || current !== inFlightRef.current
        );
        if (!cancelled && current === inFlightRef.current) {
          const stillLatest = latestVersionMap.get(key) === refreshVersion;
          if (!stillLatest) {
            return;
          }
          const cacheEntry = getOrCreateEntry(key);
          const finalTotal = lastKnownTotal || cachedTotal || cacheEntry.total || previews.length;
          lastKnownTotal = finalTotal;
          const cachePages = cacheEntry.pages ?? [];
          const preferPreviews = previews.length > cachePages.length;
          const finalPages = preferPreviews ? previews.slice() : cachePages.slice();
          replacePagesInCache(key, finalPages, finalTotal);
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
      unsubscribe();
    };
  }, [file, enabled, cacheKey]);

  return { pages, loading, totalPages, renderedPages: pages.length };
};

export type UseComparePagePreviewsReturn = ReturnType<typeof useComparePagePreviews>;
