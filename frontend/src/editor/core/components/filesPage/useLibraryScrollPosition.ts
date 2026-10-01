import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
  type UIEvent,
} from "react";

/** Restores list/grid scroll after a view's rows load; positions belong to this mounted host. */
export function useLibraryScrollPosition(
  root: RefObject<HTMLDivElement | null>,
  viewKey: string,
  loading: boolean,
  entryCount: number,
) {
  const positions = useRef(new Map<string, { top: number; left: number }>());
  const restoring = useRef(false);
  useLayoutEffect(() => {
    if (loading) return;
    const container = root.current;
    const scroller =
      container?.querySelector<HTMLElement>(".files-page-list") ??
      container?.querySelector<HTMLElement>(".files-page-content");
    if (!scroller) return;
    const position = positions.current.get(viewKey) ?? { top: 0, left: 0 };
    const restore = () => {
      scroller.scrollTop = position.top;
      scroller.scrollLeft = position.left;
    };
    restoring.current = true;
    restore();
    // Virtual rows need a frame to measure their new scroll container.
    const frame = requestAnimationFrame(() => {
      restore();
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [root, viewKey, loading, entryCount]);
  return useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        restoring.current ||
        loading ||
        !(target instanceof HTMLElement) ||
        !target.matches(".files-page-list, .files-page-content")
      )
        return;
      positions.current.set(viewKey, {
        top: target.scrollTop,
        left: target.scrollLeft,
      });
    },
    [viewKey, loading],
  );
}
