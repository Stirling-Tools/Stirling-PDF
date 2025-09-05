import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import LocalIcon from './LocalIcon';
import { addEventListenerWithCleanup } from '../../utils/genericUtils';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { TooltipTip } from '../../types/tips';
import { TooltipContent } from './tooltip/TooltipContent';
import { useSidebarContext } from '../../contexts/SidebarContext';
import styles from './tooltip/Tooltip.module.css';

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
  header?: { title: string; logo?: React.ReactNode };
  delay?: number;
  containerStyle?: React.CSSProperties;
  pinOnClick?: boolean;
  /** If true, clicking outside also closes when not pinned (default true) */
  closeOnOutside?: boolean;
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
  containerStyle = {},
  pinOnClick = false,
  closeOnOutside = true,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickPendingRef = useRef(false);
  const tooltipIdRef = useRef(`tooltip-${Math.random().toString(36).slice(2)}`);

  const clearTimers = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  const sidebarContext = sidebarTooltip ? useSidebarContext() : null;

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : internalOpen;

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (newOpen === open) return; // avoid churn
      if (isControlled) onOpenChange?.(newOpen);
      else setInternalOpen(newOpen);
      if (!newOpen) setIsPinned(false);
    },
    [isControlled, onOpenChange, open]
  );

  const { coords, positionReady } = useTooltipPosition({
    open,
    sidebarTooltip,
    position,
    gap,
    triggerRef,
    tooltipRef,
    sidebarRefs: sidebarContext?.sidebarRefs,
    sidebarState: sidebarContext?.sidebarState,
  });

  // Close on outside click: pinned → close; not pinned → optionally close
  const handleDocumentClick = useCallback(
    (e: MouseEvent) => {
      const tEl = tooltipRef.current;
      const trg = triggerRef.current;
      const target = e.target as Node | null;
      const insideTooltip = tEl && target && tEl.contains(target);
      const insideTrigger = trg && target && trg.contains(target);

      // If pinned: only close when clicking outside BOTH tooltip & trigger
      if (isPinned) {
        if (!insideTooltip && !insideTrigger) {
          setIsPinned(false);
          setOpen(false);
        }
        return;
      }

      // Not pinned and configured to close on outside
      if (closeOnOutside && !insideTooltip && !insideTrigger) {
        setOpen(false);
      }
    },
    [isPinned, closeOnOutside, setOpen]
  );

  useEffect(() => {
    // Attach global click when open (so hover tooltips can also close on outside if desired)
    if (open || isPinned) {
      return addEventListenerWithCleanup(document, 'click', handleDocumentClick as EventListener);
    }
  }, [open, isPinned, handleDocumentClick]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const arrowClass = useMemo(() => {
    if (sidebarTooltip) return null;
    const map: Record<NonNullable<TooltipProps['position']>, string> = {
      top: 'tooltip-arrow-bottom',
      bottom: 'tooltip-arrow-top',
      left: 'tooltip-arrow-left',
      right: 'tooltip-arrow-right',
    };
    return map[position] || map.right;
  }, [position, sidebarTooltip]);

  const getArrowStyleClass = useCallback(
    (key: string) =>
      styles[key as keyof typeof styles] ||
      styles[key.replace(/-([a-z])/g, (_, l) => l.toUpperCase()) as keyof typeof styles] ||
      '',
    []
  );

  // === Trigger handlers ===
  const openWithDelay = useCallback(() => {
    clearTimers();
    openTimeoutRef.current = setTimeout(() => setOpen(true), Math.max(0, delay || 0));
  }, [clearTimers, setOpen, delay]);

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!isPinned) openWithDelay();
      (children.props as any)?.onPointerEnter?.(e);
    },
    [isPinned, openWithDelay, children.props]
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const related = e.relatedTarget as Node | null;

      // Moving into the tooltip → keep open
      if (related && tooltipRef.current && tooltipRef.current.contains(related)) {
        (children.props as any)?.onPointerLeave?.(e);
        return;
      }

      // Ignore transient leave between mousedown and click
      if (clickPendingRef.current) {
        (children.props as any)?.onPointerLeave?.(e);
        return;
      }

      clearTimers();
      if (!isPinned) setOpen(false);
      (children.props as any)?.onPointerLeave?.(e);
    },
    [clearTimers, isPinned, setOpen, children.props]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      clickPendingRef.current = true;
      (children.props as any)?.onMouseDown?.(e);
    },
    [children.props]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // allow microtask turn so click can see this false
      queueMicrotask(() => (clickPendingRef.current = false));
      (children.props as any)?.onMouseUp?.(e);
    },
    [children.props]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      clearTimers();
      if (pinOnClick) {
        e.preventDefault?.();
        e.stopPropagation?.();
        if (!open) setOpen(true);
        setIsPinned(true);
        clickPendingRef.current = false;
        return;
      }
      clickPendingRef.current = false;
      (children.props as any)?.onClick?.(e);
    },
    [clearTimers, pinOnClick, open, setOpen, children.props]
  );

  // Keyboard / focus accessibility
  const handleFocus = useCallback(
    (e: React.FocusEvent) => {
      if (!isPinned) openWithDelay();
      (children.props as any)?.onFocus?.(e);
    },
    [isPinned, openWithDelay, children.props]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && tooltipRef.current && tooltipRef.current.contains(related)) {
        (children.props as any)?.onBlur?.(e);
        return;
      }
      if (!isPinned) setOpen(false);
      (children.props as any)?.onBlur?.(e);
    },
    [isPinned, setOpen, children.props]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, [setOpen]);

  // Keep open while pointer is over the tooltip; close when leaving it (if not pinned)
  const handleTooltipPointerEnter = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  const handleTooltipPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && triggerRef.current && triggerRef.current.contains(related)) return;
      if (!isPinned) setOpen(false);
    },
    [isPinned, setOpen]
  );

  // Enhance child with handlers and ref
  const childWithHandlers = React.cloneElement(children as any, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node || null;
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') originalRef(node);
      else if (originalRef && typeof originalRef === 'object') (originalRef as any).current = node;
    },
    'aria-describedby': open ? tooltipIdRef.current : undefined,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onClick: handleClick,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  });

  const shouldShowTooltip = open;

  const tooltipElement = shouldShowTooltip ? (
    <div
      id={tooltipIdRef.current}
      ref={tooltipRef}
      role="tooltip"
      tabIndex={-1}
      onPointerEnter={handleTooltipPointerEnter}
      onPointerLeave={handleTooltipPointerLeave}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: maxWidth !== undefined ? maxWidth : (sidebarTooltip ? '25rem' as const : undefined),
        minWidth,
        zIndex: 9999,
        visibility: positionReady ? 'visible' : 'hidden',
        opacity: positionReady ? 1 : 0,
        color: 'var(--text-primary)',
        ...containerStyle,
      }}
      className={`${styles['tooltip-container']} ${isPinned ? styles.pinned : ''}`}
      onClick={pinOnClick ? (e) => { e.stopPropagation(); setIsPinned(true); } : undefined}
    >
      {isPinned && (
        <button
          className={styles['tooltip-pin-button']}
          onClick={(e) => {
            e.stopPropagation();
            setIsPinned(false);
            setOpen(false);
          }}
          title="Close tooltip"
          aria-label="Close tooltip"
        >
          <LocalIcon icon="close-rounded" width="1.25rem" height="1.25rem" />
        </button>
      )}
      {arrow && !sidebarTooltip && (
        <div
          className={`${styles['tooltip-arrow']} ${getArrowStyleClass(arrowClass!)}`}
          style={
            coords.arrowOffset !== null
              ? { [position === 'top' || position === 'bottom' ? 'left' : 'top']: coords.arrowOffset }
              : undefined
          }
        />
      )}
      {header && (
        <div className={styles['tooltip-header']}>
          <div className={styles['tooltip-logo']}>
            {header.logo || (
              <img
                src="/logo-tooltip.svg"
                alt="Stirling PDF"
                style={{ width: '1.4rem', height: '1.4rem', display: 'block' }}
              />
            )}
          </div>
          <span className={styles['tooltip-title']}>{header.title}</span>
        </div>
      )}
      <TooltipContent content={content} tips={tips} />
    </div>
  ) : null;

  return (
    <>
      {childWithHandlers}
      {portalTarget && document.body.contains(portalTarget)
        ? tooltipElement && createPortal(tooltipElement, portalTarget)
        : tooltipElement}
    </>
  );
};
