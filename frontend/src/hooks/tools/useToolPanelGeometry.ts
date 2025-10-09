import { useLayoutEffect, useState, RefObject, useRef } from 'react';

export interface ToolPanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseToolPanelGeometryOptions {
  enabled: boolean;
  toolPanelRef: RefObject<HTMLDivElement | null>;
  quickAccessRef: RefObject<HTMLDivElement | null>;
  rightRailRef?: RefObject<HTMLDivElement | null>;
}

export function useToolPanelGeometry({
  enabled,
  toolPanelRef,
  quickAccessRef,
  rightRailRef,
}: UseToolPanelGeometryOptions) {
  const [geometry, setGeometry] = useState<ToolPanelGeometry | null>(null);
  const scheduleUpdateRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    if (!enabled) {
      setGeometry(null);
      return;
    }

    const panelEl = toolPanelRef.current;
    if (!panelEl) {
      setGeometry(null);
      return;
    }

    const rightRailEl = () => (rightRailRef?.current ?? null);

    let rafId: number | null = null;

    const computeAndSetGeometry = () => {
      const rect = panelEl.getBoundingClientRect();
      const rail = rightRailEl();
      const rightOffset = rail ? Math.max(0, window.innerWidth - rail.getBoundingClientRect().left) : 0;
      const width = Math.max(360, window.innerWidth - rect.left - rightOffset);
      const height = Math.max(rect.height, window.innerHeight - rect.top);
      setGeometry({
        left: rect.left,
        top: rect.top,
        width,
        height,
      });
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        computeAndSetGeometry();
        rafId = null;
      });
    };
    scheduleUpdateRef.current = scheduleUpdate;

    // Initial geometry calculation (no debounce)
    computeAndSetGeometry();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      resizeObserver.observe(panelEl);
      if (quickAccessRef.current) {
        resizeObserver.observe(quickAccessRef.current);
      }
      const rail = rightRailEl();
      if (rail) {
        resizeObserver.observe(rail);
      }
      // Observe root element to react to viewport-driven layout changes
      if (document.documentElement) {
        resizeObserver.observe(document.documentElement);
      }
    } else {
      // Fallback for environments without ResizeObserver
      const handleResize = () => scheduleUpdate();
      window.addEventListener('resize', handleResize);
      // Ensure cleanup of the fallback listener
      resizeObserver = {
        disconnect: () => window.removeEventListener('resize', handleResize),
      } as unknown as ResizeObserver;
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      scheduleUpdateRef.current = () => {};
      resizeObserver?.disconnect();
    };
  }, [enabled, quickAccessRef, toolPanelRef, rightRailRef]);

  // Secondary effect: (re)attach observers when refs' .current become available later
  useLayoutEffect(() => {
    if (!enabled) return;
    if (typeof ResizeObserver === 'undefined') return;
    const qa = quickAccessRef.current;
    const rail = rightRailRef?.current ?? null;
    if (!qa && !rail) return;

    const ro = new ResizeObserver(() => scheduleUpdateRef.current());
    if (qa) ro.observe(qa);
    if (rail) ro.observe(rail);
    return () => ro.disconnect();
  }, [enabled, quickAccessRef.current, rightRailRef?.current]);

  return geometry;
}
