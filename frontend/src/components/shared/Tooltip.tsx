import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isClickOutside, addEventListenerWithCleanup } from '../../utils/genericUtils';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { TooltipTip } from '../../types/tips';
import { TooltipContent } from './tooltip/TooltipContent';
import { useSidebarContext } from '../../contexts/SidebarContext';
import styles from './tooltip/Tooltip.module.css'

export interface TooltipProps {
  sidebarTooltip?: boolean;
  position?: 'right' | 'left' | 'top' | 'bottom';
  content?: React.ReactNode;
  tips?: TooltipTip[];
  children: React.ReactElement;
  offset?: number;
  maxWidth?: number | string;
  minWidth?: number | string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  arrow?: boolean;
  portalTarget?: HTMLElement;
  header?: {
    title: string;
    logo?: React.ReactNode;
  };
  delay?: number;
  containerStyle?: React.CSSProperties;
}

export const Tooltip: React.FC<TooltipProps> = ({
  sidebarTooltip = false,
  position = 'right',
  content,
  tips,
  children,
  offset: gap = 8,
  maxWidth,
  minWidth,
  open: controlledOpen,
  onOpenChange,
  arrow = false,
  portalTarget,
  header,
  delay = 0,
  containerStyle={},
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const clearTimers = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  };
  
  // Get sidebar context for tooltip positioning
  const sidebarContext = sidebarTooltip ? useSidebarContext() : null;

  // Always use controlled mode - if no controlled props provided, use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    clearTimers();
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }

    // Reset pin state when closing
    if (!newOpen) {
      setIsPinned(false);
    }

  };

  const handleTooltipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned(true);
  };

  const handleDocumentClick = (e: MouseEvent) => {
    // If tooltip is pinned and we click outside of it, unpin it
    if (isPinned && isClickOutside(e, tooltipRef.current)) {
      setIsPinned(false);
      handleOpenChange(false);
    }
  };

  // Use the positioning hook
  const { coords, positionReady } = useTooltipPosition({
    open,
    sidebarTooltip,
    position,
    gap,
    triggerRef,
    tooltipRef,
    sidebarRefs: sidebarContext?.sidebarRefs,
    sidebarState: sidebarContext?.sidebarState
  });

  // Add document click listener for unpinning
  useEffect(() => {
    if (isPinned) {
      return addEventListenerWithCleanup(document, 'click', handleDocumentClick as EventListener);
    }
  }, [isPinned]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);


  const getArrowClass = () => {
    // No arrow for sidebar tooltips
    if (sidebarTooltip) return null;

    switch (position) {
      case 'top': return "tooltip-arrow tooltip-arrow-bottom";
      case 'bottom': return "tooltip-arrow tooltip-arrow-top";
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

  // Always mount when open so we can measure; hide until positioned to avoid flash
  const shouldShowTooltip = open;

  const tooltipElement = shouldShowTooltip ? (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: (maxWidth !== undefined ? maxWidth : (sidebarTooltip ? '25rem' : undefined)),
        minWidth: minWidth,
        zIndex: 9999,
        visibility: positionReady ? 'visible' : 'hidden',
        opacity: positionReady ? 1 : 0,
        color: 'var(--text-primary)',
        ...containerStyle,
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
      <TooltipContent
        content={content}
        tips={tips}
      />
    </div>
  ) : null;

  const handleMouseEnter = (e: React.MouseEvent) => {
      clearTimers();
    if (!isPinned) {
      const effectiveDelay = Math.max(0, delay || 0);
      openTimeoutRef.current = setTimeout(() => {
        handleOpenChange(true);
      }, effectiveDelay);
    }

    (children.props as any)?.onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
      clearTimers();
      openTimeoutRef.current = null;

    if (!isPinned) {
      handleOpenChange(false);
    }

    (children.props as any)?.onMouseLeave?.(e);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Toggle pin state on click
    if (open) {
      setIsPinned(!isPinned);
    } else {
      clearTimers();
      handleOpenChange(true);
      setIsPinned(true);
    }

    (children.props as any)?.onClick?.(e);
  };

  // Take the child element and add tooltip behavior to it
  const childWithTooltipHandlers = React.cloneElement(children as any, {
    // Keep track of the element for positioning
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      // Don't break if the child already has a ref
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && typeof originalRef === 'object') {
        originalRef.current = node;
      }
    },
    // Add mouse events to show/hide tooltip
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onClick: handleClick,
  });

  return (
    <>
      {childWithTooltipHandlers}
      {portalTarget && document.body.contains(portalTarget)
        ? tooltipElement && createPortal(tooltipElement, portalTarget)
        : tooltipElement}
    </>
  );
}; 