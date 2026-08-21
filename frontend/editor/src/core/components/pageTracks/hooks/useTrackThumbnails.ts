import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useFileSelectors } from "@app/contexts/FileContext";
import { useThumbnailGeneration } from "@app/hooks/useThumbnailGeneration";
import { TrackPage, sourcePageKey } from "@app/components/pageTracks/types";

/** Pre-load a screen's worth either side so sideways scrolling stays smooth. */
const ROOT_MARGIN = "300px";
const MAX_IN_FLIGHT = 12;
const NOTIFY_MS = 60;

export interface TrackThumbnailStore {
  subscribe: (listener: () => void) => () => void;
  get: (key: string) => string | null;
  /** Ref callback for a page tile, driving lazy loading via intersection. */
  observe: (page: TrackPage) => (element: HTMLElement | null) => void;
}

/**
 * Renders page thumbnails on demand, keyed by source page rather than by track
 * position, so a page keeps its image when it is moved, reordered or undone.
 *
 * Results live outside React state: a track can hold thousands of pages, and
 * pushing each arriving thumbnail through a prop would re-render every tile in
 * the track. Tiles subscribe individually via {@link useTrackThumbnail}.
 */
export function useTrackThumbnails(): TrackThumbnailStore {
  const selectors = useFileSelectors();
  const { requestThumbnail, getThumbnailFromCache } = useThumbnailGeneration();

  const resolvedRef = useRef(new Map<string, string>());
  const listenersRef = useRef(new Set<() => void>());
  const inFlightRef = useRef(new Set<string>());
  const queueRef = useRef<TrackPage[]>([]);
  const notifyTimerRef = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageByElementRef = useRef(new Map<Element, TrackPage>());
  const elementByKeyRef = useRef(new Map<string, Element>());

  const scheduleNotify = useCallback(() => {
    if (notifyTimerRef.current != null) return;
    notifyTimerRef.current = window.setTimeout(() => {
      notifyTimerRef.current = null;
      listenersRef.current.forEach((listener) => listener());
    }, NOTIFY_MS);
  }, []);

  const pump = useCallback(() => {
    while (
      inFlightRef.current.size < MAX_IN_FLIGHT &&
      queueRef.current.length > 0
    ) {
      const page = queueRef.current.shift();
      if (!page) break;
      const key = sourcePageKey(page);
      if (resolvedRef.current.has(key) || inFlightRef.current.has(key))
        continue;

      const cached = getThumbnailFromCache(key);
      if (cached) {
        resolvedRef.current.set(key, cached);
        scheduleNotify();
        continue;
      }

      const file = selectors.getFile(page.sourceFileId);
      if (!file) continue;

      inFlightRef.current.add(key);
      requestThumbnail(key, file, page.sourcePageNumber)
        .then((thumbnail) => {
          if (thumbnail) {
            resolvedRef.current.set(key, thumbnail);
            scheduleNotify();
          }
        })
        .catch((error) => {
          console.error("[PageTracks] thumbnail failed", error);
        })
        .finally(() => {
          inFlightRef.current.delete(key);
          pump();
        });
    }
  }, [getThumbnailFromCache, requestThumbnail, scheduleNotify, selectors]);

  const enqueue = useCallback(
    (page: TrackPage) => {
      const key = sourcePageKey(page);
      if (resolvedRef.current.has(key) || inFlightRef.current.has(key)) return;
      if (queueRef.current.some((queued) => sourcePageKey(queued) === key))
        return;
      queueRef.current.push(page);
      pump();
    },
    [pump],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const page = pageByElementRef.current.get(entry.target);
          if (page) enqueue(page);
        });
      },
      { rootMargin: ROOT_MARGIN },
    );
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      pageByElementRef.current.clear();
      elementByKeyRef.current.clear();
      if (notifyTimerRef.current != null) {
        window.clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = null;
      }
    };
  }, [enqueue]);

  return useMemo<TrackThumbnailStore>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
      get: (key) => resolvedRef.current.get(key) ?? null,
      observe: (page) => (element) => {
        const observer = observerRef.current;
        const key = sourcePageKey(page);
        const previous = elementByKeyRef.current.get(key);
        if (previous && previous !== element) {
          observer?.unobserve(previous);
          pageByElementRef.current.delete(previous);
          elementByKeyRef.current.delete(key);
        }
        if (!element) return;
        elementByKeyRef.current.set(key, element);
        pageByElementRef.current.set(element, page);
        observer?.observe(element);
      },
    }),
    [],
  );
}

/** Subscribes a single tile to its own page's thumbnail. */
export function useTrackThumbnail(
  store: TrackThumbnailStore,
  page: TrackPage,
): string | null {
  const key = sourcePageKey(page);
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(key),
    () => null,
  );
}
