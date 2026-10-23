import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  restorePosition,
  transformPosition,
  transformSize,
  type Rotation,
  type Size,
} from "@embedpdf/models";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import { useViewerIsPanning } from "@editor/components/viewer/useViewerIsPanning";
import type {
  MeasurementKind,
  MeasureScale,
  PagePoint,
} from "@editor/utils/measurementTypes";
import {
  MEASUREMENT_COLORS,
  formatArea,
  formatLength,
  formatMeasurementValue,
  formatPaperDistance,
  generateScaleLabel,
  minPointsFor,
  pathLength,
  polygonArea,
  segmentLength,
} from "@editor/utils/measurementUtils";
import {
  describeMeasurement,
  viewAngle,
} from "@editor/utils/measurementDescription";
import {
  measurementEdges,
  snapPoint,
  type SnapGuide,
  type SnapResult,
} from "@editor/utils/measurementSnapping";
import {
  RulerMeasurementLayer,
  type RulerDraft,
  type RulerRenderedMeasurement,
} from "@editor/components/viewer/RulerMeasurementLayer";

interface Point {
  x: number;
  y: number;
}

interface RulerOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

/** Screen distance within which clicking the first corner closes an area. */
const CLOSE_PX = 10;
/** Pointer travel that turns a press on a handle into a drag rather than a click. */
const DRAG_START_PX = 3;
const CALIBRATION_COLOR = MEASUREMENT_COLORS[3];

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

/**
 * Page point → SVG coordinate projector for one render. Caches each page's
 * element, rect and size and the container rect, so projecting many points
 * costs one layout read per page rather than one per point.
 */
function createScreenProjector(
  container: HTMLElement | null,
  zoom: number,
  documentRotation: Rotation,
): (pt: PagePoint) => Point | null {
  if (!container) return () => null;
  const containerRect = container.getBoundingClientRect();
  const pages = new Map<
    number,
    { pageEl: HTMLElement; pageRect: DOMRect; rotation: Rotation } | null
  >();
  const pageFor = (pageIndex: number) => {
    if (!pages.has(pageIndex)) {
      const pageEl = container.querySelector(
        `[data-page-index="${pageIndex}"]`,
      ) as HTMLElement | null;
      pages.set(
        pageIndex,
        pageEl
          ? {
              pageEl,
              pageRect: pageEl.getBoundingClientRect(),
              rotation: getEffectivePageRotation(pageEl, documentRotation),
            }
          : null,
      );
    }
    return pages.get(pageIndex) ?? null;
  };
  return (pt) => {
    const page = pageFor(pt.pageIndex);
    if (!page) return null;
    const display = pagePointToDisplayPoint(
      page.pageEl,
      page.pageRect,
      pt,
      zoom,
      page.rotation,
    );
    return {
      x: page.pageRect.left - containerRect.left + display.x,
      y: page.pageRect.top - containerRect.top + display.y,
    };
  };
}

interface SnapModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface VertexDrag {
  id: string;
  index: number;
  kind: MeasurementKind;
  points: PagePoint[];
  moved: boolean;
}

/**
 * Draws the shared measurements over the viewer's pages. While the Measure
 * tool is open (and pan mode is off) it also creates measurements of the
 * selected kind and lets the selected one's vertices be dragged; meanwhile
 * MeasureInteractionLock keeps the viewer's own pointer handling paused.
 */
export function RulerOverlay({ containerRef }: RulerOverlayProps) {
  const { t } = useTranslation();
  const {
    isToolOpen,
    measurements,
    mode,
    selectedId,
    setSelectedId,
    settings,
    scaleFor,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
    submitCalibrationSample,
    setDraftPointCount,
    registerDrawingActions,
    registerPageViewProvider,
    notifyPageViewChange,
    pageViewFor,
    pageViewVersion,
  } = useMeasurements();

  const viewer = useViewer();
  const { registerImmediateRotationUpdate, registerImmediateZoomUpdate } =
    viewer;
  const isPanning = useViewerIsPanning();
  const isActive = isToolOpen && !isPanning;
  const [draftPoints, setDraftPoints] = useState<PagePoint[]>([]);
  /** Cursor in SVG screen space, for the crosshair and the live segment. */
  const [cursorS, setCursorS] = useState<Point | null>(null);
  /** Cursor in page space after snapping/constraining: the next point. */
  const [cursorDoc, setCursorDoc] = useState<PagePoint | null>(null);
  const [snap, setSnap] = useState<Pick<SnapResult, "vertex" | "guides">>({
    vertex: null,
    guides: [],
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDrawThroughActive, setIsDrawThroughActive] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    points: PagePoint[];
  } | null>(null);

  /** Bumped on scroll and layout changes so positions are re-read from the DOM. */
  const [scrollVersion, setScrollVersion] = useState(0);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const rulerPageContentRef = useRef<SVGGElement | null>(null);
  const renderedScrollRef = useRef({ left: 0, top: 0 });
  const draftRef = useRef<PagePoint[]>([]);
  const cursorDocRef = useRef<PagePoint | null>(null);
  const drawThroughActiveRef = useRef(false);
  const dragRef = useRef<VertexDrag | null>(null);
  const suppressClickRef = useRef(false);
  const measurementsRef = useRef(measurements);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    measurementsRef.current = measurements;
  }, [measurements]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const setDraft = useCallback((points: PagePoint[]) => {
    draftRef.current = points;
    setDraftPoints(points);
  }, []);

  const clearCursor = useCallback(() => {
    cursorDocRef.current = null;
    setCursorS(null);
    setCursorDoc(null);
    setSnap({ vertex: null, guides: [] });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft([]);
    clearCursor();
  }, [clearCursor, setDraft]);

  const setDrawThroughMode = useCallback((isEnabled: boolean) => {
    drawThroughActiveRef.current = isEnabled;
    setIsDrawThroughActive(isEnabled);
    if (isEnabled) setHoveredId(null);
  }, []);

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
      zoomRef.current = newZoom;
      setZoom(newZoom);
      // A second render once the viewer has resized its page elements, so
      // getBoundingClientRect reflects the new zoom.
      requestAnimationFrame(() => setScrollVersion((n) => n + 1));
    });
  }, [registerImmediateZoomUpdate]);

  useEffect(() => {
    return registerImmediateRotationUpdate((nextRotation) => {
      const normalizedRotation = normalizeRotation(nextRotation);
      rotationRef.current = normalizedRotation;
      setRotation(normalizedRotation);
      requestAnimationFrame(() => {
        setScrollVersion((n) => n + 1);
        notifyPageViewChange();
      });
    });
  }, [notifyPageViewChange, registerImmediateRotationUpdate]);

  useEffect(
    () =>
      registerPageViewProvider((pageIndex) => {
        const pageEl = containerRef.current?.querySelector(
          `[data-page-index="${pageIndex}"]`,
        ) as HTMLElement | null;
        if (!pageEl) return null;
        const rotation = getEffectivePageRotation(pageEl, rotationRef.current);
        const size = getPageNaturalSize(
          pageEl,
          pageEl.getBoundingClientRect(),
          zoomRef.current,
          rotation,
        );
        return { ...size, rotation };
      }),
    [containerRef, registerPageViewProvider],
  );

  // Sidebars and panels opening move the pages without a scroll event.
  useEffect(() => {
    if (!containerRef.current) return;
    const handleLayoutChange = () => setScrollVersion((n) => n + 1);
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(handleLayoutChange);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
    window.addEventListener("resize", handleLayoutChange);
    return () => window.removeEventListener("resize", handleLayoutChange);
  }, [containerRef]);

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
      if (scrollRafRef.current !== null) return;
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

  // The viewer may recreate its scroll element on zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = findScrollEl(container);
    if (el && el !== scrollElRef.current) attachScrollEl(el);
  }, [zoom, containerRef, attachScrollEl]);

  useEffect(() => {
    if (!isActive) {
      resetDraft();
      setHoveredId(null);
      setDrawThroughMode(false);
    }
  }, [isActive, resetDraft, setDrawThroughMode]);

  useEffect(() => {
    resetDraft();
  }, [mode, resetDraft]);

  useEffect(() => {
    setDraftPointCount(draftPoints.length);
  }, [draftPoints.length, setDraftPointCount]);

  /**
   * Snap a raw pointer position. Shift locks the angle; Ctrl or Cmd turns
   * snapping off. `exclude` is a vertex being dragged, which must not snap to
   * itself.
   */
  const resolvePoint = useCallback(
    (
      raw: PagePoint,
      anchor: PagePoint | null,
      modifiers: SnapModifiers,
      exclude?: { id: string; index: number },
    ): SnapResult => {
      const vertices: PagePoint[] = [];
      const edges: [PagePoint, PagePoint][] = [];
      for (const m of measurementsRef.current) {
        m.points.forEach((pt, index) => {
          if (exclude?.id !== m.id || exclude.index !== index)
            vertices.push(pt);
        });
        if (exclude?.id !== m.id) edges.push(...measurementEdges(m));
      }
      vertices.push(...draftRef.current);
      const snappingOff = modifiers.ctrlKey || modifiers.metaKey;
      return snapPoint(raw, {
        anchor,
        vertices,
        edges,
        pxToPage: 1 / (zoomRef.current || 1),
        snapToPoints: settings.snapToPoints && !snappingOff,
        snapToAngles: settings.snapToAngles && !snappingOff,
        forceAngle: modifiers.shiftKey,
      });
    },
    [settings.snapToAngles, settings.snapToPoints],
  );

  const startDraftAt = useCallback(
    (point: PagePoint) => {
      setDraft([point]);
      setSelectedId(null);
      setHoveredId(null);
    },
    [setDraft, setSelectedId],
  );

  const finishDraft = useCallback(
    (points: PagePoint[]) => {
      if (mode === "calibrate" || points.length < minPointsFor(mode)) {
        return false;
      }
      const id = addMeasurement(mode, points);
      setSelectedId(id);
      resetDraft();
      return true;
    },
    [addMeasurement, mode, resetDraft, setSelectedId],
  );

  useEffect(
    () =>
      registerDrawingActions({
        finish: () => {
          if (!finishDraft(draftRef.current)) resetDraft();
        },
        cancel: resetDraft,
      }),
    [finishDraft, registerDrawingActions, resetDraft],
  );

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !isEditableKeyboardTarget(e.target)) {
        e.preventDefault();
        setDrawThroughMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setDrawThroughMode(false);
    };
    const onBlur = () => setDrawThroughMode(false);
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

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      const draft = draftRef.current;
      if (e.key === "Escape") {
        // Esc ends a path or area with the points placed so far; with too few
        // for a measurement, it cancels.
        if (draft.length > 0) {
          if (!finishDraft(draft)) resetDraft();
        } else {
          setSelectedId(null);
        }
      } else if (e.key === "Enter" && draft.length > 0) {
        e.preventDefault();
        finishDraft(draft);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (draft.length > 0) {
          e.preventDefault();
          setDraft(draft.slice(0, -1));
        } else if (selectedId) {
          e.preventDefault();
          deleteMeasurement(selectedId);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    deleteMeasurement,
    finishDraft,
    isActive,
    resetDraft,
    selectedId,
    setDraft,
    setSelectedId,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!isActive || !el) return;

    const toScreenPt = (e: MouseEvent): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const toDocPagePt = (e: MouseEvent): PagePoint | null => {
      const pageEl = findPageAtClientPoint(el, e.clientX, e.clientY);
      if (!pageEl) return null;
      const pageIndex = parseInt(pageEl.dataset.pageIndex ?? "0", 10);
      const docPoint = clientPointToPagePoint(
        pageEl,
        e.clientX,
        e.clientY,
        zoomRef.current,
        getEffectivePageRotation(pageEl, rotationRef.current),
      );
      return { pageIndex, ...docPoint };
    };

    /** The next point under the pointer, clamped to the draft's page. */
    const pointerPoint = (e: MouseEvent): PagePoint | null => {
      const draft = draftRef.current;
      const onPage = toDocPagePt(e);
      if (
        onPage &&
        (draft.length === 0 || onPage.pageIndex === draft[0].pageIndex)
      ) {
        return onPage;
      }
      if (draft.length === 0) return onPage;
      return (
        nearestPageDocPt(
          toScreenPt(e),
          el,
          zoomRef.current,
          rotationRef.current,
          draft[0].pageIndex,
        )?.docPt ?? null
      );
    };

    const pagePointToScreenNow = (pt: PagePoint): Point | null => {
      const pageEl = el.querySelector(
        `[data-page-index="${pt.pageIndex}"]`,
      ) as HTMLElement | null;
      if (!pageEl) return null;
      const pageRect = pageEl.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const display = pagePointToDisplayPoint(
        pageEl,
        pageRect,
        pt,
        zoomRef.current,
        getEffectivePageRotation(pageEl, rotationRef.current),
      );
      return {
        x: pageRect.left - containerRect.left + display.x,
        y: pageRect.top - containerRect.top + display.y,
      };
    };

    const onMove = (e: MouseEvent) => {
      if (dragRef.current) return;
      const raw = pointerPoint(e);
      if (!raw) {
        el.style.cursor = "default";
        clearCursor();
        return;
      }
      el.style.cursor = "crosshair";
      const draft = draftRef.current;
      const result = resolvePoint(raw, draft[draft.length - 1] ?? null, e);
      const moved = result.point.x !== raw.x || result.point.y !== raw.y;
      cursorDocRef.current = result.point;
      setCursorDoc(result.point);
      setSnap({ vertex: result.vertex, guides: result.guides });
      setCursorS(moved ? pagePointToScreenNow(result.point) : toScreenPt(e));
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const target = e.target as Element;
      if (target.closest?.("[data-ruler-control]")) return;

      const draft = draftRef.current;
      const raw = pointerPoint(e);
      if (!raw) return;
      const anchor = draft[draft.length - 1] ?? null;
      const { point, vertex } = resolvePoint(raw, anchor, e);

      // A click on a measurement selects it, unless it lands on one of its
      // points: that starts a new measurement there.
      const isDrawing =
        draft.length > 0 || drawThroughActiveRef.current || e.altKey;
      if (
        !isDrawing &&
        !vertex &&
        target.closest?.("[data-ruler-interactive]")
      ) {
        return;
      }
      e.preventDefault();
      // React re-renders between this listener and its root listener, so the
      // click would otherwise go on to select the measurement underneath.
      e.stopPropagation();

      if (draft.length === 0) {
        startDraftAt(point);
        return;
      }

      if (mode === "distance" || mode === "calibrate") {
        if (segmentLength(draft[0], point) <= 0) return;
        if (mode === "calibrate") {
          submitCalibrationSample({
            start: draft[0],
            end: point,
            pdfDistancePts: segmentLength(draft[0], point),
          });
          resetDraft();
          return;
        }
        finishDraft([draft[0], point]);
        return;
      }

      // The second click of a double-click only finishes the path (see onDoubleClick).
      if (e.detail > 1) return;

      // Clicking the first vertex again closes the area.
      const closeTolerance = CLOSE_PX / (zoomRef.current || 1);
      if (
        mode === "area" &&
        draft.length >= 3 &&
        segmentLength(point, draft[0]) <= closeTolerance
      ) {
        finishDraft(draft);
        return;
      }
      setDraft([...draft, point]);
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (mode !== "perimeter" && mode !== "area") return;
      if (draftRef.current.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      finishDraft(draftRef.current);
    };

    const onLeave = () => {
      el.style.cursor = "";
      if (draftRef.current.length === 0) clearCursor();
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("click", onClick);
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("mouseleave", onLeave);
      el.style.cursor = "";
    };
  }, [
    clearCursor,
    containerRef,
    finishDraft,
    isActive,
    mode,
    resetDraft,
    resolvePoint,
    setDraft,
    startDraftAt,
    submitCalibrationSample,
  ]);

  const handleVertexPointerDown = useCallback(
    (id: string, index: number, event: React.PointerEvent) => {
      const container = containerRef.current;
      const measurement = measurementsRef.current.find((m) => m.id === id);
      if (!container || !measurement || !isActiveRef.current) return;
      event.stopPropagation();
      event.preventDefault();

      dragRef.current = {
        id,
        index,
        kind: measurement.kind,
        points: measurement.points,
        moved: false,
      };
      const pageIndex = measurement.points[index].pageIndex;
      const pressedAt = { x: event.clientX, y: event.clientY };

      const onMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (
          !drag.moved &&
          Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) <
            DRAG_START_PX
        ) {
          return;
        }
        const pageEl = container.querySelector(
          `[data-page-index="${pageIndex}"]`,
        ) as HTMLElement | null;
        if (!pageEl) return;
        const raw: PagePoint = {
          pageIndex,
          ...clientPointToPagePoint(
            pageEl,
            e.clientX,
            e.clientY,
            zoomRef.current,
            getEffectivePageRotation(pageEl, rotationRef.current),
          ),
        };
        const neighbour =
          drag.points[drag.index - 1] ??
          (drag.kind === "area"
            ? drag.points[drag.points.length - 1]
            : drag.points[drag.index + 1]) ??
          null;
        const result = resolvePoint(raw, neighbour, e, {
          id,
          index: drag.index,
        });
        const { point } = result;
        setSnap({ vertex: result.vertex, guides: result.guides });
        const points = drag.points.map((pt, i) =>
          i === drag.index ? point : pt,
        );
        dragRef.current = { ...drag, points, moved: true };
        setDragPreview({ id, points });
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const drag = dragRef.current;
        dragRef.current = null;
        setDragPreview(null);
        setSnap({ vertex: null, guides: [] });
        if (drag?.moved) {
          updateMeasurement(drag.id, { points: drag.points });
          suppressClickRef.current = true;
          // The click that follows pointerup may land outside the container.
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        } else if (drag) {
          // A press without a drag starts a new measurement from this point.
          startDraftAt(drag.points[drag.index]);
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [containerRef, resolvePoint, startDraftAt, updateMeasurement],
  );

  const renderedMeasurements = useMemo(() => {
    const project = createScreenProjector(containerRef.current, zoom, rotation);
    const scaleLine = (scale: MeasureScale | null) =>
      scale
        ? generateScaleLabel(scale.ratio, scale.unit)
        : t("measure.unscaled", "Unscaled (paper size)");

    return measurements.reduce<RulerRenderedMeasurement[]>((items, stored) => {
      const measurement =
        dragPreview?.id === stored.id
          ? { ...stored, points: dragPreview.points }
          : stored;
      const pointsS = measurement.points.map(project);
      if (pointsS.some((p) => p === null)) return items;
      const scale = scaleFor(measurement);
      const view = pageViewFor(measurement.points[0].pageIndex);
      const value = formatMeasurementValue(measurement, scale, settings);
      const detailLines = [
        describeMeasurement(t, measurement, scale, settings, view),
      ];
      if (measurement.kind === "distance") {
        const [a, b] = measurement.points;
        if (scale) {
          detailLines.push(
            t("measure.paperLength", "Paper {{value}}", {
              value: formatPaperDistance(segmentLength(a, b)),
            }),
          );
        }
        detailLines.push(
          `${scaleLine(scale)}   ∠ ${viewAngle(a, b, view).toFixed(1)}°`,
        );
      } else {
        detailLines.push(scaleLine(scale));
      }
      items.push({
        id: measurement.id,
        kind: measurement.kind,
        pointsS: pointsS as Point[],
        color: measurement.color ?? settings.defaultColor,
        strokeWidth: measurement.strokeWidth ?? settings.defaultStrokeWidth,
        label: measurement.label ? `${measurement.label}: ${value}` : value,
        detailLines,
      });
      return items;
    }, []);
    // scrollVersion and pageViewVersion stand for layout the DOM reads depend on.
  }, [
    containerRef,
    dragPreview,
    measurements,
    pageViewFor,
    pageViewVersion,
    rotation,
    scaleFor,
    scrollVersion,
    settings,
    t,
    zoom,
  ]);

  if (!isActive && measurements.length === 0) return null;

  const project = createScreenProjector(containerRef.current, zoom, rotation);

  let draft: RulerDraft | null = null;
  if (isActive && draftPoints.length > 0) {
    const livePoints = cursorDoc ? [...draftPoints, cursorDoc] : draftPoints;
    const pointsS = livePoints
      .map(project)
      .filter((p): p is Point => p !== null);
    const scale =
      mode === "calibrate" ? null : scaleFor({ points: livePoints });
    let label: string | null = null;
    if (livePoints.length >= 2) {
      if (mode === "calibrate") {
        label = formatPaperDistance(pathLength(livePoints, false));
      } else if (mode === "area" && livePoints.length >= 3) {
        label = formatArea(polygonArea(livePoints), scale, settings);
      } else {
        const [a, b] = livePoints.slice(-2);
        const angle = viewAngle(a, b, pageViewFor(a.pageIndex));
        label = `${formatLength(pathLength(livePoints, false), scale, settings)}  ${angle.toFixed(1)}°`;
      }
    }
    draft = {
      kind: mode,
      pointsS,
      label,
      color: mode === "calibrate" ? CALIBRATION_COLOR : settings.defaultColor,
    };
  }

  const snapPointS = isActive && snap.vertex ? project(snap.vertex) : null;
  const guidesS = isActive
    ? snap.guides.flatMap((guide: SnapGuide) => {
        const from = project(guide.from);
        const to = project(guide.to);
        return from && to ? [{ from, to, kind: guide.kind }] : [];
      })
    : [];

  return (
    // icon-lint-allow: runtime-generated-svg -- ruler geometry is computed from the page
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 100,
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

      <RulerMeasurementLayer
        measurements={renderedMeasurements}
        zoom={zoom}
        selectedId={selectedId}
        hoveredId={hoveredId}
        labelVisibility={settings.labelVisibility}
        isInteractionPassthroughActive={
          draftPoints.length > 0 || isDrawThroughActive
        }
        isEditable={isActive}
        draft={draft}
        cursor={isActive ? cursorS : null}
        snapPoint={snapPointS}
        guides={guidesS}
        pageContentRef={rulerPageContentRef}
        onSelect={setSelectedId}
        onDelete={deleteMeasurement}
        onHoverChange={setHoveredId}
        onVertexPointerDown={handleVertexPointerDown}
      />
    </svg>
  );
}
