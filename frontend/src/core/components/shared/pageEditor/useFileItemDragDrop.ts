import { useRef, useEffect, useState } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import { FileId } from '@app/types/file';

interface UseFileItemDragDropParams {
  fileId: FileId;
  index: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface UseFileItemDragDropReturn {
  itemRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  isDragOver: boolean;
  dropPosition: 'above' | 'below';
  movedRef: React.MutableRefObject<boolean>;
  startRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

/**
 * Hook to handle drag and drop functionality for file items in a list.
 * Manages drag state, drop zones, and reordering logic using Pragmatic Drag and Drop.
 */
export const useFileItemDragDrop = ({
  fileId,
  index,
  onReorder,
}: UseFileItemDragDropParams): UseFileItemDragDropReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('below');
  const itemRef = useRef<HTMLDivElement>(null);

  // Keep latest values without re-registering DnD
  const indexRef = useRef(index);
  const fileIdRef = useRef(fileId);
  const dropPositionRef = useRef<'above' | 'below'>('below');
  const onReorderRef = useRef(onReorder);

  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { fileIdRef.current = fileId; }, [fileId]);
  useEffect(() => { dropPositionRef.current = dropPosition; }, [dropPosition]);
  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  // Gesture guard for row click vs drag
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 25) movedRef.current = true; // ~5px threshold
  };

  const onPointerUp = () => {
    startRef.current = null;
  };

  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    const dragCleanup = draggable({
      element,
      getInitialData: () => ({
        type: 'file-item',
        fileId: fileIdRef.current,
        fromIndex: indexRef.current,
      }),
      onDragStart: () => setIsDragging((p) => (p ? p : true)),
      onDrop: () => setIsDragging((p) => (p ? false : p)),
      canDrag: () => true,
    });

    const dropCleanup = dropTargetForElements({
      element,
      getData: () => ({
        type: 'file-item',
        fileId: fileIdRef.current,
        toIndex: indexRef.current,
      }),
      onDragEnter: () => setIsDragOver((p) => (p ? p : true)),
      onDragLeave: () => {
        setIsDragOver((p) => (p ? false : p));
        setDropPosition('below');
      },
      onDrag: ({ source }) => {
        // Determine drop position based on cursor location
        const element = itemRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const clientY = (source as any).element?.getBoundingClientRect().top || 0;
        const midpoint = rect.top + rect.height / 2;

        setDropPosition(clientY < midpoint ? 'below' : 'above');
      },
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const dropPos = dropPositionRef.current;
        setDropPosition('below');
        const sourceData = source.data as any;
        if (sourceData?.type === 'file-item') {
          const fromIndex = sourceData.fromIndex as number;
          let toIndex = indexRef.current;

          // Adjust toIndex based on drop position
          if (dropPos === 'below' && fromIndex < toIndex) {
            // Dragging down, drop after target - no adjustment needed
          } else if (dropPos === 'above' && fromIndex > toIndex) {
            // Dragging up, drop before target - no adjustment needed
          } else if (dropPos === 'below' && fromIndex > toIndex) {
            // Dragging up but want below target
            toIndex = toIndex + 1;
          } else if (dropPos === 'above' && fromIndex < toIndex) {
            // Dragging down but want above target
            toIndex = toIndex - 1;
          }

          if (fromIndex !== toIndex) {
            onReorderRef.current(fromIndex, toIndex);
          }
        }
      }
    });

    return () => {
      try { dragCleanup(); } catch { /* cleanup */ }
      try { dropCleanup(); } catch { /* cleanup */ }
    };
  }, []); // Stable - no dependencies

  return {
    itemRef,
    isDragging,
    isDragOver,
    dropPosition,
    movedRef,
    startRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
};
