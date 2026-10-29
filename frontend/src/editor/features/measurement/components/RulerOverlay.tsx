import { createPortal } from "react-dom";
import "../styles/RulerOverlay.css";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  restorePosition,
  transformPosition,
  transformSize,
  type Rotation,
  type Size,
} from "@embedpdf/models";
import { useViewer } from "@editor/contexts/ViewerContext";
import type {
  MeasureScale,
  Measurement,
  PageMeasureScales,
  PagePoint,
} from "../utils/measurementTypes";
import { polygonArea, polygonPerimeter, rectanglePoints } from "../utils/measurementArea";
import { convertLength, formatMeasurement, type LengthUnit } from "@editor/utils/measurementUnits";
import { validateMeasurement } from "@editor/utils/measurementUtils";
import type { ScaleCalibrationMeasurement } from "@editor/components/viewer/ScaleCalibrationDialog";
import {
  RulerMeasurementLayer,
  type RulerLabelVisibilityMode,
  type RulerRenderedMeasurement,
} from "./RulerMeasurementLayer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

let rulerMeasurementIdCounter = 0;

function createRulerMeasurementId(): string {
  rulerMeasurementIdCounter += 1;
  return `ruler-${Date.now().toString(36)}-${rulerMeasurementIdCounter.toString(36)}`;
}

export interface RulerOverlayHandle {
  clearAll: (silent?: boolean) => void;
  undoMeasurement: () => boolean;
  redoMeasurement: () => boolean;
  deleteById: (id: string) => void;
  selectById: (id: string) => void;
  hasSelection: () => boolean;
  clearSelection: () => void;
  moveById: (id: string) => void;
  cancelMove: () => void;
  getMeasurements: () => Measurement[];
  setMeasurements: (measurements: Measurement[]) => void;
  /** Restore measurements without triggering notification */
  restoreMeasurements: (measurements: Measurement[]) => void;
  /** Register a callback to be notified when measurements change from user actions */
  onMeasurementsChange: (
    callback: (measurements: Measurement[]) => void,
  ) => () => void;
}

interface RulerOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  pageMeasureScales?: PageMeasureScales | null;
  customScale?: MeasureScale | null;
  displayUnit?: string;
  tool?: "length" | "rectangle" | "polygon";
  groups?: {id: string; name: string; color: string; lineWidth?: number}[];
  activeGroup?: string;
  isCalibrationActive?: boolean;
  onCalibrationMeasure?: (measurement: ScaleCalibrationMeasurement) => void;
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function normalizeRotation(rotation: number | null | undefined): Rotation {
  const value =
    typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;
  return ((Math.round(value) % 4) + 4) % 4;
}

function getPageRotation(pageEl: HTMLElement): Rotation {
  return normalizeRotation(Number(pageEl.dataset.pageRotation));
}

function getEffectivePageRotation(
  pageEl: HTMLElement,
  documentRotation: Rotation,
): Rotation {
  return normalizeRotation(getPageRotation(pageEl) + documentRotation);
}

function getPageNaturalSize(
  pageEl: HTMLElement,
  pageRect: DOMRect,
  zoom: number,
  rotation: Rotation,
): Size {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const dataWidth = Number(pageEl.dataset.pageWidth);
  const dataHeight = Number(pageEl.dataset.pageHeight);

  if (
    Number.isFinite(dataWidth) &&
    dataWidth > 0 &&
    Number.isFinite(dataHeight) &&
    dataHeight > 0
  ) {
    return {
      width: dataWidth / safeZoom,
      height: dataHeight / safeZoom,
    };
  }

  const visualWidth = pageRect.width / safeZoom;
  const visualHeight = pageRect.height / safeZoom;
  return rotation % 2 === 0
    ? { width: visualWidth, height: visualHeight }
    : { width: visualHeight, height: visualWidth };
}

function clampToPage(point: Point, pageSize: Size): Point {
  return {
    x: Math.max(0, Math.min(pageSize.width, point.x)),
    y: Math.max(0, Math.min(pageSize.height, point.y)),
  };
}

function clientPointToPagePoint(
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
  zoom: number,
  rotation: Rotation,
): Point {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pageRect = pageEl.getBoundingClientRect();
  const pageSize = getPageNaturalSize(pageEl, pageRect, safeZoom, rotation);
  const rotatedDisplaySize = transformSize(pageSize, rotation, safeZoom);
  const displayPoint = {
    x: clientX - pageRect.left,
    y: clientY - pageRect.top,
  };

  return clampToPage(
    restorePosition(rotatedDisplaySize, displayPoint, rotation, safeZoom),
    pageSize,
  );
}

function pagePointToDisplayPoint(
  pageEl: HTMLElement,
  pageRect: DOMRect,
  point: Point,
  zoom: number,
  rotation: Rotation,
): Point {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pageSize = getPageNaturalSize(pageEl, pageRect, safeZoom, rotation);
  return transformPosition(pageSize, point, rotation, safeZoom);
}

/**
 * Given the start/end PagePoints of a measurement, find the scale from the
 * custom scale, then the viewport whose BBox contains the midpoint, then the
 * first whole-page viewport with bbox=null.
 */
function pickScale(
  start: PagePoint,
  end: PagePoint,
  pageMeasureScales: PageMeasureScales | null | undefined,
  customScale?: MeasureScale | null,
): MeasureScale | null {
  // Cross-page measurements are meaningless — reject regardless of scale source
  if (start.pageIndex !== end.pageIndex) return null;

  // Priority 1: Use custom scale if provided
  if (customScale) return customScale;

  if (!pageMeasureScales) return null;
  const info = pageMeasureScales.get(start.pageIndex);
  if (!info?.viewports.length) return null;

  // Midpoint in screen-space page coords (x left→right, y top→bottom, PDF points)
  const mx = (start.x + end.x) / 2;
  // Flip y: screen y=0 is page top; PDF user space y=0 is page bottom
  const my = info.pageHeight - (start.y + end.y) / 2;

  let fallbackScale: MeasureScale | null = null;

  for (const { bbox, scale } of info.viewports) {
    if (!bbox) {
      fallbackScale ??= scale;
      continue;
    }

    const [x0, y0, x1, y1] = bbox;
    if (
      mx >= Math.min(x0, x1) &&
      mx <= Math.max(x0, x1) &&
      my >= Math.min(y0, y1) &&
      my <= Math.max(y0, y1)
    ) {
      return scale;
    }
  }
  return fallbackScale;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function findScrollEl(root: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if (el === root) continue;
    const { overflow, overflowY, overflowX } = window.getComputedStyle(el);
    if (
      [overflow, overflowY, overflowX].some(
        (v) => v === "auto" || v === "scroll",
      )
    ) {
      return el;
    }
  }
  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select") !== null
  );
}

function findPageAtClientPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const elementsAtPoint = document.elementsFromPoint(clientX, clientY);

  for (const element of elementsAtPoint) {
    const pageEl = element.closest?.("[data-page-index]");
    if (pageEl instanceof HTMLElement && container.contains(pageEl)) {
      return pageEl;
    }
  }

  return null;
}

/**
 * Find the nearest point on the starting page boundary and return it as both
 * an SVG screen coordinate and a PagePoint (page-relative PDF units).
 * Used to clamp the live line when the cursor drifts off the page.
 */
function nearestPageDocPt(
  cursor: Point,
  container: HTMLElement,
  zoom: number,
  documentRotation: Rotation,
  pageIndex: number,
): { screenPt: Point; docPt: PagePoint } | null {
  const pageEl = container.querySelector(
    `[data-page-index="${pageIndex}"]`,
  ) as HTMLElement | null;
  if (!pageEl) return null;

  const cr = container.getBoundingClientRect();
  const r = pageEl.getBoundingClientRect();
  const effectiveRotation = getEffectivePageRotation(pageEl, documentRotation);

  // Page bounds in SVG (container-relative) space
  const left = r.left - cr.left;
  const top = r.top - cr.top;
  const right = r.right - cr.left;
  const bottom = r.bottom - cr.top;

  // Nearest point on this rect to the cursor (SVG space)
  const cx = Math.max(left, Math.min(right, cursor.x));
  const cy = Math.max(top, Math.min(bottom, cursor.y));
  const docPoint = clientPointToPagePoint(
    pageEl,
    cr.left + cx,
    cr.top + cy,
    zoom,
    effectiveRotation,
  );

  return {
    screenPt: { x: cx, y: cy },
    docPt: {
      pageIndex,
      x: docPoint.x,
      y: docPoint.y,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export const RulerOverlay = React.forwardRef<
  RulerOverlayHandle,
  RulerOverlayProps
>(function RulerOverlayImpl(
  {
    containerRef,
    isActive,
    pageMeasureScales,
    customScale,
    displayUnit,
    tool = "length",
    groups = [],
    activeGroup = "default",
    isCalibrationActive = false,
    onCalibrationMeasure,
  }: RulerOverlayProps,
  ref,
) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [firstPt, setFirstPt] = useState<PagePoint | null>(null);
  /** Current cursor in SVG screen-space — for live crosshair and live line rendering. */
  const [cursorS, setCursorS] = useState<Point | null>(null);
  /** Current cursor in page-relative PDF units — for finalising off-page clicks. */
  const [cursorDoc, setCursorDoc] = useState<PagePoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const moveIdRef = useRef<string | null>(null);
  const [snapPoint, setSnapPoint] = useState<PagePoint | null>(null);
  const [labelVisibilityMode, setLabelVisibilityMode] =
    useState<RulerLabelVisibilityMode>("hideSmall");
  const [isDrawThroughActive, setIsDrawThroughActive] = useState(false);

  // Callbacks for explicit measurement changes; restores stay silent.
  const measurementsListenersRef = useRef<
    Set<(measurements: Measurement[]) => void>
  >(new Set());
  const measurementsRef = useRef<Measurement[]>(measurements);

  /**
   * Incremented on scroll to trigger re-renders.
   * We no longer store the scroll value — getBoundingClientRect handles that
   * automatically and is always accurate regardless of scroll position.
   */
  const [, setScrollVersion] = useState(0);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const rulerPageContentRef = useRef<SVGGElement | null>(null);
  const renderedScrollRef = useRef({ left: 0, top: 0 });
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const [areaPoints, setAreaPoints] = useState<PagePoint[]>([]);
  const areaPointsRef = useRef<PagePoint[]>([]);
  const rectStartRef = useRef<PagePoint | null>(null);
  const [rectStart, setRectStart] = useState<PagePoint | null>(null);
  const [pendingEnd, setPendingEnd] = useState<PagePoint | null>(null);
  const pendingEndRef = useRef<PagePoint | null>(null);
  const firstPtRef = useRef<PagePoint | null>(null);
  useEffect(() => {
    firstPtRef.current = firstPt;
  }, [firstPt]);

  // Reset unfinished measurement when switching tools.
  useEffect(() => {
    firstPtRef.current = null;
    pendingEndRef.current = null;
    areaPointsRef.current = [];
    setAreaPoints([]);
    rectStartRef.current = null;
    setRectStart(null);
    setFirstPt(null);
    setPendingEnd(null);
    setCursorS(null);
    setCursorDoc(null);
    setSnapPoint(null);
  }, [tool]);

  const cursorDocRef = useRef<PagePoint | null>(null);
  const wasCalibrationActiveRef = useRef(isCalibrationActive);
  const drawThroughActiveRef = useRef(false);

  const setDrawThroughMode = useCallback((isEnabled: boolean) => {
    drawThroughActiveRef.current = isEnabled;
    setIsDrawThroughActive(isEnabled);

    if (isEnabled) {
      setHoveredId(null);
    }
  }, []);

  const cycleLabelVisibilityMode = useCallback(() => {
    setLabelVisibilityMode((currentMode) => {
      if (currentMode === "hideSmall") {
        return "showAll";
      }

      if (currentMode === "showAll") {
        return "hideAll";
      }

      return "hideSmall";
    });
  }, []);

  const notifyMeasurementsChange = useCallback(
    (nextMeasurements: Measurement[]) => {
      measurementsListenersRef.current.forEach((listener) =>
        listener(nextMeasurements),
      );
    },
    [],
  );

  // Measurement-only history. PDF-viewer undo remains responsible for other edits.
  const undoStackRef = useRef<Measurement[][]>([]);
  const redoStackRef = useRef<Measurement[][]>([]);
  const replayingHistoryRef = useRef(false);
  const historyLimit = 100;
  const replaceMeasurements = useCallback(
    (nextMeasurements: Measurement[], notify = false) => {
      if (notify && !replayingHistoryRef.current &&
          JSON.stringify(measurementsRef.current) !== JSON.stringify(nextMeasurements)) {
        undoStackRef.current.push(structuredClone(measurementsRef.current));
        if (undoStackRef.current.length > historyLimit) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
      measurementsRef.current = nextMeasurements;
      setMeasurements(nextMeasurements);
      if (notify) {
        notifyMeasurementsChange(nextMeasurements);
      }
    },
    [notifyMeasurementsChange],
  );

  const updateMeasurements = useCallback(
    (
      updater: (currentMeasurements: Measurement[]) => Measurement[],
      notify = false,
    ) => {
      replaceMeasurements(updater(measurementsRef.current), notify);
    },
    [replaceMeasurements],
  );

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const viewer = useViewer();
  const { registerImmediateRotationUpdate, registerImmediateZoomUpdate } =
    viewer;

  const [zoom, setZoom] = useState<number>(() => {
    try {
      return viewer.getZoomState().zoomPercent / 100;
    } catch {
      return 1.4;
    }
  });

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [rotation, setRotation] = useState<Rotation>(() => {
    try {
      return normalizeRotation(viewer.getRotationState().rotation);
    } catch {
      return normalizeRotation(0);
    }
  });

  const rotationRef = useRef<Rotation>(rotation);
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    return registerImmediateZoomUpdate((pct) => {
      const newZoom = pct / 100;
      zoomRef.current = newZoom; // immediate for event-listener closures
      setZoom(newZoom); // re-render #1: zoom updated, but PDF.js DOM may not be yet
      // re-render #2: after PDF.js has updated page element dimensions in the DOM,
      // so getBoundingClientRect returns the correct positions for the new zoom level.
      requestAnimationFrame(() => setScrollVersion((n) => n + 1));
    });
  }, [registerImmediateZoomUpdate]);

  useEffect(() => {
    return registerImmediateRotationUpdate((nextRotation) => {
      const normalizedRotation = normalizeRotation(nextRotation);
      rotationRef.current = normalizedRotation;
      setRotation(normalizedRotation);
      requestAnimationFrame(() => setScrollVersion((n) => n + 1));
    });
  }, [registerImmediateRotationUpdate]);

  // ── Layout change tracking (menu close, sidebar toggle, etc.) ──────────────
  // Monitor PDF container for layout changes and force re-render so measurements
  // use updated getBoundingClientRect positions after layout reflow
  useEffect(() => {
    if (!containerRef.current) return;

    const handleLayoutChange = () => {
      // Layout changed - force re-render to recalculate coordinates from getBoundingClientRect
      setScrollVersion((n) => n + 1);
    };

    // Use ResizeObserver if available, otherwise fall back to window resize event
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(handleLayoutChange);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    } else {
      // Fallback for environments without ResizeObserver (legacy browsers, embedded webviews)
      window.addEventListener("resize", handleLayoutChange);
      return () => window.removeEventListener("resize", handleLayoutChange);
    }
  }, [containerRef]);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  // Native scrolling moves the PDF pages before React re-renders this fixed
  // overlay. Translate page-anchored SVG content immediately, then let the next
  // frame render exact coordinates from getBoundingClientRect.

  useLayoutEffect(() => {
    const scrollEl = scrollElRef.current;
    if (scrollEl) {
      renderedScrollRef.current = {
        left: scrollEl.scrollLeft,
        top: scrollEl.scrollTop,
      };
    }
    rulerPageContentRef.current?.removeAttribute("transform");
  });

  const attachScrollEl = useCallback((el: HTMLElement) => {
    scrollCleanupRef.current?.();
    scrollElRef.current = el;
    const handler = () => {
      if (!isActiveRef.current && measurementsRef.current.length === 0) {
        return;
      }

      const dx = renderedScrollRef.current.left - el.scrollLeft;
      const dy = renderedScrollRef.current.top - el.scrollTop;
      if (dx !== 0 || dy !== 0) {
        rulerPageContentRef.current?.setAttribute(
          "transform",
          `translate(${dx} ${dy})`,
        );
      }

      if (scrollRafRef.current !== null) {
        return;
      }

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollVersion((n) => n + 1);
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    scrollCleanupRef.current = () => {
      el.removeEventListener("scroll", handler);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tryAttach = () => {
      const el = findScrollEl(container);
      if (el) {
        attachScrollEl(el);
        return true;
      }
      return false;
    };

    if (!tryAttach()) {
      const timer = setTimeout(() => tryAttach(), 600);
      return () => {
        clearTimeout(timer);
        scrollCleanupRef.current?.();
      };
    }
    return () => scrollCleanupRef.current?.();
  }, [containerRef, attachScrollEl]);

  // Re-find scroll element when zoom changes (PDF.js may recreate the scroll DOM).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = findScrollEl(container);
    if (el && el !== scrollElRef.current) attachScrollEl(el);
  }, [zoom, containerRef, attachScrollEl]);

  // ── Imperative handle ──────────────────────────────────────────────────────
  React.useImperativeHandle(ref, () => ({
    undoMeasurement: () => {
      const previous = undoStackRef.current.pop();
      if (!previous) return false;
      redoStackRef.current.push(structuredClone(measurementsRef.current));
      replayingHistoryRef.current = true;
      replaceMeasurements(previous, true);
      replayingHistoryRef.current = false;
      return true;
    },
    redoMeasurement: () => {
      const next = redoStackRef.current.pop();
      if (!next) return false;
      undoStackRef.current.push(structuredClone(measurementsRef.current));
      replayingHistoryRef.current = true;
      replaceMeasurements(next, true);
      replayingHistoryRef.current = false;
      return true;
    },
    deleteById: (id) => {
      updateMeasurements(ms => ms.filter(m => m.id !== id), true);
      setSelectedId(null); setMenu(null);
    },
    selectById: (id) => { setSelectedId(id); setMenu(null); },
    hasSelection: () => selectedId !== null,
    clearSelection: () => { setSelectedId(null); setHoveredId(null); setMenu(null); },
    moveById: (id) => { moveIdRef.current = id; setMoveId(id); setMenu(null); },
    cancelMove: () => { moveIdRef.current = null; setMoveId(null); },
    clearAll: (silent = false) => {
      firstPtRef.current = null;
      cursorDocRef.current = null;
      if (silent) { undoStackRef.current = []; redoStackRef.current = []; }
      replaceMeasurements([], !silent);
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
      setSelectedId(null);
      setHoveredId(null);
    },
    getMeasurements: () => measurementsRef.current,
    setMeasurements: (newMeasurements: Measurement[]) => {
      // Validate all measurements before setting state
      const validated = newMeasurements.filter((m) => validateMeasurement(m));
      replaceMeasurements(validated, true);
    },
    restoreMeasurements: (newMeasurements: Measurement[]) => {
      undoStackRef.current = []; redoStackRef.current = [];
      replaceMeasurements(
        newMeasurements.filter((measurement) =>
          validateMeasurement(measurement),
        ),
        false,
      );
    },
    onMeasurementsChange: (callback: (measurements: Measurement[]) => void) => {
      measurementsListenersRef.current.add(callback);
      // Return unsubscribe function
      return () => {
        measurementsListenersRef.current.delete(callback);
      };
    },
  }));

  // ── Reset when deactivated ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      firstPtRef.current = null;
      cursorDocRef.current = null;
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
      setSelectedId(null);
      setHoveredId(null);
      setDrawThroughMode(false);
    }
  }, [isActive, setDrawThroughMode]);

  useEffect(() => {
    const wasCalibrationActive = wasCalibrationActiveRef.current;
    wasCalibrationActiveRef.current = isCalibrationActive;

    if (wasCalibrationActive !== isCalibrationActive) {
      firstPtRef.current = null;
      cursorDocRef.current = null;
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
    }
  }, [isCalibrationActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || isEditableKeyboardTarget(e.target)) {
        return;
      }

      e.preventDefault();
      setDrawThroughMode(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setDrawThroughMode(false);
      }
    };

    const onBlur = () => {
      setDrawThroughMode(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setDrawThroughMode(false);
    };
  }, [isActive, setDrawThroughMode]);

  // ── Mouse events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!isActive || !el) return;

    const toScreenPt = (e: MouseEvent): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    /**
     * Convert a mouse event to a page-relative PagePoint.
     * Returns null if the cursor is not over a page.
     */
    const toDocPagePt = (e: MouseEvent): PagePoint | null => {
      const pageEl = findPageAtClientPoint(el, e.clientX, e.clientY);
      if (!pageEl) return null;
      const pageIndex = parseInt(pageEl.dataset.pageIndex ?? "0", 10);
      const z = zoomRef.current;
      const effectiveRotation = getEffectivePageRotation(
        pageEl,
        rotationRef.current,
      );
      const docPoint = clientPointToPagePoint(
        pageEl,
        e.clientX,
        e.clientY,
        z,
        effectiveRotation,
      );
      const point = {pageIndex, x:docPoint.x, y:docPoint.y};
      if (moveIdRef.current) return point;
      let best: PagePoint | null = null;
      let bestDistance = 12;
      for (const m of measurementsRef.current) {
        const vertices = m.points?.length ? m.points : [m.start,m.end];
        for (const v of vertices) {
          if (v.pageIndex !== pageIndex) continue;
          const display = pagePointToDisplayPoint(pageEl, pageEl.getBoundingClientRect(), v, z, effectiveRotation);
          const r = pageEl.getBoundingClientRect();
          const distance = Math.hypot(e.clientX-r.left-display.x,e.clientY-r.top-display.y);
          if (distance < bestDistance) { bestDistance=distance; best=v; }
        }
      }
      return best ?? point;
    };

    const clearCursor = () => {
      setCursorS(null);
      setCursorDoc(null);
      cursorDocRef.current = null;
    };

    const onMove = (e: MouseEvent) => {
      const screenPt = toScreenPt(e);
      const docPt = toDocPagePt(e);

      if (docPt) {
        el.style.cursor = "crosshair";
        setCursorS(screenPt);
        setCursorDoc(docPt);
        cursorDocRef.current = docPt;
        const nearest = measurementsRef.current.some(m => (m.points?.length ? m.points : [m.start,m.end]).some(p => p.pageIndex === docPt.pageIndex && Math.hypot(p.x-docPt.x,p.y-docPt.y)<0.001));
        setSnapPoint(nearest ? docPt : null);
      } else if (firstPtRef.current !== null) {
        // First point placed, cursor wandered off page — clamp to nearest edge
        el.style.cursor = "crosshair";
        const result = nearestPageDocPt(
          screenPt,
          el,
          zoomRef.current,
          rotationRef.current,
          firstPtRef.current.pageIndex,
        );
        if (result) {
          setCursorS(result.screenPt);
          setCursorDoc(result.docPt);
          cursorDocRef.current = result.docPt;
        }
      } else {
        el.style.cursor = "default";
        clearCursor();
      }
    };

    const saveArea = (kind: "rectangle" | "area", points: PagePoint[]) => {
      if (points.length < 3 || polygonArea(points) <= 0) return;
      updateMeasurements(m => [...m, {
        id: createRulerMeasurementId(), kind, points,
        start: points[0], end: points[points.length - 1], groupId: activeGroup,
      }], true);
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (target.closest?.("[data-ruler-control]")) return;
      if (target.closest?.("button, select, input, textarea")) return;
      const snapped = toDocPagePt(e);
      const nearExisting = snapped && measurementsRef.current.find(m =>
        (m.points?.length ? m.points : [m.start,m.end]).some(p => p.pageIndex === snapped.pageIndex && Math.hypot(p.x-snapped.x,p.y-snapped.y)<0.001));
      if (moveIdRef.current) {
        const targetPoint = toDocPagePt(e);
        const id = moveIdRef.current;
        const current = measurementsRef.current.find(m => m.id === id);
        if (targetPoint && current && current.start.pageIndex === targetPoint.pageIndex) {
          const dx = targetPoint.x-current.start.x;
          const dy = targetPoint.y-current.start.y;
          const shift = (p: PagePoint): PagePoint => ({...p,x:p.x+dx,y:p.y+dy});
          updateMeasurements(ms => ms.map(m => m.id === id ? {...m,start:shift(m.start),end:shift(m.end),points:m.points?.map(shift)} : m),true);
        }
        moveIdRef.current=null; setMoveId(null); e.preventDefault(); return;
      }
      if (!isCalibrationActive && tool === "rectangle") {
        const pt = toDocPagePt(e);
        if (!pt) return;
        const start = rectStartRef.current;
        if (!start) { rectStartRef.current=pt; setRectStart(pt); }
        else if (start.pageIndex === pt.pageIndex) {
          saveArea("rectangle",rectanglePoints(start,pt));
          rectStartRef.current=null; setRectStart(null);
        }
        e.preventDefault(); return;
      }
      if (!isCalibrationActive && tool === "polygon") {
        const pt = toDocPagePt(e);
        if (!pt) return;
        const prev = areaPointsRef.current;
        if (prev.length && pt.pageIndex !== prev[0].pageIndex) return;
        const first = prev[0];
        // Close by clicking within 12 screen pixels of first vertex.
        if (first && prev.length >= 3) {
          const pageEl = el.querySelector(`[data-page-index="${first.pageIndex}"]`) as HTMLElement | null;
          if (pageEl) {
            const rect = pageEl.getBoundingClientRect();
            const rot = getEffectivePageRotation(pageEl, rotationRef.current);
            const a = pagePointToDisplayPoint(pageEl, rect, first, zoomRef.current, rot);
            const b = pagePointToDisplayPoint(pageEl, rect, pt, zoomRef.current, rot);
            if (Math.hypot(a.x-b.x, a.y-b.y) <= 12) {
              saveArea("area", prev);
              areaPointsRef.current = []; setAreaPoints([]);
              e.preventDefault(); return;
            }
          }
        }
        areaPointsRef.current = [...prev, pt];
        setAreaPoints(areaPointsRef.current);
        e.preventDefault(); return;
      }

      const hasMeasurementInProgress =
        firstPtRef.current !== null ||
        pendingEndRef.current !== null ||
        drawThroughActiveRef.current || e.altKey;
      if (
        !hasMeasurementInProgress &&
        target.closest?.("[data-ruler-interactive]") && !nearExisting
      ) {
        return;
      }

      const dp = toDocPagePt(e);
      const overPage = dp !== null;
      if (!overPage && firstPtRef.current === null &&
          pendingEndRef.current === null) return;
      e.preventDefault();

      const nextPoint = dp ?? cursorDocRef.current;
      if (!nextPoint) return;

      const prev = firstPtRef.current;
      const lockedEnd = pendingEndRef.current;

      if (prev && lockedEnd && !isCalibrationActive) {
        const dx = lockedEnd.x - prev.x;
        const dy = lockedEnd.y - prev.y;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const offset = (
            -(nextPoint.x - prev.x) * dy +
            (nextPoint.y - prev.y) * dx
          ) / length;

          updateMeasurements(
            (m) => [...m, {
              id: createRulerMeasurementId(),
              start: prev,
              end: lockedEnd,
              offset,
              groupId: activeGroup,
            }],
            true,
          );
        }
        pendingEndRef.current = null;
        setPendingEnd(null);
        firstPtRef.current = null;
        setFirstPt(null);
        return;
      }

      if (!prev) {
        firstPtRef.current = nextPoint;
        setFirstPt(nextPoint);
        setSelectedId(null);
        setHoveredId(null);
        return;
      }

      // CRITICAL: Reject cross-page measurements
      // Measurements must have both points on the same page
      if (prev.pageIndex !== nextPoint.pageIndex) {
        // Reset first point so user can start fresh on same page
        firstPtRef.current = null;
        cursorDocRef.current = null;
        setFirstPt(null);
        setCursorS(null);
        setCursorDoc(null);
        return;
      }

      if (!isCalibrationActive) {
        if (dist(prev, nextPoint) > 0) {
          pendingEndRef.current = nextPoint;
          setPendingEnd(nextPoint);
        }
        return;
      }

      firstPtRef.current = null;
      setFirstPt(null);

      if (isCalibrationActive) {
        const distancePts = dist(prev, nextPoint);
        if (distancePts > 0) {
          onCalibrationMeasure?.({
            start: prev,
            end: nextPoint,
            pdfDistancePts: distancePts,
          });
        }
        return;
      }

      const id = createRulerMeasurementId();
      updateMeasurements(
        (m) => [...m, { id, start: prev, end: nextPoint, groupId: activeGroup }],
        true,
      );
    };

    const onLeave = () => {
      el.style.cursor = "";
      if (firstPtRef.current === null) clearCursor();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" &&
          firstPtRef.current && pendingEndRef.current &&
          !isCalibrationActive) {
        updateMeasurements(
          (m) => [...m, {
            id: createRulerMeasurementId(),
            start: firstPtRef.current!,
            end: pendingEndRef.current!,
            offset: 0,
            groupId: activeGroup,
          }],
          true,
        );
        pendingEndRef.current = null;
        setPendingEnd(null);
        firstPtRef.current = null;
        setFirstPt(null);
        e.preventDefault();
        return;
      }
      if (tool === "polygon" && !isCalibrationActive && e.key === "Backspace" && areaPointsRef.current.length) {
        areaPointsRef.current = areaPointsRef.current.slice(0, -1);
        setAreaPoints(areaPointsRef.current);
        e.preventDefault(); return;
      }
      if (e.key === "Escape") {
        moveIdRef.current=null; setMoveId(null); setMenu(null);
        areaPointsRef.current = []; setAreaPoints([]);
        rectStartRef.current = null; setRectStart(null);
        pendingEndRef.current = null;
        setPendingEnd(null);
        firstPtRef.current = null;
        cursorDocRef.current = null;
        setFirstPt(null);
        setCursorS(null);
        setCursorDoc(null);
      }
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("click", onClick, true);
    el.addEventListener("mouseleave", onLeave);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("keydown", onKey);
      el.style.cursor = "";
    };
  }, [
    containerRef,
    isActive,
    tool,
    activeGroup,
    isCalibrationActive,
    onCalibrationMeasure,
    updateMeasurements,
  ]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
        setHoveredId(null);
        setMenu(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !isEditableKeyboardTarget(e.target)) {
        e.preventDefault();
        updateMeasurements(ms => ms.filter(m => m.id !== selectedId),true);
        setSelectedId(null); setMenu(null);
      }
    };
    document.addEventListener("keydown",key);
    return () => document.removeEventListener("keydown",key);
  },[selectedId,updateMeasurements]);

  const deleteMeasurement = useCallback(
    (id: string) => {
      updateMeasurements((prev) => prev.filter((m) => m.id !== id), true);
      // Close expanded label if the deleted measurement was selected
      if (selectedId === id) {
        setSelectedId(null);
      }
      if (hoveredId === id) {
        setHoveredId(null);
      }
    },
    [hoveredId, selectedId, updateMeasurements],
  );

  if (!isActive && measurements.length === 0) return null;

  // ── PagePoint → SVG screen coordinates ────────────────────────────────────
  /**
   * Convert a page-anchored point to SVG screen coordinates.
   *
   * Uses getBoundingClientRect so the browser computes the exact screen position
   * accounting for scroll, zoom, page margins, centering — everything. This is
   * why we no longer need to track scroll offsets.
   *
   * Returns null if the page element isn't in the DOM (shouldn't happen with
   * PDF.js placeholder divs, but guard anyway).
   */
  const pagePointToScreen = (pt: PagePoint): Point | null => {
    const container = containerRef.current;
    if (!container) return null;
    const pageEl = container.querySelector(
      `[data-page-index="${pt.pageIndex}"]`,
    ) as HTMLElement | null;
    if (!pageEl) return null;
    const pageRect = pageEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const effectiveRotation = getEffectivePageRotation(pageEl, rotation);
    const displayPoint = pagePointToDisplayPoint(
      pageEl,
      pageRect,
      pt,
      zoom,
      effectiveRotation,
    );
    return {
      x: pageRect.left - containerRect.left + displayPoint.x,
      y: pageRect.top - containerRect.top + displayPoint.y,
    };
  };

  const firstPtS = firstPt ? pagePointToScreen(firstPt) : null;
  const renderedMeasurements = measurements.reduce<RulerRenderedMeasurement[]>(
    (items, measurement) => {
      if (measurement.kind === "area" || measurement.kind === "rectangle") return items;
      const startS = pagePointToScreen(measurement.start);
      const endS = pagePointToScreen(measurement.end);
      if (!startS || !endS) {
        return items;
      }

      const measureScale = pickScale(
        measurement.start,
        measurement.end,
        pageMeasureScales,
        customScale,
      );

      const offsetEndS =
        measurement.offset && measurement.offset !== 0
          ? pagePointToScreen({
              ...measurement.start,
              x: measurement.start.x -
                (measurement.end.y - measurement.start.y) *
                measurement.offset /
                (dist(measurement.start, measurement.end) || 1),
              y: measurement.start.y +
                (measurement.end.x - measurement.start.x) *
                measurement.offset /
                (dist(measurement.start, measurement.end) || 1),
            })
          : null;

      const screenDx = endS.x - startS.x;
      const screenDy = endS.y - startS.y;
      const screenLength = Math.hypot(screenDx, screenDy);
      const screenOffset = offsetEndS && screenLength > 0
        ? (
            -(offsetEndS.x - startS.x) * screenDy +
            (offsetEndS.y - startS.y) * screenDx
          ) / screenLength
        : 0;

      items.push({
        measurement,
        startS,
        endS,
        distPts: dist(measurement.start, measurement.end),
        measureScale,
        offset: screenOffset,
      });
      return items;
    },
    [],
  );
  const pendingPreview =
    isActive && !isCalibrationActive &&
    firstPt && pendingEnd && cursorDoc
      ? (() => {
          const dx = pendingEnd.x - firstPt.x;
          const dy = pendingEnd.y - firstPt.y;
          const length = Math.hypot(dx, dy);
          if (length === 0 || cursorDoc.pageIndex !== firstPt.pageIndex) {
            return null;
          }

          const offset = (
            -(cursorDoc.x - firstPt.x) * dy +
            (cursorDoc.y - firstPt.y) * dx
          ) / length;

          const startS = pagePointToScreen(firstPt);
          const endS = pagePointToScreen(pendingEnd);
          if (!startS || !endS) return null;

          return {
            measurement: {
              id: "__offset_preview__",
              start: firstPt,
              end: pendingEnd,
              offset,
            },
            startS,
            endS,
            distPts: length,
            offset: (() => {
              const shiftedS = pagePointToScreen({
                ...firstPt,
                x: firstPt.x - dy * offset / length,
                y: firstPt.y + dx * offset / length,
              });
              if (!shiftedS) return 0;
              const sx = endS.x - startS.x;
              const sy = endS.y - startS.y;
              const sl = Math.hypot(sx, sy);
              return sl > 0
                ? (-(shiftedS.x - startS.x) * sy +
                    (shiftedS.y - startS.y) * sx) / sl
                : 0;
            })(),
            measureScale: pickScale(
              firstPt,
              pendingEnd,
              pageMeasureScales,
              customScale,
            ),
          };
        })()
      : null;

  const isMeasurementInteractionPassthroughActive =
    firstPt !== null || isDrawThroughActive;
  const pendingEndS = pendingEnd ? pagePointToScreen(pendingEnd) : null;
  const liveLine =
    isActive && (tool === "length" || isCalibrationActive) && firstPtS && cursorS && !pendingEnd
      ? {
          startS: firstPtS,
          endS: cursorS,
          measureScale:
            !isCalibrationActive && firstPt && cursorDoc
              ? pickScale(firstPt, cursorDoc, pageMeasureScales, customScale)
              : null,
        }
      : null;

  const areaRender = measurements.filter(m => (m.kind === "area" || m.kind === "rectangle") && m.points?.length).map(m => ({m, points: m.points!.map(pagePointToScreen)})).filter(v => v.points.every(Boolean));
  const previewPoints = tool === "rectangle" && rectStart && cursorDoc && rectStart.pageIndex === cursorDoc.pageIndex
    ? rectanglePoints(rectStart, cursorDoc)
    : tool === "polygon" && areaPoints.length
      ? [...areaPoints, ...(cursorDoc && cursorDoc.pageIndex === areaPoints[0].pageIndex ? [cursorDoc] : [])]
      : [];
  const previewScreen = previewPoints.map(pagePointToScreen).filter((p): p is Point => !!p);
  const areaShapes = [...areaRender.map(v => ({points: v.points as Point[], m: v.m, preview: false})), ...(previewScreen.length > 1 ? [{points: previewScreen, m: null, preview: true}] : [])];
  const textZoom = Math.max(0.25, zoom);
  const areaColor = (m: Measurement | null) => groups.find(g => g.id === (m?.groupId ?? activeGroup))?.color ?? "#299bff";
  const areaLineWidth = (m: Measurement | null) => m?.lineWidth ?? groups.find(g => g.id === (m?.groupId ?? activeGroup))?.lineWidth ?? 2;
  const areaScale = (m: Measurement | null) => {
    const pt = m?.start ?? previewPoints[0];
    return pt ? pickScale(pt, pt, pageMeasureScales, customScale) : null;
  };
  const toDisplay = (pdfLength: number, scale: MeasureScale | null, area = false) => {
    // Never present PDF paper dimensions as real-world quantities.
    if (!scale || !Number.isFinite(scale.factor) || scale.factor <= 0) return "Kalibrer";
    const source = (scale?.unit ?? "m") as LengthUnit;
    const target = (displayUnit ?? "m") as LengthUnit;
    const units = ["mm","cm","m","km","in","ft","yd","mi"];
    const from = units.includes(source) ? source : "m";
    const to = units.includes(target) ? target : "m";
    const value = pdfLength * (scale?.factor ?? 0.0254 / 72);
    const converted = convertLength(value, from, to);
    // Areas are already in squared PDF points; square the unit conversion factor, not the area.
    const convertedArea = pdfLength * Math.pow(convertLength(scale?.factor ?? 0.0254 / 72, from, to), 2);
    return formatMeasurement(area ? convertedArea : converted, to, area ? "area" : "length");
  };
  return (
    <>
    {/* icon-lint-allow: runtime-generated-svg */} -- ruler geometry is computed from the page
    <svg
      className="ruler-overlay"
      onContextMenu={(e) => {
        const target = (e.target as Element).closest("[data-measurement-id]");
        const id = target?.getAttribute("data-measurement-id");
        if (id) { e.preventDefault(); setSelectedId(id); setMenu({id,x:e.clientX,y:e.clientY}); }
      }}
      onClick={(e) => {
        // Close expanded label if clicking on empty SVG area
        if (e.target === e.currentTarget) {
          setSelectedId(null);
        }
      }}
    >
      <defs>
        <filter id="ruler-shadow" x="-20%" y="-50%" width="140%" height="200%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="2"
            floodColor="rgba(0,0,0,0.22)"
          />
        </filter>
      </defs>

      <g className="ruler-overlay__areas">
        {areaShapes.map((shape, i) => {
          const pts = shape.points;
          const color = areaColor(shape.m);
          const scale = areaScale(shape.m);
          const raw = shape.m?.points ?? previewPoints;
          const cx = pts.reduce((sum,p) => sum+p.x,0)/pts.length;
          const cy = pts.reduce((sum,p) => sum+p.y,0)/pts.length;
          return <g key={shape.m?.id ?? "area-preview"} data-ruler-interactive={shape.m ? "true" : undefined}
            className={shape.m ? "ruler-overlay__shape ruler-overlay__shape--interactive" : "ruler-overlay__shape"}
            onClick={e => {if (!shape.m) return; e.stopPropagation(); setSelectedId(shape.m.id);}}
            onContextMenu={e => {if (!shape.m) return; e.preventDefault(); e.stopPropagation(); setSelectedId(shape.m.id); setMenu({id:shape.m.id,x:e.clientX,y:e.clientY});}}>

            <polygon points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={areaLineWidth(shape.m)+(shape.m?.id===selectedId?1.5:0)} strokeDasharray={shape.preview ? "6 4" : undefined}/>
            {raw.length >= 3 && <text x={cx} y={cy} fill={color} fontSize={14 * textZoom} fontWeight={700} textAnchor="middle" className="ruler-overlay__label" strokeWidth={3 * textZoom}>{toDisplay(polygonArea(raw), scale, true)}</text>}
            {pts.map((p,j) => {
              if (shape.preview && j === pts.length-1) return null;
              const q = pts[(j+1)%pts.length];
              const a = raw[j], b = raw[(j+1)%raw.length];
              if (!a || !b) return null;
              const len = Math.hypot(a.x-b.x,a.y-b.y);
              return <text key={j} x={(p.x+q.x)/2} y={(p.y+q.y)/2-5 * textZoom} fill={color} fontSize={11 * textZoom} textAnchor="middle" className="ruler-overlay__label" strokeWidth={3 * textZoom}>{toDisplay(len,scale)}</text>;
            })}
            {!shape.preview && raw.length>=3 && <text x={cx} y={cy+18 * textZoom} fill={color} fontSize={11 * textZoom} textAnchor="middle" className="ruler-overlay__label" strokeWidth={3 * textZoom}>Omkrets {toDisplay(polygonPerimeter(raw),scale)}</text>}
          </g>;
        })}
      </g>
      {snapPoint && isActive && (()=>{const p=pagePointToScreen(snapPoint);return p ? <circle className="ruler-overlay__snap" cx={p.x} cy={p.y} r={6} strokeWidth={2}/> : null;})()}
      <RulerMeasurementLayer
        groupColors={Object.fromEntries(groups.map(g => [g.id, g.color]))}
        displayUnit={displayUnit}
        measurements={
          pendingPreview
            ? [...renderedMeasurements, pendingPreview]
            : renderedMeasurements
        }
        zoom={zoom}
        selectedId={selectedId}
        hoveredId={hoveredId}
        labelVisibilityMode={labelVisibilityMode}
        isInteractionPassthroughActive={
          isMeasurementInteractionPassthroughActive
        }
        liveLine={liveLine}
        firstPoint={isActive ? firstPtS : null}
        cursor={isActive ? cursorS : null}
        pageContentRef={rulerPageContentRef}
        onSelect={setSelectedId}
        onDelete={deleteMeasurement}
        onHoverChange={setHoveredId}
        onClearAll={() => {
          replaceMeasurements([], true);
          setSelectedId(null);
          setHoveredId(null);
        }}
        onCycleLabelVisibilityMode={cycleLabelVisibilityMode}
      />
    </svg>
    {menu && createPortal(<div className="ruler-overlay__menu" style={{left:Math.min(menu.x,window.innerWidth-200),top:Math.min(menu.y,window.innerHeight-150)}}>
      {[["Flytt",()=>{moveIdRef.current=menu.id;setMoveId(menu.id);setMenu(null);}],
        ["Endre gruppe",()=>{const chosen=window.prompt("Gruppe: "+groups.map(g=>g.name+" ("+g.id+")").join(", "),activeGroup);if(chosen && groups.some(g=>g.id===chosen)){updateMeasurements(ms=>ms.map(m=>m.id===menu.id?{...m,groupId:chosen}:m),true);}setMenu(null);}],
        ["Slett",()=>{updateMeasurements(ms=>ms.filter(m=>m.id!==menu.id),true);setSelectedId(null);setMenu(null);}]] .map(([label,fn])=><button key={label as string} type="button" onClick={fn as ()=>void} className="ruler-overlay__menu-item">{label as string}</button>)}
      <button type="button" onClick={()=>setMenu(null)} className="ruler-overlay__menu-item ruler-overlay__menu-item--close">Lukk</button>
    </div>,document.body)}
    </>
  );
});

RulerOverlay.displayName = "RulerOverlay";
