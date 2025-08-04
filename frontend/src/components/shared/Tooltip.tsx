import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export interface TooltipTip {
  title?: string;
  description?: string;
  bullets?: string[];
  body?: React.ReactNode;
}

export interface TooltipProps {
  sidebarTooltip?: boolean;
  position?: 'right' | 'left' | 'top' | 'bottom';
  content?: React.ReactNode;
  tips?: TooltipTip[];
  children: React.ReactElement;
  offset?: number;
  maxWidth?: number | string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  arrow?: boolean;
  portalTarget?: HTMLElement;
  header?: {
    title: string;
    logo?: React.ReactNode;
  };
}

type Position = 'right' | 'left' | 'top' | 'bottom';

interface PlacementResult {
  top: number;
  left: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSidebarRect(): { rect: DOMRect | null, isCorrectSidebar: boolean } {
  // Find the rightmost sidebar - this will be the "All Tools" expanded panel
  const allSidebars = [];

  // Find the QuickAccessBar (narrow left bar)
  const quickAccessBar = document.querySelector('[data-sidebar="quick-access"]');
  if (quickAccessBar) {
    const rect = quickAccessBar.getBoundingClientRect();
    if (rect.width > 0) {
      allSidebars.push({
        element: 'QuickAccessBar',
        selector: '[data-sidebar="quick-access"]',
        rect
      });
    }
  }

  // Find the tool panel (the expanded "All Tools" panel)  
  const toolPanel = document.querySelector('[data-sidebar="tool-panel"]');
  if (toolPanel) {
    const rect = toolPanel.getBoundingClientRect();
    if (rect.width > 0) {
      allSidebars.push({
        element: 'ToolPanel',
        selector: '[data-sidebar="tool-panel"]',
        rect
      });
    }
  }

  // Use the rightmost sidebar (which should be the tool panel when expanded)
  if (allSidebars.length > 0) {
    const rightmostSidebar = allSidebars.reduce((rightmost, current) => {
      return current.rect.right > rightmost.rect.right ? current : rightmost;
    });

    // Only consider it correct if we're using the ToolPanel (expanded All Tools sidebar)
    const isCorrectSidebar = rightmostSidebar.element === 'ToolPanel';

    console.log('✅ Tooltip positioning using:', {
      element: rightmostSidebar.element,
      selector: rightmostSidebar.selector,
      width: rightmostSidebar.rect.width,
      right: rightmostSidebar.rect.right,
      isCorrectSidebar,
      rect: rightmostSidebar.rect
    });

    return { rect: rightmostSidebar.rect, isCorrectSidebar };
  }

  console.warn('⚠️ No sidebars found, using fallback positioning');
  // Final fallback
  return { rect: new DOMRect(0, 0, 280, window.innerHeight), isCorrectSidebar: false };
}

export const Tooltip: React.FC<TooltipProps> = ({
  sidebarTooltip = false,
  position = 'right',
  content,
  tips,
  children,
  offset: gap = 8,
  maxWidth = 280,
  open: controlledOpen,
  onOpenChange,
  arrow = false,
  portalTarget,
  header,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowOffset: number | null }>({ top: 0, left: 0, arrowOffset: null });
  const [positionReady, setPositionReady] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always use controlled mode - if no controlled props provided, use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }

    // Reset position ready state when closing
    if (!newOpen) {
      setPositionReady(false);
      setIsPinned(false);
    }
  };

  const handleTooltipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned(true);
  };

  const handleDocumentClick = (e: MouseEvent) => {
    // If tooltip is pinned and we click outside of it, unpin it
    if (isPinned && tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
      setIsPinned(false);
      handleOpenChange(false);
    }
  };

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
      clearTimeout(hoverTimeoutRef.current!);

      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [open, sidebarLeft, position, gap, sidebarTooltip]);
  // Add document click listener for unpinning
  useEffect(() => {
    if (isPinned) {
      document.addEventListener('click', handleDocumentClick);
      return () => {
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  }, [isPinned]);

  const getArrowClass = () => {
    // No arrow for sidebar tooltips
    if (sidebarTooltip) return null;

    switch (position) {
      case 'top': return "tooltip-arrow tooltip-arrow-top";
      case 'bottom': return "tooltip-arrow tooltip-arrow-bottom";
      case 'left': return "tooltip-arrow tooltip-arrow-left";
      case 'right': return "tooltip-arrow tooltip-arrow-right";
      default: return "tooltip-arrow tooltip-arrow-right";
    }
  };

  const getArrowStyleClass = (arrowClass: string) => {
    const styleKey = arrowClass.split(' ')[1];
    // Handle both kebab-case and camelCase CSS module exports
    return styles[styleKey as keyof typeof styles] ||
      styles[styleKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) as keyof typeof styles] ||
      '';
  };

  // Only show tooltip when position is ready and correct
  const shouldShowTooltip = open && (sidebarTooltip ? positionReady : true);

  const tooltipElement = shouldShowTooltip ? (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        maxWidth,
        zIndex: 9999,
        visibility: 'visible',
        opacity: 1,
        color: 'var(--text-primary)',
      }}
      className={`${styles['tooltip-container']} ${isPinned ? styles.pinned : ''}`}
      onClick={handleTooltipClick}
    >
      {isPinned && (
        <button
          className={styles['tooltip-pin-button']}
          onClick={(e) => {
            e.stopPropagation();
            setIsPinned(false);
            handleOpenChange(false);
          }}
          title="Close tooltip"
        >
          <span className="material-symbols-rounded">
            close
          </span>
        </button>
      )}
      {arrow && getArrowClass() && (
        <div
          className={`${styles['tooltip-arrow']} ${getArrowStyleClass(getArrowClass()!)}`}
          style={coords.arrowOffset !== null ? {
            [position === 'top' || position === 'bottom' ? 'left' : 'top']: coords.arrowOffset
          } : undefined}
        />
      )}
      {header && (
        <div className={styles['tooltip-header']}>
          <div className={styles['tooltip-logo']}>
            {header.logo || <img src="/logo-tooltip.svg" alt="Stirling PDF" style={{ width: '1.4rem', height: '1.4rem', display: 'block' }} />}
          </div>
          <span className={styles['tooltip-title']}>{header.title}</span>
        </div>
      )}
      <div
        className={styles['tooltip-body']}
        style={{
          color: 'var(--text-primary)',
          padding: '16px',
          fontSize: '14px',
          lineHeight: '1.6'
        }}
      >
        <div style={{ color: 'var(--text-primary)' }}>
          {tips ? (
            <>
              {tips.map((tip, index) => (
                <div key={index} style={{ marginBottom: index < tips.length - 1 ? '24px' : '0' }}>
                  {tip.title && (
                    <div style={{
                      display: 'inline-block',
                      backgroundColor: 'var(--tooltip-title-bg)',
                      color: 'var(--tooltip-title-color)',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      fontWeight: '600',
                      marginBottom: '12px'
                    }}>
                      {tip.title}
                    </div>
                  )}
                  {tip.description && (
                    <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '13px' }} dangerouslySetInnerHTML={{ __html: tip.description }} />
                  )}
                  {tip.bullets && tip.bullets.length > 0 && (
                    <ul style={{ margin: '0', paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {tip.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex} style={{ marginBottom: '6px' }} dangerouslySetInnerHTML={{ __html: bullet }} />
                      ))}
                    </ul>
                  )}
                  {tip.body && (
                    <div style={{ marginTop: '12px' }}>
                      {tip.body}
                    </div>
                  )}
                </div>
              ))}
              {content && (
                <div style={{ marginTop: '24px' }}>
                  {content}
                </div>
              )}
            </>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  ) : null;

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Only show on hover if not pinned
    if (!isPinned) {
      handleOpenChange(true);
    }

    (children.props as any)?.onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Only hide on mouse leave if not pinned
    if (!isPinned) {
      // Add a small delay to prevent flickering
      hoverTimeoutRef.current = setTimeout(() => {
        handleOpenChange(false);
      }, 100);
    }

    (children.props as any)?.onMouseLeave?.(e);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Toggle pin state on click
    if (open) {
      setIsPinned(!isPinned);
    } else {
      handleOpenChange(true);
      setIsPinned(true);
    }

    (children.props as any)?.onClick?.(e);
  };

  const enhancedChildren = React.cloneElement(children as any, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      // Forward ref if children already has one
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && typeof originalRef === 'object') {
        originalRef.current = node;
      }
    },
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onClick: handleClick,
    onFocus: (e: React.FocusEvent) => {
      if (!isPinned) {
        handleOpenChange(true);
      }
      (children.props as any)?.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!isPinned) {
        handleOpenChange(false);
      }
      (children.props as any)?.onBlur?.(e);
    },
  });

  return (
    <>
      {enhancedChildren}
      {portalTarget && document.body.contains(portalTarget)
        ? tooltipElement && createPortal(tooltipElement, portalTarget)
        : tooltipElement}
    </>
  );
}; 