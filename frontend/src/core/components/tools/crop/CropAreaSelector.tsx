import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Box, useMantineTheme, MantineTheme } from '@mantine/core';
import {
  PDFBounds,
  Rectangle,
  domToPDFCoordinates,
  pdfToDOMCoordinates,
  constrainDOMRectToThumbnail,
  isPointInThumbnail
} from '@app/utils/cropCoordinates';
import { type ResizeHandle } from '@app/constants/cropConstants';

interface CropAreaSelectorProps {
  /** PDF bounds for coordinate conversion */
  pdfBounds: PDFBounds;
  /** Current crop area in PDF coordinates */
  cropArea: Rectangle;
  /** Callback when crop area changes */
  onCropAreaChange: (cropArea: Rectangle) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Child content (typically the PDF thumbnail) */
  children: React.ReactNode;
}

const CropAreaSelector: React.FC<CropAreaSelectorProps> = ({
  pdfBounds,
  cropArea,
  onCropAreaChange,
  disabled = false,
  children
}) => {
  const theme = useMantineTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCropArea, setInitialCropArea] = useState<Rectangle>(cropArea);

  // Convert PDF crop area to DOM coordinates for display
  const domRect = pdfToDOMCoordinates(cropArea, pdfBounds);

  // Handle mouse down on overlay (start dragging or resizing)
  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || !containerRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if we're clicking on a resize handle first (higher priority)
    const handle = getResizeHandle(x, y, domRect);

    if (handle) {
      setIsResizing(handle);
      setInitialCropArea(cropArea);
      setIsDragging(false); // Ensure we're not dragging when resizing
    } else if (isPointInCropArea(x, y, domRect)) {
      // Only allow dragging if we're not on a resize handle
      setIsDragging(true);
      setIsResizing(null); // Ensure we're not resizing when dragging
      setDragStart({ x: x - domRect.x, y: y - domRect.y });
    }
  }, [disabled, cropArea, domRect]);

  // Handle mouse down on container (start new selection)
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Only start new selection if clicking within thumbnail area
    if (!isPointInThumbnail(x, y, pdfBounds)) return;

    e.preventDefault();
    e.stopPropagation();

    // Start new crop selection
    const newDomRect: Rectangle = { x, y, width: 20, height: 20 };
    const constrainedRect = constrainDOMRectToThumbnail(newDomRect, pdfBounds);
    const newCropArea = domToPDFCoordinates(constrainedRect, pdfBounds);

    onCropAreaChange(newCropArea);
    setIsResizing('se'); // Start resizing from the southeast corner
    setInitialCropArea(newCropArea);
  }, [disabled, pdfBounds, onCropAreaChange]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (disabled || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      // Dragging the entire crop area
      const newX = x - dragStart.x;
      const newY = y - dragStart.y;

      const newDomRect: Rectangle = {
        x: newX,
        y: newY,
        width: domRect.width,
        height: domRect.height
      };

      const constrainedRect = constrainDOMRectToThumbnail(newDomRect, pdfBounds);
      const newCropArea = domToPDFCoordinates(constrainedRect, pdfBounds);
      onCropAreaChange(newCropArea);

    } else if (isResizing) {
      // Resizing the crop area
      const newDomRect = calculateResizedRect(isResizing, domRect, x, y);
      const constrainedRect = constrainDOMRectToThumbnail(newDomRect, pdfBounds);
      const newCropArea = domToPDFCoordinates(constrainedRect, pdfBounds);
      onCropAreaChange(newCropArea);
    }
  }, [disabled, isDragging, isResizing, dragStart, domRect, initialCropArea, pdfBounds, onCropAreaChange]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  return (
    <Box
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        userSelect: 'none'
      }}
      onMouseDown={handleContainerMouseDown}
    >
      {/* PDF Thumbnail Content */}
      {children}

      {/* Crop Area Overlay */}
      {!disabled && (
        <Box
          ref={overlayRef}
          style={{
            position: 'absolute',
            left: domRect.x,
            top: domRect.y,
            width: domRect.width,
            height: domRect.height,
            border: `2px solid ${theme.other.crop.overlayBorder}`,
            backgroundColor: theme.other.crop.overlayBackground,
            cursor: 'move',
            pointerEvents: 'auto',
            transition: (isDragging || isResizing) ? undefined : 'all 1s ease-in-out'
          }}
          onMouseDown={handleOverlayMouseDown}
        >
          {/* Resize Handles */}
          {renderResizeHandles(disabled, theme)}
        </Box>
      )}
    </Box>
  );
};

// Helper functions

function getResizeHandle(x: number, y: number, domRect: Rectangle): ResizeHandle {
  const handleSize = 8;
  const tolerance = handleSize;

  // Corner handles (check these first, they have priority)
  if (isNear(x, domRect.x, tolerance) && isNear(y, domRect.y, tolerance)) return 'nw';
  if (isNear(x, domRect.x + domRect.width, tolerance) && isNear(y, domRect.y, tolerance)) return 'ne';
  if (isNear(x, domRect.x, tolerance) && isNear(y, domRect.y + domRect.height, tolerance)) return 'sw';
  if (isNear(x, domRect.x + domRect.width, tolerance) && isNear(y, domRect.y + domRect.height, tolerance)) return 'se';

  // Edge handles (only if not in corner area)
  if (isNear(x, domRect.x + domRect.width / 2, tolerance) && isNear(y, domRect.y, tolerance)) return 'n';
  if (isNear(x, domRect.x + domRect.width, tolerance) && isNear(y, domRect.y + domRect.height / 2, tolerance)) return 'e';
  if (isNear(x, domRect.x + domRect.width / 2, tolerance) && isNear(y, domRect.y + domRect.height, tolerance)) return 's';
  if (isNear(x, domRect.x, tolerance) && isNear(y, domRect.y + domRect.height / 2, tolerance)) return 'w';

  return null;
}

function isNear(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function isPointInCropArea(x: number, y: number, domRect: Rectangle): boolean {
  return x >= domRect.x && x <= domRect.x + domRect.width &&
         y >= domRect.y && y <= domRect.y + domRect.height;
}

function calculateResizedRect(
  handle: ResizeHandle,
  currentRect: Rectangle,
  mouseX: number,
  mouseY: number,
): Rectangle {
  let { x, y, width, height } = currentRect;

  switch (handle) {
    case 'nw':
      width += x - mouseX;
      height += y - mouseY;
      x = mouseX;
      y = mouseY;
      break;
    case 'ne':
      width = mouseX - x;
      height += y - mouseY;
      y = mouseY;
      break;
    case 'sw':
      width += x - mouseX;
      height = mouseY - y;
      x = mouseX;
      break;
    case 'se':
      width = mouseX - x;
      height = mouseY - y;
      break;
    case 'n':
      height += y - mouseY;
      y = mouseY;
      break;
    case 'e':
      width = mouseX - x;
      break;
    case 's':
      height = mouseY - y;
      break;
    case 'w':
      width += x - mouseX;
      x = mouseX;
      break;
  }

  // Enforce minimum size
  width = Math.max(10, width);
  height = Math.max(10, height);

  return { x, y, width, height };
}

function renderResizeHandles(disabled: boolean, theme: MantineTheme) {
  if (disabled) return null;

  const handleSize = 8;
  const handleStyle = {
    position: 'absolute' as const,
    width: handleSize,
    height: handleSize,
    backgroundColor: theme.other.crop.handleColor,
    border: `1px solid ${theme.other.crop.handleBorder}`,
    borderRadius: '2px',
    pointerEvents: 'auto' as const
  };

  return (
    <>
      {/* Corner handles */}
      <Box style={{ ...handleStyle, left: -handleSize/2, top: -handleSize/2, cursor: 'nw-resize' }} />
      <Box style={{ ...handleStyle, right: -handleSize/2, top: -handleSize/2, cursor: 'ne-resize' }} />
      <Box style={{ ...handleStyle, left: -handleSize/2, bottom: -handleSize/2, cursor: 'sw-resize' }} />
      <Box style={{ ...handleStyle, right: -handleSize/2, bottom: -handleSize/2, cursor: 'se-resize' }} />

      {/* Edge handles */}
      <Box style={{ ...handleStyle, left: '50%', marginLeft: -handleSize/2, top: -handleSize/2, cursor: 'n-resize' }} />
      <Box style={{ ...handleStyle, right: -handleSize/2, top: '50%', marginTop: -handleSize/2, cursor: 'e-resize' }} />
      <Box style={{ ...handleStyle, left: '50%', marginLeft: -handleSize/2, bottom: -handleSize/2, cursor: 's-resize' }} />
      <Box style={{ ...handleStyle, left: -handleSize/2, top: '50%', marginTop: -handleSize/2, cursor: 'w-resize' }} />
    </>
  );
}

export default CropAreaSelector;
