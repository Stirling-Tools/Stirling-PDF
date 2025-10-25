import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Box } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRID_CONSTANTS } from './constants';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';

interface DragDropItem {
  id: string;
  splitAfter?: boolean;
  isPlaceholder?: boolean;
}

interface DragDropGridProps<T extends DragDropItem> {
  items: T[];
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>, boxSelectedIds: string[], clearBoxSelection: () => void, getBoxSelection: () => string[], activeId: string | null, activeDragIds: string[], justMoved: boolean, isOver: boolean, dragHandleProps?: any, zoomLevel?: number) => React.ReactNode;
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  zoomLevel?: number;
}

type DropSide = 'left' | 'right' | null;

interface DropHint {
  hoveredId: string | null;
  dropSide: DropSide;
}

function resolveDropHint(
  activeId: string | null,
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  cursorX: number,
  cursorY: number,
): DropHint {
  if (!activeId) {
    return { hoveredId: null, dropSide: null };
  }

  const rows = new Map<number, Array<{ id: string; rect: DOMRect }>>();

  itemRefs.current.forEach((element, itemId) => {
    if (!element || itemId === activeId) return;

    const rect = element.getBoundingClientRect();
    const rowCenter = rect.top + rect.height / 2;

    let row = rows.get(rowCenter);
    if (!row) {
      row = [];
      rows.set(rowCenter, row);
    }
    row.push({ id: itemId, rect });
  });

  let hoveredId: string | null = null;
  let dropSide: DropSide = null;

  let closestRowY = 0;
  let closestRowDistance = Infinity;

  rows.forEach((_items, rowY) => {
    const distance = Math.abs(cursorY - rowY);
    if (distance < closestRowDistance) {
      closestRowDistance = distance;
      closestRowY = rowY;
    }
  });

  const closestRow = rows.get(closestRowY);
  if (!closestRow || closestRow.length === 0) {
    return { hoveredId: null, dropSide: null };
  }

  let closestDistance = Infinity;
  closestRow.forEach(({ id, rect }) => {
    const distanceToLeft = Math.abs(cursorX - rect.left);
    const distanceToRight = Math.abs(cursorX - rect.right);

    if (distanceToLeft < closestDistance) {
      closestDistance = distanceToLeft;
      hoveredId = id;
      dropSide = 'left';
    }
    if (distanceToRight < closestDistance) {
      closestDistance = distanceToRight;
      hoveredId = id;
      dropSide = 'right';
    }
  });

  return { hoveredId, dropSide };
}

function resolveTargetIndex<T extends DragDropItem>(
  hoveredId: string | null,
  dropSide: DropSide,
  filteredItems: T[],
  filteredToOriginalIndex: number[],
  originalItemsLength: number,
  fallbackIndex: number | null,
): number | null {
  const convertFilteredIndexToOriginal = (filteredIndex: number): number => {
    if (filteredToOriginalIndex.length === 0) {
      return 0;
    }

    if (filteredIndex <= 0) {
      return filteredToOriginalIndex[0];
    }

    if (filteredIndex >= filteredToOriginalIndex.length) {
      return originalItemsLength;
    }

    return filteredToOriginalIndex[filteredIndex];
  };

  if (hoveredId) {
    const filteredIndex = filteredItems.findIndex(item => item.id === hoveredId);
    if (filteredIndex !== -1) {
      const adjustedIndex = filteredIndex + (dropSide === 'right' ? 1 : 0);
      return convertFilteredIndexToOriginal(adjustedIndex);
    }
  }

  if (fallbackIndex !== null && fallbackIndex !== undefined) {
    const adjustedIndex = fallbackIndex + (dropSide === 'right' ? 1 : 0);
    return convertFilteredIndexToOriginal(adjustedIndex);
  }

  return null;
}

// Lightweight wrapper that handles dnd-kit hooks for each visible item
interface DraggableItemProps<T extends DragDropItem> {
  item: T;
  index: number;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  boxSelectedPageIds: string[];
  clearBoxSelection: () => void;
  getBoxSelection: () => string[];
  activeId: string | null;
  activeDragIds: string[];
  justMoved: boolean;
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  onUpdateDropTarget: (itemId: string | null) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>, boxSelectedIds: string[], clearBoxSelection: () => void, getBoxSelection: () => string[], activeId: string | null, activeDragIds: string[], justMoved: boolean, isOver: boolean, dragHandleProps?: any, zoomLevel?: number) => React.ReactNode;
  zoomLevel: number;
}

const DraggableItem = <T extends DragDropItem>({ item, index, itemRefs, boxSelectedPageIds, clearBoxSelection, getBoxSelection, activeId, activeDragIds, justMoved, getThumbnailData, renderItem, onUpdateDropTarget, zoomLevel }: DraggableItemProps<T>) => {
  const { attributes, listeners, setNodeRef: setDraggableRef } = useDraggable({
    id: item.id,
    data: {
      index,
      pageNumber: index + 1,
      getThumbnail: () => {
        if (getThumbnailData) {
          const data = getThumbnailData(item.id);
          if (data?.src) return data;
        }

        const element = itemRefs.current.get(item.id);
        const imgElement = element?.querySelector('img.ph-no-capture') as HTMLImageElement;
        if (imgElement?.src) {
          return {
            src: imgElement.src,
            rotation: imgElement.dataset.originalRotation ? parseInt(imgElement.dataset.originalRotation) : 0
          };
        }
        return null;
      }
    }
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
    data: { index, pageNumber: index + 1 }
  });

  // Notify parent when hover state changes
  React.useEffect(() => {
    if (isOver) {
      onUpdateDropTarget(item.id);
    } else {
      onUpdateDropTarget(null);
    }
  }, [isOver, item.id, onUpdateDropTarget]);

  const setNodeRef = useCallback((element: HTMLDivElement | null) => {
    setDraggableRef(element);
    setDroppableRef(element);
  }, [setDraggableRef, setDroppableRef]);

  return (
    <>
      {renderItem(item, index, itemRefs, boxSelectedPageIds, clearBoxSelection, getBoxSelection, activeId, activeDragIds, justMoved, isOver, { ref: setNodeRef, ...attributes, ...listeners }, zoomLevel)}
    </>
  );
};

const DragDropGrid = <T extends DragDropItem>({
  items,
  renderItem,
  onReorderPages,
  getThumbnailData,
  zoomLevel = 1.0,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const getScrollElement = useCallback(() => {
    return containerRef.current?.closest('[data-scrolling-container]') as HTMLElement | null;
  }, []);

  const { filteredItems: visibleItems, filteredToOriginalIndex } = useMemo(() => {
    const filtered: T[] = [];
    const indexMap: number[] = [];

    items.forEach((item, index) => {
      if (!item.isPlaceholder) {
        filtered.push(item);
        indexMap.push(index);
      }
    });

    return { filteredItems: filtered, filteredToOriginalIndex: indexMap };
  }, [items]);

  // Box selection state
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectedPageIds, setBoxSelectedPageIds] = useState<string[]>([]);
  const [justMovedIds, setJustMovedIds] = useState<string[]>([]);
  const highlightTimeoutRef = useRef<number | null>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ src: string; rotation: number } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<DropSide>(null);

  // Configure sensors for dnd-kit with activation constraint
  // Require 10px movement before drag starts to allow clicks for selection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  // Throttled pointer move handler for drop indicator
  // Calculate drop position based on cursor location relative to ALL items, not just hovered item
  useEffect(() => {
    if (!activeId) {
      setDropSide(null);
      setHoveredItemId(null);
      return;
    }

    let rafId: number | null = null;

    const handlePointerMove = (e: PointerEvent) => {
      // Use the actual cursor position (pointer coordinates)
      const cursorX = e.clientX;
      const cursorY = e.clientY;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          const hint = resolveDropHint(activeId, itemRefs, cursorX, cursorY);
          setHoveredItemId(hint.hoveredId);
          setDropSide(hint.dropSide);
          rafId = null;
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [activeId]);

  // Responsive grid configuration
  const [itemsPerRow, setItemsPerRow] = useState(4);
  const OVERSCAN = visibleItems.length > 1000 ? GRID_CONSTANTS.OVERSCAN_LARGE : GRID_CONSTANTS.OVERSCAN_SMALL;

  // Calculate items per row based on container width
  const calculateItemsPerRow = useCallback(() => {
    if (!containerRef.current) return 4; // Default fallback

    const containerWidth = containerRef.current.offsetWidth;
    if (containerWidth === 0) return 4; // Container not measured yet

    // Convert rem to pixels for calculation
    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ITEM_WIDTH = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx * zoomLevel;
    const ITEM_GAP = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx * zoomLevel;

    // Calculate how many items fit: (width - gap) / (itemWidth + gap)
    const availableWidth = containerWidth - ITEM_GAP; // Account for first gap
    const itemWithGap = ITEM_WIDTH + ITEM_GAP;
    const calculated = Math.floor(availableWidth / itemWithGap);

    return Math.max(1, calculated); // At least 1 item per row
  }, [zoomLevel]);

  // Update items per row when container resizes or zoom changes
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
  }, [calculateItemsPerRow, zoomLevel]);

  // Virtualization with react-virtual library
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(visibleItems.length / itemsPerRow),
    getScrollElement,
    estimateSize: () => {
      const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return parseFloat(GRID_CONSTANTS.ITEM_HEIGHT) * remToPx * zoomLevel;
    },
    overscan: OVERSCAN,
  });

  // Re-measure virtualizer when zoom or items per row changes
  useEffect(() => {
    rowVirtualizer.measure();
  }, [zoomLevel, itemsPerRow]);

  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  // Box selection handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only respond to primary button

    const container = containerRef.current;
    if (!container) return;

    const clickTarget = e.target as Node;
    let clickedPageId: string | null = null;

    itemRefs.current.forEach((element, pageId) => {
      if (element.contains(clickTarget)) {
        clickedPageId = pageId;
      }
    });

    if (clickedPageId) {
      // Clicking directly on a page shouldn't initiate box selection
      // but clear previous box selection if clicking outside current group
      if (boxSelectedPageIds.length > 0 && !boxSelectedPageIds.includes(clickedPageId)) {
        setBoxSelectedPageIds([]);
      }
      return;
    }

    e.preventDefault();

    const rect = container.getBoundingClientRect();
    setIsBoxSelecting(true);
    setBoxSelectStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setBoxSelectEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setBoxSelectedPageIds([]);
  }, [boxSelectedPageIds]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isBoxSelecting || !boxSelectStart) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setBoxSelectEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Calculate which pages intersect with selection box
    const boxLeft = Math.min(boxSelectStart.x, e.clientX - rect.left);
    const boxRight = Math.max(boxSelectStart.x, e.clientX - rect.left);
    const boxTop = Math.min(boxSelectStart.y, e.clientY - rect.top);
    const boxBottom = Math.max(boxSelectStart.y, e.clientY - rect.top);

    const selectedIds: string[] = [];
    itemRefs.current.forEach((pageEl, pageId) => {
      const pageRect = pageEl.getBoundingClientRect();
      const pageLeft = pageRect.left - rect.left;
      const pageRight = pageRect.right - rect.left;
      const pageTop = pageRect.top - rect.top;
      const pageBottom = pageRect.bottom - rect.top;

      // Check if page intersects with selection box
      const intersects = !(
        pageRight < boxLeft ||
        pageLeft > boxRight ||
        pageBottom < boxTop ||
        pageTop > boxBottom
      );

      if (intersects) {
        selectedIds.push(pageId);
      }
    });

    setBoxSelectedPageIds(selectedIds);
  }, [isBoxSelecting, boxSelectStart]);

  const handleMouseUp = useCallback(() => {
    if (isBoxSelecting) {
      // Keep box-selected pages highlighted (don't clear boxSelectedPageIds yet)
      // They will remain highlighted until next interaction
      setIsBoxSelecting(false);
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
    }
  }, [isBoxSelecting]);

  // Function to clear box selection (exposed to child components)
  const clearBoxSelection = useCallback(() => {
    setBoxSelectedPageIds([]);
  }, []);

  // Function to get current box selection (exposed to child components)
  const getBoxSelection = useCallback(() => {
    return boxSelectedPageIds;
  }, [boxSelectedPageIds]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = event.active.id as string;
    setActiveId(activeId);

    // Call the getter function to get fresh thumbnail data
    const getThumbnail = event.active.data.current?.getThumbnail;
    if (getThumbnail) {
      const thumbnailData = getThumbnail();
      if (thumbnailData?.src) {
        setDragPreview({ src: thumbnailData.src, rotation: thumbnailData.rotation });
        return;
      }
    }

    setDragPreview(null);
  }, []);


  // Handle drag cancel
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDragPreview(null);
    setHoveredItemId(null);
    setDropSide(null);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    const finalDropSide = dropSide;
    setActiveId(null);
    setDragPreview(null);
    setHoveredItemId(null);
    setDropSide(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Get data from hooks
    const activeData = active.data.current;
    if (!activeData) return;

    const sourcePageNumber = activeData.pageNumber;

    const overData = over?.data.current;
    let targetIndex = resolveTargetIndex(
      hoveredItemId,
      finalDropSide,
      visibleItems,
      filteredToOriginalIndex,
      items.length,
      overData ? overData.index : null
    );

    if (targetIndex === null) return;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex > items.length) targetIndex = items.length;

    // Check if this page is box-selected
    const isBoxSelected = boxSelectedPageIds.includes(active.id as string);
    const pagesToDrag = isBoxSelected && boxSelectedPageIds.length > 0 ? boxSelectedPageIds : undefined;

    // Call reorder with page number and target index
    onReorderPages(sourcePageNumber, targetIndex, pagesToDrag);

    // Highlight moved pages briefly
    const movedIds = pagesToDrag ?? [active.id as string];
    setJustMovedIds(movedIds);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setJustMovedIds([]);
      highlightTimeoutRef.current = null;
    }, 1200);

    // Clear box selection after drag
    if (pagesToDrag) {
      clearBoxSelection();
    }
  }, [boxSelectedPageIds, dropSide, hoveredItemId, visibleItems, filteredToOriginalIndex, items, onReorderPages, clearBoxSelection]);

  // Calculate optimal width for centering
  const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const itemWidth = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx * zoomLevel;
  const itemGap = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx * zoomLevel;
  const gridWidth = itemsPerRow * itemWidth + (itemsPerRow - 1) * itemGap;

  // Calculate selection box dimensions
  const selectionBoxStyle = isBoxSelecting && boxSelectStart && boxSelectEnd ? {
    position: 'absolute' as const,
    left: Math.min(boxSelectStart.x, boxSelectEnd.x),
    top: Math.min(boxSelectStart.y, boxSelectEnd.y),
    width: Math.abs(boxSelectEnd.x - boxSelectStart.x),
    height: Math.abs(boxSelectEnd.y - boxSelectStart.y),
    border: '2px dashed #3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    pointerEvents: 'none' as const,
    zIndex: 1000,
  } : null;

  // Calculate drop indicator position
  const dropIndicatorStyle = useMemo(() => {
    if (!hoveredItemId || !dropSide || !activeId) return null;

    const element = itemRefs.current.get(hoveredItemId);
    const container = containerRef.current;
    if (!element || !container) return null;

    const itemRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const top = itemRect.top - containerRect.top;
    const height = itemRect.height;
    const left = dropSide === 'left'
      ? itemRect.left - containerRect.left - itemGap / 2
      : itemRect.right - containerRect.left + itemGap / 2;

    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: '4px',
      height: `${height}px`,
      backgroundColor: 'rgba(96, 165, 250, 0.8)',
      borderRadius: '2px',
      zIndex: 1001,
      pointerEvents: 'none' as const,
    };
  }, [hoveredItemId, dropSide, activeId, itemGap, zoomLevel]);

  const activeDragIds = useMemo(() => {
    if (!activeId) return [];
    if (boxSelectedPageIds.includes(activeId)) {
      return boxSelectedPageIds;
    }
    return [activeId];
  }, [activeId, boxSelectedPageIds]);

  const handleWheelWhileDragging = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!activeId) {
      return;
    }

    const scrollElement = getScrollElement();
    if (!scrollElement) {
      return;
    }

    scrollElement.scrollBy({
      top: event.deltaY,
      left: event.deltaX,
    });

    event.preventDefault();
  }, [activeId, getScrollElement]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheelWhileDragging}
        style={{
          // Basic container styles
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Selection box overlay */}
        {selectionBoxStyle && <div style={selectionBoxStyle} />}

        {/* Global drop indicator */}
        {dropIndicatorStyle && <div style={dropIndicatorStyle} />}

      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          maxWidth: `${gridWidth}px`,
          position: 'relative',
          margin: '0 auto',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * itemsPerRow;
          const endIndex = Math.min(startIndex + itemsPerRow, visibleItems.length);
          const rowItems = visibleItems.slice(startIndex, endIndex);

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
                  gap: `calc(${GRID_CONSTANTS.ITEM_GAP} * ${zoomLevel})`,
                  justifyContent: 'flex-start',
                  height: '100%',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                {rowItems.map((item, itemIndex) => {
                  const actualIndex = startIndex + itemIndex;
                  return (
                    <DraggableItem
                      key={item.id}
                      item={item}
                      index={actualIndex}
                      itemRefs={itemRefs}
                      boxSelectedPageIds={boxSelectedPageIds}
                      clearBoxSelection={clearBoxSelection}
                      getBoxSelection={getBoxSelection}
                      activeId={activeId}
                      activeDragIds={activeDragIds}
                      justMoved={justMovedIds.includes(item.id)}
                      getThumbnailData={getThumbnailData}
                      onUpdateDropTarget={setHoveredItemId}
                      renderItem={renderItem}
                      zoomLevel={zoomLevel}
                    />
                  );
                })}

              </div>
            </div>
          );
        })}
      </div>
    </Box>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeId && (
          <div style={{ position: 'relative', cursor: 'grabbing' }}>
            {/* Multi-page badge */}
            {boxSelectedPageIds.includes(activeId) && boxSelectedPageIds.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  zIndex: 1001
                }}
              >
                {boxSelectedPageIds.length}
              </div>
            )}
            {/* Just the thumbnail image */}
            {dragPreview ? (
              <img
                src={dragPreview.src}
                alt="Dragging"
                style={{
                  width: `calc(20rem * ${zoomLevel})`,
                  height: `calc(20rem * ${zoomLevel})`,
                  objectFit: 'contain',
                  transform: `rotate(${dragPreview.rotation}deg)`,
                  pointerEvents: 'none',
                  opacity: 0.5,
                }}
              />
            ) : (
              <div style={{
                width: `calc(20rem * ${zoomLevel})`,
                height: `calc(20rem * ${zoomLevel})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
                opacity: 0.5,
              }}>
                📄
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default DragDropGrid;
