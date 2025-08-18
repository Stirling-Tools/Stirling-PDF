import React, { useRef, useEffect } from 'react';
import { Box } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import styles from './PageEditor.module.css';

interface DragDropItem {
  id: string;
  splitBefore?: boolean;
}

interface DragDropGridProps<T extends DragDropItem> {
  items: T[];
  selectedItems: number[];
  selectionMode: boolean;
  isAnimating: boolean;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>) => React.ReactNode;
  renderSplitMarker?: (item: T, index: number) => React.ReactNode;
}

const DragDropGrid = <T extends DragDropItem>({
  items,
  selectedItems,
  selectionMode,
  isAnimating,
  onReorderPages,
  renderItem,
  renderSplitMarker,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  
  
  // Grid configuration
  const ITEMS_PER_ROW = 4;
  const ITEM_HEIGHT = 340; // 20rem + gap
  const OVERSCAN = items.length > 1000 ? 8 : 4; // More overscan for large documents
  
  // Virtualization with react-virtual library
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / ITEMS_PER_ROW),
    getScrollElement: () => containerRef.current?.closest('[data-scrolling-container]') as Element,
    estimateSize: () => ITEM_HEIGHT,
    overscan: OVERSCAN,
  });



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
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * ITEMS_PER_ROW;
          const endIndex = Math.min(startIndex + ITEMS_PER_ROW, items.length);
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
                  gap: '1.5rem',
                  justifyContent: 'flex-start',
                  height: '100%',
                  alignItems: 'center',
                }}
              >
                {rowItems.map((item, itemIndex) => {
                  const actualIndex = startIndex + itemIndex;
                  return (
                    <React.Fragment key={item.id}>
                      {/* Split marker */}
                      {renderSplitMarker && item.splitBefore && actualIndex > 0 && renderSplitMarker(item, actualIndex)}
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
