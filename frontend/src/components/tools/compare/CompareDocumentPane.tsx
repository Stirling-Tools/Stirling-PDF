import { Alert, Group, Loader, Stack, Text } from '@mantine/core';
import { RefObject } from 'react';
import type { PagePreview, WordHighlightEntry } from './types';
import type { TokenBoundingBox } from '../../../types/compare';
import CompareNavigationDropdown from './CompareNavigationDropdown';
import { toRgba } from './compareUtils';
import LazyLoadContainer from '../../shared/LazyLoadContainer';
import { useMediaQuery } from '@mantine/hooks';

interface CompareDocumentPaneProps {
  pane: 'base' | 'comparison';
  layout: 'side-by-side' | 'stacked';
  scrollRef: RefObject<HTMLDivElement | null>;
  peerScrollRef: RefObject<HTMLDivElement | null>;
  handleScrollSync: (source: HTMLDivElement | null, target: HTMLDivElement | null) => void;
  beginPan: (pane: 'base' | 'comparison', event: React.MouseEvent<HTMLDivElement>) => void;
  continuePan: (event: React.MouseEvent<HTMLDivElement>) => void;
  endPan: () => void;
  handleWheelZoom: (pane: 'base' | 'comparison', event: React.WheelEvent<HTMLDivElement>) => void;
  onTouchStart: (pane: 'base' | 'comparison', event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
  isPanMode: boolean;
  zoom: number;
  pan?: { x: number; y: number };
  title: string;
  dropdownPlaceholder?: string;
  changes: Array<{ value: string; label: string; pageNumber?: number }>;
  onNavigateChange: (id: string, pageNumber?: number) => void;
  isLoading: boolean;
  processingMessage: string;
  emptyMessage: string;
  pages: PagePreview[];
  pairedPages: PagePreview[];
  getRowHeightPx: (pageNumber: number) => number;
  wordHighlightMap: Map<number, WordHighlightEntry[]>;
  tokenIndexToGroupId: Map<number, string>;
  documentLabel: string;
  pageLabel: string;
  altLabel: string;
}

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
  emptyMessage,
  pages,
  pairedPages,
  getRowHeightPx,
  wordHighlightMap,
  tokenIndexToGroupId,
  documentLabel,
  pageLabel,
  altLabel,
}: CompareDocumentPaneProps) => {
  // Constants that vary by pane
  const HIGHLIGHT_COLOR = pane === 'base' ? '#ff6b6b' : '#51cf66'; // red for base (removals), green for comparison (additions)
  const HIGHLIGHT_OPACITY = pane === 'base' ? 0.45 : 0.35;
  const OFFSET_PIXELS = pane === 'base' ? 4 : 2;
  const cursorStyle = isPanMode && zoom > 1 ? 'grab' : 'auto';
  const panX = (pan?.x ?? 0);
  const panY = (pan?.y ?? 0);

  return (
    <div className="compare-pane">
      <div className="compare-header">
        <Group justify="space-between" align="center">
          <Text fw={600} size="lg">
            {title}
          </Text>
          {changes.length > 0 && (
            <CompareNavigationDropdown
              changes={changes}
              placeholder={dropdownPlaceholder ?? ''}
              className={pane === 'comparison' ? 'compare-changes-select--comparison' : undefined}
              onNavigate={onNavigateChange}
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
        onWheel={(event) => handleWheelZoom(pane, event)}
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

          {!isLoading && pages.length === 0 && (
            <Alert color="gray" variant="light">
              <Text size="sm">{emptyMessage}</Text>
            </Alert>
          )}

          {pages.map((page) => {
            const peerPage = pairedPages.find((item) => item.pageNumber === page.pageNumber);
            const targetHeight = peerPage ? Math.max(page.height, peerPage.height) : page.height;
            const fit = targetHeight / page.height;
            const rowHeightPx = getRowHeightPx(page.pageNumber);
            const highlightOffset = OFFSET_PIXELS / page.height;
            const rotationNorm = ((page.rotation ?? 0) % 360 + 360) % 360;
            const isPortrait = rotationNorm === 0 || rotationNorm === 180;
            const isStackedPortrait = layout === 'stacked' && isPortrait;
            const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
            const isMobile = useMediaQuery('(max-width: 1024px)');
            const containerW = scrollRef.current?.clientWidth ?? viewportWidth;
            const stackedWidth = isMobile
              ? Math.max(320, Math.round(containerW))
              : Math.max(320, Math.round(viewportWidth * 0.5));
            const stackedHeight = Math.round(stackedWidth * 1.4142);

            const wordRects = wordHighlightMap.get(page.pageNumber) ?? [];
            const groupedRects = new Map<string, TokenBoundingBox[]>();
            for (const { rect, index } of wordRects) {
              const id =
                tokenIndexToGroupId.get(index) ?? `${pane}-token-${index}`;
              const current = groupedRects.get(id) ?? [];
              current.push(rect);
              groupedRects.set(id, current);
            }

            return (
              <LazyLoadContainer
                key={`${pane}-page-${page.pageNumber}`}
                rootMargin="100px"
                threshold={0.1}
                fallback={
                  <div
                    className="compare-diff-page"
                    data-page-number={page.pageNumber}
                    style={{ minHeight: `${rowHeightPx}px` }}
                  >
                    <Text size="xs" fw={600} c="dimmed">
                      {documentLabel} · {pageLabel} {page.pageNumber}
                    </Text>
                    <div
                      className="compare-diff-page__canvas compare-diff-page__canvas--zoom"
                      style={{ width: `${Math.round(page.width * fit)}px` }}
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
                  <Text size="xs" fw={600} c="dimmed">
                    {documentLabel} · {pageLabel} {page.pageNumber}
                  </Text>
                  <div
                    className="compare-diff-page__canvas compare-diff-page__canvas--zoom"
                    style={isStackedPortrait
                      ? { width: `${stackedWidth}px`, height: `${stackedHeight}px`, marginLeft: 'auto', marginRight: 'auto' }
                      : { width: `${Math.round(page.width * fit)}px` }}
                  >
                    <div
                      className={`compare-diff-page__inner compare-diff-page__inner--${pane}`}
                      style={{ transform: `translate(${-panX}px, ${-panY}px) scale(${zoom})`, transformOrigin: 'top left' }}
                    >
                      <img
                        src={page.url}
                        alt={altLabel}
                        loading="lazy"
                        className="compare-diff-page__image"
                      />
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
