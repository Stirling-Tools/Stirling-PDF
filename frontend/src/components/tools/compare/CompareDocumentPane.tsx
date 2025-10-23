import { Alert, Group, Loader, Stack, Text } from '@mantine/core';
import { MutableRefObject } from 'react';
import type { PagePreview, WordHighlightEntry } from './types';
import type { TokenBoundingBox } from '../../../types/compare';
import CompareNavigationDropdown from './CompareNavigationDropdown';
import { toRgba } from './compareUtils';

interface CompareDocumentPaneProps {
  pane: 'base' | 'comparison';
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  peerScrollRef: MutableRefObject<HTMLDivElement | null>;
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
  changes: Array<{ value: string; label: string }>;
  onNavigateChange: (id: string) => void;
  isLoading: boolean;
  processingMessage: string;
  emptyMessage: string;
  pages: PagePreview[];
  pairedPages: PagePreview[];
  getRowHeightPx: (pageNumber: number) => number;
  highlightColor: string;
  highlightOpacity: number;
  offsetPixels: number;
  wordHighlightMap: Map<number, WordHighlightEntry[]>;
  tokenIndexToGroupId: Map<number, string>;
  documentLabel: string;
  pageLabel: string;
  altLabel: string;
}

const mergeSameLineRects = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
  if (rects.length === 0) {
    return rects;
  }
  const EPS_X = 0.02;
  const EPS_Y = 0.006;
  const sorted = rects
    .slice()
    .sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));

  const merged: TokenBoundingBox[] = [];
  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(rect.top - last.top) < EPS_Y && rect.left <= last.left + last.width + EPS_X) {
      const left = Math.min(last.left, rect.left);
      const right = Math.max(last.left + last.width, rect.left + rect.width);
      const top = Math.min(last.top, rect.top);
      const bottom = Math.max(last.top + last.height, rect.top + rect.height);
      last.left = left;
      last.top = top;
      last.width = Math.max(0, right - left);
      last.height = Math.max(0, bottom - top);
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
};

const CompareDocumentPane = ({
  pane,
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
  highlightColor,
  highlightOpacity,
  offsetPixels,
  wordHighlightMap,
  tokenIndexToGroupId,
  documentLabel,
  pageLabel,
  altLabel,
}: CompareDocumentPaneProps) => {
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
            const highlightOffset = offsetPixels / page.height;

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
              <div
                key={`${pane}-page-${page.pageNumber}`}
                className="compare-diff-page"
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
                    <img
                      src={page.url}
                      alt={altLabel}
                      loading="lazy"
                      className="compare-diff-page__image"
                    />
                    {[...groupedRects.entries()].flatMap(([id, rects]) =>
                      mergeSameLineRects(rects).map((rect, index) => (
                        <span
                          key={`${pane}-highlight-${page.pageNumber}-${id}-${index}`}
                          data-change-id={id}
                          className="compare-diff-highlight"
                          style={{
                            left: `${rect.left * 100}%`,
                            top: `${(rect.top + highlightOffset) * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: `${rect.height * 100}%`,
                            backgroundColor: toRgba(highlightColor, highlightOpacity),
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Stack>
      </div>
    </div>
  );
};

export default CompareDocumentPane;
