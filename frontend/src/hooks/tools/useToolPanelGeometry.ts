import { useLayoutEffect, useState, RefObject } from 'react';

export interface ToolPanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseToolPanelGeometryOptions {
  enabled: boolean;
  toolPanelRef: RefObject<HTMLDivElement>;
  quickAccessRef: RefObject<HTMLDivElement>;
}

export function useToolPanelGeometry({
  enabled,
  toolPanelRef,
  quickAccessRef,
}: UseToolPanelGeometryOptions) {
  const [geometry, setGeometry] = useState<ToolPanelGeometry | null>(null);

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

    const rightRailEl = () => document.querySelector('[data-sidebar="right-rail"]') as HTMLElement | null;

    let timeoutId: number | null = null;

    const updateGeometry = () => {
      // Debounce: clear any pending update
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      // Schedule update after 150ms of inactivity
      timeoutId = window.setTimeout(() => {
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
        timeoutId = null;
      }, 150);
    };

    // Initial geometry calculation (no debounce)
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

    const handleResize = () => updateGeometry();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateGeometry());
      resizeObserver.observe(panelEl);
      if (quickAccessRef.current) {
        resizeObserver.observe(quickAccessRef.current);
      }
      const rail = rightRailEl();
      if (rail) {
        resizeObserver.observe(rail);
      }
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [enabled, quickAccessRef, toolPanelRef]);

  return geometry;
}
