import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mantine/core';
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
  onDragStart: (pageNumber: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (pageNumber: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetPageNumber: number | 'end') => void;
  onEndZoneDragEnter: () => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>) => React.ReactNode;
  renderSplitMarker?: (item: T, index: number) => React.ReactNode;
  draggedItem: number | null;
  dropTarget: number | 'end' | null;
  multiItemDrag: {pageNumbers: number[], count: number} | null;
  dragPosition: {x: number, y: number} | null;
}

const DragDropGrid = <T extends DragDropItem>({
  items,
  selectedItems,
  selectionMode,
  isAnimating,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onEndZoneDragEnter,
  renderItem,
  renderSplitMarker,
  draggedItem,
  dropTarget,
  multiItemDrag,
  dragPosition,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  // Virtualization configuration - adjust for document size
  const isLargeDocument = items.length > 1000; // Only virtualize for very large documents
  const ITEM_HEIGHT = 340; // Height of PageThumbnail + gap (20rem + gap)
  const ITEMS_PER_ROW = 4; // Approximate items per row
  const BUFFER_SIZE = isLargeDocument ? 2 : 3; // Larger buffer for smoother scrolling
  const OVERSCAN = ITEMS_PER_ROW * BUFFER_SIZE; // Total buffer items
  
  // Log virtualization stats for debugging
  React.useEffect(() => {
    if (items.length > 100) {
      console.log(`📊 DragDropGrid: Virtualizing ${items.length} items (large doc: ${isLargeDocument}, buffer: ${BUFFER_SIZE})`);
    }
  }, [items.length, isLargeDocument, BUFFER_SIZE]);

  // Throttled scroll handler to prevent excessive re-renders
  const throttleRef = useRef<number>();
  
  // Detect scroll position from parent container
  useEffect(() => {
    const updateScrollPosition = () => {
      // Throttle scroll updates for better performance
      if (throttleRef.current) {
        cancelAnimationFrame(throttleRef.current);
      }
      
      throttleRef.current = requestAnimationFrame(() => {
        const scrollingParent = containerRef.current?.closest('[data-scrolling-container]') || 
                                containerRef.current?.offsetParent?.closest('div[style*="overflow"]');
        
        if (scrollingParent) {
          setScrollTop(scrollingParent.scrollTop || 0);
        }
      });
    };

    const scrollingParent = containerRef.current?.closest('[data-scrolling-container]') ||
                            containerRef.current?.offsetParent?.closest('div[style*="overflow"]');
    
    if (scrollingParent) {
      // Use passive listener for better scrolling performance
      scrollingParent.addEventListener('scroll', updateScrollPosition, { passive: true });
      updateScrollPosition(); // Initial position
      
      return () => {
        scrollingParent.removeEventListener('scroll', updateScrollPosition);
        if (throttleRef.current) {
          cancelAnimationFrame(throttleRef.current);
        }
      };
    }
  }, []);

  // Calculate visible range with virtualization (only for very large documents)
  const { startIndex, endIndex, totalHeight, topSpacer } = useMemo(() => {
    // Skip virtualization for smaller documents to avoid jankiness
    if (!isLargeDocument) {
      return {
        startIndex: 0,
        endIndex: items.length,
        totalHeight: Math.ceil(items.length / ITEMS_PER_ROW) * ITEM_HEIGHT,
        topSpacer: 0
      };
    }

    const containerHeight = containerRef.current?.clientHeight || 600;
    const rowHeight = ITEM_HEIGHT;
    const totalRows = Math.ceil(items.length / ITEMS_PER_ROW);
    const visibleRows = Math.ceil(containerHeight / rowHeight);
    
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_SIZE);
    const endRow = Math.min(totalRows, startRow + visibleRows + BUFFER_SIZE * 2);
    
    const startIndex = startRow * ITEMS_PER_ROW;
    const endIndex = Math.min(items.length, endRow * ITEMS_PER_ROW);
    const totalHeight = totalRows * rowHeight;
    const topSpacer = startRow * rowHeight;
    
    return { startIndex, endIndex, totalHeight, topSpacer };
  }, [items.length, scrollTop, ITEM_HEIGHT, ITEMS_PER_ROW, BUFFER_SIZE, isLargeDocument]);

  // Only render visible items for performance
  const visibleItems = useMemo(() => {
    const visible = items.slice(startIndex, endIndex);
    
    // Debug logging for large documents
    if (items.length > 500 && visible.length > 0) {
      console.log(`📊 DragDropGrid: Rendering ${visible.length} items (${startIndex}-${endIndex-1}) of ${items.length} total`);
    }
    
    return visible;
  }, [items, startIndex, endIndex]);

  // Global drag cleanup
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      onDragEnd();
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    if (draggedItem) {
      document.addEventListener('dragend', handleGlobalDragEnd);
      document.addEventListener('drop', handleGlobalDrop);
    }

    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [draggedItem, onDragEnd]);

  return (
    <Box 
      ref={containerRef}
      style={{ 
        // Performance optimizations for smooth scrolling
        transform: 'translateZ(0)', // Force hardware acceleration
        backfaceVisibility: 'hidden', // Better rendering performance
        WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
      }}
    >
      <div
        style={{
          position: 'relative',
          height: totalHeight,
          paddingBottom: '100px'
        }}
      >
        {/* Top spacer for virtualization */}
        <div style={{ height: topSpacer }} />
        
        {/* Visible items container */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            justifyContent: 'flex-start',
            // Prevent layout shifts during scrolling
            containIntrinsicSize: '20rem 20rem',
            contain: 'layout style',
          }}
        >
          {visibleItems.map((item, visibleIndex) => {
            const actualIndex = startIndex + visibleIndex;
            return (
              <React.Fragment key={item.id}>
                {/* Split marker */}
                {renderSplitMarker && item.splitBefore && actualIndex > 0 && renderSplitMarker(item, actualIndex)}

                {/* Item */}
                {renderItem(item, actualIndex, itemRefs)}
              </React.Fragment>
            );
          })}
          
          {/* End drop zone - inline with pages */}
          <div className="w-[20rem] h-[20rem] flex items-center justify-center flex-shrink-0">
            <div
              data-drop-zone="end"
              className={`cursor-pointer select-none w-[15rem] h-[15rem] flex items-center justify-center flex-shrink-0 shadow-sm hover:shadow-md transition-all relative ${
                dropTarget === 'end'
                  ? 'ring-2 ring-green-500 bg-green-50'
                  : 'bg-white hover:bg-blue-50 border-2 border-dashed border-gray-300 hover:border-blue-400'
              }`}
              style={{ borderRadius: '12px' }}
              onDragOver={onDragOver}
              onDragEnter={onEndZoneDragEnter}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, 'end')}
            >
              <div className="text-gray-500 text-sm text-center font-medium">
                Drop here to<br />move to end
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-item drag indicator */}
      {multiItemDrag && dragPosition && (
        <div
          className={styles.multiDragIndicator}
          style={{
            left: dragPosition.x,
            top: dragPosition.y,
          }}
        >
          {multiItemDrag.count} items
        </div>
      )}
    </Box>
  );
};

export default DragDropGrid;
