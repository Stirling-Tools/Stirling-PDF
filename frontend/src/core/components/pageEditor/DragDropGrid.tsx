import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Box } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRID_CONSTANTS } from '@app/components/pageEditor/constants';
import styles from '@app/components/pageEditor/DragDropGrid.module.css';
import {
  Z_INDEX_SELECTION_BOX,
  Z_INDEX_DROP_INDICATOR,
  Z_INDEX_DRAG_BADGE,
} from '@app/styles/zIndex';
import { LocalIcon } from '@app/components/shared/LocalIcon';
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
  originalFileId?: string;
  pageNumber?: number;
}

interface DragDropGridProps<T extends DragDropItem> {
  items: T[];
  onReorderPages: (sourcePageNumber: number, targetIndex: number, selectedPageIds?: string[]) => void;
  renderItem: (item: T, index: number, refs: React.MutableRefObject<Map<string, HTMLDivElement>>, boxSelectedIds: string[], clearBoxSelection: () => void, getBoxSelection: () => string[], activeId: string | null, activeDragIds: string[], justMoved: boolean, isOver: boolean, dragHandleProps?: any, zoomLevel?: number) => React.ReactNode;
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  zoomLevel?: number;
  selectedFileIds?: string[];
  selectedPageIds?: string[];
  onVisibleItemsChange?: (items: T[]) => void;
}

type DropSide = 'left' | 'right' | null;

type ItemRect = { id: string; rect: DOMRect };

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

  const items: ItemRect[] = Array.from(itemRefs.current.entries())
    .filter((entry): entry is [string, HTMLDivElement] => !!entry[1] && entry[0] !== activeId)
    .map(([itemId, element]) => ({
      id: itemId,
      rect: element.getBoundingClientRect(),
    }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);

  if (items.length === 0) {
    return { hoveredId: null, dropSide: null };
  }

  items.sort((a, b) => a.rect.top - b.rect.top);

  const rows: ItemRect[][] = [];
  const rowTolerance = items[0].rect.height / 2;

  items.forEach((item) => {
    const currentRow = rows[rows.length - 1];
    if (!currentRow) {
      rows.push([item]);
      return;
    }

    const isSameRow = Math.abs(item.rect.top - currentRow[0].rect.top) <= rowTolerance;
    if (isSameRow) {
      currentRow.push(item);
    } else {
      rows.push([item]);
    }
  });

  let targetRow: ItemRect[] | undefined;
  let smallestRowDistance = Infinity;

  rows.forEach((row) => {
    if (row.length === 0) {
      return;
    }
    const top = row[0].rect.top;
    const bottom = row[0].rect.bottom;
    const centerY = top + (bottom - top) / 2;
    const distance = Math.abs(cursorY - centerY);
    if (distance < smallestRowDistance) {
      smallestRowDistance = distance;
      targetRow = row;
    }
  });

  if (!targetRow || targetRow.length === 0) {
    return { hoveredId: null, dropSide: null };
  }

  let hoveredItem = targetRow[0];
  let smallestHorizontalDistance = Infinity;

  targetRow.forEach((item) => {
    const midpoint = item.rect.left + item.rect.width / 2;
    const distance = Math.abs(cursorX - midpoint);
    if (distance < smallestHorizontalDistance) {
      smallestHorizontalDistance = distance;
      hoveredItem = item;
    }
  });

  const firstItem = targetRow[0];
  const lastItem = targetRow[targetRow.length - 1];

  let dropSide: DropSide;
  if (cursorX < firstItem.rect.left) {
    hoveredItem = firstItem;
    dropSide = 'left';
  } else if (cursorX > lastItem.rect.right) {
    hoveredItem = lastItem;
    dropSide = 'right';
  } else {
    const midpoint = hoveredItem.rect.left + hoveredItem.rect.width / 2;
    dropSide = cursorX >= midpoint ? 'right' : 'left';
  }

  return { hoveredId: hoveredItem.id, dropSide };
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
  selectedPageIds?: string[];
}

const DraggableItemInner = <T extends DragDropItem>({ item, index, itemRefs, boxSelectedPageIds, clearBoxSelection, getBoxSelection, activeId, activeDragIds, justMoved, getThumbnailData, renderItem, onUpdateDropTarget, zoomLevel }: DraggableItemProps<T>) => {
  const isPlaceholder = Boolean(item.isPlaceholder);
  const pageNumber = (item as any).pageNumber ?? index + 1;
  const { attributes, listeners, setNodeRef: setDraggableRef } = useDraggable({
    id: item.id,
    disabled: isPlaceholder,
    data: {
      index,
      pageNumber,
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
  useEffect(() => {
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

// Memoize to prevent unnecessary re-renders and hook thrashing
const DraggableItem = React.memo(DraggableItemInner, (prevProps, nextProps) => {
  // Return true to SKIP re-render (props are equal)
  // Return false to RE-RENDER (props changed)

  // Check if item reference or content changed (including thumbnail)
  const itemChanged = prevProps.item !== nextProps.item;

  // If item object reference changed, we need to re-render
  if (itemChanged) {
    return false; // Props changed, re-render needed
  }

  // Check if page selection changed (for checkbox selection, not box selection)
  const prevSelectedSet = prevProps.selectedPageIds ? new Set(prevProps.selectedPageIds) : null;
  const nextSelectedSet = nextProps.selectedPageIds ? new Set(nextProps.selectedPageIds) : null;

  if (prevSelectedSet && nextSelectedSet) {
    const prevSelected = prevSelectedSet.has(prevProps.item.id);
    const nextSelected = nextSelectedSet.has(nextProps.item.id);
    if (prevSelected !== nextSelected) {
      return false; // Selection state changed for this item, re-render needed
    }
  }

  // Item reference is same, check other props
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.index === nextProps.index &&
    prevProps.activeId === nextProps.activeId &&
    prevProps.justMoved === nextProps.justMoved &&
    prevProps.zoomLevel === nextProps.zoomLevel &&
    prevProps.activeDragIds.length === nextProps.activeDragIds.length &&
    prevProps.boxSelectedPageIds.length === nextProps.boxSelectedPageIds.length
  );
}) as typeof DraggableItemInner;

const DragDropGrid = <T extends DragDropItem>({
  items,
  renderItem,
  onReorderPages,
  getThumbnailData,
  zoomLevel = 1.0,
  selectedFileIds,
  selectedPageIds,
  onVisibleItemsChange,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const getScrollElement = useCallback(() => {
    return containerRef.current?.closest('[data-scrolling-container]') as HTMLElement | null;
  }, []);

  // Create stable signature for items to ensure useMemo detects changes
  const itemsSignature = useMemo(() => items.map(item => item.id).join(','), [items]);
  const selectedFileIdsSignature = useMemo(() => selectedFileIds?.join(',') || '', [selectedFileIds]);

  const { filteredItems: visibleItems, filteredToOriginalIndex } = useMemo(() => {
    const filtered: T[] = [];
    const indexMap: number[] = [];
    const selectedIds =
      selectedFileIds && selectedFileIds.length > 0 ? new Set(selectedFileIds) : null;

    items.forEach((item, index) => {
      const isPlaceholder = Boolean(item.isPlaceholder);
      if (isPlaceholder) {
        return;
      }

      const belongsToVisibleFile =
        !selectedIds || !item.originalFileId || selectedIds.has(item.originalFileId);

      if (!belongsToVisibleFile) {
        return;
      }

      filtered.push(item);
      indexMap.push(index);
    });

    return { filteredItems: filtered, filteredToOriginalIndex: indexMap };
  }, [items, selectedFileIds, itemsSignature, selectedFileIdsSignature]);

  useEffect(() => {
    const visibleIdSet = new Set(visibleItems.map(item => item.id));
    itemRefs.current.forEach((_, pageId) => {
      if (!visibleIdSet.has(pageId)) {
        itemRefs.current.delete(pageId);
      }
    });
  }, [visibleItems]);

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

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!onVisibleItemsChange) return;

    const visibleItemsForCallback: T[] = [];
    virtualRows.forEach((row) => {
      const startIndex = row.index * itemsPerRow;
      const endIndex = Math.min(startIndex + itemsPerRow, visibleItems.length);
      visibleItemsForCallback.push(...visibleItems.slice(startIndex, endIndex));
    });

    onVisibleItemsChange(visibleItemsForCallback);
  }, [virtualRows, visibleItems, itemsPerRow, onVisibleItemsChange]);

  // Re-measure virtualizer when zoom or items per row changes
  // Also remeasure when items change (not just length) to handle item additions/removals
  const visibleItemsSignature = useMemo(() => visibleItems.map(item => item.id).join(','), [visibleItems]);
  useEffect(() => {
    rowVirtualizer.measure();
  }, [zoomLevel, itemsPerRow, visibleItems.length, visibleItemsSignature, rowVirtualizer]);

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

    const activeData = active.data.current;
    if (!activeData) {
      return;
    }

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

    if (targetIndex === null) {
      return;
    }
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
    left: Math.min(boxSelectStart.x, boxSelectEnd.x),
    top: Math.min(boxSelectStart.y, boxSelectEnd.y),
    width: Math.abs(boxSelectEnd.x - boxSelectStart.x),
    height: Math.abs(boxSelectEnd.y - boxSelectStart.y),
    zIndex: Z_INDEX_SELECTION_BOX,
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
      left: `${left}px`,
      top: `${top}px`,
      height: `${height}px`,
      zIndex: Z_INDEX_DROP_INDICATOR,
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
        className={styles.gridContainer}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheelWhileDragging}
      >
        {selectionBoxStyle && (
          <div
            className={styles.selectionBox}
            style={selectionBoxStyle}
          />
        )}

        {dropIndicatorStyle && (
          <div
            className={styles.dropIndicator}
            style={dropIndicatorStyle}
          />
        )}

        <div
          className={styles.virtualRows}
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            maxWidth: `${gridWidth}px`,
            margin: '0 auto',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const startIndex = virtualRow.index * itemsPerRow;
            const endIndex = Math.min(startIndex + itemsPerRow, visibleItems.length);
            const rowItems = visibleItems.slice(startIndex, endIndex);

            return (
              <div
                key={virtualRow.index}
                className={styles.virtualRow}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={styles.rowContent}
                  style={{
                    gap: `calc(${GRID_CONSTANTS.ITEM_GAP} * ${zoomLevel})`,
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
                        selectedPageIds={selectedPageIds}
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
          <div className={styles.dragOverlay}>
            {boxSelectedPageIds.includes(activeId) && boxSelectedPageIds.length > 1 && (
              <div
                className={styles.dragOverlayBadge}
                style={{ zIndex: Z_INDEX_DRAG_BADGE }}
              >
                {boxSelectedPageIds.length}
              </div>
            )}
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
              <div
                className={styles.dragOverlayPreview}
                style={{
                  width: `calc(20rem * ${zoomLevel})`,
                  height: `calc(20rem * ${zoomLevel})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                <LocalIcon icon="description" width="3rem" height="3rem" />
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default DragDropGrid;
