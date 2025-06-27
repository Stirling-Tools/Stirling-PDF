import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box } from '@mantine/core';
import styles from './PageEditor.module.css';

interface DragDropItem {
  id: string;
  splitBefore?: boolean;
}

interface DragDropGridProps<T extends DragDropItem> {
  items: T[];
  selectedItems: string[];
  selectionMode: boolean;
  isAnimating: boolean;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (itemId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string | 'end') => void;
  onEndZoneDragEnter: () => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>) => React.ReactNode;
  renderSplitMarker?: (item: T, index: number) => React.ReactNode;
  draggedItem: string | null;
  dropTarget: string | null;
  multiItemDrag: {itemIds: string[], count: number} | null;
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
    <Box>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.5rem',
          justifyContent: 'flex-start',
          paddingBottom: '100px',
          // Performance optimizations for smooth scrolling
          willChange: 'scroll-position',
          transform: 'translateZ(0)', // Force hardware acceleration
          backfaceVisibility: 'hidden',
          // Use containment for better rendering performance
          contain: 'layout style paint',
        }}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {/* Split marker */}
            {renderSplitMarker && item.splitBefore && index > 0 && renderSplitMarker(item, index)}

            {/* Item */}
            {renderItem(item, index, itemRefs)}
          </React.Fragment>
        ))}

        {/* End drop zone */}
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
