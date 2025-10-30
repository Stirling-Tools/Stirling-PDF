import { Group, Loader, Stack, Text } from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import type { PagePreview } from '@app/types/compare';
import type { TokenBoundingBox, CompareDocumentPaneProps } from '@app/types/compare';
import CompareNavigationDropdown from './CompareNavigationDropdown';
import LazyLoadContainer from '@app/components/shared/LazyLoadContainer';
import { useIsMobile } from '@app/hooks/useIsMobile';

const toRgba = (hexColor: string, alpha: number): string => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return hexColor;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Merge overlapping or touching rects into larger non-overlapping blocks.
// This is more robust across rotations (vertical "lines" etc.) and prevents dark spots.
const mergeConnectedRects = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
  if (rects.length === 0) return rects;
  const EPS = 0.004; // small tolerance in normalized page coords
  const sorted = rects.slice().sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
  const merged: TokenBoundingBox[] = [];
  const overlapsOrTouches = (a: TokenBoundingBox, b: TokenBoundingBox) => {
    const aR = a.left + a.width;
    const aB = a.top + a.height;
    const bR = b.left + b.width;
    const bB = b.top + b.height;
    // Overlap or touch within EPS gap
    return !(b.left > aR + EPS || bR < a.left - EPS || b.top > aB + EPS || bB < a.top - EPS);
  };
  for (const r of sorted) {
    let mergedIntoExisting = false;
    for (let i = 0; i < merged.length; i += 1) {
      const m = merged[i];
      if (overlapsOrTouches(m, r)) {
        const left = Math.min(m.left, r.left);
        const top = Math.min(m.top, r.top);
        const right = Math.max(m.left + m.width, r.left + r.width);
        const bottom = Math.max(m.top + m.height, r.top + r.height);
        merged[i] = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        mergedIntoExisting = true;
        break;
      }
    }
    if (!mergedIntoExisting) {
      merged.push({ ...r });
    }
  }
  return merged;
};

const CompareDocumentPane = ({
  pane,
  layout,
  scrollRef,
  peerScrollRef,
  handleScrollSync,
  beginPan,
  continuePan,
  endPan,
  handleWheelZoom,
  handleWheelOverscroll,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  isPanMode,
  zoom,
  pan,
  title,
  dropdownPlaceholder,
  changes,
  onNavigateChange,
  isLoading,
  processingMessage,
  pages,
  pairedPages,
  getRowHeightPx,
  wordHighlightMap,
  metaIndexToGroupId,
  documentLabel,
  pageLabel,
  altLabel,
}: CompareDocumentPaneProps) => {
  const isMobileViewport = useIsMobile();
  const pairedPageMap = useMemo(() => {
    const map = new Map<number, PagePreview>();
    pairedPages.forEach((item) => {
      map.set(item.pageNumber, item);
    });
    return map;
  }, [pairedPages]);

  const HIGHLIGHT_COLOR = pane === 'base' ? '#ff6b6b' : '#51cf66'; // red for base (removals), green for comparison (additions)
  const HIGHLIGHT_OPACITY = pane === 'base' ? 0.45 : 0.35;
  const OFFSET_PIXELS = pane === 'base' ? 4 : 2;
  const cursorStyle = isPanMode && zoom > 1 ? 'grab' : 'auto';
  const panX = (pan?.x ?? 0);
  const panY = (pan?.y ?? 0);

  // Track which page images have finished loading to avoid flashing between states
  const imageLoadedRef = useRef<Map<number, boolean>>(new Map());
  const [, forceRerender] = useState(0);

  return (
    <div className="compare-pane">
      <div className="compare-header">
        <Group justify="space-between" align="center">
          <Text fw={600} size="lg">
            {title}
          </Text>
          {(changes.length > 0 || Boolean(dropdownPlaceholder)) && (
              <CompareNavigationDropdown
                changes={changes}
                placeholder={dropdownPlaceholder ?? null}
                className={pane === 'comparison' ? 'compare-changes-select--comparison' : undefined}
                onNavigate={onNavigateChange}
                renderedPageNumbers={useMemo(() => new Set(pages.map(p => p.pageNumber)), [pages])}
              />
          )}
        </Group>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => handleScrollSync(event.currentTarget, peerScrollRef.current)}
        onMouseDown={(event) => beginPan(pane, event)}
        onMouseMove={continuePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onWheel={(event) => { handleWheelZoom(pane, event); handleWheelOverscroll(pane, event); }}
        onTouchStart={(event) => onTouchStart(pane, event)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="compare-pane__scroll"
        style={{ cursor: cursorStyle }}
      >
        <Stack gap="sm" className="compare-pane__content">
          {isLoading && (
            <Group justify="center" gap="xs" py="md">
              <Loader size="sm" />
              <Text size="sm">{processingMessage}</Text>
            </Group>
          )}

          {pages.map((page) => {
            const peerPage = pairedPageMap.get(page.pageNumber);
            const targetHeight = peerPage ? Math.max(page.height, peerPage.height) : page.height;
            const fit = targetHeight / page.height;
            const rowHeightPx = getRowHeightPx(page.pageNumber);
            const highlightOffset = OFFSET_PIXELS / page.height;
            const rotationNorm = ((page.rotation ?? 0) % 360 + 360) % 360;
            const isPortrait = rotationNorm === 0 || rotationNorm === 180;
            const isLandscape = rotationNorm === 90 || rotationNorm === 270;
            const isStackedPortrait = layout === 'stacked' && isPortrait;
            const isStackedLandscape = layout === 'stacked' && isLandscape;
            const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
            const containerW = scrollRef.current?.clientWidth ?? viewportWidth;
            const stackedWidth = isMobileViewport
              ? Math.max(320, Math.round(containerW))
              : Math.max(320, Math.round(viewportWidth * 0.5));
            const stackedHeight = Math.round(stackedWidth * 1.4142);

            const wordRects = wordHighlightMap.get(page.pageNumber) ?? [];
            const groupedRects = new Map<string, TokenBoundingBox[]>();
            for (const { rect, metaIndex } of wordRects) {
              const id = metaIndexToGroupId.get(metaIndex) ?? `${pane}-token-${metaIndex}`;
              const current = groupedRects.get(id) ?? [];
              current.push(rect);
              groupedRects.set(id, current);
            }
            const preloadMarginPx = Math.max(rowHeightPx * 5, 1200); // render several pages ahead to hide loading flashes

            return (
              <LazyLoadContainer
                key={`${pane}-page-${page.pageNumber}`}
                rootMargin={`${preloadMarginPx}px 0px ${preloadMarginPx}px 0px`}
                threshold={0.1}
                fallback={
                  <div
                    className="compare-diff-page"
                    data-page-number={page.pageNumber}
                    style={{ minHeight: `${rowHeightPx}px` }}
                  >
                  <div
                    className="compare-page-title"
                    style={isStackedPortrait
                      ? { width: `${stackedWidth}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : isStackedLandscape
                      ? { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }}
                  >
                      <Text size="xs" fw={600} c="dimmed" ta="center">
                        {documentLabel} · {pageLabel} {page.pageNumber}
                      </Text>
                    </div>
                    <div
                      className="compare-diff-page__canvas compare-diff-page__canvas--zoom"
                      style={isStackedPortrait
                        ? { width: `${stackedWidth}px`, height: `${stackedHeight}px`, marginLeft: 'auto', marginRight: 'auto' }
                        : isStackedLandscape
                        ? { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }
                        : { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }}
                    >
                      <div
                        className="compare-diff-page__inner"
                        style={{ transform: `translate(${-panX}px, ${-panY}px) scale(${zoom})`, transformOrigin: 'top left' }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.round(page.height * fit)}px`,
                            backgroundColor: '#f8f9fa',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #e9ecef',
                          }}
                        >
                          <Loader size="sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                }
              >
                <div
                  className="compare-diff-page"
                  data-page-number={page.pageNumber}
                  style={{ minHeight: `${rowHeightPx}px` }}
                >
                  <div
                    className="compare-page-title"
                    style={isStackedPortrait
                      ? { width: `${stackedWidth}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : isStackedLandscape
                      ? { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }}
                  >
                    <Text size="xs" fw={600} c="dimmed" ta="center">
                      {documentLabel} · {pageLabel} {page.pageNumber}
                    </Text>
                  </div>
                  <div
                    className="compare-diff-page__canvas compare-diff-page__canvas--zoom"
                    style={isStackedPortrait
                      ? { width: `${stackedWidth}px`, height: `${stackedHeight}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : isStackedLandscape
                      ? { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : { width: `${Math.round(page.width * fit)}px`, marginLeft: 'auto', marginRight: 'auto' }}
                  >
                    <div
                      className={`compare-diff-page__inner compare-diff-page__inner--${pane}`}
                      style={{
                        transform: `translate(${-panX}px, ${-panY}px) scale(${zoom})`,
                        transformOrigin: 'top left'
                      }}
                    >
                      {/* Image layer */}
                      <img
                        src={page.url ?? ''}
                        alt={altLabel}
                        loading="lazy"
                        className="compare-diff-page__image"
                        onLoad={() => {
                          if (!imageLoadedRef.current.get(page.pageNumber)) {
                            imageLoadedRef.current.set(page.pageNumber, true);
                            forceRerender(v => v + 1);
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
                          const rotation = ((page.rotation ?? 0) % 360 + 360) % 360;
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
                                backgroundColor: toRgba(HIGHLIGHT_COLOR, HIGHLIGHT_OPACITY),
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </LazyLoadContainer>
            );
          })}
        </Stack>
      </div>
    </div>
  );
};

export default CompareDocumentPane;
