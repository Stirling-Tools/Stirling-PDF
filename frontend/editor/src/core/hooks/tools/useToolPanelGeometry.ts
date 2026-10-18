import { useLayoutEffect, useState, RefObject, useRef } from "react";

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
}

interface PanelBox {
  right: number;
  top: number;
  height: number;
}

/**
 * The translate applied by the element and each of its ancestors: the wings
 * slide wrappers, not the elements themselves.
 */
export function translatedBy(el: Element): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const { transform } = window.getComputedStyle(node);
    if (!transform || transform === "none") continue;
    const values = transform
      .slice(transform.indexOf("(") + 1, -1)
      .split(",")
      .map(Number);
    // matrix(a, b, c, d, tx, ty) vs matrix3d(m11…m44, tx, ty, m43, m44)
    const translation = transform.startsWith("matrix3d") ? 12 : 4;
    x += values[translation] ?? 0;
    y += values[translation + 1] ?? 0;
  }
  return { x, y };
}

/**
 * The box the element settles at, with in-flight transforms removed.
 *
 * A rect read mid-slide is off by the animation's current offset.
 */
function settledBox(el: Element): PanelBox {
  const rect = el.getBoundingClientRect();
  const { x, y } = translatedBy(el);
  return {
    right: rect.right - x,
    top: rect.top - y,
    height: rect.height,
  };
}

function computeGeometry(
  panelEl: HTMLDivElement,
  quickAccessRef: RefObject<HTMLDivElement | null>,
): ToolPanelGeometry {
  const rect = settledBox(panelEl);
  const isRTL =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";
  let width: number;
  let left: number;

  if (isRTL) {
    // RTL: panel is on the left, expands rightward
    width = Math.max(360, window.innerWidth - rect.right);
    left = rect.right;
  } else {
    // LTR: panel is on the right, expands leftward to the file sidebar
    const quickAccessRect = quickAccessRef.current
      ? settledBox(quickAccessRef.current)
      : null;
    const leftOffset = quickAccessRect ? quickAccessRect.right : 0;
    width = Math.max(360, rect.right - leftOffset);
    left = leftOffset;
  }
  const height = Math.max(rect.height, window.innerHeight - rect.top);
  return { left, top: rect.top, width, height };
}

export function useToolPanelGeometry({
  enabled,
  toolPanelRef,
  quickAccessRef,
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

    let rafId: number | null = null;

    const computeAndSetGeometry = () => {
      setGeometry(computeGeometry(panelEl, quickAccessRef));
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
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      resizeObserver.observe(panelEl);
      if (quickAccessRef.current) {
        resizeObserver.observe(quickAccessRef.current);
      }
      // Observe root element to react to viewport-driven layout changes
      if (document.documentElement) {
        resizeObserver.observe(document.documentElement);
      }
    } else {
      // Fallback for environments without ResizeObserver
      const handleResize = () => scheduleUpdate();
      window.addEventListener("resize", handleResize);
      // Ensure cleanup of the fallback listener
      resizeObserver = {
        disconnect: () => window.removeEventListener("resize", handleResize),
      } as unknown as ResizeObserver;
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      scheduleUpdateRef.current = () => {};
      resizeObserver?.disconnect();
    };
  }, [enabled, quickAccessRef, toolPanelRef]);

  // Secondary effect: (re)attach observer when quickAccessRef.current becomes available later
  useLayoutEffect(() => {
    if (!enabled) return;
    if (typeof ResizeObserver === "undefined") return;
    const qa = quickAccessRef.current;
    if (!qa) return;

    const ro = new ResizeObserver(() => scheduleUpdateRef.current());
    ro.observe(qa);
    return () => ro.disconnect();
  }, [enabled, quickAccessRef.current]);

  return geometry;
}
