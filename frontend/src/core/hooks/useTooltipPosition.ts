import { useState, useEffect } from 'react';
import { clamp } from '@app/utils/genericUtils';
import { getSidebarInfo } from '@app/utils/sidebarUtils';
import { SidebarRefs, SidebarState } from '@app/types/sidebar';

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
  tooltipRef,
  sidebarRefs,
  sidebarState
}: {
  open: boolean;
  sidebarTooltip: boolean;
  position: Position;
  gap: number;
  triggerRef: React.RefObject<HTMLElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  sidebarRefs?: SidebarRefs;
  sidebarState?: SidebarState;
}): PositionState {
  const [coords, setCoords] = useState<{ top: number; left: number; arrowOffset: number | null }>({
    top: 0,
    left: 0,
    arrowOffset: null
  });
  const [positionReady, setPositionReady] = useState(false);

  // Fallback sidebar position (only used as last resort)
  const sidebarLeft = 240;
  const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  const updatePosition = () => {
    if (!triggerRef.current || !open) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();

    let top: number;
    let left: number;
    let arrowOffset: number | null = null;

    if (sidebarTooltip) {
      // Require sidebar refs and state for proper positioning
      if (!sidebarRefs || !sidebarState) {
        console.warn('Sidebar tooltip requires sidebarRefs and sidebarState props');
        setPositionReady(false);
        return;
      }

      const sidebarInfo = getSidebarInfo(sidebarRefs, sidebarState);
      const rect = sidebarInfo.rect;
      if (!rect) {
        setPositionReady(false);
        return;
      }

      // Only show tooltip if we have the tool panel active
      if (!sidebarInfo.isToolPanelActive) {
        console.log('Not showing tooltip - tool panel not active');
        setPositionReady(false);
        return;
      }

      const tooltipRect = tooltipRef.current?.getBoundingClientRect() || null;

      // Position adjacent to sidebar; mirror for RTL
      if (isRTL) {
        left = rect.left - (tooltipRect?.width || 0) - 20;
      } else {
        left = rect.right + 20;
      }
      top = triggerRect.top; // Align top of tooltip with trigger element

      // Only clamp if we have tooltip dimensions
      if (tooltipRect) {
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
