/**
 * ResizeHandle — drag handle for resizing sidebar panels.
 *
 * Place on the edge of a panel. Drag to resize.
 * Pass `side="left"` for right panels, `side="right"` for left panels.
 */

import React, { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  /** Which edge of the panel this handle sits on */
  side: 'left' | 'right';
  /** Current width of the panel */
  currentWidth: number;
  /** Minimum width in px */
  minWidth?: number;
  /** Maximum width in px (or fraction of viewport) */
  maxWidth?: number;
  /** Called with the new width during drag */
  onResize: (width: number) => void;
}

export function ResizeHandle({
  side,
  currentWidth,
  minWidth = 200,
  maxWidth = 600,
  onResize,
}: ResizeHandleProps) {
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = currentWidth;

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = side === 'left'
          ? startX - ev.clientX   // left handle: drag left = wider
          : ev.clientX - startX;  // right handle: drag right = wider
        const clamped = Math.min(Math.max(startWidth + delta, minWidth), maxWidth);
        onResize(clamped);
      };

      const onUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [currentWidth, side, minWidth, maxWidth, onResize]
  );

  return (
    <div
      className={`resize-handle resize-handle--${side}`}
      onMouseDown={handleMouseDown}
    />
  );
}
