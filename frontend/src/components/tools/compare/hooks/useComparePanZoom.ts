import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { PagePreview } from '../../../../hooks/useProgressivePagePreviews';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 100000;
const ZOOM_STEP = 0.1;

type Pane = 'base' | 'comparison';

interface PanState {
  x: number;
  y: number;
}

interface ScrollLinkDelta {
  vertical: number;
  horizontal: number;
}

// Pixel-based anchors captured when linking scroll, to preserve the
// visual offset between panes and avoid an initial snap.
interface ScrollLinkAnchors {
  deltaPixelsBaseToComp: number;
  deltaPixelsCompToBase: number;
}

interface PanDragState {
  active: boolean;
  source: Pane | null;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  targetStartPanX: number;
  targetStartPanY: number;
}

interface PinchState {
  active: boolean;
  pane: Pane | null;
  startDistance: number;
  startZoom: number;
}

export interface UseComparePanZoomOptions {
  prefersStacked: boolean;
  basePages: PagePreview[];
  comparisonPages: PagePreview[];
}

export interface UseComparePanZoomReturn {
  layout: 'side-by-side' | 'stacked';
  setLayout: (layout: 'side-by-side' | 'stacked') => void;
  toggleLayout: () => void;
  baseScrollRef: RefObject<HTMLDivElement | null>;
  comparisonScrollRef: RefObject<HTMLDivElement | null>;
  isScrollLinked: boolean;
  setIsScrollLinked: (value: boolean) => void;
  captureScrollLinkDelta: () => void;
  clearScrollLinkDelta: () => void;
  isPanMode: boolean;
  setIsPanMode: (value: boolean) => void;
  baseZoom: number;
  setBaseZoom: (value: number) => void;
  comparisonZoom: number;
  setComparisonZoom: (value: number) => void;
  basePan: PanState;
  comparisonPan: PanState;
  centerPanForZoom: (pane: Pane, zoom: number) => void;
  clampPanForZoom: (pane: Pane, zoom: number) => void;
  handleScrollSync: (source: HTMLDivElement | null, target: HTMLDivElement | null) => void;
  beginPan: (pane: Pane, event: ReactMouseEvent<HTMLDivElement>) => void;
  continuePan: (event: ReactMouseEvent<HTMLDivElement>) => void;
  endPan: () => void;
  handleWheelZoom: (pane: Pane, event: ReactWheelEvent<HTMLDivElement>) => void;
  onTouchStart: (pane: Pane, event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  zoomLimits: { min: number; max: number; step: number };
}

export const useComparePanZoom = ({
  basePages,
  comparisonPages,
  prefersStacked,
}: UseComparePanZoomOptions): UseComparePanZoomReturn => {
  const baseScrollRef = useRef<HTMLDivElement>(null);
  const comparisonScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const scrollLinkDeltaRef = useRef<ScrollLinkDelta>({ vertical: 0, horizontal: 0 });
  const scrollLinkAnchorsRef = useRef<ScrollLinkAnchors>({
    deltaPixelsBaseToComp: 0,
    deltaPixelsCompToBase: 0,
  });
  const [isScrollLinked, setIsScrollLinked] = useState(true);
  const [isPanMode, setIsPanMode] = useState(false);
  const panDragRef = useRef<PanDragState>({
    active: false,
    source: null,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    targetStartPanX: 0,
    targetStartPanY: 0,
  });
  const lastActivePaneRef = useRef<Pane>('base');
  const [baseZoom, setBaseZoom] = useState(1);
  const [comparisonZoom, setComparisonZoom] = useState(1);
  const [basePan, setBasePan] = useState<PanState>({ x: 0, y: 0 });
  const [comparisonPan, setComparisonPan] = useState<PanState>({ x: 0, y: 0 });
  const wheelZoomAccumRef = useRef<{ base: number; comparison: number }>({ base: 0, comparison: 0 });
  const pinchRef = useRef<PinchState>({ active: false, pane: null, startDistance: 0, startZoom: 1 });
  const edgeOverscrollRef = useRef<{ base: number; comparison: number }>({ base: 0, comparison: 0 });

  const [layout, setLayoutState] = useState<'side-by-side' | 'stacked'>(prefersStacked ? 'stacked' : 'side-by-side');
  const setLayout = useCallback((next: 'side-by-side' | 'stacked') => {
    setLayoutState(next);
  }, []);
  const toggleLayout = useCallback(() => {
    setLayoutState(prev => (prev === 'side-by-side' ? 'stacked' : 'side-by-side'));
  }, []);

  useEffect(() => {
    setLayoutState(prev => (prefersStacked ? 'stacked' : prev === 'stacked' ? 'side-by-side' : prev));
  }, [prefersStacked]);

  const getPagesForPane = useCallback(
    (pane: Pane) => (pane === 'base' ? basePages : comparisonPages),
    [basePages, comparisonPages]
  );

  // Build per-row heights using the same rule as the renderer: pair pages by pageNumber and use the max height
  const rowHeights = useMemo(() => {
    const allPageNumbers = Array.from(
      new Set([
        ...basePages.map(p => p.pageNumber),
        ...comparisonPages.map(p => p.pageNumber),
      ])
    ).sort((a, b) => a - b);

    const base: number[] = [];
    const comp: number[] = [];
    for (const pageNumber of allPageNumbers) {
      const b = basePages.find(p => p.pageNumber === pageNumber) || null;
      const c = comparisonPages.find(p => p.pageNumber === pageNumber) || null;
      const h = Math.round(Math.max(b?.height ?? 0, c?.height ?? 0));
      if (b) base.push(h);
      if (c) comp.push(h);
      if (!b && c) {
        // base missing this page; still push height for mapping purposes
        base.push(h);
      }
      if (!c && b) {
        // comparison missing this page; still push height for mapping purposes
        comp.push(h);
      }
    }

    const prefix = (arr: number[]) => {
      const out: number[] = new Array(arr.length + 1);
      out[0] = 0;
      for (let i = 0; i < arr.length; i += 1) out[i + 1] = out[i] + arr[i];
      return out;
    };

    return {
      base,
      comp,
      basePrefix: prefix(base),
      compPrefix: prefix(comp),
    };
  }, [basePages, comparisonPages]);

  const mapScrollTopBetweenPanes = useCallback(
    (sourceTop: number, sourceIsBase: boolean): number => {
      const srcHeights = sourceIsBase ? rowHeights.base : rowHeights.comp;
      const dstHeights = sourceIsBase ? rowHeights.comp : rowHeights.base;
      const srcPrefix = sourceIsBase ? rowHeights.basePrefix : rowHeights.compPrefix;
      const dstPrefix = sourceIsBase ? rowHeights.compPrefix : rowHeights.basePrefix;

      if (dstHeights.length === 0 || srcHeights.length === 0) return sourceTop;

      // Clamp to valid range
      const srcMax = Math.max(0, srcPrefix[srcPrefix.length - 1] - 1);
      const top = Math.max(0, Math.min(srcMax, Math.floor(sourceTop)));

      // Binary search to find page index i where srcPrefix[i] <= top < srcPrefix[i+1]
      let lo = 0;
      let hi = srcHeights.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (srcPrefix[mid] <= top) lo = mid; else hi = mid - 1;
      }
      const i = lo;
      const within = top - srcPrefix[i];
      const frac = srcHeights[i] > 0 ? within / srcHeights[i] : 0;

      const j = Math.min(i, dstHeights.length - 1);
      const dstTop = dstPrefix[j] + frac * (dstHeights[j] || 1);
      return dstTop;
    },
    [rowHeights]
  );

  const getMaxCanvasSize = useCallback(
    (pane: Pane) => {
      const pages = getPagesForPane(pane);
      const peers = getPagesForPane(pane === 'base' ? 'comparison' : 'base');
      let maxW = 0;
      let maxH = 0;
      for (const page of pages) {
        const peer = peers.find(p => p.pageNumber === page.pageNumber);
        const targetHeight = peer ? Math.max(page.height, peer.height) : page.height;
        const fit = targetHeight / page.height;
        const width = Math.round(page.width * fit);
        const height = Math.round(targetHeight);
        if (width > maxW) maxW = width;
        if (height > maxH) maxH = height;
      }
      return { maxW, maxH };
    },
    [getPagesForPane]
  );

  const getPanBounds = useCallback(
    (pane: Pane, zoomOverride?: number) => {
      const container = pane === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
      const canvasEl = container?.querySelector('.compare-diff-page__canvas') as HTMLElement | null;
      let canvasW: number | null = null;
      let canvasH: number | null = null;
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        canvasW = Math.max(0, Math.round(rect.width));
        canvasH = Math.max(0, Math.round(rect.height));
      }

      const fallback = getMaxCanvasSize(pane);
      const W = canvasW ?? fallback.maxW;
      const H = canvasH ?? fallback.maxH;
      const zoom = zoomOverride !== undefined ? zoomOverride : pane === 'base' ? baseZoom : comparisonZoom;
      const extraX = Math.max(0, W * (Math.max(zoom, 1) - 1));
      const extraY = Math.max(0, H * (Math.max(zoom, 1) - 1));
      return { maxX: extraX, maxY: extraY };
    },
    [baseZoom, comparisonZoom, getMaxCanvasSize]
  );

  const getPaneRotation = useCallback(
    (pane: Pane) => {
      const pages = getPagesForPane(pane);
      const rotation = pages[0]?.rotation ?? 0;
      const normalized = ((rotation % 360) + 360) % 360;
      return normalized as 0 | 90 | 180 | 270 | number;
    },
    [getPagesForPane]
  );

  const mapPanBetweenOrientations = useCallback(
    (source: Pane, target: Pane, sourcePan: PanState) => {
      const sourceRotation = getPaneRotation(source);
      const targetRotation = getPaneRotation(target);
      const sourceBounds = getPanBounds(source);
      const targetBounds = getPanBounds(target);

      const sx = sourceBounds.maxX === 0 ? 0 : (sourcePan.x / sourceBounds.maxX) * 2 - 1;
      const sy = sourceBounds.maxY === 0 ? 0 : (sourcePan.y / sourceBounds.maxY) * 2 - 1;

      const applyRotation = (nx: number, ny: number, rotation: number) => {
        const r = ((rotation % 360) + 360) % 360;
        if (r === 0) return { nx, ny };
        if (r === 90) return { nx: ny, ny: -nx };
        if (r === 180) return { nx: -nx, ny: -ny };
        if (r === 270) return { nx: -ny, ny: nx };
        return { nx, ny };
      };

      const logical = applyRotation(sx, sy, sourceRotation);
      const targetCentered = applyRotation(logical.nx, logical.ny, 360 - targetRotation);

      const targetNormX = (targetCentered.nx + 1) / 2;
      const targetNormY = (targetCentered.ny + 1) / 2;

      const targetX = Math.max(0, Math.min(targetBounds.maxX, targetNormX * targetBounds.maxX));
      const targetY = Math.max(0, Math.min(targetBounds.maxY, targetNormY * targetBounds.maxY));
      return { x: targetX, y: targetY };
    },
    [getPaneRotation, getPanBounds]
  );

  const centerPanForZoom = useCallback(
    (pane: Pane, zoomValue: number) => {
      const bounds = getPanBounds(pane, zoomValue);
      const center = { x: Math.round(bounds.maxX / 2), y: Math.round(bounds.maxY / 2) };
      if (pane === 'base') {
        setBasePan(center);
      } else {
        setComparisonPan(center);
      }
    },
    [getPanBounds]
  );

  const clampPanForZoom = useCallback(
    (pane: Pane, zoomValue: number) => {
      const bounds = getPanBounds(pane, zoomValue);
      const current = pane === 'base' ? basePan : comparisonPan;
      const clamped = {
        x: Math.max(0, Math.min(bounds.maxX, current.x)),
        y: Math.max(0, Math.min(bounds.maxY, current.y)),
      };
      if (pane === 'base') {
        setBasePan(clamped);
      } else {
        setComparisonPan(clamped);
      }
    },
    [basePan, comparisonPan, getPanBounds]
  );

  const handleScrollSync = useCallback(
    (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
      if (panDragRef.current.active) return;
      if (!source || !target || isSyncingRef.current || !isScrollLinked) {
        return;
      }

      lastActivePaneRef.current = source === baseScrollRef.current ? 'base' : 'comparison';

      const sourceIsBase = source === baseScrollRef.current;

      const targetVerticalRange = Math.max(1, target.scrollHeight - target.clientHeight);
      const mappedTop = mapScrollTopBetweenPanes(source.scrollTop, sourceIsBase);

      // Use pixel anchors captured at link time to preserve offset
      const deltaPx = sourceIsBase
        ? scrollLinkAnchorsRef.current.deltaPixelsBaseToComp
        : scrollLinkAnchorsRef.current.deltaPixelsCompToBase;

      const desiredTop = Math.max(0, Math.min(targetVerticalRange, mappedTop + deltaPx));

      isSyncingRef.current = true;
      target.scrollTop = desiredTop;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    },
    [isScrollLinked, mapScrollTopBetweenPanes]
  );

  const beginPan = useCallback(
    (pane: Pane, event: ReactMouseEvent<HTMLDivElement>) => {
      if (!isPanMode) return;
      const zoom = pane === 'base' ? baseZoom : comparisonZoom;
      if (zoom <= 1) return;
      const container = pane === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
      if (!container) return;

      const targetEl = event.target as HTMLElement | null;
      const isOnImage = !!targetEl?.closest('.compare-diff-page__inner');
      if (!isOnImage) return;

      event.preventDefault();
      panDragRef.current = {
        active: true,
        source: pane,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: pane === 'base' ? basePan.x : comparisonPan.x,
        startPanY: pane === 'base' ? basePan.y : comparisonPan.y,
        targetStartPanX: pane === 'base' ? comparisonPan.x : basePan.x,
        targetStartPanY: pane === 'base' ? comparisonPan.y : basePan.y,
      };
      edgeOverscrollRef.current[pane] = 0;
      lastActivePaneRef.current = pane;
      (container as HTMLDivElement).style.cursor = 'grabbing';
    },
    [isPanMode, baseZoom, comparisonZoom, basePan, comparisonPan]
  );

  const continuePan = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!isPanMode) return;
      const drag = panDragRef.current;
      if (!drag.active || !drag.source) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      const isBase = drag.source === 'base';
      const bounds = getPanBounds(drag.source);
      const rawX = drag.startPanX - dx;
      const rawY = drag.startPanY - dy;
      const desired = {
        x: Math.max(0, Math.min(bounds.maxX, rawX)),
        y: Math.max(0, Math.min(bounds.maxY, rawY)),
      };

      // On vertical overscroll beyond pan bounds, scroll the page (with deadzone + incremental steps)
      const container = isBase ? baseScrollRef.current : comparisonScrollRef.current;
      if (container) {
        const DEADZONE = 32; // pixels
        const STEP = 48; // pixels per incremental scroll
        let overflowY = 0;
        if (rawY < 0) overflowY = rawY; // negative -> scroll up
        else if (rawY > bounds.maxY) overflowY = rawY - bounds.maxY; // positive -> scroll down
        let applyCandidate = 0;
        if (overflowY < -DEADZONE) applyCandidate = overflowY + DEADZONE;
        else if (overflowY > DEADZONE) applyCandidate = overflowY - DEADZONE;
        if (applyCandidate !== 0) {
          const key = isBase ? 'base' : 'comparison';
          const deltaSinceLast = applyCandidate - edgeOverscrollRef.current[key];
          const magnitude = Math.abs(deltaSinceLast);
          if (magnitude >= STEP) {
            const stepDelta = Math.sign(deltaSinceLast) * Math.floor(magnitude / STEP) * STEP;
            edgeOverscrollRef.current[key] += stepDelta;
            const prevTop = container.scrollTop;
            const nextTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, prevTop + stepDelta));
            if (nextTop !== prevTop) {
              container.scrollTop = nextTop;
              if (isScrollLinked) {
                const sourceIsBase = isBase;
                const target = isBase ? comparisonScrollRef.current : baseScrollRef.current;
                if (target) {
                  const targetVerticalRange = Math.max(1, target.scrollHeight - target.clientHeight);
                  const mappedTop = mapScrollTopBetweenPanes(nextTop, sourceIsBase);
                  const deltaPx = sourceIsBase
                    ? scrollLinkAnchorsRef.current.deltaPixelsBaseToComp
                    : scrollLinkAnchorsRef.current.deltaPixelsCompToBase;
                  const desiredTop = Math.max(0, Math.min(targetVerticalRange, mappedTop + deltaPx));
                  target.scrollTop = desiredTop;
                }
              }
            }
          }
        } else {
          // Reset accumulator when back within deadzone
          edgeOverscrollRef.current[isBase ? 'base' : 'comparison'] = 0;
        }
      }

      if (isScrollLinked) {
        if (isBase) {
          setBasePan(desired);
        } else {
          setComparisonPan(desired);
        }
        const otherPane: Pane = isBase ? 'comparison' : 'base';
        const mappedPeer = mapPanBetweenOrientations(drag.source, otherPane, desired);
        const peerBounds = getPanBounds(otherPane);
        const clampedPeer = {
          x: Math.max(0, Math.min(peerBounds.maxX, mappedPeer.x)),
          y: Math.max(0, Math.min(peerBounds.maxY, mappedPeer.y)),
        };
        if (isBase) {
          setComparisonPan(clampedPeer);
        } else {
          setBasePan(clampedPeer);
        }
      } else {
        if (isBase) {
          setBasePan(desired);
        } else {
          setComparisonPan(desired);
        }
      }
    },
    [getPanBounds, isPanMode, isScrollLinked, mapPanBetweenOrientations]
  );

  const endPan = useCallback(() => {
    const drag = panDragRef.current;
    if (!drag.active) return;
    const sourceEl = drag.source === 'base' ? baseScrollRef.current : comparisonScrollRef.current;
    if (sourceEl) {
      const zoom = drag.source === 'base' ? baseZoom : comparisonZoom;
      (sourceEl as HTMLDivElement).style.cursor = isPanMode ? (zoom > 1 ? 'grab' : 'auto') : '';
    }
    panDragRef.current.active = false;
    panDragRef.current.source = null;
  }, [baseZoom, comparisonZoom, isPanMode]);

  const handleWheelZoom = useCallback(
    (pane: Pane, event: ReactWheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const key = pane === 'base' ? 'base' : 'comparison';
      const accum = wheelZoomAccumRef.current;
      const threshold = 180;
      accum[key] += event.deltaY;
      const steps = Math.trunc(Math.abs(accum[key]) / threshold);
      if (steps <= 0) return;
      const direction = accum[key] > 0 ? -1 : 1;
      accum[key] = accum[key] % threshold;
      const applySteps = (zoom: number) => {
        let next = zoom;
        for (let i = 0; i < steps; i += 1) {
          next = direction > 0
            ? Math.min(ZOOM_MAX, +(next + ZOOM_STEP).toFixed(2))
            : Math.max(ZOOM_MIN, +(next - ZOOM_STEP).toFixed(2));
        }
        return next;
      };
      if (pane === 'base') {
        const prev = baseZoom;
        const next = applySteps(prev);
        setBaseZoom(next);
        if (next < prev) {
          centerPanForZoom('base', next);
        } else {
          clampPanForZoom('base', next);
        }
      } else {
        const prev = comparisonZoom;
        const next = applySteps(prev);
        setComparisonZoom(next);
        if (next < prev) {
          centerPanForZoom('comparison', next);
        } else {
          clampPanForZoom('comparison', next);
        }
      }
    },
    [baseZoom, clampPanForZoom, centerPanForZoom, comparisonZoom]
  );

  const onTouchStart = useCallback(
    (pane: Pane, event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 2) {
        const [t1, t2] = [event.touches[0], event.touches[1]];
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        pinchRef.current = {
          active: true,
          pane,
          startDistance: Math.hypot(dx, dy),
          startZoom: pane === 'base' ? baseZoom : comparisonZoom,
        };
        event.preventDefault();
      } else if (event.touches.length === 1) {
        if (!isPanMode) return;
        const zoom = pane === 'base' ? baseZoom : comparisonZoom;
        if (zoom <= 1) return;
        const targetEl = event.target as HTMLElement | null;
        const isOnImage = !!targetEl?.closest('.compare-diff-page__inner');
        if (!isOnImage) return;
        const touch = event.touches[0];
        panDragRef.current = {
          active: true,
          source: pane,
          startX: touch.clientX,
          startY: touch.clientY,
          startPanX: pane === 'base' ? basePan.x : comparisonPan.x,
          startPanY: pane === 'base' ? basePan.y : comparisonPan.y,
          targetStartPanX: pane === 'base' ? comparisonPan.x : basePan.x,
          targetStartPanY: pane === 'base' ? comparisonPan.y : basePan.y,
        };
        edgeOverscrollRef.current[pane] = 0;
        event.preventDefault();
      }
    },
    [basePan, baseZoom, comparisonPan, comparisonZoom, isPanMode]
  );

  const onTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (pinchRef.current.active && event.touches.length === 2) {
        const [t1, t2] = [event.touches[0], event.touches[1]];
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const distance = Math.hypot(dx, dy);
        const scale = distance / Math.max(1, pinchRef.current.startDistance);
        const dampened = 1 + (scale - 1) * 0.6;
        const pane = pinchRef.current.pane!;
        const startZoom = pinchRef.current.startZoom;
        const previousZoom = pane === 'base' ? baseZoom : comparisonZoom;
        const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(startZoom * dampened).toFixed(2)));
        if (pane === 'base') {
          setBaseZoom(nextZoom);
          if (nextZoom < previousZoom) {
            centerPanForZoom('base', nextZoom);
          } else if (nextZoom > previousZoom) {
            clampPanForZoom('base', nextZoom);
          }
        } else {
          setComparisonZoom(nextZoom);
          if (nextZoom < previousZoom) {
            centerPanForZoom('comparison', nextZoom);
          } else if (nextZoom > previousZoom) {
            clampPanForZoom('comparison', nextZoom);
          }
        }
        event.preventDefault();
        return;
      }

      if (panDragRef.current.active && event.touches.length === 1) {
        const touch = event.touches[0];
        const dx = touch.clientX - panDragRef.current.startX;
        const dy = touch.clientY - panDragRef.current.startY;
        const isBase = panDragRef.current.source === 'base';
        const bounds = getPanBounds(panDragRef.current.source!);
        const rawX = panDragRef.current.startPanX - dx;
        const rawY = panDragRef.current.startPanY - dy;
        const desired = {
          x: Math.max(0, Math.min(bounds.maxX, rawX)),
          y: Math.max(0, Math.min(bounds.maxY, rawY)),
        };

        const container = isBase ? baseScrollRef.current : comparisonScrollRef.current;
        if (container) {
          const DEADZONE = 32;
          const STEP = 48;
          let overflowY = 0;
          if (rawY < 0) overflowY = rawY; else if (rawY > bounds.maxY) overflowY = rawY - bounds.maxY;
          let applyCandidate = 0;
          if (overflowY < -DEADZONE) applyCandidate = overflowY + DEADZONE;
          else if (overflowY > DEADZONE) applyCandidate = overflowY - DEADZONE;
          if (applyCandidate !== 0) {
            const key = isBase ? 'base' : 'comparison';
            const deltaSinceLast = applyCandidate - edgeOverscrollRef.current[key];
            const magnitude = Math.abs(deltaSinceLast);
            if (magnitude >= STEP) {
              const stepDelta = Math.sign(deltaSinceLast) * Math.floor(magnitude / STEP) * STEP;
              edgeOverscrollRef.current[key] += stepDelta;
              const prevTop = container.scrollTop;
              const nextTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, prevTop + stepDelta));
              if (nextTop !== prevTop) {
                container.scrollTop = nextTop;
                if (isScrollLinked) {
                  const sourceIsBase = isBase;
                  const target = isBase ? comparisonScrollRef.current : baseScrollRef.current;
                  if (target) {
                    const targetVerticalRange = Math.max(1, target.scrollHeight - target.clientHeight);
                    const mappedTop = mapScrollTopBetweenPanes(nextTop, sourceIsBase);
                    const deltaPx = sourceIsBase
                      ? scrollLinkAnchorsRef.current.deltaPixelsBaseToComp
                      : scrollLinkAnchorsRef.current.deltaPixelsCompToBase;
                    const desiredTop = Math.max(0, Math.min(targetVerticalRange, mappedTop + deltaPx));
                    target.scrollTop = desiredTop;
                  }
                }
              }
            }
          } else {
            edgeOverscrollRef.current[isBase ? 'base' : 'comparison'] = 0;
          }
        }
        if (isScrollLinked) {
          if (isBase) {
            setBasePan(desired);
          } else {
            setComparisonPan(desired);
          }
          const otherPane: Pane = isBase ? 'comparison' : 'base';
          const mappedPeer = mapPanBetweenOrientations(isBase ? 'base' : 'comparison', otherPane, desired);
          const peerBounds = getPanBounds(otherPane);
          const clampedPeer = {
            x: Math.max(0, Math.min(peerBounds.maxX, mappedPeer.x)),
            y: Math.max(0, Math.min(peerBounds.maxY, mappedPeer.y)),
          };
          if (isBase) {
            setComparisonPan(clampedPeer);
          } else {
            setBasePan(clampedPeer);
          }
        } else {
          if (isBase) {
            setBasePan(desired);
          } else {
            setComparisonPan(desired);
          }
        }
        event.preventDefault();
      }
    },
    [baseZoom, clampPanForZoom, centerPanForZoom, comparisonZoom, getPanBounds, isScrollLinked, mapPanBetweenOrientations]
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current.active = false;
    pinchRef.current.pane = null;
    panDragRef.current.active = false;
  }, []);

  // Auto-toggle Pan Mode based on zoom level
  useEffect(() => {
    const shouldPan = baseZoom > 1 || comparisonZoom > 1;
    if (isPanMode !== shouldPan) setIsPanMode(shouldPan);
  }, [baseZoom, comparisonZoom, isPanMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isScrollLinked) return;
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      const isEditable = target && (tag === 'input' || tag === 'textarea' || target.getAttribute('contenteditable') === 'true');
      if (isEditable) return;

      const baseEl = baseScrollRef.current;
      const compEl = comparisonScrollRef.current;
      if (!baseEl || !compEl) return;

      const STEP = 80;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? STEP : -STEP;
        isSyncingRef.current = true;
        baseEl.scrollTop = Math.max(0, Math.min(baseEl.scrollTop + delta, baseEl.scrollHeight - baseEl.clientHeight));
        compEl.scrollTop = Math.max(0, Math.min(compEl.scrollTop + delta, compEl.scrollHeight - compEl.clientHeight));
        requestAnimationFrame(() => {
          isSyncingRef.current = false;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isScrollLinked]);

  const captureScrollLinkDelta = useCallback(() => {
    const baseEl = baseScrollRef.current;
    const compEl = comparisonScrollRef.current;
    if (!baseEl || !compEl) {
      scrollLinkDeltaRef.current = { vertical: 0, horizontal: 0 };
      scrollLinkAnchorsRef.current = { deltaPixelsBaseToComp: 0, deltaPixelsCompToBase: 0 };
      return;
    }
    const baseVMax = Math.max(1, baseEl.scrollHeight - baseEl.clientHeight);
    const compVMax = Math.max(1, compEl.scrollHeight - compEl.clientHeight);
    const baseHMax = Math.max(1, baseEl.scrollWidth - baseEl.clientWidth);
    const compHMax = Math.max(1, compEl.scrollWidth - compEl.clientWidth);

    const baseV = baseEl.scrollTop / baseVMax;
    const compV = compEl.scrollTop / compVMax;
    const baseH = baseEl.scrollLeft / baseHMax;
    const compH = compEl.scrollLeft / compHMax;

    scrollLinkDeltaRef.current = {
      vertical: compV - baseV,
      horizontal: compH - baseH,
    };

    // Capture pixel anchors in mapped space
    const mappedBaseToComp = mapScrollTopBetweenPanes(baseEl.scrollTop, true);
    const mappedCompToBase = mapScrollTopBetweenPanes(compEl.scrollTop, false);
    scrollLinkAnchorsRef.current = {
      deltaPixelsBaseToComp: compEl.scrollTop - mappedBaseToComp,
      deltaPixelsCompToBase: baseEl.scrollTop - mappedCompToBase,
    };
  }, [mapScrollTopBetweenPanes]);

  const clearScrollLinkDelta = useCallback(() => {
    scrollLinkDeltaRef.current = { vertical: 0, horizontal: 0 };
    scrollLinkAnchorsRef.current = { deltaPixelsBaseToComp: 0, deltaPixelsCompToBase: 0 };
  }, []);

  const zoomLimits = useMemo(() => ({ min: ZOOM_MIN, max: ZOOM_MAX, step: ZOOM_STEP }), []);

  return {
    layout,
    setLayout,
    toggleLayout,
    baseScrollRef,
    comparisonScrollRef,
    isScrollLinked,
    setIsScrollLinked,
    captureScrollLinkDelta,
    clearScrollLinkDelta,
    isPanMode,
    setIsPanMode,
    baseZoom,
    setBaseZoom,
    comparisonZoom,
    setComparisonZoom,
    basePan,
    comparisonPan,
    centerPanForZoom,
    clampPanForZoom,
    handleScrollSync,
    beginPan,
    continuePan,
    endPan,
    handleWheelZoom,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    zoomLimits,
  };
};
