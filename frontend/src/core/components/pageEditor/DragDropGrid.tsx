import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Box } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRID_CONSTANTS } from '@app/components/pageEditor/constants';
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
  renderItem: (
    item: T,
    index: number,
    refs: React.MutableRefObject<Map<string, HTMLDivElement>>,
    boxSelectedIds: string[],
    clearBoxSelection: () => void,
    getBoxSelection: () => string[],
    activeId: string | null,
    activeDragIds: string[],
    justMoved: boolean,
    isOver: boolean,
    dragHandleProps?: any,
    zoomLevel?: number,
  ) => React.ReactNode;
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
  renderItem: (
    item: T,
    index: number,
    refs: React.MutableRefObject<Map<string, HTMLDivElement>>,
    boxSelectedIds: string[],
    clearBoxSelection: () => void,
    getBoxSelection: () => string[],
    activeId: string | null,
    activeDragIds: string[],
    justMoved: boolean,
    isOver: boolean,
    dragHandleProps?: any,
    zoomLevel?: number,
  ) => React.ReactNode;
  zoomLevel: number;
}

const DraggableItem = <T extends DragDropItem>({
  item,
  index,
  itemRefs,
  boxSelectedPageIds,
  clearBoxSelection,
  getBoxSelection,
  activeId,
  activeDragIds,
  justMoved,
  getThumbnailData,
  renderItem,
  onUpdateDropTarget,
  zoomLevel,
}: DraggableItemProps<T>) => {
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
            rotation: imgElement.dataset.originalRotation ? parseInt(imgElement.dataset.originalRotation) : 0,
          };
        }
        return null;
      },
    },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
    data: { index, pageNumber: index + 1 },
  });

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
    if (element) {
      itemRefs.current.set(item.id, element);
    } else {
      itemRefs.current.delete(item.id);
    }
  }, [item.id, setDraggableRef, setDroppableRef]);

  return renderItem(
    item,
    index,
    itemRefs,
    boxSelectedPageIds,
    clearBoxSelection,
    getBoxSelection,
    activeId,
    activeDragIds,
    justMoved,
    isOver,
    {
      ...attributes,
      ...listeners,
      ref: setNodeRef,
      onPointerDown: (event: React.PointerEvent) => {
        event.preventDefault();
        listeners.onPointerDown?.(event as any);
      },
    },
    zoomLevel,
  );
};

interface DragOverlayContentProps<T extends DragDropItem> {
  activeItem: T | null;
  getThumbnailData?: (itemId: string) => { src: string; rotation: number } | null;
  zoomLevel: number;
}

const DragOverlayContent = <T extends DragDropItem>({ activeItem, getThumbnailData, zoomLevel }: DragOverlayContentProps<T>) => {
  const thumbnailData = activeItem && getThumbnailData ? getThumbnailData(activeItem.id) : null;

  if (!activeItem) {
    return null;
  }

  return (
    <div
      style={{
        transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : undefined,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        backgroundColor: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-border)',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
      }}
    >
      {thumbnailData?.src ? (
        <img
          src={thumbnailData.src}
          alt="drag-preview"
          style={{
            display: 'block',
            width: `calc(${GRID_CONSTANTS.ITEM_WIDTH} * ${zoomLevel})`,
            borderRadius: '6px',
          }}
        />
      ) : (
        <div
          style={{
            width: GRID_CONSTANTS.ITEM_WIDTH,
            height: GRID_CONSTANTS.ITEM_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          Moving page...
        </div>
      )}
    </div>
  );
};

const DragDropGrid = <T extends DragDropItem>({
  items,
  onReorderPages,
  renderItem,
  getThumbnailData,
  zoomLevel = 1,
}: DragDropGridProps<T>) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const boxSelectionRef = useRef<Set<string>>(new Set());
  const getBoxSelection = useCallback(() => Array.from(boxSelectionRef.current), []);
  const clearBoxSelection = useCallback(() => {
    boxSelectionRef.current.clear();
  }, []);

  const [itemsPerRow, setItemsPerRow] = useState(4);
  const overscan = items.length > 1000 ? GRID_CONSTANTS.OVERSCAN_LARGE : GRID_CONSTANTS.OVERSCAN_SMALL;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<string[]>([]);
  const [justMovedIds, setJustMovedIds] = useState<Set<string>>(new Set());
  const [dropHint, setDropHint] = useState<DropHint>({ hoveredId: null, dropSide: null });
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const calculateItemsPerRow = useCallback(() => {
    if (!containerRef.current) return 4;

    const containerWidth = containerRef.current.offsetWidth;
    if (containerWidth === 0) return 4;

    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ITEM_WIDTH = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
    const ITEM_GAP = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;

    const availableWidth = containerWidth - ITEM_GAP;
    const itemWithGap = ITEM_WIDTH + ITEM_GAP;
    const calculated = Math.floor(availableWidth / itemWithGap);

    return Math.max(1, calculated);
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      const newItemsPerRow = calculateItemsPerRow();
      setItemsPerRow(newItemsPerRow);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    const resizeObserver = new ResizeObserver(updateLayout);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateLayout);
      resizeObserver.disconnect();
    };
  }, [calculateItemsPerRow]);

  const filteredItems = useMemo(() => items.filter(item => !item.isPlaceholder), [items]);
  const filteredToOriginalIndex = useMemo(() => {
    const result: number[] = [];
    items.forEach((item, index) => {
      if (!item.isPlaceholder) {
        result.push(index);
      }
    });
    return result;
  }, [items]);

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredItems.length / itemsPerRow),
    getScrollElement: () => containerRef.current?.closest('[data-scrolling-container]') as Element,
    estimateSize: () => {
      const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return parseFloat(GRID_CONSTANTS.ITEM_HEIGHT) * remToPx;
    },
    overscan,
  });

  const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const itemWidth = parseFloat(GRID_CONSTANTS.ITEM_WIDTH) * remToPx;
  const itemGap = parseFloat(GRID_CONSTANTS.ITEM_GAP) * remToPx;
  const gridWidth = itemsPerRow * itemWidth + (itemsPerRow - 1) * itemGap;

  const activeItem = activeId ? items.find(item => item.id === activeId) || null : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    const activeElement = itemRefs.current.get(active.id as string);
    if (activeElement) {
      activeElement.style.opacity = '0.2';
    }

    const selectedIds = getBoxSelection();
    if (selectedIds.includes(active.id as string)) {
      setActiveDragIds(selectedIds);
    } else {
      setActiveDragIds([active.id as string]);
    }
  }, [getBoxSelection]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active } = event;
    const activeIndex = filteredItems.findIndex(item => item.id === active.id);
    const fallbackIndex = activeIndex !== -1 ? filteredToOriginalIndex[activeIndex] : null;

    if (!dropHint.hoveredId && fallbackIndex === null) {
      setDropHint({ hoveredId: null, dropSide: null });
      setActiveId(null);
      setActiveDragIds([]);
      return;
    }

    const targetIndex = resolveTargetIndex(
      dropHint.hoveredId,
      dropHint.dropSide,
      filteredItems,
      filteredToOriginalIndex,
      items.length,
      fallbackIndex,
    );

    if (targetIndex !== null) {
      const pageNumber = filteredItems.findIndex(item => item.id === active.id) + 1;
      if (pageNumber > 0) {
        onReorderPages(pageNumber, targetIndex, activeDragIds);

        const updatedJustMoved = new Set<string>(activeDragIds);
        setJustMovedIds(updatedJustMoved);

        setTimeout(() => {
          setJustMovedIds(prev => {
            const next = new Set(prev);
            activeDragIds.forEach(id => next.delete(id));
            return next;
          });
        }, 500);
      }
    }

    setDropHint({ hoveredId: null, dropSide: null });
    setActiveId(null);
    setActiveDragIds([]);

    const activeElement = itemRefs.current.get(active.id as string);
    if (activeElement) {
      activeElement.style.opacity = '';
    }
  }, [activeDragIds, dropHint, filteredItems, filteredToOriginalIndex, items.length, onReorderPages]);

  const handleDragCancel = useCallback(() => {
    setDropHint({ hoveredId: null, dropSide: null });
    setActiveId(null);
    setActiveDragIds([]);
  }, []);

  const handleDragMove = useCallback((event: DragStartEvent | DragEndEvent) => {
    const { active, delta } = event;
    if (!active) return;

    const referenceElement = itemRefs.current.get(active.id as string);
    if (!referenceElement) return;

    const referenceRect = referenceElement.getBoundingClientRect();
    const cursorX = referenceRect.left + delta.x;
    const cursorY = referenceRect.top + delta.y;

    const hint = resolveDropHint(active.id as string, itemRefs, cursorX, cursorY);
    setDropHint(hint);
  }, []);

  useEffect(() => {
    const scrollContainer = containerRef.current?.closest('[data-scrolling-container]');
    if (!scrollContainer) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const getDropIndicatorStyle = useCallback((itemId: string) => {
    if (dropHint.hoveredId !== itemId) {
      return {};
    }

    if (dropHint.dropSide === 'left') {
      return {
        boxShadow: '-4px 0 0 0 var(--mantine-primary-color-filled)',
      };
    }

    if (dropHint.dropSide === 'right') {
      return {
        boxShadow: '4px 0 0 0 var(--mantine-primary-color-filled)',
      };
    }

    return {};
  }, [dropHint]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      onDragMove={handleDragMove}
    >
      <Box
        ref={containerRef}
        style={{
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
            const endIndex = Math.min(startIndex + itemsPerRow, filteredItems.length);
            const rowItems = filteredItems.slice(startIndex, endIndex);

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
                    position: 'relative',
                  }}
                >
                  {rowItems.map((item, itemIndex) => {
                    const actualIndex = startIndex + itemIndex;
                    const originalIndex = filteredToOriginalIndex[actualIndex];

                    return (
                      <React.Fragment key={item.id}>
                        <DraggableItem
                          item={item}
                          index={originalIndex}
                          itemRefs={itemRefs}
                          boxSelectedPageIds={getBoxSelection()}
                          clearBoxSelection={clearBoxSelection}
                          getBoxSelection={getBoxSelection}
                          activeId={activeId}
                          activeDragIds={activeDragIds}
                          justMoved={justMovedIds.has(item.id)}
                          getThumbnailData={getThumbnailData}
                          zoomLevel={zoomLevel}
                          onUpdateDropTarget={setDropTargetId}
                          renderItem={(...args) => {
                            const node = renderItem(...args);
                            const style = getDropIndicatorStyle(item.id);
                            return <div style={style}>{node}</div>;
                          }}
                        />
                      </React.Fragment>
                    );
                  })}

                  {dropTargetId && dropHint.hoveredId === dropTargetId && dropHint.dropSide && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: dropHint.dropSide === 'left' ? '-0.25rem' : undefined,
                        right: dropHint.dropSide === 'right' ? '-0.25rem' : undefined,
                        width: '0.25rem',
                        backgroundColor: 'var(--mantine-primary-color-filled)',
                        borderRadius: '9999px',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Box>

      <DragOverlay dropAnimation={null}>
        <DragOverlayContent
          activeItem={activeItem || null}
          getThumbnailData={getThumbnailData}
          zoomLevel={zoomLevel}
        />
      </DragOverlay>
    </DndContext>
  );
};

export type { DragDropItem };
export default DragDropGrid;
