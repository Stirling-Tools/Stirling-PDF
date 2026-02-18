import { Group, Loader, Stack, Text } from '@mantine/core';
import { useMemo, useRef, useEffect, useState } from 'react';
import type { PagePreview } from '@app/types/compare';
import type { TokenBoundingBox, CompareDocumentPaneProps } from '@app/types/compare';
import { mergeConnectedRects, normalizeRotation, groupWordRects, computePageLayoutMetrics } from '@app/components/tools/compare/compare';
import CompareNavigationDropdown from '@app/components/tools/compare/CompareNavigationDropdown';
import { useIsMobile } from '@app/hooks/useIsMobile';

// utilities moved to compare.ts

const CompareDocumentPane = ({
  pane,
  layout,
  scrollRef,
  peerScrollRef,
  handleScrollSync,
  handleWheelZoom,
  handleWheelOverscroll,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  isPanMode,
  zoom,
  title,
  dropdownPlaceholder,
  changes,
  onNavigateChange,
  isLoading,
  processingMessage,
  pages,
  pairedPages,
  wordHighlightMap,
  metaIndexToGroupId,
  documentLabel,
  pageLabel,
  altLabel,
  onVisiblePageChange,
}: CompareDocumentPaneProps) => {
  const isMobileViewport = useIsMobile();
  const pairedPageMap = useMemo(() => {
    const map = new Map<number, PagePreview>();
    pairedPages.forEach((item) => {
      map.set(item.pageNumber, item);
    });
    return map;
  }, [pairedPages]);

  const HIGHLIGHT_BG_VAR = pane === 'base' ? 'var(--spdf-compare-removed-bg)' : 'var(--spdf-compare-added-bg)';
  const OFFSET_PIXELS = pane === 'base' ? 4 : 2;
  const cursorStyle = isPanMode && zoom > 1 ? 'grab' : 'auto';
  const pagePanRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ active: boolean; page: number | null; startX: number; startY: number; startPanX: number; startPanY: number }>({ active: false, page: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  // Track which page images have finished loading to avoid flashing between states
  const imageLoadedRef = useRef<Map<number, boolean>>(new Map());
  // Force a re-render when an image load state changes (refs don't trigger renders)
  const [, setImageLoadedTick] = useState(0);
  const visiblePageRafRef = useRef<number | null>(null);
  const lastReportedVisiblePageRef = useRef<number | null>(null);
  const pageNodesRef = useRef<HTMLElement[] | null>(null);
  const groupedRectsByPage = useMemo(() => {
    const out = new Map<number, Map<string, TokenBoundingBox[]>>();
    for (const p of pages) {
      const rects = wordHighlightMap.get(p.pageNumber) ?? [];
      out.set(p.pageNumber, groupWordRects(rects, metaIndexToGroupId, pane));
    }
    return out;
  }, [pages, wordHighlightMap, metaIndexToGroupId, pane]);

  // When zoom returns to 1 (reset), clear per-page pan state so content is centered again
  useEffect(() => {
    if (zoom <= 1) {
      pagePanRef.current.clear();
    }
  }, [zoom]);

  const renderedPageNumbers = useMemo(
    () => new Set(pages.map((p) => p.pageNumber)),
    [pages]
  );

  return (
    <div className="compare-pane">
      <div className="compare-header">
        <Group justify="space-between" align="center">
          <Text fw={600} size="lg">
            {title}
          </Text>
          <Group justify="flex-end" align="center" gap="sm" wrap="nowrap"> 
            {(changes.length > 0 || Boolean(dropdownPlaceholder)) && (
              <CompareNavigationDropdown
                changes={changes}
                placeholder={dropdownPlaceholder ?? null}
                className={pane === 'comparison' ? 'compare-changes-select--comparison' : undefined}
                onNavigate={onNavigateChange}
                renderedPageNumbers={renderedPageNumbers}
              />
            )}
          </Group>
        </Group>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          handleScrollSync(event.currentTarget, peerScrollRef.current);
          // Notify parent about the currently visible page (throttled via rAF)
          if (visiblePageRafRef.current != null) return;
          if (!onVisiblePageChange || pages.length === 0) return;
          visiblePageRafRef.current = requestAnimationFrame(() => {
            const container = scrollRef.current;
            if (!container) return;
            const mid = container.scrollTop + container.clientHeight * 0.5;
            let bestPage = pages[0]?.pageNumber ?? 1;
            let bestDist = Number.POSITIVE_INFINITY;
            let nodes = pageNodesRef.current;
            if (!nodes || nodes.length !== pages.length) {
              nodes = Array.from(container.querySelectorAll('.compare-diff-page')) as HTMLElement[];
              pageNodesRef.current = nodes;
            }
            for (const el of nodes) {
              const top = el.offsetTop;
              const height = el.clientHeight || 1;
              const center = top + height / 2;
              const dist = Math.abs(center - mid);
              if (dist < bestDist) {
                bestDist = dist;
                const attr = el.getAttribute('data-page-number');
                const pn = attr ? parseInt(attr, 10) : NaN;
                if (!Number.isNaN(pn)) bestPage = pn;
              }
            }
            if (typeof onVisiblePageChange === 'function' && bestPage !== lastReportedVisiblePageRef.current) {
              lastReportedVisiblePageRef.current = bestPage;
              onVisiblePageChange(pane, bestPage);
            }
            visiblePageRafRef.current = null;
          });
        }}
        onMouseDown={undefined}
        onMouseMove={undefined}
        onMouseUp={undefined}
        onMouseLeave={undefined}
        onWheel={(event) => { handleWheelZoom(pane, event); handleWheelOverscroll(pane, event); }}
        onTouchStart={(event) => onTouchStart(pane, event)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="compare-pane__scroll"
        style={{ cursor: cursorStyle }}
      >
        <Stack gap={zoom <= 0.6 ? 2 : zoom <= 0.85 ? 'xs' : 'sm'} className="compare-pane__content">
          {isLoading && (
            <Group justify="center" gap="xs" py="md">
              <Loader size="sm" />
              <Text size="sm">{processingMessage}</Text>
            </Group>
          )}

          {pages.map((page) => {
            const peerPage = pairedPageMap.get(page.pageNumber);
            const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
            const metrics = computePageLayoutMetrics({
              page,
              peerPage: peerPage ?? null,
              layout,
              isMobileViewport,
              scrollRefWidth: scrollRef.current?.clientWidth ?? null,
              viewportWidth,
              zoom,
              offsetPixels: OFFSET_PIXELS,
            });

            const { highlightOffset, containerWidth, containerHeight, innerScale } = metrics;

            // Compute clamped pan for current zoom so content always touches edges when in bounds
            const storedPan = pagePanRef.current.get(page.pageNumber) || { x: 0, y: 0 };
            const contentWidth = Math.max(0, Math.round(containerWidth * innerScale));
            const contentHeight = Math.max(0, Math.round(containerHeight * innerScale));
            const maxPanX = Math.max(0, contentWidth - Math.round(containerWidth));
            const maxPanY = Math.max(0, contentHeight - Math.round(containerHeight));
            const clampedPanX = Math.max(0, Math.min(maxPanX, storedPan.x));
            const clampedPanY = Math.max(0, Math.min(maxPanY, storedPan.y));

            const groupedRects = groupedRectsByPage.get(page.pageNumber) ?? new Map();

            return (
              <>
                <div
                  className="compare-diff-page"
                  data-page-number={page.pageNumber}
                  style={{ minHeight: `${containerHeight}px` }}
                >
                  <div
                    className="compare-page-title"
                    style={{ width: `${containerWidth}px`, marginLeft: 'auto', marginRight: 'auto' }}
                  >
                    <Text size="xs" fw={600} c="dimmed" ta="center">
                      {documentLabel} · {pageLabel} {page.pageNumber}
                    </Text>
                  </div>
                  <div
                    className="compare-diff-page__canvas compare-diff-page__canvas--zoom"
                    style={{ width: `${containerWidth}px`, height: `${containerHeight}px`, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
                    onMouseDown={(e) => {
                      if (!isPanMode || zoom <= 1) return;
                      dragRef.current.active = true;
                      dragRef.current.page = page.pageNumber;
                      dragRef.current.startX = e.clientX;
                      dragRef.current.startY = e.clientY;
                      const curr = pagePanRef.current.get(page.pageNumber) || { x: 0, y: 0 };
                      dragRef.current.startPanX = curr.x;
                      dragRef.current.startPanY = curr.y;
                      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
                      e.preventDefault();
                    }}
                    onMouseMove={(e) => {
                      if (!dragRef.current.active || dragRef.current.page !== page.pageNumber) return;
                      const dx = e.clientX - dragRef.current.startX;
                      const dy = e.clientY - dragRef.current.startY;
                      // Clamp panning based on the actual rendered content size.
                      // The inner layer is width/height of the container, then scaled by innerScale.
                      const contentWidth = Math.max(0, Math.round(containerWidth * innerScale));
                      const contentHeight = Math.max(0, Math.round(containerHeight * innerScale));
                      const maxX = Math.max(0, contentWidth - Math.round(containerWidth));
                      const maxY = Math.max(0, contentHeight - Math.round(containerHeight));
                      const candX = dragRef.current.startPanX - dx;
                      const candY = dragRef.current.startPanY - dy;
                      const next = { x: Math.max(0, Math.min(maxX, candX)), y: Math.max(0, Math.min(maxY, candY)) };
                      pagePanRef.current.set(page.pageNumber, next);
                      e.preventDefault();
                    }}
                    onMouseUp={(e) => {
                      if (dragRef.current.active) {
                        dragRef.current.active = false;
                        (e.currentTarget as HTMLElement).style.cursor = cursorStyle;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dragRef.current.active) {
                        dragRef.current.active = false;
                        (e.currentTarget as HTMLElement).style.cursor = cursorStyle;
                      }
                    }}
                  >
                    <div
                      className={`compare-diff-page__inner compare-diff-page__inner--${pane}`}
                      style={{
                        transform: `scale(${innerScale}) translate3d(${-((clampedPanX) / innerScale)}px, ${-((clampedPanY) / innerScale)}px, 0)`,
                        transformOrigin: 'top left'
                      }}
                    >
                      {/* Image layer */}
                      <img
                        src={page.url ?? ''}
                        alt={altLabel}
                        loading="lazy"
                        decoding="async"
                        className="compare-diff-page__image"
                        onLoad={() => {
                          if (!imageLoadedRef.current.get(page.pageNumber)) {
                            imageLoadedRef.current.set(page.pageNumber, true);
                            setImageLoadedTick((v) => v + 1); // refs don't trigger renders
                          }
                        }}
                      />
                      {/* Overlay loader until the page image is loaded */}
                      {!((imageLoadedRef.current.get(page.pageNumber) ?? false)) && (
                        <div className="compare-page-loader-overlay">
                          <Loader size="sm" />
                        </div>
                      )}
                      {[...groupedRects.entries()].flatMap(([id, rects]) =>
                        mergeConnectedRects(rects).map((rect, index) => {
                          const rotation = normalizeRotation(page.rotation);
                          const verticalOffset = rotation === 180 ? -highlightOffset : highlightOffset;
                          return (
                            <span
                              key={`${pane}-highlight-${page.pageNumber}-${id}-${index}`}
                              data-change-id={id}
                              className="compare-diff-highlight"
                              style={{
                                left: `${rect.left * 100}%`,
                                top: `${(rect.top + verticalOffset) * 100}%`,
                                width: `${rect.width * 100}%`,
                                height: `${rect.height * 100}%`,
                                backgroundColor: HIGHLIGHT_BG_VAR,
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                </>
            );
          })}
        </Stack>
      </div>
    </div>
  );
};

export default CompareDocumentPane;
