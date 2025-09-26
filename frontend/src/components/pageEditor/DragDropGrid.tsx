import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRID_CONSTANTS } from './constants';

interface DragDropItem {
  id: string;
  splitAfter?: boolean;
}

interface DragDropGridProps<T extends DragDropItem> {
  items: T[];
  selectedItems: string[];
  selectionMode: boolean;
  isAnimating: boolean;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => void;
  renderItem: (item: T, index: number, refs: React.RefObject<Map<string, HTMLDivElement>>) => React.ReactNode;
  renderSplitMarker?: (item: T, index: number) => React.ReactNode;
}

const DragDropGrid = <T extends DragDropItem>({
  items,
  renderItem,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive grid configuration
  const [itemsPerRow, setItemsPerRow] = useState(4);
  const OVERSCAN = items.length > 1000 ? GRID_CONSTANTS.OVERSCAN_LARGE : GRID_CONSTANTS.OVERSCAN_SMALL;

  // Calculate items per row based on container width
  const calculateItemsPerRow = useCallback(() => {
    if (!containerRef.current) return 4; // Default fallback

    const containerWidth = containerRef.current.offsetWidth;
    if (containerWidth === 0) return 4; // Container not measured yet

    // Convert rem to pixels for calculation
    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ITEM_WIDTH = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
    const ITEM_GAP = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;

    // Calculate how many items fit: (width - gap) / (itemWidth + gap)
    const availableWidth = containerWidth - ITEM_GAP; // Account for first gap
    const itemWithGap = ITEM_WIDTH + ITEM_GAP;
    const calculated = Math.floor(availableWidth / itemWithGap);

    return Math.max(1, calculated); // At least 1 item per row
  }, []);

  // Update items per row when container resizes
  useEffect(() => {
    const updateLayout = () => {
      const newItemsPerRow = calculateItemsPerRow();
      setItemsPerRow(newItemsPerRow);
    };

    // Initial calculation
    updateLayout();

    // Listen for window resize
    window.addEventListener('resize', updateLayout);

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(updateLayout);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateLayout);
      resizeObserver.disconnect();
    };
  }, [calculateItemsPerRow]);

  // Virtualization with react-virtual library
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / itemsPerRow),
    getScrollElement: () => containerRef.current?.closest('[data-scrolling-container]') as Element,
    estimateSize: () => {
      const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return parseFloat(GRID_CONSTANTS.ITEM_HEIGHT) * remToPx;
    },
    overscan: OVERSCAN,
  });

  // Calculate optimal width for centering
  const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const itemWidth = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
  const itemGap = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;
  const gridWidth = itemsPerRow * itemWidth + (itemsPerRow - 1) * itemGap;

  return (
    <Box
      ref={containerRef}
      style={{
        // Basic container styles
        width: '100%',
        height: '100%',
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
          margin: '0 auto',
          maxWidth: `${gridWidth}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * itemsPerRow;
          const endIndex = Math.min(startIndex + itemsPerRow, items.length);
          const rowItems = items.slice(startIndex, endIndex);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: GRID_CONSTANTS.ITEM_GAP,
                  justifyContent: 'flex-start',
                  height: '100%',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                {rowItems.map((item, itemIndex) => {
                  const actualIndex = startIndex + itemIndex;
                  return (
                    <React.Fragment key={item.id}>
                      {/* Item */}
                      {renderItem(item, actualIndex, itemRefs)}
                    </React.Fragment>
                  );
                })}

              </div>
            </div>
          );
        })}
      </div>
    </Box>
  );
};

export default DragDropGrid;
