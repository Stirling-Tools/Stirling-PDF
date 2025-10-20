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
  selectedItems: string[];
  selectionMode: boolean;
  isAnimating: boolean;
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>, boxSelectedIds: string[], clearBoxSelection: () => void, getBoxSelection: () => string[], activeId: string | null, isOver: boolean, dragHandleProps?: any, zoomLevel?: number) => React.ReactNode;
  renderSplitMarker?: (item: T, index: number) => React.ReactNode;
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  zoomLevel?: number;
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
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  onUpdateDropTarget: (itemId: string | null) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>, boxSelectedIds: string[], clearBoxSelection: () => void, getBoxSelection: () => string[], activeId: string | null, isOver: boolean, dragHandleProps?: any, zoomLevel?: number) => React.ReactNode;
  zoomLevel: number;
}

const DraggableItem = <T extends DragDropItem>({ item, index, itemRefs, boxSelectedPageIds, clearBoxSelection, getBoxSelection, activeId, getThumbnailData, renderItem, onUpdateDropTarget, zoomLevel }: DraggableItemProps<T>) => {
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
      {renderItem(item, index, itemRefs, boxSelectedPageIds, clearBoxSelection, getBoxSelection, activeId, isOver, { ref: setNodeRef, ...attributes, ...listeners }, zoomLevel)}
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

  // Filter out placeholder items (invisible pages for deselected files)
  const visibleItems = items.filter(item => !item.isPlaceholder);

  // Box selection state
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectedPageIds, setBoxSelectedPageIds] = useState<string[]>([]);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ src: string; rotation: number } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

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
          // Step 1: Group items by rows and find closest row to cursor
          const rows = new Map<number, Array<{ id: string; element: HTMLDivElement; rect: DOMRect }>>();

          itemRefs.current.forEach((element, itemId) => {
            // Skip the item being dragged
            if (itemId === activeId) return;

            const rect = element.getBoundingClientRect();
            const rowCenter = rect.top + rect.height / 2;

            // Group items by their vertical center position (items in same row will have similar centers)
            let foundRow = false;
            rows.forEach((items, rowY) => {
              if (Math.abs(rowY - rowCenter) < rect.height / 4) {
                items.push({ id: itemId, element, rect });
                foundRow = true;
              }
            });

            if (!foundRow) {
              rows.set(rowCenter, [{ id: itemId, element, rect }]);
            }
          });

          // Step 2: Find the closest row to cursor Y position
          let closestRowY = 0;
          let closestRowDistance = Infinity;
          Array.from(rows.keys()).forEach((rowY) => {
            const distance = Math.abs(cursorY - rowY);
            if (distance < closestRowDistance) {
              closestRowDistance = distance;
              closestRowY = rowY;
            }
          });

          const closestRow = rows.get(closestRowY);
          if (!closestRow || closestRow.length === 0) {
            setHoveredItemId(null);
            setDropSide(null);
            rafId = null;
            return;
          }

          // Step 3: Within the closest row, find the closest edge to cursor X position
          let closestItemId: string | null = null;
          let closestDistance = Infinity;
          let closestSide: 'left' | 'right' = 'left';

          closestRow.forEach(({ id, rect }) => {
            // Calculate distance to left and right edges
            const distanceToLeft = Math.abs(cursorX - rect.left);
            const distanceToRight = Math.abs(cursorX - rect.right);

            // Find the closest edge
            if (distanceToLeft < closestDistance) {
              closestDistance = distanceToLeft;
              closestItemId = id;
              closestSide = 'left';
            }
            if (distanceToRight < closestDistance) {
              closestDistance = distanceToRight;
              closestItemId = id;
              closestSide = 'right';
            }
          });

          setHoveredItemId(closestItemId);
          setDropSide(closestSide);
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
    getScrollElement: () => containerRef.current?.closest('[data-scrolling-container]') as Element,
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

  // Box selection handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start box select if Ctrl/Cmd is held
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Clear previous box selection when starting new one
      setIsBoxSelecting(true);
      setBoxSelectStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setBoxSelectEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setBoxSelectedPageIds([]);
    } else {
      // Clear box selection when clicking without Ctrl
      if (boxSelectedPageIds.length > 0) {
        setBoxSelectedPageIds([]);
      }
    }
  }, [boxSelectedPageIds.length]);

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
    const overData = over.data.current;

    if (!activeData || !overData) return;

    const sourcePageNumber = activeData.pageNumber;
    let targetIndex = overData.index;

    // Use the final drop side to adjust target index
    if (finalDropSide === 'right') {
      targetIndex = targetIndex + 1;
    }

    // Check if this page is box-selected
    const isBoxSelected = boxSelectedPageIds.includes(active.id as string);
    const pagesToDrag = isBoxSelected && boxSelectedPageIds.length > 0 ? boxSelectedPageIds : undefined;

    // Call reorder with page number and target index
    onReorderPages(sourcePageNumber, targetIndex, pagesToDrag);

    // Clear box selection after drag
    if (pagesToDrag) {
      clearBoxSelection();
    }
  }, [boxSelectedPageIds, dropSide, onReorderPages, clearBoxSelection]);

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
        style={{
          // Basic container styles
          width: '100%',
          height: '100%',
          position: 'relative',
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
          position: 'relative',
          margin: '0 auto',
          maxWidth: `${gridWidth}px`,
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
