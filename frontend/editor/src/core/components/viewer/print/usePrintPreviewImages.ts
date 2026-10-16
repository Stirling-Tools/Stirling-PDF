import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ViewerContext } from "@app/contexts/viewer/viewerContext";

/** The figure is a preview, so a page renders well below its printed size. */
const PREVIEW_SCALE = 0.5;

/** Renders run a few at a time, as the thumbnail sidebar runs them. */
const PREVIEW_CONCURRENCY = 3;

/** A stable empty list, so a preset with no figure never asks for pages. */
export const NO_PREVIEW_PAGES: number[] = [];

/** What the figure can say about a page: a drawing, a wait, a failure or none. */
export type PreviewPageState = "ready" | "loading" | "failed" | "idle";

/**
 * Where the reader is in the document, so the dialog can name the page it is
 * showing. The count arrives with the document, which can outlast this mount.
 *
 * `active` is false while the reader is not looking at this: the viewer keeps the
 * print dialog mounted when it is closed, and a scroll listener there would
 * re-render the whole dialog on every page the reader turns.
 */
export function usePrintPagePosition(active = true): {
  currentPage: number;
  pageCount: number;
} {
  const viewer = useContext(ViewerContext);
  const [position, setPosition] = useState({ currentPage: 1, pageCount: 0 });

  useEffect(() => {
    if (!viewer || !active) {
      return;
    }

    const state = viewer.getScrollState();
    setPosition({
      currentPage: state.currentPage,
      pageCount: state.totalPages,
    });

    return viewer.registerImmediateScrollUpdate((currentPage, pageCount) =>
      setPosition((current) =>
        current.currentPage === currentPage && current.pageCount === pageCount
          ? current
          : { currentPage, pageCount },
      ),
    );
  }, [viewer, active]);

  return position;
}

/**
 * Renders preview pages through the viewer's own thumbnail engine, so the
 * dialog's figure shows the document rather than a diagram of it.
 *
 * The viewer is optional: outside it the lookup always misses, and the figure
 * draws its placeholder instead. Every blob URL created here is released when
 * the document changes or the dialog unmounts. A page that failed is named as
 * such rather than left looking like blank paper, and `retry` asks again.
 *
 * The page count comes from the caller, which already subscribes to the
 * viewer's scroll position: a second subscription there re-renders the dialog
 * twice for every page the reader turns.
 */
export function usePrintPreviewImages(
  pages: number[],
  pageCount: number,
): {
  pageImage: (page: number) => string | null;
  pageState: (page: number) => PreviewPageState;
  retry: () => void;
} {
  const viewer = useContext(ViewerContext);
  const [images, setImages] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const [attempt, setAttempt] = useState(0);
  const urlsRef = useRef(new Map<number, string>());
  const api = viewer?.getThumbnailAPI() ?? null;
  const documentId = viewer?.activeFileId ?? null;

  // The pages travel as text so a list rebuilt during render cannot restart the
  // renders; only a change to the set of pages does.
  const key = pages.join(",");
  const wanted = useMemo(
    () =>
      key
        .split(",")
        .map(Number)
        .filter((page) => page > 0)
        .sort((a, b) => a - b),
    [key],
  );

  // Previews belong to one document, and this runs before the renders below, so
  // a swap cannot leave the figure showing pages of the document that closed.
  useEffect(() => {
    if (!documentId) {
      return;
    }

    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setImages({});
    setFailed([]);
  }, [documentId]);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    const queue = wanted.filter(
      (page) => page <= pageCount && !urlsRef.current.has(page),
    );

    const renderPage = async (page: number) => {
      try {
        const blob = await api.renderThumb(page - 1, PREVIEW_SCALE).toPromise();
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        urlsRef.current.set(page, url);
        setImages((current) => ({ ...current, [page]: url }));
      } catch (thrown) {
        console.error("[Print] Preview page failed", thrown);
        if (!cancelled) {
          setFailed((current) =>
            current.includes(page) ? current : [...current, page],
          );
        }
      }
    };

    const worker = async () => {
      for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
        if (cancelled) {
          return;
        }
        await renderPage(page);
      }
    };

    void Promise.all(
      Array.from({ length: PREVIEW_CONCURRENCY }, () => worker()),
    );

    return () => {
      cancelled = true;
    };
  }, [api, documentId, pageCount, wanted, attempt]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const retry = useCallback(() => {
    setFailed([]);
    setAttempt((current) => current + 1);
  }, []);

  // Both readers of the render state keep one identity for as long as their
  // inputs do: they are props of the memoized figures, and a new function on
  // every render would re-render the figure this hook exists to feed.
  const pageState = useCallback(
    (page: number): PreviewPageState => {
      if (images[page]) {
        return "ready";
      }
      if (page < 1 || page > pageCount) {
        return "idle";
      }
      if (failed.includes(page)) {
        return "failed";
      }
      return wanted.includes(page) ? "loading" : "idle";
    },
    [images, failed, wanted, pageCount],
  );

  const pageImage = useCallback(
    (page: number) => images[page] ?? null,
    [images],
  );

  return { pageImage, pageState, retry };
}
