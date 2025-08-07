import { useState, useEffect, useMemo } from 'react';
import { clamp, getSidebarRect } from '../utils/domUtils';

type Position = 'right' | 'left' | 'top' | 'bottom';

interface PlacementResult {
  top: number;
  left: number;
}

interface PositionState {
  coords: { top: number; left: number; arrowOffset: number | null };
  positionReady: boolean;
}

function place(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  position: Position,
  offset: number
): PlacementResult {
  let top = 0;
  let left = 0;

  switch (position) {
    case 'right':
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.right + offset;
      break;
    case 'left':
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.left - tooltipRect.width - offset;
      break;
    case 'top':
      top = triggerRect.top - tooltipRect.height - offset;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
    case 'bottom':
      top = triggerRect.bottom + offset;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
  }

  return { top, left };
}

export function useTooltipPosition({
  open,
  sidebarTooltip,
  position,
  gap,
  triggerRef,
  tooltipRef
}: {
  open: boolean;
  sidebarTooltip: boolean;
  position: Position;
  gap: number;
  triggerRef: React.RefObject<HTMLElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}): PositionState {
  const [coords, setCoords] = useState<{ top: number; left: number; arrowOffset: number | null }>({ 
    top: 0, 
    left: 0, 
    arrowOffset: null 
  });
  const [positionReady, setPositionReady] = useState(false);

  // Memoize sidebar position for performance
  const sidebarLeft = useMemo(() => {
    if (!sidebarTooltip) return 0;
    const sidebarInfo = getSidebarRect();
    return sidebarInfo.rect ? sidebarInfo.rect.right : 240;
  }, [sidebarTooltip]);

  const updatePosition = () => {
    if (!triggerRef.current || !open) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();

    let top: number;
    let left: number;
    let arrowOffset: number | null = null;

    if (sidebarTooltip) {
      // Get fresh sidebar position each time
      const sidebarInfo = getSidebarRect();
      const currentSidebarRight = sidebarInfo.rect ? sidebarInfo.rect.right : sidebarLeft;

      // Only show tooltip if we have the correct sidebar (ToolPanel)
      if (!sidebarInfo.isCorrectSidebar) {
        console.log('🚫 Not showing tooltip - wrong sidebar detected');
        setPositionReady(false);
        return;
      }

      // Position to the right of correct sidebar with 20px gap
      left = currentSidebarRight + 20;
      top = triggerRect.top; // Align top of tooltip with trigger element

      console.log('Sidebar tooltip positioning:', {
        currentSidebarRight,
        triggerRect,
        calculatedLeft: left,
        calculatedTop: top,
        isCorrectSidebar: sidebarInfo.isCorrectSidebar
      });

      // Only clamp if we have tooltip dimensions
      if (tooltipRef.current) {
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const maxTop = window.innerHeight - tooltipRect.height - 4;
        const originalTop = top;
        top = clamp(top, 4, maxTop);

        // If tooltip was clamped, adjust arrow position to stay aligned with trigger
        if (originalTop !== top) {
          arrowOffset = triggerRect.top + triggerRect.height / 2 - top;
        }
      }

      setCoords({ top, left, arrowOffset });
      setPositionReady(true);
    } else {
      // Regular tooltip logic
      if (!tooltipRef.current) return;

      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const placement = place(triggerRect, tooltipRect, position, gap);
      top = placement.top;
      left = placement.left;

      // Clamp to viewport
      top = clamp(top, 4, window.innerHeight - tooltipRect.height - 4);
      left = clamp(left, 4, window.innerWidth - tooltipRect.width - 4);

      // Calculate arrow position to stay aligned with trigger
      if (position === 'top' || position === 'bottom') {
        // For top/bottom arrows, adjust horizontal position
        const triggerCenter = triggerRect.left + triggerRect.width / 2;
        const tooltipCenter = left + tooltipRect.width / 2;
        if (Math.abs(triggerCenter - tooltipCenter) > 4) {
          // Arrow needs adjustment
          arrowOffset = triggerCenter - left - 4; // 4px is half arrow width
        }
      } else {
        // For left/right arrows, adjust vertical position
        const triggerCenter = triggerRect.top + triggerRect.height / 2;
        const tooltipCenter = top + tooltipRect.height / 2;
        if (Math.abs(triggerCenter - tooltipCenter) > 4) {
          // Arrow needs adjustment
          arrowOffset = triggerCenter - top - 4; // 4px is half arrow height
        }
      }

      setCoords({ top, left, arrowOffset });
      setPositionReady(true);
    }
  };

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(updatePosition);

    const handleUpdate = () => requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [open, sidebarLeft, position, gap, sidebarTooltip]);

  return { coords, positionReady };
} 